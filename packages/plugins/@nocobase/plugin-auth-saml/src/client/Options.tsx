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
          idpMetadata: {
            type: 'string',
            title: '{{t("IdP metadata")}}',
            required: true,
            'x-decorator': 'FormItem',
            'x-component': 'TextArea',
            'x-component-props': { rows: 6, placeholder: '{{t("IdP metadata XML or URL")}}' },
          },
          spEntityId: {
            type: 'string',
            title: '{{t("SP entity ID")}}',
            required: true,
            'x-decorator': 'FormItem',
            'x-component': 'Input',
          },
          spAcsUrl: {
            type: 'string',
            title: '{{t("SP ACS URL")}}',
            required: true,
            'x-decorator': 'FormItem',
            'x-component': 'Input',
            'x-component-props': {
              placeholder: 'https://example.com/api/saml:callback?authenticator=saml',
            },
          },
          spPrivateKey: {
            type: 'string',
            title: '{{t("SP private key")}}',
            'x-decorator': 'FormItem',
            'x-component': 'TextArea',
            'x-component-props': { rows: 4 },
          },
          wantAssertionsSigned: {
            type: 'boolean',
            title: '{{t("Want assertions signed")}}',
            'x-decorator': 'FormItem',
            'x-component': 'Checkbox',
          },
        },
      }}
    />
  );
};
