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
          url: {
            type: 'string',
            title: '{{t("LDAP server URL")}}',
            required: true,
            'x-decorator': 'FormItem',
            'x-component': 'Input',
            'x-component-props': { placeholder: 'ldaps://ldap.example.com:636' },
          },
          baseDn: {
            type: 'string',
            title: '{{t("Base DN")}}',
            required: true,
            'x-decorator': 'FormItem',
            'x-component': 'Input',
            'x-component-props': { placeholder: 'dc=example,dc=com' },
          },
          filterTemplate: {
            type: 'string',
            title: '{{t("User filter template")}}',
            'x-decorator': 'FormItem',
            'x-component': 'Input',
            default: '(uid={{username}})',
            'x-component-props': { placeholder: '(uid={{username}})' },
          },
          bindDn: {
            type: 'string',
            title: '{{t("Service account DN (optional)")}}',
            'x-decorator': 'FormItem',
            'x-component': 'Input',
            'x-component-props': { placeholder: 'cn=service,dc=example,dc=com' },
          },
          bindPassword: {
            type: 'string',
            title: '{{t("Service account password (optional)")}}',
            'x-decorator': 'FormItem',
            'x-component': 'Password',
          },
          attributesMapping: {
            type: 'object',
            title: '{{t("Attributes mapping")}}',
            'x-decorator': 'FormItem',
            properties: {
              email: {
                type: 'string',
                title: '{{t("Email attribute")}}',
                'x-decorator': 'FormItem',
                'x-component': 'Input',
                default: 'mail',
              },
              nickname: {
                type: 'string',
                title: '{{t("Nickname attribute")}}',
                'x-decorator': 'FormItem',
                'x-component': 'Input',
                default: 'cn',
              },
            },
          },
        },
      }}
    />
  );
};
