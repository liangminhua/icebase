/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Context, Next } from '@nocobase/actions';
import type { Collection } from '@nocobase/database';
import { renderFilename, renderTemplate } from './template';

interface PrintTemplateValues {
  title?: string;
  collection?: string;
  content?: string;
  filename?: string;
}

const ASSOCIATION_TYPES = ['belongsTo', 'hasOne', 'hasMany', 'belongsToMany'];

/**
 * Collect association names of a collection so related records are loaded
 * and available to placeholders like `{{ relation.field }}`.
 */
function getAssociationNames(collection: Collection): string[] {
  const names: string[] = [];
  for (const field of collection.fields.values()) {
    if (ASSOCIATION_TYPES.includes(field.type)) {
      names.push(field.name);
    }
  }
  return names;
}

export async function render(ctx: Context, next: Next) {
  const params = ctx.action.params;
  const values = (params.values ?? {}) as Record<string, unknown>;
  const readId = (value: unknown): string | number | undefined =>
    typeof value === 'string' || typeof value === 'number' ? value : undefined;
  const templateId = readId(params.templateId ?? params.filterByTk ?? values.templateId);
  const recordId = readId(params.recordId ?? values.recordId);

  if (templateId == null) {
    ctx.throw(400, 'templateId is required');
  }
  if (recordId == null) {
    ctx.throw(400, 'recordId is required');
  }

  const template = await ctx.db.getRepository('printTemplates').findOne({
    filterByTk: templateId,
  });
  if (!template) {
    ctx.throw(404, 'Print template not found');
  }

  const { title, collection, content, filename } = template.get() as PrintTemplateValues;
  if (!collection) {
    ctx.throw(400, 'Print template has no target collection');
  }

  const targetCollection = ctx.db.getCollection(collection);
  if (!targetCollection) {
    ctx.throw(400, `Collection "${collection}" does not exist`);
  }

  const record = await targetCollection.repository.findOne({
    filterByTk: recordId,
    appends: getAssociationNames(targetCollection),
  });
  if (!record) {
    ctx.throw(404, 'Record not found');
  }

  const recordJson = record.toJSON();
  ctx.body = {
    filename: renderFilename(filename, recordJson, title),
    html: renderTemplate(content, recordJson),
  };

  await next();
}
