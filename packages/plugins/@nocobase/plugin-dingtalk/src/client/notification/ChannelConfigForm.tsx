/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Form, Input } from 'antd';
import React from 'react';
import { usePluginTranslation } from '../../locale';

export const ChannelConfigForm: React.FC = () => {
  const { t } = usePluginTranslation();

  return (
    <>
      <Form.Item
        label={t('Webhook URL')}
        name={['options', 'webhookUrl']}
        extra={t('The custom robot webhook address, e.g. https://oapi.dingtalk.com/robot/send?access_token=xxx')}
        rules={[{ required: true, message: t('The field value is required') }]}
      >
        <Input placeholder="https://oapi.dingtalk.com/robot/send?access_token=xxx" />
      </Form.Item>
      <Form.Item
        label={t('Signature secret')}
        name={['options', 'secret']}
        extra={t(
          'Optional. The custom robot signature secret (SEC...). When set, requests are signed with HMAC-SHA256.',
        )}
      >
        <Input.Password placeholder="SEC..." autoComplete="new-password" />
      </Form.Item>
    </>
  );
};

export default ChannelConfigForm;
