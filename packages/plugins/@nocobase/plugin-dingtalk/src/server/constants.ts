/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// DingTalk open platform endpoints, kept as constants so tests can assert against them.
export const DINGTALK_OAUTH_AUTHORIZE_URL = 'https://login.dingtalk.com/oauth2/auth';
export const DINGTALK_API_BASE = 'https://api.dingtalk.com';
export const DINGTALK_USER_ACCESS_TOKEN_PATH = '/v1.0/oauth2/userAccessToken';
export const DINGTALK_CONTACT_ME_PATH = '/v1.0/contact/users/me';
export const DINGTALK_CORP_ACCESS_TOKEN_PATH = '/v1.0/oauth2/accessToken';
// Sub-department list: `${DINGTALK_API_BASE}${DINGTALK_SUB_DEPARTMENTS_PATH}/${deptId}/subDepartments`
export const DINGTALK_SUB_DEPARTMENTS_PATH = '/v1.0/contact/departments';
export const DINGTALK_DEPT_USERS_PATH = '/v1.0/contact/users';

export const DINGTALK_ROOT_DEPT_ID = 1;
export const DINGTALK_MAX_RESULTS = 100;

export interface DingTalkProviderConfig {
  appKey: string;
  appSecret: string;
  corpId?: string;
}

export interface DingTalkUserAccessToken {
  accessToken: string;
  expireIn: number;
  corpId?: string;
}

export interface DingTalkProfile {
  unionId: string;
  userid?: string;
  nick?: string;
  name?: string;
  avatarUrl?: string;
  mobile?: string;
  email?: string;
}

export interface DingTalkDepartment {
  deptId: number;
  name: string;
  parentDeptId?: number;
}

export interface DingTalkDeptUser {
  userid: string;
  unionId?: string;
  name?: string;
  mobile?: string;
  email?: string;
}
