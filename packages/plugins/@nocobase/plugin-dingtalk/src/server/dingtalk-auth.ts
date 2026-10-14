/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { AuthConfig, BaseAuth } from '@nocobase/auth';
import type { Model } from '@nocobase/database';
import type { AuthModel } from '@nocobase/plugin-auth';
import { NAMESPACE, resourceName } from '../constant';
import { DingTalkProfile } from './constants';
import { buildAuthorizeUrl, DingTalkClient } from './dingtalk-client';
import { matchOrCreateUser } from './user-mapping';

export interface AuthState {
  name?: string;
  redirect?: string;
}

export function encodeState(state: AuthState): string {
  return Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
}

export function decodeState(raw?: string): AuthState | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as AuthState;
    return typeof parsed === 'object' && parsed ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Only allow relative paths or same-origin absolute URLs as the post-login redirect target,
 * so a crafted state value cannot turn the callback into an open redirect.
 */
export function validateRedirect(redirect: string | undefined, origin: string): string {
  if (redirect && redirect.startsWith('/')) {
    return redirect;
  }
  if (redirect) {
    try {
      if (new URL(redirect).origin === origin) {
        return redirect;
      }
    } catch {
      // fall through
    }
  }
  return '/';
}

export class DingTalkAuth extends BaseAuth {
  constructor(config: AuthConfig) {
    super({
      ...config,
      userCollection: config.ctx.db.getCollection('users'),
    });
  }

  get providerConfig(): { appKey: string; appSecret: string; corpId?: string } {
    return {
      appKey: this.options?.appKey,
      appSecret: this.options?.appSecret,
      corpId: this.options?.corpId,
    };
  }

  getCallbackUrl(origin: string): string {
    return this.options?.redirectUri || `${origin}/api/${resourceName}:callback`;
  }

  buildAuthorizeUrl(callbackUrl: string, state: string): string {
    const { appKey, corpId } = this.providerConfig;
    return buildAuthorizeUrl({ appKey, corpId, redirectUri: callbackUrl, state });
  }

  /**
   * The authorization code arrives as the `authCode` (new OAuth) or `code` query parameter of the callback request.
   */
  async validate(): Promise<Model> {
    const ctx = this.ctx;
    const code = (ctx.query['authCode'] || ctx.query['code']) as string | undefined;
    if (!code) {
      ctx.throw(400, ctx.t('Authorization code is missing', { ns: NAMESPACE }));
    }
    const client = new DingTalkClient(this.providerConfig);
    let profile: DingTalkProfile;
    try {
      const token = await client.getUserAccessToken(code);
      profile = await client.getUserInfo(token.accessToken);
    } catch (error) {
      ctx.log.error(error, { method: 'dingtalk.validate' });
      ctx.throw(401, ctx.t('Failed to get user info', { ns: NAMESPACE }));
    }
    if (!profile?.unionId) {
      ctx.throw(401, ctx.t('Failed to get user info', { ns: NAMESPACE }));
    }
    return await matchOrCreateUser(ctx.app, this.authenticator as unknown as AuthModel, {
      uuid: profile.unionId,
      nickname: profile.nick || profile.name || profile.unionId,
      mobile: profile.mobile || undefined,
      email: profile.email || undefined,
    });
  }
}
