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
import { useAuthTranslation } from './locale';

export const Options = () => {
  const { t } = useAuthTranslation();
  return (
    <SchemaComponent
      scope={{ t }}
      schema={{
        type: 'object',
        properties: {
          casBaseUrl: {
            type: 'string',
            title: '{{t("CAS base URL")}}',
            required: true,
            'x-decorator': 'FormItem',
            'x-component': 'Input',
            'x-component-props': { placeholder: 'https://cas.example.com/cas' },
          },
          serviceName: {
            type: 'string',
            title: '{{t("Service name (optional)")}}',
            'x-decorator': 'FormItem',
            'x-component': 'Input',
            'x-component-props': {
              placeholder: 'https://nocobase.example.com',
            },
          },
        },
      }}
    />
  );
};
