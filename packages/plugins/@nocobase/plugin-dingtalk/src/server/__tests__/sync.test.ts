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
import { DINGTALK_API_BASE, DINGTALK_CORP_ACCESS_TOKEN_PATH, DINGTALK_DEPT_USERS_PATH } from '../constants';

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

const departmentsResponse = (result: unknown[]) => ({ data: { result, hasMore: false } });

describe('dingtalk sync', () => {
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
    // Minimal departments collection (normally provided by @nocobase/plugin-departments).
    app.db.collection({
      name: 'departments',
      fields: [
        { type: 'string', name: 'title' },
        { type: 'bigInt', name: 'parentId' },
      ],
    });
    await app.db.sync();
  });

  afterAll(async () => {
    await app.destroy();
  });

  beforeEach(() => {
    mockedGet.mockReset();
    mockedPost.mockReset();
    mockedPost.mockImplementation(async (url: string) => {
      if (url === `${DINGTALK_API_BASE}${DINGTALK_CORP_ACCESS_TOKEN_PATH}`) {
        return { data: { accessToken: 'corp-access-token', expireIn: 7200 } };
      }
      throw new Error(`unexpected POST ${url}`);
    });
    mockedGet.mockImplementation(async (url: string) => {
      if (url === `${DINGTALK_API_BASE}/v1.0/contact/departments/1/subDepartments`) {
        return departmentsResponse([{ deptId: 100, name: 'Dept A', parentDeptId: 1 }]);
      }
      if (url === `${DINGTALK_API_BASE}/v1.0/contact/departments/100/subDepartments`) {
        return departmentsResponse([{ deptId: 101, name: 'Dept B', parentDeptId: 100 }]);
      }
      if (url === `${DINGTALK_API_BASE}/v1.0/contact/departments/101/subDepartments`) {
        return departmentsResponse([]);
      }
      if (url === `${DINGTALK_API_BASE}${DINGTALK_DEPT_USERS_PATH}`) {
        return {
          data: {
            list: [
              { userid: 'u1', unionId: 'union-1', name: 'Alice', mobile: '13800000001', email: 'alice@example.com' },
              { userid: 'u2', unionId: 'union-2', name: 'Bob', mobile: '13800000002' },
            ],
            hasMore: false,
          },
        };
      }
      throw new Error(`unexpected GET ${url}`);
    });
  });

  it('syncs departments into the departments collection idempotently', async () => {
    const loggedIn = await agent.login(1);
    const first = await loggedIn.resource('dingtalk').syncDepartments();
    expect(first.status).toBe(200);
    expect(first.body.data.count).toBe(2);

    const repo = app.db.getRepository('departments');
    const deptA = await repo.findOne({ filter: { title: 'Dept A' } });
    const deptB = await repo.findOne({ filter: { title: 'Dept B' } });
    expect(deptA).toBeTruthy();
    expect(deptB).toBeTruthy();
    expect(deptB.parentId).toBe(deptA.id);

    // second run must not duplicate departments
    await loggedIn.resource('dingtalk').syncDepartments();
    const all = await repo.find();
    expect(all.length).toBe(2);
  });

  it('syncs users into the users collection idempotently', async () => {
    const loggedIn = await agent.login(1);
    const first = await loggedIn.resource('dingtalk').syncUsers();
    expect(first.status).toBe(200);
    expect(first.body.data.count).toBe(2);

    const repo = app.db.getRepository('users');
    const alice = await repo.findOne({ filter: { username: 'u1' } });
    expect(alice).toBeTruthy();
    expect(alice.nickname).toBe('Alice');
    expect(alice.phone).toBe('13800000001');

    // second run must not duplicate users
    const second = await loggedIn.resource('dingtalk').syncUsers();
    expect(second.body.data.count).toBe(2);
    const alices = await repo.find({ filter: { username: 'u1' } });
    expect(alices.length).toBe(1);
  });
});
