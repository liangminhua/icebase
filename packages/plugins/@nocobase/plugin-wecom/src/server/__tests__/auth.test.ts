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
import PluginWecomServer from '../plugin';
import {
  WECOM_API_BASE,
  WECOM_GET_TOKEN_PATH,
  WECOM_GET_USER_INFO_PATH,
  WECOM_GET_USER_PATH,
  WECOM_OAUTH_AUTHORIZE_URL,
} from '../constants';

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

describe('wecom sign-in', () => {
  let app: MockServer;
  let agent: ReturnType<MockServer['agent']>;
  const authenticatorName = 'wecom-main';

  beforeAll(async () => {
    app = await createMockServer({
      plugins: ['field-sort', 'users', 'auth', [PluginWecomServer, { name: 'wecom' }]],
    });
    agent = app.agent();
    await app.db.getRepository('authenticators').create({
      values: {
        name: authenticatorName,
        authType: 'wecom',
        enabled: true,
        options: {
          corpId: 'ww-corp-id',
          agentId: '1000002',
          secret: 'test-secret',
        },
      },
    });
  });

  afterAll(async () => {
    await app.destroy();
  });

  beforeEach(() => {
    mockedGet.mockReset();
    mockedGet.mockImplementation(async (url: string) => {
      if (url === `${WECOM_API_BASE}${WECOM_GET_TOKEN_PATH}`) {
        return { data: { errcode: 0, access_token: 'access-token', expires_in: 7200 } };
      }
      if (url === `${WECOM_API_BASE}${WECOM_GET_USER_INFO_PATH}`) {
        return { data: { errcode: 0, userid: 'user-1' } };
      }
      if (url === `${WECOM_API_BASE}${WECOM_GET_USER_PATH}`) {
        return {
          data: {
            errcode: 0,
            userid: 'user-1',
            name: 'WeCom User',
            mobile: '13800000001',
            email: 'wecom@example.com',
          },
        };
      }
      throw new Error(`unexpected GET ${url}`);
    });
  });

  it('redirects to the wecom authorization page', async () => {
    const res = await agent.get(`/wecom:auth?authenticator=${authenticatorName}&redirect=/admin`);
    expect(res.status).toBe(302);
    const location = new URL(res.headers.location);
    expect(location.origin + location.pathname).toBe(WECOM_OAUTH_AUTHORIZE_URL);
    expect(location.hash).toBe('#wechat_redirect');
    expect(location.searchParams.get('corpid')).toBe('ww-corp-id');
    expect(location.searchParams.get('agentid')).toBe('1000002');
    expect(location.searchParams.get('response_type')).toBe('code');
    expect(location.searchParams.get('scope')).toBe('snsapi_base');
    expect(location.searchParams.get('redirect_uri')).toBeTruthy();
    expect(location.searchParams.get('state')).toBeTruthy();
  });

  it('creates the user on first sign-in and reuses it on the next one', async () => {
    const authRes = await agent.get(`/wecom:auth?authenticator=${authenticatorName}&redirect=/admin`);
    const state = new URL(authRes.headers.location).searchParams.get('state');

    const callbackRes = await agent.get(`/wecom:callback?code=the-code&state=${encodeURIComponent(state)}`);
    expect(callbackRes.status).toBe(302);
    const target = new URL(callbackRes.headers.location, 'http://localhost');
    expect(target.pathname).toBe('/admin');
    expect(target.searchParams.get('authenticator')).toBe(authenticatorName);
    const token = target.searchParams.get('token');
    expect(token).toBeTruthy();

    const userRepo = app.db.getRepository('users');
    const user = await userRepo.findOne({ filter: { phone: '13800000001' } });
    expect(user).toBeTruthy();
    expect(user.nickname).toBe('WeCom User');
    expect(user.email).toBe('wecom@example.com');

    // the authorization code has been exchanged with the mocked endpoints
    expect(mockedGet).toHaveBeenCalledWith(
      `${WECOM_API_BASE}${WECOM_GET_TOKEN_PATH}`,
      expect.objectContaining({ params: expect.objectContaining({ corpid: 'ww-corp-id', corpsecret: 'test-secret' }) }),
    );
    expect(mockedGet).toHaveBeenCalledWith(
      `${WECOM_API_BASE}${WECOM_GET_USER_INFO_PATH}`,
      expect.objectContaining({ params: expect.objectContaining({ code: 'the-code' }) }),
    );

    // sign in again with the same userid: the same local user is matched, no duplicates
    const authRes2 = await agent.get(`/wecom:auth?authenticator=${authenticatorName}`);
    const state2 = new URL(authRes2.headers.location).searchParams.get('state');
    await agent.get(`/wecom:callback?code=another-code&state=${encodeURIComponent(state2)}`);
    const users = await userRepo.find({ filter: { phone: '13800000001' } });
    expect(users.length).toBe(1);
  });
});
