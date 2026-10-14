/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { Profile } from '@node-saml/node-saml';
import { AuthConfig, BaseAuth } from '@nocobase/auth';
import { Model } from '@nocobase/database';
import { AuthModel } from '@nocobase/plugin-auth';
import { namespace } from '../constants';
import { createSamlClient, getSamlOptions, SamlAuthenticatorOptions } from './saml';

const isEmail = (value: string) => /^[\w-]+(\.[\w-]+)*@[\w-]+(\.[\w-]+)+$/.test(value);

function firstAttributeValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }
  return undefined;
}

export class SAMLAuth extends BaseAuth {
  constructor(config: AuthConfig) {
    super({ ...config, userCollection: config.ctx.db.getCollection('users') });
  }

  private getOptions(): SamlAuthenticatorOptions {
    return getSamlOptions(this.authenticator.options);
  }

  /** Build the IdP redirect URL; `relayState` carries the post-login redirect target. */
  async getAuthorizeUrl(relayState: string): Promise<string> {
    const client = await createSamlClient(this.getOptions());
    return client.getAuthorizeUrlAsync(relayState, undefined);
  }

  async validate(): Promise<Model> {
    const ctx = this.ctx;
    const body = (ctx.request.body || {}) as Record<string, string>;
    if (!body.SAMLResponse) {
      ctx.throw(400, ctx.t('SAML response is required', { ns: namespace }));
    }
    const client = await createSamlClient(this.getOptions());
    let profile: Profile | undefined;
    try {
      const result = await client.validatePostResponseAsync({ SAMLResponse: body.SAMLResponse });
      profile = result.profile;
    } catch (error) {
      ctx.log.warn(`saml: failed to validate response: ${error instanceof Error ? error.message : String(error)}`, {
        method: 'saml.validate',
      });
    }
    if (!profile?.nameID) {
      ctx.throw(401, ctx.t('SAML authentication failed', { ns: namespace }));
    }
    const attrs = (profile.attributes || {}) as Record<string, unknown>;
    const nameID = profile.nameID;
    const email = firstAttributeValue(attrs.email) || (isEmail(nameID) ? nameID : undefined);
    const nickname = firstAttributeValue(attrs.displayName) || firstAttributeValue(attrs.cn) || nameID;
    return await this.findOrCreateUser(nameID, { email, nickname });
  }

  /**
   * Map the SAML identity to a NocoBase user: match the linked user by uuid (nameID) first,
   * then an existing user by email, otherwise create a new one linked to the authenticator.
   */
  private async findOrCreateUser(uuid: string, values: { email?: string; nickname?: string }): Promise<Model> {
    const authenticator = this.authenticator as AuthModel;
    let user = await authenticator.findUser(uuid);
    if (!user && values.email) {
      user = await this.userRepository.findOne({ filter: { email: values.email } });
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
