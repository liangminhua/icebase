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
import { WECOM_API_BASE, WECOM_DEPARTMENT_LIST_PATH, WECOM_GET_TOKEN_PATH, WECOM_USER_LIST_PATH } from '../constants';

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

describe('wecom sync', () => {
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
    mockedGet.mockImplementation(async (url: string) => {
      if (url === `${WECOM_API_BASE}${WECOM_GET_TOKEN_PATH}`) {
        return { data: { errcode: 0, access_token: 'access-token', expires_in: 7200 } };
      }
      if (url === `${WECOM_API_BASE}${WECOM_DEPARTMENT_LIST_PATH}`) {
        return {
          data: {
            errcode: 0,
            department: [
              { id: 100, name: 'Dept A', parentid: 1 },
              { id: 101, name: 'Dept B', parentid: 100 },
            ],
          },
        };
      }
      if (url === `${WECOM_API_BASE}${WECOM_USER_LIST_PATH}`) {
        return {
          data: {
            errcode: 0,
            userlist: [
              { userid: 'u1', name: 'Alice', mobile: '13800000001', email: 'alice@example.com' },
              { userid: 'u2', name: 'Bob', mobile: '13800000002' },
            ],
          },
        };
      }
      throw new Error(`unexpected GET ${url}`);
    });
  });

  it('syncs departments into the departments collection idempotently', async () => {
    const loggedIn = await agent.login(1);
    const first = await loggedIn.resource('wecom').syncDepartments();
    expect(first.status).toBe(200);
    expect(first.body.data.count).toBe(2);

    const repo = app.db.getRepository('departments');
    const deptA = await repo.findOne({ filter: { title: 'Dept A' } });
    const deptB = await repo.findOne({ filter: { title: 'Dept B' } });
    expect(deptA).toBeTruthy();
    expect(deptB).toBeTruthy();
    expect(deptB.parentId).toBe(deptA.id);

    // second run must not duplicate departments
    await loggedIn.resource('wecom').syncDepartments();
    const all = await repo.find();
    expect(all.length).toBe(2);
  });

  it('syncs users into the users collection idempotently', async () => {
    const loggedIn = await agent.login(1);
    const first = await loggedIn.resource('wecom').syncUsers();
    expect(first.status).toBe(200);
    expect(first.body.data.count).toBe(2);

    const repo = app.db.getRepository('users');
    const alice = await repo.findOne({ filter: { username: 'u1' } });
    expect(alice).toBeTruthy();
    expect(alice.nickname).toBe('Alice');
    expect(alice.phone).toBe('13800000001');

    // second run must not duplicate users
    const second = await loggedIn.resource('wecom').syncUsers();
    expect(second.body.data.count).toBe(2);
    const alices = await repo.find({ filter: { username: 'u1' } });
    expect(alices.length).toBe(1);
  });
});
