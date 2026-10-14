/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { BaseFieldOptions, DataTypes, Field, Model } from '@nocobase/database';
import { FindOptions } from 'sequelize';

export type RollupAggregate = 'count' | 'sum' | 'avg' | 'min' | 'max';

export interface RollupFieldOptions extends BaseFieldOptions {
  type: 'rollup';
  /**
   * hasMany / belongsToMany relation field name defined on the current collection
   */
  relation: string;
  /** field name on the target collection to aggregate (optional when aggregate is 'count') */
  targetField?: string;
  aggregate: RollupAggregate;
  /** additional static filter applied on the target collection query */
  filter?: Record<string, any>;
}

function mergeFilter(extra: Record<string, any> | undefined, base: Record<string, any>) {
  return extra ? { $and: [extra, base] } : base;
}

/**
 * Rollup field: read-time aggregated field over a multi-row relation
 * (hasMany / belongsToMany), supporting sum/avg/count/min/max.
 *
 * For hasMany, one IN query per find batch on the target collection.
 * For belongsToMany, one query on the through collection plus one on the target.
 *
 * Aggregation follows SQL semantics on empty sets: count = 0, others = null.
 */
export class RollupField extends Field {
  get dataType() {
    return DataTypes.VIRTUAL;
  }

  resolveRelation(): { type: 'hasMany' | 'belongsToMany'; parentKey: string } | null {
    const rel = this.collection.fields.get(this.options.relation);
    if (!rel || !rel.isRelationField()) {
      return null;
    }
    if (rel.type === 'hasMany') {
      return { type: rel.type, parentKey: rel.sourceKey };
    }
    if (rel.type === 'belongsToMany') {
      return { type: rel.type, parentKey: rel.sourceKey };
    }
    return null;
  }

  protected shouldSkip(options: FindOptions) {
    const fields = (options as any)?.fields;
    if (!Array.isArray(fields) || fields.length === 0) {
      return false;
    }
    return !fields.some((item) => {
      const name = Array.isArray(item) ? item[0] : item;
      return name === this.name;
    });
  }

  /**
   * the UI saves the match condition as a JSON string, normalize it to an object
   */
  protected normalizeFilter(): Record<string, any> | undefined {
    const filter = this.options.filter;
    if (typeof filter === 'string' && filter.trim()) {
      try {
        return JSON.parse(filter);
      } catch {
        return undefined;
      }
    }
    return filter;
  }

  /**
   * SQL-like aggregation over matched rows.
   * count counts all matched rows; others ignore null values.
   */
  aggregateValues(rawValues: any[]): number | null {
    switch (this.options.aggregate) {
      case 'count':
        return rawValues.length;
      case 'sum': {
        const values = rawValues.filter((v) => v !== null && v !== undefined).map(Number);
        return values.length ? values.reduce((a, b) => a + b, 0) : null;
      }
      case 'avg': {
        const values = rawValues.filter((v) => v !== null && v !== undefined).map(Number);
        return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
      }
      case 'min': {
        const values = rawValues.filter((v) => v !== null && v !== undefined).map(Number);
        return values.length ? Math.min(...values) : null;
      }
      case 'max': {
        const values = rawValues.filter((v) => v !== null && v !== undefined).map(Number);
        return values.length ? Math.max(...values) : null;
      }
      default:
        return null;
    }
  }

  private async findHasManyValues(keys: any[], targetCollection, options: FindOptions): Promise<Map<any, any>> {
    const rel = this.collection.fields.get(this.options.relation);
    const childKey = rel.foreignKey;
    const result = new Map<any, any[]>();
    const filter = mergeFilter(this.normalizeFilter(), { [childKey]: { $in: keys } });
    const fields = this.options.targetField ? [childKey, this.options.targetField] : [childKey];
    const rows = await targetCollection.repository.find({ filter, fields, transaction: (options as any).transaction });
    for (const row of rows) {
      const key = row.get(childKey);
      if (!result.has(key)) {
        result.set(key, []);
      }
      result.get(key).push(this.options.targetField ? row.get(this.options.targetField) : null);
    }
    return new Map([...result.entries()].map(([key, values]) => [key, this.aggregateValues(values)]));
  }

  private async findBelongsToManyValues(keys: any[], targetCollection, options: FindOptions): Promise<Map<any, any>> {
    const rel = this.collection.fields.get(this.options.relation);
    const throughCollection = this.database.getCollection(rel.through);
    if (!throughCollection) {
      return new Map();
    }
    const throughFk = rel.foreignKey;
    const throughOtherFk = rel.otherKey;
    const targetMatchKey = rel.targetKey;

    // step 1: group link rows by parent key
    const linkRows = await throughCollection.repository.find({
      filter: { [throughFk]: { $in: keys } },
      fields: [throughFk, throughOtherFk],
      transaction: (options as any).transaction,
    });
    const linkGroups = new Map<any, any[]>();
    for (const link of linkRows) {
      const parentKey = link.get(throughFk);
      if (!linkGroups.has(parentKey)) {
        linkGroups.set(parentKey, []);
      }
      linkGroups.get(parentKey).push(link.get(throughOtherFk));
    }

    // step 2: fetch target rows for all linked ids
    const allIds = [
      ...new Set(linkRows.map((link) => link.get(throughOtherFk)).filter((v) => v !== null && v !== undefined)),
    ];
    const targetRows = allIds.length
      ? await targetCollection.repository.find({
          filter: mergeFilter(this.normalizeFilter(), { [targetMatchKey]: { $in: allIds } }),
          fields: this.options.targetField ? [targetMatchKey, this.options.targetField] : [targetMatchKey],
          transaction: (options as any).transaction,
        })
      : [];
    const targetById = new Map(targetRows.map((row) => [row.get(targetMatchKey), row]));

    const result = new Map<any, any>();
    for (const [parentKey, ids] of linkGroups) {
      const rows = ids.map((id) => targetById.get(id)).filter(Boolean);
      const rawValues = rows.map((row) => (this.options.targetField ? row.get(this.options.targetField) : null));
      result.set(parentKey, this.aggregateValues(rawValues));
    }
    return result;
  }

  fillValue = async (instances: Model[], options: FindOptions = {}) => {
    if (!Array.isArray(instances) || instances.length === 0 || (options as any).raw) {
      return;
    }
    if (this.shouldSkip(options)) {
      return;
    }
    const rel = this.resolveRelation();
    if (!rel) {
      return;
    }
    const targetCollection = this.database.getCollection(
      (this.collection.fields.get(this.options.relation) as any).target,
    );
    if (!targetCollection) {
      return;
    }

    const { parentKey } = rel;
    const keys = [
      ...new Set(instances.map((inst) => inst.get(parentKey)).filter((v) => v !== null && v !== undefined)),
    ];
    const valueMap = keys.length
      ? rel.type === 'hasMany'
        ? await this.findHasManyValues(keys, targetCollection, options)
        : await this.findBelongsToManyValues(keys, targetCollection, options)
      : new Map<any, any>();

    const emptyValue = this.options.aggregate === 'count' ? 0 : null;
    for (const inst of instances) {
      const key = inst.get(parentKey);
      const value = key === null || key === undefined ? emptyValue : valueMap.get(key) ?? emptyValue;
      inst.set(this.name, value, { raw: true });
    }
  };

  bind() {
    super.bind();
    this.on('afterFind' as any, this.fillValue);
  }

  unbind() {
    super.unbind();
    this.off('afterFind' as any, this.fillValue);
  }
}
