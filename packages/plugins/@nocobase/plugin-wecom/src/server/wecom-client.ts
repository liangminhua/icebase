/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import axios from 'axios';
import {
  WECOM_API_BASE,
  WECOM_DEPARTMENT_LIST_PATH,
  WECOM_GET_TOKEN_PATH,
  WECOM_GET_USER_INFO_PATH,
  WECOM_GET_USER_PATH,
  WECOM_OAUTH_AUTHORIZE_URL,
  WECOM_USER_LIST_PATH,
  WecomDepartment,
  WecomDeptUser,
  WecomProfile,
  WecomProviderConfig,
  WecomResponse,
} from './constants';

/**
 * Build the web authorization page URL of WeCom.
 * @see https://developer.work.weixin.qq.com/document/path/91022
 */
export function buildAuthorizeUrl(options: {
  corpId: string;
  agentId: string;
  redirectUri: string;
  state: string;
  scope?: string;
}): string {
  const params: Record<string, string> = {
    corpid: options.corpId,
    agentid: options.agentId,
    redirect_uri: options.redirectUri,
    response_type: 'code',
    scope: options.scope ?? 'snsapi_base',
    state: options.state,
  };
  return `${WECOM_OAUTH_AUTHORIZE_URL}?${new URLSearchParams(params).toString()}#wechat_redirect`;
}

export class WecomClient {
  constructor(protected config: WecomProviderConfig) {}

  async getAccessToken(): Promise<string> {
    const res = await axios.get(`${WECOM_API_BASE}${WECOM_GET_TOKEN_PATH}`, {
      params: {
        corpid: this.config.corpId,
        corpsecret: this.config.secret,
      },
    });
    const data = res.data as WecomResponse & { access_token?: string };
    if (!data?.access_token) {
      throw new Error(`Wecom gettoken failed: ${data?.errmsg || 'no access_token'}`);
    }
    return data.access_token;
  }

  /**
   * Exchange the OAuth code for the member userid.
   */
  async getUserIdByCode(accessToken: string, code: string): Promise<string> {
    const res = await axios.get(`${WECOM_API_BASE}${WECOM_GET_USER_INFO_PATH}`, {
      params: {
        access_token: accessToken,
        code,
      },
    });
    const data = res.data as WecomResponse & { userid?: string };
    if (data?.errcode && data.errcode !== 0) {
      throw new Error(data.errmsg || `Wecom getuserinfo failed: ${data.errcode}`);
    }
    if (!data?.userid) {
      throw new Error('Wecom getuserinfo did not return a userid');
    }
    return data.userid;
  }

  async getUser(accessToken: string, userid: string): Promise<WecomProfile> {
    const res = await axios.get(`${WECOM_API_BASE}${WECOM_GET_USER_PATH}`, {
      params: {
        access_token: accessToken,
        userid,
      },
    });
    const data = res.data as WecomProfile & WecomResponse;
    if (data?.errcode && data.errcode !== 0) {
      throw new Error(data.errmsg || `Wecom user/get failed: ${data.errcode}`);
    }
    return data;
  }

  async getUserInfoByCode(accessToken: string, code: string): Promise<WecomProfile> {
    const userid = await this.getUserIdByCode(accessToken, code);
    return await this.getUser(accessToken, userid);
  }

  async listDepartments(accessToken: string): Promise<WecomDepartment[]> {
    const res = await axios.get(`${WECOM_API_BASE}${WECOM_DEPARTMENT_LIST_PATH}`, {
      params: {
        access_token: accessToken,
      },
    });
    const data = res.data as WecomResponse & { department?: WecomDepartment[] };
    if (data?.errcode && data.errcode !== 0) {
      throw new Error(data.errmsg || `Wecom department/list failed: ${data.errcode}`);
    }
    return data?.department ?? [];
  }

  async listDeptUsers(accessToken: string, departmentId: number): Promise<WecomDeptUser[]> {
    const res = await axios.get(`${WECOM_API_BASE}${WECOM_USER_LIST_PATH}`, {
      params: {
        access_token: accessToken,
        department_id: departmentId,
        fetch_child: 1,
      },
    });
    const data = res.data as WecomResponse & { userlist?: WecomDeptUser[] };
    if (data?.errcode && data.errcode !== 0) {
      throw new Error(data.errmsg || `Wecom user/list failed: ${data.errcode}`);
    }
    return data?.userlist ?? [];
  }
}
