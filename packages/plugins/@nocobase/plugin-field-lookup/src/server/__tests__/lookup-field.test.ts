/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { createMockDatabase, Database } from '@nocobase/database';
import { LookupField } from '../lookup-field';
import { RollupField } from '../rollup-field';

describe('lookup field', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createMockDatabase();
    await db.clean({ drop: true });
    db.registerFieldTypes({
      lookup: LookupField,
      rollup: RollupField,
    });
  });

  afterEach(async () => {
    await db.close();
  });

  const setupBelongsTo = async (lookupOptions: Record<string, any> = {}) => {
    db.collection({
      name: 'categories',
      fields: [{ type: 'string', name: 'title' }],
    });
    db.collection({
      name: 'posts',
      fields: [
        { type: 'string', name: 'title' },
        { type: 'belongsTo', name: 'category', target: 'categories', foreignKey: 'categoryId' },
        {
          type: 'lookup',
          name: 'category_title',
          relation: 'category',
          targetField: 'title',
          ...lookupOptions,
        },
      ],
    });
    await db.sync();
  };

  it('should read the target field value through belongsTo relation', async () => {
    await setupBelongsTo();
    const category = await db.getCollection('categories').repository.create({ values: { title: 't1' } });
    const post = await db.getCollection('posts').repository.create({
      values: { title: 'p1', categoryId: category.get('id') },
    });

    const found = await db.getCollection('posts').repository.findOne({
      filterByTk: post.get('id'),
    });
    expect(found.get('category_title')).toBe('t1');
  });

  it('should return null when foreign key is empty or dangling', async () => {
    await setupBelongsTo();
    await db.getCollection('posts').repository.create({ values: { title: 'p2' } });

    const found = await db.getCollection('posts').repository.findOne({ filter: { title: 'p2' } });
    expect(found.get('category_title')).toBeNull();
  });

  it('should return null when target record does not exist', async () => {
    await setupBelongsTo();
    await db.getCollection('posts').repository.create({ values: { title: 'p3', categoryId: 99999 } });

    const found = await db.getCollection('posts').repository.findOne({ filter: { title: 'p3' } });
    expect(found.get('category_title')).toBeNull();
  });

  it('should map values correctly for a batch with different foreign keys', async () => {
    await setupBelongsTo();
    const c1 = await db.getCollection('categories').repository.create({ values: { title: 'c1' } });
    const c2 = await db.getCollection('categories').repository.create({ values: { title: 'c2' } });
    await db.getCollection('posts').repository.create({ values: { title: 'p1', categoryId: c1.get('id') } });
    await db.getCollection('posts').repository.create({ values: { title: 'p2', categoryId: c2.get('id') } });

    const rows = await db.getCollection('posts').repository.find({ sort: ['id'] });
    const values = rows.map((row) => row.get('category_title'));
    expect(values).toEqual(['c1', 'c2']);
  });

  it('should apply the additional filter option', async () => {
    await setupBelongsTo({ filter: { title: 'not-exists' } });
    const category = await db.getCollection('categories').repository.create({ values: { title: 't1' } });
    await db.getCollection('posts').repository.create({
      values: { title: 'p1', categoryId: category.get('id') },
    });

    const found = await db.getCollection('posts').repository.findOne({ filter: { title: 'p1' } });
    expect(found.get('category_title')).toBeNull();
  });

  it('should skip filling when explicit fields list does not contain the field', async () => {
    await setupBelongsTo();
    const category = await db.getCollection('categories').repository.create({ values: { title: 't1' } });
    await db.getCollection('posts').repository.create({
      values: { title: 'p1', categoryId: category.get('id') },
    });

    const found = await db.getCollection('posts').repository.findOne({
      filter: { title: 'p1' },
      fields: ['title'],
    });
    expect(found.get('category_title')).toBeUndefined();
  });

  it('should support hasOne relation', async () => {
    db.collection({
      name: 'profiles',
      fields: [
        { type: 'string', name: 'note' },
        { type: 'belongsTo', name: 'post', target: 'posts', foreignKey: 'postId' },
      ],
    });
    db.collection({
      name: 'posts_has_one',
      fields: [
        { type: 'string', name: 'title' },
        { type: 'hasOne', name: 'profile', target: 'profiles', foreignKey: 'postId' },
        { type: 'lookup', name: 'profile_note', relation: 'profile', targetField: 'note' },
      ],
    });
    await db.sync();

    const post = await db.getCollection('posts_has_one').repository.create({ values: { title: 'p1' } });
    await db.getCollection('profiles').repository.create({
      values: { note: 'n1', postId: post.get('id') },
    });

    const found = await db.getCollection('posts_has_one').repository.findOne({ filterByTk: post.get('id') });
    expect(found.get('profile_note')).toBe('n1');
  });

  it('should ignore invalid relation configuration without breaking find', async () => {
    await setupBelongsTo({ relation: 'not_a_relation' });
    await db.getCollection('posts').repository.create({ values: { title: 'p1' } });
    const found = await db.getCollection('posts').repository.findOne({ filter: { title: 'p1' } });
    expect(found.get('category_title')).toBeUndefined();
  });
});

