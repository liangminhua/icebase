/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { AuthConfig, BaseAuth } from '@nocobase/auth';
import { Model } from '@nocobase/database';
import { AuthModel } from '@nocobase/plugin-auth';
import { namespace } from '../constants';
import {
  CasAuthenticatorOptions,
  fetchCasServiceValidate,
  normalizeCasBaseUrl,
  parseCasAuthentication,
  sanitizeRedirect,
} from './cas';

const isEmail = (value: string) => /^[\w-]+(\.[\w-]+)*@[\w-]+(\.[\w-]+)+$/.test(value);

export class CASAuth extends BaseAuth {
  constructor(config: AuthConfig) {
    super({ ...config, userCollection: config.ctx.db.getCollection('users') });
  }

  private getOptions(): CasAuthenticatorOptions {
    return (this.authenticator.options || {}) as CasAuthenticatorOptions;
  }

  private requireBaseUrl(): string {
    const options = this.getOptions();
    if (!options.casBaseUrl) {
      throw new ConfigurationError('CAS authenticator is not configured');
    }
    return normalizeCasBaseUrl(options.casBaseUrl);
  }

  /**
   * Rebuild the service URL passed to CAS at login time. The value must be identical on
   * both calls for CAS ticket validation, so it is constructed deterministically from the
   * service name (or request origin), the resourcer prefix and a fixed query order.
   */
  private buildServiceUrl(redirect: string): string {
    const options = this.getOptions();
    const origin = options.serviceName || `${this.ctx.protocol}://${this.ctx.host}`;
    const prefix = this.ctx.app.resourceManager?.options?.prefix || '';
    const params = new URLSearchParams();
    params.set('authenticator', this.authenticator.name);
    params.set('redirect', redirect);
    return `${origin}${prefix}/cas:callback?${params.toString()}`;
  }

  /** Build the CAS login URL; `redirect` rides inside the service URL. */
  async getAuthorizeUrl(redirect: string): Promise<string> {
    const baseUrl = this.requireBaseUrl();
    const service = this.buildServiceUrl(redirect);
    return `${baseUrl}/login?service=${encodeURIComponent(service)}`;
  }

  async validate(): Promise<Model> {
    const ctx = this.ctx;
    const baseUrl = this.requireBaseUrl();
    const ticket = ctx.query.ticket;
    if (typeof ticket !== 'string' || !ticket) {
      ctx.throw(400, ctx.t('CAS ticket is required', { ns: namespace }));
    }
    const service = this.buildServiceUrl(sanitizeRedirect(ctx.query.redirect));
    const xml = await fetchCasServiceValidate(
      `${baseUrl}/serviceValidate?ticket=${encodeURIComponent(ticket)}&service=${encodeURIComponent(service)}`,
    );
    const username = parseCasAuthentication(xml);
    const email = isEmail(username) ? username : undefined;
    const usernameValue = !isEmail(username) && this.validateUsername(username) ? username : undefined;
    return await this.findOrCreateUser(username, {
      email,
      nickname: username,
      username: usernameValue,
    });
  }

  /**
   * Map the CAS identity to a NocoBase user: match the linked user by uuid (cas:user) first,
   * then an existing user by username/email, otherwise create a new one linked to the authenticator.
   */
  private async findOrCreateUser(
    uuid: string,
    values: { email?: string; nickname?: string; username?: string },
  ): Promise<Model> {
    const authenticator = this.authenticator as AuthModel;
    let user = await authenticator.findUser(uuid);
    if (!user && (values.username || values.email)) {
      const or: Array<Record<string, string>> = [];
      if (values.username) {
        or.push({ username: values.username });
      }
      if (values.email) {
        or.push({ email: values.email });
      }
      user = await this.userRepository.findOne({ filter: { $or: or } });
      if (user) {
        await authenticator.addUser(user, { through: { uuid } });
      }
    }
    if (!user) {
      user = await authenticator.newUser(uuid, values);
    }
    return user;
  }
}
