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

export class LookupFieldInterface extends CollectionFieldInterface {
  name = 'lookup';
  type = 'object';
  group = 'advanced';
  order = 0;
  title = `{{t("Lookup", { ns: "${NAMESPACE}" })}}`;
  description = `{{t("Read a field value from a related collection at read time, following a belongsTo or hasOne relation.", { ns: "${NAMESPACE}" })}}`;
  sortable = false;
  default = {
    type: 'lookup',
    uiSchema: {
      type: 'string',
      'x-component': 'Input',
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
      'x-component': 'LookupRelationSelect',
      'x-component-props': {
        relationTypes: ['belongsTo', 'hasOne'],
        useCurrentFields: '{{ useCurrentFields }}',
      },
    },
    targetField: {
      type: 'string',
      title: `{{t("Target field", { ns: "${NAMESPACE}" })}}`,
      required: true,
      'x-decorator': 'FormItem',
      'x-component': 'LookupTargetFieldSelect',
      'x-component-props': {
        useCurrentFields: '{{ useCurrentFields }}',
      },
      'x-reactions': {
        dependencies: ['relation'],
        fulfill: {
          state: {
            visible: '{{$deps[0] != null}}',
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
    ],
  };
  components = {
    LookupRelationSelect: RelationSelect,
    LookupTargetFieldSelect: TargetFieldSelect,
  };
}
