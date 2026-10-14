/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { BaseNotificationChannel } from '@nocobase/plugin-notification-manager';
import axios from 'axios';
import { signWebhookUrl } from './dingtalk-client';

export interface DingTalkChannelMessage {
  title?: string;
  content: string;
}

/**
 * DingTalk custom robot channel. Posts markdown messages to the configured webhook,
 * optionally signed with HMAC-SHA256 (`secret`).
 * @see https://open.dingtalk.com/document/orgapp/customize-robot-security-settings
 */
export class DingTalkNotificationChannel extends BaseNotificationChannel<DingTalkChannelMessage> {
  async send(params: {
    channel: { name: string; options: Record<string, string>; notificationType?: string };
    message: DingTalkChannelMessage;
    receivers?: unknown;
  }): Promise<{ message: DingTalkChannelMessage; status: 'success' | 'failure'; reason?: string }> {
    const { channel, message } = params;
    const { webhookUrl, secret } = channel?.options ?? {};
    if (!webhookUrl) {
      return { message, status: 'failure', reason: 'webhookUrl is required' };
    }
    const content = message?.content ?? '';
    const title = message?.title || 'NocoBase';
    const url = secret ? signWebhookUrl(webhookUrl, secret, Date.now()) : webhookUrl;
    try {
      const res = await axios.post(url, {
        msgtype: 'markdown',
        markdown: {
          title,
          text: content,
        },
      });
      const data = res.data as { errcode?: number; errmsg?: string } | undefined;
      if (data?.errcode !== 0) {
        return { message, status: 'failure', reason: data?.errmsg || 'DingTalk robot returned an error' };
      }
      return { message, status: 'success' };
    } catch (error) {
      return {
        message,
        status: 'failure',
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
