/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { ISchema } from '@formily/react';
import { SchemaComponent } from '@nocobase/client';
import type { Authenticator } from '@nocobase/plugin-auth/client';
import { useSignIn } from '@nocobase/plugin-auth/client';
import React from 'react';
import { useAuthTranslation } from './locale';

const schema: ISchema = {
  type: 'object',
  name: 'ldapForm',
  'x-component': 'FormV2',
  properties: {
    account: {
      type: 'string',
      required: true,
      'x-decorator': 'FormItem',
      'x-component': 'Input',
      'x-component-props': { placeholder: '{{t("Username/Email")}}' },
    },
    password: {
      type: 'string',
      required: true,
      'x-decorator': 'FormItem',
      'x-component': 'Password',
      'x-component-props': { placeholder: '{{t("Password")}}' },
    },
    actions: {
      type: 'void',
      'x-component': 'div',
      properties: {
        submit: {
          title: '{{t("Sign in")}}',
          type: 'void',
          'x-component': 'Action',
          'x-component-props': {
            htmlType: 'submit',
            block: true,
            type: 'primary',
            useAction: '{{ useLdapSignIn }}',
            style: { width: '100%' },
          },
        },
      },
    },
  },
};

export const SignInForm = (props: { authenticator: Authenticator }) => {
  const { name } = props.authenticator;
  const useLdapSignIn = () => useSignIn(name);
  return <SchemaComponent schema={schema} scope={{ useLdapSignIn }} />;
};
