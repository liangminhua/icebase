/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { SAML } from '@node-saml/node-saml';

export interface SamlAuthenticatorOptions {
  /** IdP metadata, either an XML string or an HTTP(S) URL pointing to it. */
  idpMetadata?: string;
  spEntityId?: string;
  spAcsUrl?: string;
  spPrivateKey?: string;
  wantAssertionsSigned?: boolean;
}

/** Thrown when the authenticator options are missing or unusable; surfaces as a 500 response. */
export class ConfigurationError extends Error {
  status = 500;
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);

async function resolveIdpMetadata(config: string): Promise<string> {
  if (!isHttpUrl(config)) {
    return config;
  }
  const response = await fetch(config);
  if (!response.ok) {
    throw new ConfigurationError(`Failed to fetch IdP metadata from ${config}`);
  }
  return response.text();
}

/**
 * Extract the IdP entry point (HTTP-Redirect binding preferred) and the signing certificate
 * from an IdP metadata XML document. node-saml requires an explicit idpCert, so we derive it
 * from the metadata instead of asking administrators to maintain a separate certificate.
 */
export function parseIdpMetadata(xml: string): { entryPoint: string; idpCert: string } {
  const certMatch = xml.match(/<(?:[\w.-]+:)?X509Certificate>\s*([^<]+?)\s*<\//);
  const elements = xml.match(/<(?:[\w.-]+:)?SingleSignOnService\b[^>]*>/g) || [];
  let entryPoint = '';
  let postEntryPoint = '';
  for (const element of elements) {
    const location = element.match(/Location="([^"]+)"/)?.[1];
    if (!location) {
      continue;
    }
    const binding = element.match(/Binding="([^"]+)"/)?.[1] || '';
    if (binding.includes('HTTP-Redirect')) {
      entryPoint = location;
      break;
    }
    if (binding.includes('HTTP-POST')) {
      postEntryPoint = postEntryPoint || location;
    }
  }
  entryPoint = entryPoint || postEntryPoint;
  const idpCert = certMatch?.[1]?.trim();
  if (!entryPoint || !idpCert) {
    throw new ConfigurationError('Invalid IdP metadata: SingleSignOnService or X509Certificate is missing');
  }
  return { entryPoint, idpCert };
}

export function getSamlOptions(options: Record<string, unknown> | undefined | null): SamlAuthenticatorOptions {
  return (options || {}) as SamlAuthenticatorOptions;
}

export async function createSamlClient(options: SamlAuthenticatorOptions): Promise<SAML> {
  if (!options.idpMetadata || !options.spEntityId || !options.spAcsUrl) {
    throw new ConfigurationError('SAML authenticator is not configured');
  }
  const metadata = await resolveIdpMetadata(options.idpMetadata);
  const { entryPoint, idpCert } = parseIdpMetadata(metadata);
  return new SAML({
    issuer: options.spEntityId,
    callbackUrl: options.spAcsUrl,
    idpCert,
    entryPoint,
    ...(options.spPrivateKey ? { privateKey: options.spPrivateKey } : {}),
    ...(options.wantAssertionsSigned != null ? { wantAssertionsSigned: !!options.wantAssertionsSigned } : {}),
  });
}
