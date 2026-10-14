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
import { RollupRelationConfigureField, RollupTargetFieldConfigureField } from '../components/ConfigureFields';

export class RollupFieldInterface extends CollectionFieldInterface {
  name = 'rollup';
  type = 'object';
  group = 'advanced';
  order = 0;
  title = tExpr('Rollup');
  description = tExpr(
    'Aggregate related records (sum/avg/count/min/max) at read time, following a hasMany or belongsToMany relation.',
  );
  sortable = false;
  default = {
    interface: 'rollup',
    type: 'rollup',
    uiSchema: {
      type: 'number',
      'x-component': 'InputNumber',
      'x-read-pretty': true,
    },
  };
  configure = {
    items: [
      {
        name: 'relation',
        title: tExpr('Relation field'),
        required: true,
        Component: RollupRelationConfigureField,
      },
      {
        name: 'aggregate',
        title: tExpr('Aggregate function'),
        required: true,
        defaultValue: 'sum',
        component: 'Radio.Group',
        options: [
          { value: 'sum', label: tExpr('Sum') },
          { value: 'avg', label: tExpr('Average') },
          { value: 'count', label: tExpr('Count') },
          { value: 'min', label: tExpr('Min') },
          { value: 'max', label: tExpr('Max') },
        ],
      },
      {
        name: 'targetField',
        title: tExpr('Target field'),
        Component: RollupTargetFieldConfigureField,
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
  filterable = createTypedFilterable([{ types: ['number'], operators: 'number' }]);
}
