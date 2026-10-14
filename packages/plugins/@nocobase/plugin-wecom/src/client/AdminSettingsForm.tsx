/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { SchemaComponent } from '@nocobase/client';
import React from 'react';
import { usePluginTranslation } from './locale';
import { resourceName } from '../constant';

export const AdminSettingsForm: React.FC = () => {
  const { t } = usePluginTranslation();
  const redirectUriExtra = t('Optional. The OAuth callback address. Leave empty to use {{callback}} automatically', {
    callback: `/api/${resourceName}:callback`,
  });

  return (
    <SchemaComponent
      scope={{ t }}
      schema={{
        type: 'object',
        properties: {
          corpId: {
            type: 'string',
            title: '{{t("Corp ID")}}',
            required: true,
            'x-decorator': 'FormItem',
            'x-component': 'Input',
            'x-component-props': { placeholder: 'wwxxxxxxxxxxxxxxxx' },
          },
          agentId: {
            type: 'string',
            title: '{{t("Agent ID")}}',
            required: true,
            'x-decorator': 'FormItem',
            'x-component': 'Input',
            'x-component-props': { placeholder: '1000002' },
          },
          secret: {
            type: 'string',
            title: '{{t("Secret")}}',
            required: true,
            'x-decorator': 'FormItem',
            'x-component': 'Input',
          },
          redirectUri: {
            type: 'string',
            title: '{{t("Redirect URI")}}',
            description: redirectUriExtra,
            'x-decorator': 'FormItem',
            'x-component': 'Input',
            'x-component-props': { placeholder: `https://your-domain.com/api/${resourceName}:callback` },
          },
        },
      }}
    />
  );
};

export default AdminSettingsForm;
