/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Client } from 'ldapts';
import { AuthConfig, BaseAuth } from '@nocobase/auth';
import { Model } from '@nocobase/database';
import { AuthModel } from '@nocobase/plugin-auth';
import { namespace } from '../constants';

export interface LdapAttributesMapping {
  email?: string;
  nickname?: string;
  username?: string;
}

export interface LdapAuthenticatorOptions {
  url?: string;
  baseDn?: string;
  filterTemplate?: string;
  bindDn?: string;
  bindPassword?: string;
  attributesMapping?: LdapAttributesMapping;
}

/** Thrown when the authenticator options are missing or the service bind fails; surfaces as a 500 response. */
export class ConfigurationError extends Error {
  status = 500;
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

/** Escape a raw value before interpolating it into an LDAP filter (RFC 4515). */
export function escapeLdapFilter(value: string): string {
  return value
    .replace(/\\/g, '\\5c')
    .replace(/\*/g, '\\2a')
    .replace(/\(/g, '\\28')
    .replace(/\)/g, '\\29')
    .replace(/\0/g, '\\00');
}

function entryValue(entry: Record<string, unknown>, attr: string | undefined): string | undefined {
  if (!attr) {
    return undefined;
  }
  const value = entry[attr];
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }
  return undefined;
}

export class LDAPAuth extends BaseAuth {
  constructor(config: AuthConfig) {
    super({ ...config, userCollection: config.ctx.db.getCollection('users') });
  }

  private getOptions(): LdapAuthenticatorOptions {
    return (this.authenticator.options || {}) as LdapAuthenticatorOptions;
  }

  async validate(): Promise<Model> {
    const ctx = this.ctx;
    const { account, password } = ctx.action.params.values || {};
    if (!account || !password) {
      ctx.throw(400, ctx.t('Please enter your username and password', { ns: namespace }));
    }
    const options = this.getOptions();
    if (!options.url || !options.baseDn) {
      throw new ConfigurationError('LDAP authenticator is not configured');
    }
    const client = new Client({ url: options.url });
    try {
      if (options.bindDn) {
        try {
          await client.bind(options.bindDn, options.bindPassword || '');
        } catch (error) {
          ctx.log.warn(`ldap: service bind failed: ${error instanceof Error ? error.message : String(error)}`, {
            method: 'ldap.validate',
          });
          throw new ConfigurationError('LDAP service account bind failed');
        }
      }
      const filterTemplate = options.filterTemplate || '(uid={{username}})';
      const filter = filterTemplate.replace(/\{\{\s*username\s*\}\}/g, escapeLdapFilter(String(account)));
      const mapping: Required<LdapAttributesMapping> = { email: 'mail', nickname: 'cn', ...options.attributesMapping };
      const attributes = Array.from(new Set(Object.values(mapping).filter((attr): attr is string => !!attr)));
      const { searchEntries } = await client.search(options.baseDn, { scope: 'sub', filter, attributes });
      const entry = (searchEntries[0] || {}) as Record<string, unknown>;
      if (!entry.dn) {
        ctx.throw(401, ctx.t('The username or password is incorrect, please re-enter', { ns: namespace }));
      }
      try {
        await client.bind(String(entry.dn), String(password));
      } catch (error) {
        ctx.log.warn(`ldap: user bind failed: ${error instanceof Error ? error.message : String(error)}`, {
          method: 'ldap.validate',
        });
        ctx.throw(401, ctx.t('The username or password is incorrect, please re-enter', { ns: namespace }));
      }
      const email = entryValue(entry, mapping.email);
      const username = entryValue(entry, mapping.username) || String(account);
      return await this.findOrCreateUser(String(entry.dn), {
        email,
        nickname: entryValue(entry, mapping.nickname) || username,
        username: this.validateUsername(username) ? username : undefined,
      });
    } finally {
      try {
        await client.unbind();
      } catch {
        // the connection may already be closed; nothing to clean up
      }
    }
  }

  /**
   * Map the LDAP entry to a NocoBase user: match the linked user by uuid (entry DN) first,
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
