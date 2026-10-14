/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

export interface CasAuthenticatorOptions {
  /** CAS server base URL, e.g. https://cas.example.com/cas */
  casBaseUrl?: string;
  /** The base URL of this NocoBase as registered in CAS; falls back to the request origin. */
  serviceName?: string;
}

/** Thrown when the authenticator options are missing; surfaces as a 500 response. */
export class ConfigurationError extends Error {
  status = 500;
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

/** Thrown when the CAS server refuses the ticket; surfaces as a 401 response. */
export class CasAuthenticationError extends Error {
  status = 401;
  constructor(message: string) {
    super(message);
    this.name = 'CasAuthenticationError';
  }
}

export function normalizeCasBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

/**
 * Extract the authenticated user from a CAS serviceValidate XML response.
 * The namespace prefix is not fixed across CAS servers, so element names are matched
 * with an optional prefix instead of pulling in an XML parser dependency.
 */
export function parseCasAuthentication(xml: string): string {
  const userMatch = xml.match(/<(?:[\w.-]+:)?user>\s*([^<]+?)\s*<\//);
  if (/<(?:[\w.-]+:)?authenticationSuccess[\s>]/.test(xml) && userMatch) {
    return userMatch[1];
  }
  const failureMatch = xml.match(/<(?:[\w.-]+:)?authenticationFailure[^>]*>([\s\S]*?)<\//);
  if (failureMatch) {
    throw new CasAuthenticationError(failureMatch[1]?.trim() || 'CAS authentication failed');
  }
  throw new CasAuthenticationError('Invalid CAS serviceValidate response');
}

export async function fetchCasServiceValidate(validateUrl: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(validateUrl);
  } catch (error) {
    throw new CasAuthenticationError(
      `CAS serviceValidate request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!response.ok) {
    throw new CasAuthenticationError(`CAS serviceValidate responded with status ${response.status}`);
  }
  return response.text();
}

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