describe('rollup field', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createMockDatabase();
    await db.clean({ drop: true });
    db.registerFieldTypes({
      lookup: LookupField,
      rollup: RollupField,
    });
  });

  afterEach(async () => {
    await db.close();
  });

  const setupHasMany = async (rollupOptions: Record<string, any> = {}) => {
    db.collection({
      name: 'comments',
      fields: [
        { type: 'float', name: 'amount' },
        { type: 'belongsTo', name: 'post', target: 'posts', foreignKey: 'postId' },
      ],
    });
    db.collection({
      name: 'posts',
      fields: [
        { type: 'string', name: 'title' },
        { type: 'hasMany', name: 'comments', target: 'comments', foreignKey: 'postId' },
        {
          type: 'rollup',
          name: 'total',
          relation: 'comments',
          targetField: 'amount',
          aggregate: 'sum',
          ...rollupOptions,
        },
      ],
    });
    await db.sync();
  };

  it('should aggregate sum over hasMany relation', async () => {
    await setupHasMany();
    const post = await db.getCollection('posts').repository.create({ values: { title: 'p1' } });
    const postId = post.get('id');
    await db.getCollection('comments').repository.create({ values: { amount: 1.5, postId } });
    await db.getCollection('comments').repository.create({ values: { amount: 2.5, postId } });

    const found = await db.getCollection('posts').repository.findOne({ filterByTk: postId });
    expect(found.get('total')).toBe(4);
  });

  it.each(['count', 'avg', 'min', 'max'] as const)('should support %s aggregate', async (aggregate) => {
    await setupHasMany({ aggregate, targetField: aggregate === 'count' ? undefined : 'amount' });
    const post = await db.getCollection('posts').repository.create({ values: { title: 'p1' } });
    const postId = post.get('id');
    await db.getCollection('comments').repository.create({ values: { amount: 3, postId } });
    await db.getCollection('comments').repository.create({ values: { amount: 1, postId } });
    await db.getCollection('comments').repository.create({ values: { amount: 2, postId } });

    const found = await db.getCollection('posts').repository.findOne({ filterByTk: postId });
    if (aggregate === 'count') {
      expect(found.get('total')).toBe(3);
    } else if (aggregate === 'avg') {
      expect(found.get('total')).toBe(2);
    } else if (aggregate === 'min') {
      expect(found.get('total')).toBe(1);
    } else {
      expect(found.get('total')).toBe(3);
    }
  });

  it('should return SQL-like empty set results', async () => {
    await setupHasMany({ aggregate: 'count', targetField: undefined });
    const post = await db.getCollection('posts').repository.create({ values: { title: 'p1' } });

    const found = await db.getCollection('posts').repository.findOne({ filterByTk: post.get('id') });
    expect(found.get('total')).toBe(0);
  });

  it('should return null for sum over empty children', async () => {
    await setupHasMany({ aggregate: 'sum' });
    const post = await db.getCollection('posts').repository.create({ values: { title: 'p1' } });
    const found = await db.getCollection('posts').repository.findOne({ filterByTk: post.get('id') });
    expect(found.get('total')).toBeNull();
  });

  it('should apply the additional filter option', async () => {
    await setupHasMany({ filter: { amount: { $gt: 2 } } });
    const post = await db.getCollection('posts').repository.create({ values: { title: 'p1' } });
    const postId = post.get('id');
    await db.getCollection('comments').repository.create({ values: { amount: 1, postId } });
    await db.getCollection('comments').repository.create({ values: { amount: 3, postId } });

    const found = await db.getCollection('posts').repository.findOne({ filterByTk: postId });
    expect(found.get('total')).toBe(3);
  });

  it('should support belongsToMany relation', async () => {
    db.collection({
      name: 'tags',
      fields: [{ type: 'string', name: 'name' }],
    });
    db.collection({
      name: 'articles',
      fields: [
        { type: 'string', name: 'title' },
        {
          type: 'belongsToMany',
          name: 'tags',
          target: 'tags',
          through: 'articles_tags',
          foreignKey: 'articleId',
          otherKey: 'tagId',
        },
        { type: 'rollup', name: 'tags_count', relation: 'tags', aggregate: 'count' },
      ],
    });
    await db.sync();

    const article = await db.getCollection('articles').repository.create({ values: { title: 'a1' } });
    const t1 = await db.getCollection('tags').repository.create({ values: { name: 't1' } });
    const t2 = await db.getCollection('tags').repository.create({ values: { name: 't2' } });
    await db
      .getCollection('articles_tags')
      .repository.create({ values: { articleId: article.get('id'), tagId: t1.get('id') } });
    await db
      .getCollection('articles_tags')
      .repository.create({ values: { articleId: article.get('id'), tagId: t2.get('id') } });

    const found = await db.getCollection('articles').repository.findOne({ filterByTk: article.get('id') });
    expect(found.get('tags_count')).toBe(2);
  });

  it('should ignore invalid relation configuration without breaking find', async () => {
    await setupHasMany({ relation: 'not_a_relation' });
    const post = await db.getCollection('posts').repository.create({ values: { title: 'p1' } });
    const found = await db.getCollection('posts').repository.findOne({ filterByTk: post.get('id') });
    expect(found.get('total')).toBeUndefined();
  });
});
