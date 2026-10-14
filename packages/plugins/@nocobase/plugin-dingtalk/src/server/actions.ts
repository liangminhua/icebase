/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Context, Next } from '@nocobase/actions';
import { NAMESPACE, authType, resourceName } from '../constant';
import { DingTalkAuth, decodeState, encodeState, validateRedirect } from './dingtalk-auth';
import { getEnabledAuthenticator, syncDingTalkDepartments, syncDingTalkUsers } from './sync';
import type { PluginDingtalkServer } from './plugin';

/**
 * GET dingtalk:auth — redirect the browser to the DingTalk authorization page.
 */
export async function authAction(ctx: Context, next: Next) {
  const query = ctx.query as { authenticator?: string; redirect?: string };
  let name = query.authenticator;
  if (!name) {
    const authenticator = await getEnabledAuthenticator(ctx.db, authType);
    name = authenticator?.name;
  }
  if (!name) {
    ctx.throw(400, ctx.t('DingTalk is not configured yet', { ns: NAMESPACE }));
  }
  const auth = (await ctx.app.authManager.get(name, ctx)) as DingTalkAuth;
  const callbackUrl = auth.getCallbackUrl(ctx.origin);
  const state = encodeState({ name, redirect: validateRedirect(query.redirect, ctx.origin) });
  ctx.withoutDataWrapping = true;
  ctx.redirect(auth.buildAuthorizeUrl(callbackUrl, state));
  await next();
}

/**
 * GET dingtalk:callback — exchange the authorization code, match/create the user and
 * redirect back to the app with `?token=&authenticator=` (consumed by the auth providers).
 */
export async function callbackAction(ctx: Context, next: Next) {
  const query = ctx.query as { authCode?: string; code?: string; state?: string; authenticator?: string };
  const state = decodeState(query.state);
  if (query.state && !state) {
    ctx.throw(400, ctx.t('Invalid state parameter', { ns: NAMESPACE }));
  }
  const name = state?.name || query.authenticator;
  if (!name) {
    ctx.throw(400, ctx.t('DingTalk is not configured yet', { ns: NAMESPACE }));
  }
  const redirect = validateRedirect(state?.redirect, ctx.origin);
  const auth = (await ctx.app.authManager.get(name, ctx)) as DingTalkAuth;
  const result = await auth.signIn();
  const token = (result as { token?: string })?.token;
  const user = (result as { user?: { id?: number } })?.user;
  ctx.log.info('dingtalk sign-in callback', { authenticator: name, userId: user?.id });
  const joiner = redirect.includes('?') ? '&' : '?';
  ctx.withoutDataWrapping = true;
  ctx.redirect(
    `${redirect}${joiner}token=${encodeURIComponent(token ?? '')}&authenticator=${encodeURIComponent(name)}`,
  );
  await next();
}

export async function syncDepartmentsAction(ctx: Context, next: Next) {
  const plugin = ctx.app.getPlugin(resourceName) as PluginDingtalkServer;
  const count = await plugin.syncDepartments();
  ctx.body = { count };
  await next();
}

export async function syncUsersAction(ctx: Context, next: Next) {
  const plugin = ctx.app.getPlugin(resourceName) as PluginDingtalkServer;
  const count = await plugin.syncUsers();
  ctx.body = { count };
  await next();
}
