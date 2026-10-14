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

export const MessageConfigForm: React.FC<{ variableOptions?: unknown }> = () => {
  const { t } = usePluginTranslation();

  return (
    <>
      <Form.Item label={t('Title')} name={['title']}>
        <Input />
      </Form.Item>
      <Form.Item
        label={t('Content')}
        name={['content']}
        extra={t('Markdown content sent to the robot')}
        rules={[{ required: true, message: t('The field value is required') }]}
      >
        <Input.TextArea rows={6} />
      </Form.Item>
    </>
  );
};

export default MessageConfigForm;
