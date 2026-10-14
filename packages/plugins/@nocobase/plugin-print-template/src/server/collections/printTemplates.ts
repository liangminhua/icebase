/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

export default {
  name: 'printTemplates',
  fields: [
    {
      type: 'string',
      name: 'title',
      interface: 'input',
      required: true,
    },
    {
      type: 'string',
      name: 'collection',
      interface: 'input',
      required: true,
    },
    {
      type: 'string',
      name: 'engine',
      defaultValue: 'html',
    },
    {
      type: 'text',
      name: 'content',
      interface: 'textarea',
      required: true,
    },
    {
      type: 'string',
      name: 'filename',
    },
  ],
};
