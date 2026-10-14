/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { CollectionFieldInterface, interfacesProperties } from '@nocobase/client';
import { NAMESPACE } from '../../locale';
import { RelationSelect, TargetFieldSelect } from '../components/FieldSelects';

const { defaultProps } = interfacesProperties;

export class RollupFieldInterface extends CollectionFieldInterface {
  name = 'rollup';
  type = 'object';
  group = 'advanced';
  order = 0;
  title = `{{t("Rollup", { ns: "${NAMESPACE}" })}}`;
  description = `{{t("Aggregate related records (sum/avg/count/min/max) at read time, following a hasMany or belongsToMany relation.", { ns: "${NAMESPACE}" })}}`;
  sortable = false;
  default = {
    type: 'rollup',
    uiSchema: {
      type: 'number',
      'x-component': 'InputNumber',
      'x-read-pretty': true,
    },
  };
  properties = {
    ...defaultProps,
    relation: {
      type: 'string',
      title: `{{t("Relation field", { ns: "${NAMESPACE}" })}}`,
      required: true,
      'x-decorator': 'FormItem',
      'x-component': 'RollupRelationSelect',
      'x-component-props': {
        relationTypes: ['hasMany', 'belongsToMany'],
        useCurrentFields: '{{ useCurrentFields }}',
      },
    },
    aggregate: {
      type: 'string',
      title: `{{t("Aggregate function", { ns: "${NAMESPACE}" })}}`,
      required: true,
      default: 'sum',
      'x-decorator': 'FormItem',
      'x-component': 'Radio.Group',
      enum: [
        { value: 'sum', label: `{{t("Sum", { ns: "${NAMESPACE}" })}}` },
        { value: 'avg', label: `{{t("Average", { ns: "${NAMESPACE}" })}}` },
        { value: 'count', label: `{{t("Count", { ns: "${NAMESPACE}" })}}` },
        { value: 'min', label: `{{t("Min", { ns: "${NAMESPACE}" })}}` },
        { value: 'max', label: `{{t("Max", { ns: "${NAMESPACE}" })}}` },
      ],
    },
    targetField: {
      type: 'string',
      title: `{{t("Target field", { ns: "${NAMESPACE}" })}}`,
      'x-decorator': 'FormItem',
      'x-component': 'RollupTargetFieldSelect',
      'x-component-props': {
        useCurrentFields: '{{ useCurrentFields }}',
      },
      'x-reactions': {
        dependencies: ['relation', 'aggregate'],
        fulfill: {
          state: {
            visible: '{{$deps[0] != null && $deps[1] !== "count"}}',
            required: '{{$deps[1] !== "count"}}',
          },
        },
      },
    },
    filter: {
      type: 'string',
      title: `{{t("Match condition (JSON)", { ns: "${NAMESPACE}" })}}`,
      'x-decorator': 'FormItem',
      'x-component': 'Input.TextArea',
      'x-component-props': {
        placeholder: '{"status": "published"}',
        rows: 3,
      },
    },
  };
  filterable = {
    operators: [
      { value: '$eq', label: '{{t("is")}}', hasNotEqual: true },
      { value: '$ne', label: '{{t("is not")}}', noDisabled: true },
      { value: 'empty', label: '{{t("is empty")}}' },
      { value: 'notEmpty', label: '{{t("is not empty")}}' },
      { value: '$gt', label: '{{t(">")}}' },
      { value: '$gte', label: '{{t("≥")}}' },
      { value: '$lt', label: '{{t("<")}}' },
      { value: '$lte', label: '{{t("≤")}}' },
    ],
  };
  components = {
    RollupRelationSelect: RelationSelect,
    RollupTargetFieldSelect: TargetFieldSelect,
  };
}
