/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { Model } from '@nocobase/database';
import type { Application } from '@nocobase/server';
import type { AuthModel } from '@nocobase/plugin-auth';

export interface RemoteUserProfile {
  /** Stable identity in the remote platform: wecom userid. */
  uuid: string;
  nickname?: string;
  mobile?: string;
  email?: string;
  username?: string;
}

/**
 * Map a remote user profile onto the local `users` collection:
 * 1. match by the stable uuid through the authenticator <-> users relation (the `usersAuthenticators` join table);
 * 2. match by mobile / username / email;
 * 3. fall back to `AuthModel.findOrCreateUser` which links the user through the join table.
 * Existing users are updated with non-empty profile values so repeated syncs stay idempotent.
 */
export async function matchOrCreateUser(
  app: Application,
  authenticator: AuthModel | null,
  profile: RemoteUserProfile,
): Promise<Model> {
  const userRepo = app.db.getRepository('users');

  if (authenticator) {
    const linked = await authenticator.findUser(profile.uuid);
    if (linked) {
      await updateProfile(userRepo, linked, profile);
      return (await userRepo.findOne({ filterByTk: linked.id })) ?? linked;
    }
  }

  const matchFilter = buildMatchFilter(profile);
  const user = matchFilter ? await userRepo.findOne({ filter: matchFilter }) : null;

  if (user) {
    await updateProfile(userRepo, user, profile);
    if (authenticator) {
      await authenticator.addUser(user, {
        through: {
          uuid: profile.uuid,
        },
      });
    }
    return (await userRepo.findOne({ filterByTk: user.id })) ?? user;
  }

  const userValues: Record<string, string> = {};
  if (profile.username) {
    userValues.username = profile.username;
  }
  if (profile.nickname) {
    userValues.nickname = profile.nickname;
  }
  if (profile.mobile) {
    userValues.phone = profile.mobile;
  }
  if (profile.email) {
    userValues.email = profile.email;
  }
  if (!Object.keys(userValues).length) {
    userValues.nickname = profile.uuid;
  }

  if (authenticator) {
    return await authenticator.findOrCreateUser(profile.uuid, userValues);
  }
  return await userRepo.create({ values: userValues });
}

function buildMatchFilter(profile: RemoteUserProfile): Record<string, unknown> | null {
  const or: Array<Record<string, string>> = [];
  if (profile.mobile) {
    or.push({ phone: profile.mobile }, { username: profile.mobile }, { email: profile.mobile });
  }
  if (profile.email) {
    or.push({ email: profile.email });
  }
  if (profile.username) {
    or.push({ username: profile.username });
  }
  return or.length ? { $or: or } : null;
}

async function updateProfile(userRepo, user: Model, profile: RemoteUserProfile) {
  const values: Record<string, string> = {};
  if (profile.nickname && user.get('nickname') !== profile.nickname) {
    values.nickname = profile.nickname;
  }
  if (profile.mobile && !user.get('phone')) {
    values.phone = profile.mobile;
  }
  if (profile.email && !user.get('email')) {
    values.email = profile.email;
  }
  if (!Object.keys(values).length) {
    return;
  }
  await userRepo.update({
    filterByTk: user.get('id') as number,
    values,
  });
}
