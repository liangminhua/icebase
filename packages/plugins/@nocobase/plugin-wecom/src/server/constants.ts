/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// WeCom (WeChat Work) endpoints, kept as constants so tests can assert against them.
export const WECOM_OAUTH_AUTHORIZE_URL = 'https://open.weixin.qq.com/connect/oauth2/authorize';
export const WECOM_API_BASE = 'https://qyapi.weixin.qq.com';
export const WECOM_GET_TOKEN_PATH = '/cgi-bin/gettoken';
export const WECOM_GET_USER_INFO_PATH = '/cgi-bin/auth/getuserinfo';
export const WECOM_GET_USER_PATH = '/cgi-bin/user/get';
export const WECOM_DEPARTMENT_LIST_PATH = '/cgi-bin/department/list';
export const WECOM_USER_LIST_PATH = '/cgi-bin/user/list';

export interface WecomProviderConfig {
  corpId: string;
  agentId: string;
  secret: string;
}

export interface WecomProfile {
  userid: string;
  name?: string;
  mobile?: string;
  email?: string;
  department?: number[];
}

export interface WecomDepartment {
  id: number;
  name: string;
  parentid: number;
}

export interface WecomDeptUser {
  userid: string;
  name?: string;
  mobile?: string;
  email?: string;
  department?: number[];
}

export interface WecomResponse {
  errcode?: number;
  errmsg?: string;
}
