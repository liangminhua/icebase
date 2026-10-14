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

const successXml = `<cas:serviceResponse xmlns:cas="http://www.yale.edu/tp/cas">
  <cas:authenticationSuccess>
    <cas:user>u@x.com</cas:user>
  </cas:authenticationSuccess>
</cas:serviceResponse>`;

const failureXml = `<cas:serviceResponse xmlns:cas="http://www.yale.edu/tp/cas">
  <cas:authenticationFailure code="INVALID_TICKET">Ticket ST-1 not recognized</cas:authenticationFailure>
</cas:serviceResponse>`;

describe('cas auth', () => {
  let app: MockServer;
  let db: Database;
  let agent;
  let fetchMock: ReturnType<typeof vi.fn>;
  const originalFetch = globalThis.fetch;

  beforeAll(async () => {
    app = await createMockServer({
      plugins: ['field-sort', 'users', 'auth', 'acl', 'auth-cas', 'data-source-manager'],
    });
    db = app.db;
    agent = app.agent();
    await db.getRepository('authenticators').create({
      values: {
        name: 'cas-auth',
        authType: 'CAS',
        enabled: true,
        options: {
          casBaseUrl: 'https://cas.example.com/cas',
          serviceName: 'http://localhost:13000',
        },
      },
    });
  });

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  afterAll(async () => {
    await app.destroy();
  });

  it('should return the CAS login url', async () => {
    const res = await agent.get('/cas:getAuthUrl?authenticator=cas-auth&redirect=%2Fadmin');
    expect(res.status).toBe(200);
    const authUrl = res.body.data.authUrl as string;
    expect(authUrl).toContain('https://cas.example.com/cas/login?service=');
    const service = decodeURIComponent(authUrl.split('service=')[1]);
    expect(service).toBe('http://localhost:13000/cas:callback?authenticator=cas-auth&redirect=%2Fadmin');
  });

  it('should create a new user and sign in via the callback', async () => {
    fetchMock.mockResolvedValue({ ok: true, text: async () => successXml });
    const res = await agent.get('/cas:callback?authenticator=cas-auth&ticket=ST-1&redirect=%2Fadmin').redirects(0);
    expect(res.status).toBe(302);
    const location = res.headers.location as string;
    expect(location).toContain('/admin');
    expect(location).toContain('authenticator=cas-auth');
    const token = new URL(`http://localhost${location}`).searchParams.get('token');
    expect(token).toBeTruthy();
    const payload = await app.authManager.jwt.decode(token);
    const user = await db.getRepository('users').findOne({ filter: { email: 'u@x.com' } });
    expect(user).toBeTruthy();
    expect(payload.userId).toBe(user.id);
    const validateUrl = fetchMock.mock.calls[0][0] as string;
    expect(validateUrl).toContain('https://cas.example.com/cas/serviceValidate?ticket=ST-1&service=');
    const service = decodeURIComponent(validateUrl.split('service=')[1]);
    expect(service).toBe('http://localhost:13000/cas:callback?authenticator=cas-auth&redirect=%2Fadmin');
  });

  it('should link an existing user matched by username', async () => {
    const existing = await db.getRepository('users').create({
      values: { username: 'bob', nickname: 'Bob' },
    });
    fetchMock.mockResolvedValue({ ok: true, text: async () => successXml.replace('u@x.com', 'bob') });
    const res = await agent.get('/cas:callback?authenticator=cas-auth&ticket=ST-2&redirect=%2Fadmin').redirects(0);
    expect(res.status).toBe(302);
    const token = new URL(`http://localhost${res.headers.location}`).searchParams.get('token');
    const payload = await app.authManager.jwt.decode(token);
    expect(payload.userId).toBe(existing.id);
    const linked = await db.getRepository('usersAuthenticators').findOne({
      filter: { userId: existing.id, authenticator: 'cas-auth' },
    });
    expect(linked).toBeTruthy();
  });

  it('should reject a failed CAS validation', async () => {
    fetchMock.mockResolvedValue({ ok: true, text: async () => failureXml });
    const res = await agent.get('/cas:callback?authenticator=cas-auth&ticket=ST-BAD&redirect=%2Fadmin').redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/signin');
    expect(res.headers.location).not.toContain('token=');
  });
});
