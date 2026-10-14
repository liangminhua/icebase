/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { Database, Model } from '@nocobase/database';
import type { Application } from '@nocobase/server';
import type { AuthModel } from '@nocobase/plugin-auth';
import { authType } from '../constant';
import { DingTalkClient } from './dingtalk-client';
import { DingTalkProviderConfig } from './constants';
import { matchOrCreateUser } from './user-mapping';

/**
 * Find the first enabled authenticator of this plugin's auth type.
 */
export async function getEnabledAuthenticator(db: Database, type: string, name?: string): Promise<AuthModel | null> {
  const repo = db.getRepository('authenticators');
  const filter: Record<string, unknown> = { authType: type, enabled: true };
  if (name) {
    filter.name = name;
  }
  const authenticator = await repo.findOne({ filter });
  return (authenticator as unknown as AuthModel) ?? null;
}

/**
 * Sync DingTalk departments into the local `departments` collection (created by @nocobase/plugin-departments).
 * The collection is matched by title; the tree is walked breadth-first so parents are always created before children.
 * Returns the number of departments written.
 */
export async function syncDingTalkDepartments(app: Application, config: DingTalkProviderConfig): Promise<number> {
  const departmentsCollection = app.db.getCollection('departments');
  if (!departmentsCollection) {
    app.logger.warn('dingtalk: departments collection does not exist, skip department sync');
    return 0;
  }
  const client = new DingTalkClient(config);
  const accessToken = await client.getCorpAccessToken();
  const departments = await client.listAllDepartments(accessToken);
  const repo = departmentsCollection.repository;
  const idMap = new Map<number, number>();
  let count = 0;
  for (const dept of departments) {
    if (!dept.deptId || !dept.name) {
      continue;
    }
    const parentDept = dept.parentDeptId ? idMap.get(dept.parentDeptId) : undefined;
    const record: Model = await repo.updateOrCreate({
      filterKeys: ['title'],
      values: {
        title: dept.name,
        ...(parentDept ? { parentId: parentDept } : {}),
      },
    });
    idMap.set(dept.deptId, record.id as number);
    count += 1;
  }
  return count;
}

/**
 * Sync DingTalk contacts into the local `users` collection. Users are deduplicated by userid
 * and matched/updated through `matchOrCreateUser`, so repeated runs are idempotent.
 * Returns the number of users processed.
 */
export async function syncDingTalkUsers(app: Application, config: DingTalkProviderConfig): Promise<number> {
  const client = new DingTalkClient(config);
  const accessToken = await client.getCorpAccessToken();
  const departments = await client.listAllDepartments(accessToken);
  const authenticator = await getEnabledAuthenticator(app.db, authType);
  const seen = new Set<string>();
  for (const dept of departments) {
    const deptUsers = await client.listDeptUsers(dept.deptId, accessToken);
    for (const profile of deptUsers) {
      if (!profile.userid || seen.has(profile.userid)) {
        continue;
      }
      seen.add(profile.userid);
      await matchOrCreateUser(app, authenticator, {
        uuid: profile.userid,
        username: profile.userid,
        nickname: profile.name || profile.userid,
        mobile: profile.mobile || undefined,
        email: profile.email || undefined,
      });
    }
  }
  return seen.size;
}
