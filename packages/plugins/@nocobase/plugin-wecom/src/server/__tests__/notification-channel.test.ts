/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import axios from 'axios';
import type { Application } from '@nocobase/server';
import type { Mock } from 'vitest';
import { WecomNotificationChannel } from '../notification-channel';

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

const webhookUrl = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=abc123';

describe('wecom notification channel', () => {
  const app = {} as unknown as Application;

  beforeEach(() => {
    mockedPost.mockReset();
  });

  it('sends the markdown payload with the title prefixed in bold', async () => {
    mockedPost.mockResolvedValue({ data: { errcode: 0, errmsg: 'ok' } });
    const channel = new WecomNotificationChannel(app);
    const result = await channel.send({
      channel: { name: 'ch', options: { webhookUrl }, notificationType: 'wecom' },
      message: { title: 'Weekly report', content: 'Hello **world**' },
    });
    expect(result.status).toBe('success');
    expect(mockedPost).toHaveBeenCalledTimes(1);
    expect(mockedPost).toHaveBeenCalledWith(webhookUrl, {
      msgtype: 'markdown',
      markdown: { content: '**Weekly report**\nHello **world**' },
    });
  });

  it('sends the raw content when no title is given', async () => {
    mockedPost.mockResolvedValue({ data: { errcode: 0, errmsg: 'ok' } });
    const channel = new WecomNotificationChannel(app);
    const result = await channel.send({
      channel: { name: 'ch', options: { webhookUrl }, notificationType: 'wecom' },
      message: { content: 'plain message' },
    });
    expect(result.status).toBe('success');
    expect(mockedPost).toHaveBeenCalledWith(webhookUrl, {
      msgtype: 'markdown',
      markdown: { content: 'plain message' },
    });
  });

  it('fails when the webhook url is missing', async () => {
    const channel = new WecomNotificationChannel(app);
    const result = await channel.send({
      channel: { name: 'ch', options: {}, notificationType: 'wecom' },
      message: { content: 'x' },
    });
    expect(result.status).toBe('failure');
    expect(result.reason).toBe('webhookUrl is required');
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('returns failure when the robot responds with an error code', async () => {
    mockedPost.mockResolvedValue({ data: { errcode: 93000, errmsg: 'invalid webhook url' } });
    const channel = new WecomNotificationChannel(app);
    const result = await channel.send({
      channel: { name: 'ch', options: { webhookUrl }, notificationType: 'wecom' },
      message: { content: 'x' },
    });
    expect(result.status).toBe('failure');
    expect(result.reason).toBe('invalid webhook url');
  });
});
