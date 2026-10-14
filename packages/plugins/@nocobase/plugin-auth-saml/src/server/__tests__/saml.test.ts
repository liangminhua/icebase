/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Database } from '@nocobase/database';
import { createMockServer, MockServer } from '@nocobase/test';
import * as nodeSaml from '@node-saml/node-saml';

vi.mock('@node-saml/node-saml', () => {
  const instances: Array<Record<string, unknown>> = [];
  class SAML {
    options: Record<string, unknown>;
    constructor(options: Record<string, unknown>) {
      this.options = options;
      instances.push(this);
    }
    async getAuthorizeUrlAsync(relayState: string): Promise<string> {
      return `https://idp.example.com/sso?SAMLRequest=fake&RelayState=${encodeURIComponent(relayState)}`;
    }
    async validatePostResponseAsync(container: Record<string, string>) {
      if (container.SAMLResponse === 'valid') {
        return {
          profile: {
            nameID: 'u@x.com',
            attributes: { email: ['u@x.com'], displayName: 'Sample User' },
          },
          loggedOut: false,
        };
      }
      if (container.SAMLResponse === 'valid-linked') {
        return {
          profile: {
            nameID: 'linked@x.com',
            attributes: { email: 'linked@x.com' },
          },
          loggedOut: false,
        };
      }
      throw new Error('Invalid SAML response');
    }
  }
  return { SAML, __instances: instances };
});

const samlMock = nodeSaml as unknown as {
  __instances: Array<{ options: Record<string, unknown> }>;
};

const idpMetadata = `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://idp.example.com/metadata">
  <md:IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:KeyDescriptor use="signing">
      <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
        <ds:X509Data>
          <ds:X509Certificate>MIIC-fake-certificate</ds:X509Certificate>
        </ds:X509Data>
      </ds:KeyInfo>
    </md:KeyDescriptor>
    <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://idp.example.com/sso-post"/>
    <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://idp.example.com/sso"/>
  </md:IDPSSODescriptor>
</md:EntityDescriptor>`;

describe('saml auth', () => {
  let app: MockServer;
  let db: Database;
  let agent;

  beforeAll(async () => {
    app = await createMockServer({
      plugins: ['field-sort', 'users', 'auth', 'acl', 'auth-saml', 'data-source-manager'],
    });
    db = app.db;
    agent = app.agent();
    await db.getRepository('authenticators').create({
      values: {
        name: 'saml-auth',
        authType: 'SAML',
        enabled: true,
        options: {
          idpMetadata,
          spEntityId: 'https://sp.example.com/metadata',
          spAcsUrl: 'http://localhost:13000/saml:callback?authenticator=saml-auth',
        },
      },
    });
  });

  afterAll(async () => {
    await app.destroy();
  });

  it('should return the IdP authorize url parsed from metadata', async () => {
    const res = await agent.get('/saml:getAuthUrl?authenticator=saml-auth&redirect=%2Fadmin%3Fpage%3D1');
    expect(res.status).toBe(200);
    const authUrl = res.body.data.authUrl as string;
    expect(authUrl).toContain('https://idp.example.com/sso');
    expect(authUrl).toContain(encodeURIComponent('/admin?page=1'));
    const client = samlMock.__instances[samlMock.__instances.length - 1];
    expect(client.options.entryPoint).toBe('https://idp.example.com/sso');
    expect(client.options.idpCert).toBe('MIIC-fake-certificate');
    expect(client.options.issuer).toBe('https://sp.example.com/metadata');
    expect(client.options.callbackUrl).toBe('http://localhost:13000/saml:callback?authenticator=saml-auth');
  });

  it('should create a new user and sign in via the callback', async () => {
    const res = await agent
      .post('/saml:callback?authenticator=saml-auth')
      .type('form')
      .send({ SAMLResponse: 'valid', RelayState: '/admin?page=1' });
    expect(res.status).toBe(302);
    const location = res.headers.location as string;
    expect(location).toContain('/admin?page=1');
    expect(location).toContain('authenticator=saml-auth');
    const token = new URL(`http://localhost${location}`).searchParams.get('token');
    expect(token).toBeTruthy();
    const payload = await app.authManager.jwt.decode(token);
    const user = await db.getRepository('users').findOne({ filter: { email: 'u@x.com' } });
    expect(user).toBeTruthy();
    expect(user.get('nickname')).toBe('Sample User');
    expect(payload.userId).toBe(user.id);
  });

  it('should link an existing user matched by email', async () => {
    const existing = await db.getRepository('users').create({
      values: { email: 'linked@x.com', nickname: 'Existing' },
    });
    const res = await agent
      .post('/saml:callback?authenticator=saml-auth')
      .type('form')
      .send({ SAMLResponse: 'valid-linked' });
    expect(res.status).toBe(302);
    const token = new URL(`http://localhost${res.headers.location}`).searchParams.get('token');
    const payload = await app.authManager.jwt.decode(token);
    expect(payload.userId).toBe(existing.id);
    const linked = await db.getRepository('usersAuthenticators').findOne({
      filter: { userId: existing.id, authenticator: 'saml-auth' },
    });
    expect(linked).toBeTruthy();
  });

  it('should reject an invalid SAML response and fall back to the signin page', async () => {
    const res = await agent
      .post('/saml:callback?authenticator=saml-auth')
      .type('form')
      .send({ SAMLResponse: 'invalid' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/signin');
    expect(res.headers.location).not.toContain('token=');
  });
});
