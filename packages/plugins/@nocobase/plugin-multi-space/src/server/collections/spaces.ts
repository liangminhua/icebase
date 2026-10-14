/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { defineCollection } from '@nocobase/database';

/**
 * Spaces for logical data isolation. Records of space-enabled collections carry a spaceId,
 * which is filtered by the X-Space request header.
 */
export default defineCollection({
  dumpRules: {
    group: 'required',
  },
  name: 'spaces',
  dataCategory: 'system',
  createdBy: true,
  updatedBy: true,
  fields: [
    {
      interface: 'id',
      type: 'bigInt',
      name: 'id',
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    {
      interface: 'input',
      type: 'string',
      name: 'name',
      allowNull: false,
      unique: true,
      uiSchema: {
        type: 'string',
        title: '{{t("Name")}}',
        'x-component': 'Input',
        required: true,
      },
    },
    {
      interface: 'input',
      type: 'string',
      name: 'title',
      uiSchema: {
        type: 'string',
        title: '{{t("Title")}}',
        'x-component': 'Input',
      },
    },
    {
      interface: 'textarea',
      type: 'text',
      name: 'description',
      allowNull: true,
      uiSchema: {
        type: 'string',
        title: '{{t("Description")}}',
        'x-component': 'Input.TextArea',
      },
    },
    {
      interface: 'integer',
      type: 'integer',
      name: 'sortOrder',
      uiSchema: {
        type: 'number',
        title: '{{t("Sort order")}}',
        'x-component': 'InputNumber',
      },
    },
  ],
});
