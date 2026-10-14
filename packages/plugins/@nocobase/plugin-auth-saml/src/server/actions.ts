/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Context, Next } from '@nocobase/actions';
import { buildRedirectPath, resolveSigninPrefix, resolveSubAppSegment } from '@nocobase/plugin-auth';
import { namespace } from '../constants';
import { SAMLAuth } from './saml-auth';

/** Only accept root-relative paths to avoid open redirects. */
export function sanitizeRedirect(value: unknown): string {
  if (typeof value !== 'string') {
    return '/admin';
  }
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('://')) {
    return '/admin';
  }
  return value;
}

function requireAuthenticatorName(ctx: Context): string {
  const name = ctx.query.authenticator;
  if (typeof name !== 'string' || !name) {
    ctx.throw(400, ctx.t('Authenticator name is required', { ns: namespace }));
  }
  return name;
}

/** Called by the client sign-in button; responds with the IdP URL to navigate to. */
export async function getAuthUrl(ctx: Context, next: Next) {
  const name = requireAuthenticatorName(ctx);
  const auth = (await ctx.app.authManager.get(name, ctx)) as SAMLAuth;
  const authUrl = await auth.getAuthorizeUrl(sanitizeRedirect(ctx.query.redirect));
  ctx.body = { authUrl };
  await next();
}

/** The IdP POSTs the SAML response here; sign the user in and redirect back to the app. */
export async function callback(ctx: Context, next: Next) {
  const name = requireAuthenticatorName(ctx);
  const body = (ctx.request.body || {}) as Record<string, string>;
  const redirect = sanitizeRedirect(body.RelayState || ctx.query.redirect);
  const appPublicPath = process.env.APP_PUBLIC_PATH || '';
  const subAppSegment = await resolveSubAppSegment(ctx.req, ctx.app.name);
  try {
    const auth = (await ctx.app.authManager.get(name, ctx)) as SAMLAuth;
    const { token } = await auth.signIn();
    const target = buildRedirectPath({ appPublicPath, subAppSegment, target: redirect });
    const sep = target.includes('?') ? '&' : '?';
    ctx.redirect(`${target}${sep}authenticator=${encodeURIComponent(name)}&token=${encodeURIComponent(token)}`);
  } catch (error) {
    ctx.log.warn(`saml: sign in failed: ${error instanceof Error ? error.message : String(error)}`, {
      method: 'saml.callback',
    });
    const signinPrefix = resolveSigninPrefix({ appPublicPath, redirect, subAppSegment });
    ctx.redirect(`${signinPrefix}/signin?authenticator=${encodeURIComponent(name)}`);
  }
  await next();
}

export default { getAuthUrl, callback };
