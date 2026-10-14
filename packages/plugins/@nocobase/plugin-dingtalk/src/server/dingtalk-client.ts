/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import crypto from 'crypto';
import axios from 'axios';
import {
  DINGTALK_API_BASE,
  DINGTALK_CONTACT_ME_PATH,
  DINGTALK_CORP_ACCESS_TOKEN_PATH,
  DINGTALK_DEPT_USERS_PATH,
  DINGTALK_MAX_RESULTS,
  DINGTALK_OAUTH_AUTHORIZE_URL,
  DINGTALK_ROOT_DEPT_ID,
  DINGTALK_SUB_DEPARTMENTS_PATH,
  DINGTALK_USER_ACCESS_TOKEN_PATH,
  DingTalkDeptUser,
  DingTalkDepartment,
  DingTalkProfile,
  DingTalkProviderConfig,
  DingTalkUserAccessToken,
} from './constants';

/**
 * Build the QR code / web authorization page URL of DingTalk.
 * @see https://open.dingtalk.com/document/orgapp/tutorial-obtaining-user-personal-information
 */
export function buildAuthorizeUrl(options: {
  appKey: string;
  corpId?: string;
  redirectUri: string;
  state: string;
  scope?: string;
}): string {
  const params: Record<string, string> = {
    redirect_uri: options.redirectUri,
    response_type: 'code',
    client_id: options.appKey,
    scope: options.scope ?? 'openid',
    state: options.state,
  };
  if (options.corpId) {
    params.org_type = 'dingtalk';
    params.corpId = options.corpId;
  }
  return `${DINGTALK_OAUTH_AUTHORIZE_URL}?${new URLSearchParams(params).toString()}`;
}

/**
 * DingTalk custom robot signature: stringToSign = `${timestamp}\n${secret}`,
 * sign = base64(HmacSHA256(stringToSign, secret)), url-encoded and appended to the webhook URL.
 * @see https://open.dingtalk.com/document/orgapp/customize-robot-security-settings
 */
export function signWebhookUrl(webhookUrl: string, secret: string, timestamp: number): string {
  const stringToSign = `${timestamp}\n${secret}`;
  const hmac = crypto.createHmac('sha256', secret).update(stringToSign, 'utf8').digest('base64');
  const joiner = webhookUrl.includes('?') ? '&' : '?';
  return `${webhookUrl}${joiner}timestamp=${timestamp}&sign=${encodeURIComponent(hmac)}`;
}

export class DingTalkClient {
  constructor(protected config: DingTalkProviderConfig) {}

  async getUserAccessToken(code: string): Promise<DingTalkUserAccessToken> {
    const res = await axios.post(`${DINGTALK_API_BASE}${DINGTALK_USER_ACCESS_TOKEN_PATH}`, {
      clientId: this.config.appKey,
      clientSecret: this.config.appSecret,
      code,
      grantType: 'authorization_code',
    });
    return res.data as DingTalkUserAccessToken;
  }

  async getUserInfo(userAccessToken: string): Promise<DingTalkProfile> {
    const res = await axios.get(`${DINGTALK_API_BASE}${DINGTALK_CONTACT_ME_PATH}`, {
      headers: {
        'x-acs-dingtalk-access-token': userAccessToken,
      },
    });
    return res.data as DingTalkProfile;
  }

  async getCorpAccessToken(): Promise<string> {
    const res = await axios.post(`${DINGTALK_API_BASE}${DINGTALK_CORP_ACCESS_TOKEN_PATH}`, {
      appKey: this.config.appKey,
      appSecret: this.config.appSecret,
    });
    const data = res.data as { accessToken?: string };
    if (!data?.accessToken) {
      throw new Error('DingTalk did not return an accessToken');
    }
    return data.accessToken;
  }

  async listSubDepartments(deptId: number, accessToken: string): Promise<DingTalkDepartment[]> {
    const departments: DingTalkDepartment[] = [];
    let cursor = 0;
    let hasMore = true;
    while (hasMore) {
      const res = await axios.get(`${DINGTALK_API_BASE}${DINGTALK_SUB_DEPARTMENTS_PATH}/${deptId}/subDepartments`, {
        params: {
          cursor,
          maxResults: DINGTALK_MAX_RESULTS,
        },
        headers: {
          'x-acs-dingtalk-access-token': accessToken,
        },
      });
      const data = res.data as { result?: DingTalkDepartment[]; hasMore?: boolean; nextCursor?: number };
      departments.push(...(data.result ?? []));
      hasMore = Boolean(data.hasMore);
      cursor = data.nextCursor ?? 0;
    }
    return departments;
  }

  /**
   * Walk the department tree from the root department.
   */
  async listAllDepartments(accessToken: string): Promise<DingTalkDepartment[]> {
    const result: DingTalkDepartment[] = [];
    const root: DingTalkDepartment = { deptId: DINGTALK_ROOT_DEPT_ID, name: 'Root', parentDeptId: 0 };
    const queue: DingTalkDepartment[] = [root];
    const seen = new Set<number>();
    while (queue.length) {
      const current = queue.shift() as DingTalkDepartment;
      if (seen.has(current.deptId)) {
        continue;
      }
      seen.add(current.deptId);
      const children = await this.listSubDepartments(current.deptId, accessToken);
      for (const child of children) {
        result.push({ ...child, parentDeptId: current.deptId });
        queue.push(child);
      }
    }
    return result;
  }

  async listDeptUsers(deptId: number, accessToken: string): Promise<DingTalkDeptUser[]> {
    const users: DingTalkDeptUser[] = [];
    let cursor = 0;
    let hasMore = true;
    while (hasMore) {
      const res = await axios.get(`${DINGTALK_API_BASE}${DINGTALK_DEPT_USERS_PATH}`, {
        params: {
          deptId,
          cursor,
          maxResults: DINGTALK_MAX_RESULTS,
        },
        headers: {
          'x-acs-dingtalk-access-token': accessToken,
        },
      });
      const data = res.data as { list?: DingTalkDeptUser[]; hasMore?: boolean; nextCursor?: number };
      users.push(...(data.list ?? []));
      hasMore = Boolean(data.hasMore);
      cursor = data.nextCursor ?? 0;
    }
    return users;
  }
}
