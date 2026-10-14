/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import React from 'react';
import { SchemaComponent } from '@nocobase/client';
import { resourceName } from '../constant';
import { usePluginTranslation } from './locale';

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
          appKey: {
            type: 'string',
            title: '{{t("App Key")}}',
            required: true,
            'x-decorator': 'FormItem',
            'x-component': 'Input',
          },
          appSecret: {
            type: 'string',
            title: '{{t("App Secret")}}',
            required: true,
            'x-decorator': 'FormItem',
            'x-component': 'Input',
          },
          corpId: {
            type: 'string',
            title: '{{t("Corp ID")}}',
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
