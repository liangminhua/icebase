/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { Database } from '@nocobase/database';
import type { Application } from '@nocobase/server';
import type { AuthModel } from '@nocobase/plugin-auth';
import { authType } from '../constant';
import { WecomClient } from './wecom-client';
import { WecomProviderConfig } from './constants';
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
 * Sync WeCom departments into the local `departments` collection (created by @nocobase/plugin-departments).
 * The collection is matched by title; parents are processed before children so the tree links resolve.
 * Returns the number of departments written.
 */
export async function syncWecomDepartments(app: Application, config: WecomProviderConfig): Promise<number> {
  const departmentsCollection = app.db.getCollection('departments');
  if (!departmentsCollection) {
    app.logger.warn('wecom: departments collection does not exist, skip department sync');
    return 0;
  }
  const client = new WecomClient(config);
  const accessToken = await client.getAccessToken();
  const departments = await client.listDepartments(accessToken);
  // order parents before children so parentId can be resolved from the local id map
  const sorted = [...departments].sort((a, b) => (a.parentid ?? 0) - (b.parentid ?? 0));
  const repo = departmentsCollection.repository;
  const idMap = new Map<number, number>();
  let count = 0;
  for (const dept of sorted) {
    if (!dept.id || !dept.name) {
      continue;
    }
    const parentLocalId = idMap.get(dept.parentid);
    const record = await repo.updateOrCreate({
      filterKeys: ['title'],
      values: {
        title: dept.name,
        ...(parentLocalId ? { parentId: parentLocalId } : {}),
      },
    });
    idMap.set(dept.id, record.id as number);
    count += 1;
  }
  return count;
}

/**
 * Sync WeCom contacts into the local `users` collection. Users are deduplicated by userid
 * and matched/updated through `matchOrCreateUser`, so repeated runs are idempotent.
 * Returns the number of users processed.
 */
export async function syncWecomUsers(app: Application, config: WecomProviderConfig): Promise<number> {
  const client = new WecomClient(config);
  const accessToken = await client.getAccessToken();
  const departments = await client.listDepartments(accessToken);
  const authenticator = await getEnabledAuthenticator(app.db, authType);
  const seen = new Set<string>();
  for (const dept of departments) {
    const deptUsers = await client.listDeptUsers(accessToken, dept.id);
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
