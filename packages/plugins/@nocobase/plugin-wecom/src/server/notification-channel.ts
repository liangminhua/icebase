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

export interface WecomChannelMessage {
  title?: string;
  content: string;
}

/**
 * WeCom group robot channel. Posts markdown messages to the configured webhook.
 * @see https://developer.work.weixin.qq.com/document/path/91770
 */
export class WecomNotificationChannel extends BaseNotificationChannel<WecomChannelMessage> {
  async send(params: {
    channel: { name: string; options: Record<string, string>; notificationType?: string };
    message: WecomChannelMessage;
    receivers?: unknown;
  }): Promise<{ message: WecomChannelMessage; status: 'success' | 'failure'; reason?: string }> {
    const { channel, message } = params;
    const { webhookUrl } = channel?.options ?? {};
    if (!webhookUrl) {
      return { message, status: 'failure', reason: 'webhookUrl is required' };
    }
    const title = message?.title;
    const content = title ? `**${title}**\n${message.content ?? ''}` : message?.content ?? '';
    try {
      const res = await axios.post(webhookUrl, {
        msgtype: 'markdown',
        markdown: {
          content,
        },
      });
      const data = res.data as { errcode?: number; errmsg?: string } | undefined;
      if (data?.errcode !== 0) {
        return { message, status: 'failure', reason: data?.errmsg || 'WeCom robot returned an error' };
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
