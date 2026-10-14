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
        extra={t('The group robot webhook address, e.g. https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx')}
        rules={[{ required: true, message: t('The field value is required') }]}
      >
        <Input placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx" />
      </Form.Item>
    </>
  );
};

export default ChannelConfigForm;
