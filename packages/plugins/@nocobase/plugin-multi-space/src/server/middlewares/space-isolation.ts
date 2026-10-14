/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Context, Next } from '@nocobase/actions';
import { NONE_SPACE, NAMESPACE, READ_ACTIONS, SPACE_FIELD_NAME, SPACE_HEADER_KEY, WRITE_ACTIONS } from '../constants';

const SPACE_ID_PATTERN = /^\d+$/;

function parseSpaceId(ctx: Context): string | null | undefined {
  const value = ctx.get(SPACE_HEADER_KEY);
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (value === NONE_SPACE) {
    return null;
  }
  if (!SPACE_ID_PATTERN.test(value)) {
    ctx.throw(400, ctx.i18n.t('Invalid X-Space header', { ns: NAMESPACE }));
  }
  return value;
}

function injectSpaceValues(ctx: Context, spaceId: string | null) {
  const values = ctx.action.params.values;
  if (Array.isArray(values)) {
    for (const item of values) {
      if (item && typeof item === 'object') {
        item[SPACE_FIELD_NAME] = spaceId;
      }
    }
    return;
  }
  if (values && typeof values === 'object') {
    values[SPACE_FIELD_NAME] = spaceId;
  }
}

/**
 * Injects the space scope into collection actions for collections that enabled space isolation.
 * The current space is read from the `X-Space` header:
 * - a space id: scope records to `{ spaceId: id }`;
 * - `none`: scope records to `{ spaceId: null }` (unassigned records only);
 * - absent: no scope is applied.
 */
export async function spaceIsolationMiddleware(ctx: Context, next: Next) {
  if (!ctx.action) {
    return next();
  }

  // Only isolate the main data source
  const dataSourceName = ctx.dataSource?.name;
  if (dataSourceName && dataSourceName !== 'main') {
    return next();
  }

  const { actionName, resourceName } = ctx.action;
  if (!actionName || !resourceName) {
    return next();
  }

  const collection = ctx.db.getCollection(resourceName);
  if (!collection?.options?.usingSpace) {
    return next();
  }

  if (!READ_ACTIONS.includes(actionName) && !WRITE_ACTIONS.includes(actionName) && actionName !== 'create') {
    return next();
  }

  const spaceId = parseSpaceId(ctx);
  if (spaceId === undefined) {
    return next();
  }

  if (actionName === 'create') {
    ctx.action.mergeParams({ values: { [SPACE_FIELD_NAME]: spaceId } });
    injectSpaceValues(ctx, spaceId);
  } else {
    ctx.action.mergeParams({ filter: { [SPACE_FIELD_NAME]: spaceId } });
  }

  return next();
}
