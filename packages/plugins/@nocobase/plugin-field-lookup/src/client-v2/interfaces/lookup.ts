/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { CollectionFieldInterface, createTypedFilterable } from '@nocobase/client-v2';
import { NAMESPACE, tExpr } from '../locale';
import { LookupRelationConfigureField, LookupTargetFieldConfigureField } from '../components/ConfigureFields';

export class LookupFieldInterface extends CollectionFieldInterface {
  name = 'lookup';
  type = 'object';
  group = 'advanced';
  order = 0;
  title = tExpr('Lookup');
  description = tExpr(
    'Read a field value from a related collection at read time, following a belongsTo or hasOne relation.',
  );
  sortable = false;
  default = {
    interface: 'lookup',
    type: 'lookup',
    uiSchema: {
      type: 'string',
      'x-component': 'Input',
      'x-read-pretty': true,
    },
  };
  configure = {
    items: [
      {
        name: 'relation',
        title: tExpr('Relation field'),
        required: true,
        Component: LookupRelationConfigureField,
      },
      {
        name: 'targetField',
        title: tExpr('Target field'),
        required: true,
        Component: LookupTargetFieldConfigureField,
      },
      {
        name: 'filter',
        title: tExpr('Match condition (JSON)'),
        component: 'TextArea',
        componentProps: {
          placeholder: '{"status": "published"}',
          rows: 3,
        },
      },
    ],
  };
  filterable = createTypedFilterable([{ types: ['string', 'number'], operators: 'string' }]);
}
