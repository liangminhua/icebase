/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import axios from 'axios';
import { createMockServer, MockServer } from '@nocobase/test';
import type { Mock } from 'vitest';
import PluginDingtalkServer from '../plugin';
import { DINGTALK_API_BASE, DINGTALK_CONTACT_ME_PATH, DINGTALK_USER_ACCESS_TOKEN_PATH } from '../constants';

vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>();
  return {
    ...actual,
    default: {
      ...actual.default,
      get: vi.fn(),
      post: vi.fn(),
    },
  };
});

const mockedGet = axios.get as unknown as Mock;
const mockedPost = axios.post as unknown as Mock;

describe('dingtalk sign-in', () => {
  let app: MockServer;
  let agent: ReturnType<MockServer['agent']>;
  const authenticatorName = 'dingtalk-main';

  beforeAll(async () => {
    app = await createMockServer({
      plugins: ['field-sort', 'users', 'auth', [PluginDingtalkServer, { name: 'dingtalk' }]],
    });
    agent = app.agent();
    await app.db.getRepository('authenticators').create({
      values: {
        name: authenticatorName,
        authType: 'dingtalk',
        enabled: true,
        options: {
          appKey: 'test-app-key',
          appSecret: 'test-app-secret',
        },
      },
    });
  });

  afterAll(async () => {
    await app.destroy();
  });

  beforeEach(() => {
    mockedGet.mockReset();
    mockedPost.mockReset();
    mockedPost.mockImplementation(async (url: string) => {
      if (url === `${DINGTALK_API_BASE}${DINGTALK_USER_ACCESS_TOKEN_PATH}`) {
        return { data: { accessToken: 'user-access-token', expireIn: 7200 } };
      }
      throw new Error(`unexpected POST ${url}`);
    });
    mockedGet.mockImplementation(async (url: string) => {
      if (url === `${DINGTALK_API_BASE}${DINGTALK_CONTACT_ME_PATH}`) {
        return {
          data: {
            unionId: 'union-1',
            nick: 'Ding User',
            mobile: '13800000001',
            email: 'ding@example.com',
          },
        };
      }
      throw new Error(`unexpected GET ${url}`);
    });
  });

  it('redirects to the dingtalk authorization page', async () => {
    const res = await agent.get(`/dingtalk:auth?authenticator=${authenticatorName}&redirect=/admin`);
    expect(res.status).toBe(302);
    const location = new URL(res.headers.location);
    expect(location.origin + location.pathname).toBe('https://login.dingtalk.com/oauth2/auth');
    expect(location.searchParams.get('client_id')).toBe('test-app-key');
    expect(location.searchParams.get('response_type')).toBe('code');
    expect(location.searchParams.get('scope')).toBe('openid');
    expect(location.searchParams.get('redirect_uri')).toBeTruthy();
    expect(location.searchParams.get('state')).toBeTruthy();
  });

  it('creates the user on first sign-in and reuses it on the next one', async () => {
    const authRes = await agent.get(`/dingtalk:auth?authenticator=${authenticatorName}&redirect=/admin`);
    const state = new URL(authRes.headers.location).searchParams.get('state');

    const callbackRes = await agent.get(`/dingtalk:callback?authCode=the-code&state=${encodeURIComponent(state)}`);
    expect(callbackRes.status).toBe(302);
    const target = new URL(callbackRes.headers.location, 'http://localhost');
    expect(target.pathname).toBe('/admin');
    expect(target.searchParams.get('authenticator')).toBe(authenticatorName);
    const token = target.searchParams.get('token');
    expect(token).toBeTruthy();

    const userRepo = app.db.getRepository('users');
    const user = await userRepo.findOne({ filter: { phone: '13800000001' } });
    expect(user).toBeTruthy();
    expect(user.nickname).toBe('Ding User');
    expect(user.email).toBe('ding@example.com');

    // the authorization code has been exchanged with the mocked token endpoint
    expect(mockedPost).toHaveBeenCalledWith(
      `${DINGTALK_API_BASE}${DINGTALK_USER_ACCESS_TOKEN_PATH}`,
      expect.objectContaining({ clientId: 'test-app-key', code: 'the-code', grantType: 'authorization_code' }),
    );

    // sign in again with the same unionId: the same local user is matched, no duplicates
    const authRes2 = await agent.get(`/dingtalk:auth?authenticator=${authenticatorName}`);
    const state2 = new URL(authRes2.headers.location).searchParams.get('state');
    await agent.get(`/dingtalk:callback?authCode=another-code&state=${encodeURIComponent(state2)}`);
    const users = await userRepo.find({ filter: { phone: '13800000001' } });
    expect(users.length).toBe(1);
  });
});
