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
import type { Application } from '@nocobase/server';
import type { Mock } from 'vitest';
import { signWebhookUrl } from '../dingtalk-client';
import { DingTalkNotificationChannel } from '../notification-channel';

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

const mockedPost = axios.post as unknown as Mock;

const webhookUrl = 'https://oapi.dingtalk.com/robot/send?access_token=abc123';

describe('dingtalk webhook signature', () => {
  it('appends timestamp and HMAC-SHA256 sign of `${timestamp}\\n${secret}`', () => {
    const timestamp = 1700000000000;
    const secret = 'SEC8f2a1example-secret';
    const url = signWebhookUrl(webhookUrl, secret, timestamp);
    const expectedSign = encodeURIComponent(
      crypto.createHmac('sha256', secret).update(`${timestamp}\n${secret}`, 'utf8').digest('base64'),
    );
    expect(url).toBe(`${webhookUrl}&timestamp=${timestamp}&sign=${expectedSign}`);
  });

  it('uses ? as the joiner when the webhook url has no query string', () => {
    const url = signWebhookUrl('https://oapi.dingtalk.com/robot/send', 'secret', 1);
    expect(url).toContain('https://oapi.dingtalk.com/robot/send?timestamp=1&sign=');
  });
});

describe('dingtalk notification channel', () => {
  const app = {} as unknown as Application;

  beforeEach(() => {
    mockedPost.mockReset();
  });

  it('sends the markdown payload to the webhook', async () => {
    mockedPost.mockResolvedValue({ data: { errcode: 0, errmsg: 'ok' } });
    const channel = new DingTalkNotificationChannel(app);
    const result = await channel.send({
      channel: { name: 'ch', options: { webhookUrl }, notificationType: 'dingtalk' },
      message: { title: 'Weekly report', content: 'Hello **world**' },
    });
    expect(result.status).toBe('success');
    expect(mockedPost).toHaveBeenCalledTimes(1);
    expect(mockedPost).toHaveBeenCalledWith(webhookUrl, {
      msgtype: 'markdown',
      markdown: { title: 'Weekly report', text: 'Hello **world**' },
    });
  });

  it('signs the request when the secret is configured', async () => {
    mockedPost.mockResolvedValue({ data: { errcode: 0, errmsg: 'ok' } });
    const channel = new DingTalkNotificationChannel(app);
    const result = await channel.send({
      channel: { name: 'ch', options: { webhookUrl, secret: 'SEC8f2a1example-secret' }, notificationType: 'dingtalk' },
      message: { content: 'signed message' },
    });
    expect(result.status).toBe('success');
    const [url, payload] = mockedPost.mock.calls[0];
    expect(String(url)).toContain('timestamp=');
    expect(String(url)).toContain('sign=');
    expect(payload).toMatchObject({ msgtype: 'markdown', markdown: { text: 'signed message' } });
  });

  it('fails when the webhook url is missing', async () => {
    const channel = new DingTalkNotificationChannel(app);
    const result = await channel.send({
      channel: { name: 'ch', options: {}, notificationType: 'dingtalk' },
      message: { content: 'x' },
    });
    expect(result.status).toBe('failure');
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('returns failure when the robot responds with an error code', async () => {
    mockedPost.mockResolvedValue({ data: { errcode: 310000, errmsg: 'sign not match' } });
    const channel = new DingTalkNotificationChannel(app);
    const result = await channel.send({
      channel: { name: 'ch', options: { webhookUrl }, notificationType: 'dingtalk' },
      message: { content: 'x' },
    });
    expect(result.status).toBe('failure');
    expect(result.reason).toBe('sign not match');
  });
});
