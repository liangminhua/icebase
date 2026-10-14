/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Context, Next } from '@nocobase/actions';
import path from 'path';
import { Collection, CollectionOptions } from '@nocobase/database';
import { InstallOptions, Plugin } from '@nocobase/server';
import { NAMESPACE, SPACE_FIELD_NAME } from './constants';
import { spaceIsolationMiddleware } from './middlewares/space-isolation';

type SpaceCollectionOptions = CollectionOptions & {
  usingSpace?: boolean;
  from?: string;
};

export class PluginMultiSpaceServer extends Plugin {
  afterAdd() {}

  beforeLoad() {
    // Collections defined later (plugin collections, collection-manager metadata loaded at beforeStart) get the spaceId field automatically
    this.db.on('afterDefineCollection', (collection: Collection) => {
      this.setSpaceField(collection);
    });
  }

  async load() {
    await this.db.import({ directory: path.resolve(__dirname, 'collections') });
    // Handle collections that were defined before this plugin loaded
    for (const collection of this.db.collections.values()) {
      this.setSpaceField(collection);
    }

    this.app.resourceManager.use(spaceIsolationMiddleware, { tag: 'multiSpace' });

    this.app.resourceManager.define({
      name: 'multiSpace',
      actions: {
        listCollections: this.listCollections.bind(this),
        toggleCollection: this.toggleCollection.bind(this),
      },
    });

    this.app.acl.registerSnippet({
      name: `pm.${this.name}`,
      actions: ['multiSpace:*', 'spaces:*'],
    });
  }

  async install(options?: InstallOptions) {}

  async afterEnable() {}

  async afterDisable() {}

  async remove() {}

  protected isToggleable(collection: Collection) {
    const options = (collection.options ?? {}) as SpaceCollectionOptions;
    if (!options || options.view || options.sql) {
      return false;
    }
    return true;
  }

  /**
   * Add the spaceId field to a collection which enabled space isolation.
   */
  protected setSpaceField(collection: Collection) {
    if (!collection) {
      return;
    }
    const options = (collection.options ?? {}) as SpaceCollectionOptions;
    if (!options.usingSpace) {
      return;
    }
    if (options.view || options.sql) {
      return;
    }
    if (collection.hasField(SPACE_FIELD_NAME)) {
      return;
    }
    collection.setField(SPACE_FIELD_NAME, { type: 'bigInt', index: true });
  }

  /**
   * Persist the usingSpace flag in the main data source `collections` metadata (options JSONB).
   */
  protected async setCollectionMeta(ctx: Context, collectionName: string, collection: Collection, enabled: boolean) {
    const repo = ctx.db.getRepository('collections');
    const exists = await repo.findOne({ filter: { name: collectionName } });
    if (exists) {
      await repo.update({ filterByTk: collectionName, values: { usingSpace: enabled } });
      return;
    }
    // Code-defined collections may have no metadata row yet, create one so the flag survives restarts
    await repo.create({
      values: {
        name: collectionName,
        title: collection.options.title,
        from: 'db2cm',
        fields: [],
        usingSpace: enabled,
      },
    });
  }

  async listCollections(ctx: Context, next: Next) {
    const items = [];
    for (const collection of ctx.db.collections.values()) {
      if (!this.isToggleable(collection)) {
        continue;
      }
      const options = collection.options as SpaceCollectionOptions;
      items.push({
        name: collection.name,
        title: options.title ?? collection.name,
        usingSpace: !!options.usingSpace,
      });
    }
    items.sort((a, b) => a.name.localeCompare(b.name));
    ctx.body = items;
    await next();
  }

  async toggleCollection(ctx: Context, next: Next) {
    const values = ctx.action.params.values ?? {};
    const collectionName = values.collectionName;
    const enabled = values.enabled;
    if (!collectionName || typeof enabled !== 'boolean') {
      ctx.throw(400, ctx.i18n.t('collectionName and enabled are required', { ns: NAMESPACE }));
    }
    const collection = ctx.db.getCollection(collectionName);
    if (!collection) {
      ctx.throw(400, ctx.i18n.t('Collection {{name}} does not exist', { ns: NAMESPACE, name: collectionName }));
    }
    if (!this.isToggleable(collection)) {
      ctx.throw(400, ctx.i18n.t('This collection does not support space isolation', { ns: NAMESPACE }));
    }

    // Update the in-memory collection options first so the middleware and
    // setSpaceField take effect immediately (metadata keeps it across restarts).
    (collection.options as SpaceCollectionOptions).usingSpace = enabled;

    await this.setCollectionMeta(ctx, collectionName, collection, enabled);

    if (enabled) {
      this.setSpaceField(collection);
      await collection.sync();
    } else if (collection.hasField(SPACE_FIELD_NAME)) {
      // Only remove the field definition, keep the column and data in database
      collection.removeField(SPACE_FIELD_NAME);
    }

    ctx.body = { collectionName, enabled };
    await next();
  }
}

export default PluginMultiSpaceServer;
