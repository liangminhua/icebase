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
import * as ldapts from 'ldapts';

vi.mock('ldapts', () => {
  const state = { entries: [] as Array<Record<string, unknown>> };
  const clients: Array<Record<string, unknown>> = [];
  class Client {
    binds: Array<[string, string]> = [];
    searches: Array<{ base: string; options: Record<string, unknown> }> = [];
    constructor(_options: Record<string, unknown>) {
      clients.push(this);
    }
    async bind(dn: string, password: string) {
      this.binds.push([dn, password]);
      if (password === 'wrong-user-password') {
        const error = new Error('invalid credentials');
        error.name = 'InvalidCredentialsError';
        throw error;
      }
    }
    async search(base: string, options: Record<string, unknown>) {
      this.searches.push({ base, options });
      return { searchEntries: state.entries };
    }
    async unbind() {}
  }
  return { Client, __state: state, __clients: clients };
});

const ldaptsMock = ldapts as unknown as {
  __state: { entries: Array<Record<string, unknown>> };
  __clients: Array<{
    binds: Array<[string, string]>;
    searches: Array<{ base: string; options: Record<string, unknown> }>;
  }>;
};

describe('ldap auth', () => {
  let app: MockServer;
  let db: Database;
  let agent;

  beforeAll(async () => {
    app = await createMockServer({
      plugins: ['field-sort', 'users', 'auth', 'acl', 'auth-ldap', 'data-source-manager'],
    });
    db = app.db;
    agent = app.agent();
    await db.getRepository('authenticators').create({
      values: {
        name: 'ldap-auth',
        authType: 'LDAP',
        enabled: true,
        options: {
          url: 'ldap://ldap.example.com',
          baseDn: 'dc=example,dc=com',
          bindDn: 'cn=service,dc=example,dc=com',
          bindPassword: 'service-secret',
          attributesMapping: { email: 'mail', nickname: 'cn' },
        },
      },
    });
  });

  afterAll(async () => {
    await app.destroy();
  });

  it('should create a new user when LDAP bind succeeds', async () => {
    ldaptsMock.__state.entries = [
      { dn: 'uid=newuser,dc=example,dc=com', uid: 'newuser', mail: 'new@x.com', cn: 'New User' },
    ];
    const res = await agent
      .set({ 'X-Authenticator': 'ldap-auth' })
      .post('/auth:signIn')
      .send({ account: 'newuser', password: 'right' });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.token).toBeDefined();
    const user = await db.getRepository('users').findOne({ filter: { email: 'new@x.com' } });
    expect(user.get('nickname')).toBe('New User');
    expect(user.get('username')).toBe('newuser');
    const client = ldaptsMock.__clients[ldaptsMock.__clients.length - 1];
    expect(client.binds[0]).toEqual(['cn=service,dc=example,dc=com', 'service-secret']);
    expect(client.binds[1]).toEqual(['uid=newuser,dc=example,dc=com', 'right']);
    expect(client.searches[0].options.filter).toBe('(uid=newuser)');
  });

  it('should reject a wrong password', async () => {
    ldaptsMock.__state.entries = [{ dn: 'uid=bob,dc=example,dc=com', uid: 'bob', mail: 'bob@x.com', cn: 'Bob' }];
    const res = await agent
      .set({ 'X-Authenticator': 'ldap-auth' })
      .post('/auth:signIn')
      .send({ account: 'bob', password: 'wrong-user-password' });
    expect(res.statusCode).toBe(401);
    const user = await db.getRepository('users').findOne({ filter: { email: 'bob@x.com' } });
    expect(user).toBeFalsy();
  });

  it('should reject when the user is not found in LDAP', async () => {
    ldaptsMock.__state.entries = [];
    const res = await agent
      .set({ 'X-Authenticator': 'ldap-auth' })
      .post('/auth:signIn')
      .send({ account: 'ghost', password: 'right' });
    expect(res.statusCode).toBe(401);
  });

  it('should link an existing user matched by username or email', async () => {
    const existing = await db.getRepository('users').create({
      values: { username: 'alice', email: 'alice@x.com', nickname: 'Alice' },
    });
    ldaptsMock.__state.entries = [
      { dn: 'uid=alice,dc=example,dc=com', uid: 'alice', mail: 'alice@x.com', cn: 'Alice LDAP' },
    ];
    const res = await agent
      .set({ 'X-Authenticator': 'ldap-auth' })
      .post('/auth:signIn')
      .send({ account: 'alice', password: 'right' });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.user.id).toBe(existing.id);
    expect(res.body.data.user.nickname).toBe('Alice');
    const linked = await db.getRepository('usersAuthenticators').findOne({
      filter: { userId: existing.id, authenticator: 'ldap-auth' },
    });
    expect(linked).toBeTruthy();
  });
});
