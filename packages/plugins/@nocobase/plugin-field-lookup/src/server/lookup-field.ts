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

export interface LookupFieldOptions extends BaseFieldOptions {
  type: 'lookup';
  /**
   * belongsTo / hasOne relation field name defined on the current collection.
   * - belongsTo: foreignKey lives on the current collection, referencing target's targetKey
   * - hasOne: foreignKey lives on the target collection, referencing current collection's sourceKey
   */
  relation: string;
  /** field name on the target collection to read (required, also avoids recursive filling) */
  targetField: string;
  /** additional static filter applied on the target collection query */
  filter?: Record<string, any>;
}

/**
 * Lookup field: read-time computed field that follows a single-row relation
 * (belongsTo / hasOne) and reads one field from the target collection.
 *
 * Values are filled in `afterFind` with one IN query per find batch,
 * so the field is not stored in the database table.
 */
export class LookupField extends Field {
  get dataType() {
    return DataTypes.VIRTUAL;
  }

  resolveRelation(): { type: 'belongsTo' | 'hasOne'; localKey: string; targetMatchKey: string; target: string } | null {
    const rel = this.collection.fields.get(this.options.relation);
    if (!rel || !rel.isRelationField()) {
      return null;
    }
    const relType = rel.type;
    if (relType === 'belongsTo') {
      return { type: relType, target: rel.target, localKey: rel.foreignKey, targetMatchKey: rel.targetKey };
    }
    if (relType === 'hasOne') {
      return { type: relType, target: rel.target, localKey: rel.sourceKey, targetMatchKey: rel.foreignKey };
    }
    return null;
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

  protected mergeFilters(extra: Record<string, any> | undefined, base: Record<string, any>) {
    return extra ? { $and: [extra, base] } : base;
  }

  /**
   * skip filling when the caller explicitly requests a field list which does not contain this field
   */
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
    const targetCollection = this.database.getCollection(rel.target);
    if (!targetCollection || !this.options.targetField) {
      return;
    }

    const { localKey, targetMatchKey } = rel;
    const keys = [...new Set(instances.map((inst) => inst.get(localKey)).filter((v) => v !== null && v !== undefined))];
    const valueMap = new Map<any, any>();
    if (keys.length > 0) {
      const filter = this.mergeFilters(this.normalizeFilter(), { [targetMatchKey]: { $in: keys } });
      const rows = await targetCollection.repository.find({
        filter,
        fields: [targetMatchKey, this.options.targetField],
        transaction: (options as any).transaction,
      });
      for (const row of rows) {
        valueMap.set(row.get(targetMatchKey), row.get(this.options.targetField));
      }
    }

    for (const inst of instances) {
      const key = inst.get(localKey);
      const value = key === null || key === undefined ? null : valueMap.get(key) ?? null;
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
