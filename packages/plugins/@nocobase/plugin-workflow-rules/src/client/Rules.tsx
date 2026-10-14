/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import React from 'react';

import { SchemaInitializerItemType, Variable } from '@nocobase/client';
import {
  BaseTypeSets,
  Instruction,
  ValueBlock,
  WorkflowVariableInput,
  defaultFieldNames,
} from '@nocobase/plugin-workflow/client';
import { SubModelItem } from '@nocobase/flow-engine';
import { OrderedListOutlined } from '@ant-design/icons';
import { lang, NAMESPACE, useLang } from '../locale';
import { RulesEditor } from './RulesEditor';

export default class extends Instruction {
  title = `{{t("Rules (decision table)", { ns: "${NAMESPACE}" })}}`;
  type = 'rules';
  group = 'calculation';
  description = `{{t("Match an ordered rule list (when -> then) and return the result of the first matched rule, all matched results, or the else branch.", { ns: "${NAMESPACE}" })}}`;
  icon = (<OrderedListOutlined />);
  fieldset = {
    mode: {
      type: 'string',
      title: `{{t("Match mode", { ns: "${NAMESPACE}" })}}`,
      default: 'first-match',
      'x-decorator': 'FormItem',
      'x-component': 'Radio.Group',
      enum: [
        { value: 'first-match', label: `{{t("First match", { ns: "${NAMESPACE}" })}}` },
        { value: 'all-match', label: `{{t("All match", { ns: "${NAMESPACE}" })}}` },
      ],
    },
    rules: {
      type: 'array',
      title: `{{t("Rules", { ns: "${NAMESPACE}" })}}`,
      default: [],
      'x-decorator': 'FormItem',
      'x-component': 'RulesEditor',
    },
    else: {
      type: 'string',
      title: `{{t("Else (result expression)", { ns: "${NAMESPACE}" })}}`,
      'x-decorator': 'FormItem',
      'x-component': 'WorkflowVariableInput',
      'x-component-props': {
        changeOnSelect: true,
        variableOptions: {
          types: [{ type: 'reference', options: { collection: '*', entity: true } }],
        },
      },
    },
  };
  components = {
    RulesEditor,
    WorkflowVariableInput,
    ValueBlock,
  };
  useVariables({ key, title }, { types, fieldNames = defaultFieldNames }) {
    if (
      types &&
      !types.some((type) => type in BaseTypeSets || Object.values(BaseTypeSets).some((set) => set.has(type)))
    ) {
      return null;
    }
    return {
      [fieldNames.value]: key,
      [fieldNames.label]: title,
    };
  }
  useInitializers(node): SchemaInitializerItemType {
    return {
      name: `#${node.id}`,
      type: 'item',
      title: node.title ?? `#${node.id}`,
      Component: ValueBlock.Initializer,
      node,
      // eslint-disable-next-line react-hooks/rules-of-hooks
      resultTitle: useLang('Rules result'),
    };
  }
  /**
   * 2.0
   */
  getCreateModelMenuItem({ node }): SubModelItem {
    return {
      key: `#${node.id}`,
      label: node.title ?? `#${node.id}`,
      useModel: 'NodeValueModel',
      createModelOptions: {
        use: 'NodeValueModel',
        stepParams: {
          valueSettings: {
            init: {
              dataSource: `{{$jobsMapByNodeKey.${node.key}}}`,
              defaultValue: lang('Rules result'),
            },
          },
          cardSettings: {
            titleDescription: {
              title: `{{t("Rules (decision table)", { ns: "${NAMESPACE}" })}}`,
            },
          },
        },
      },
    };
  }
}
