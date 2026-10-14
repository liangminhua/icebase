/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { randomUUID } from 'crypto';

import { MockServer, createMockServer } from '@nocobase/test';
import Plugin from '..';

describe('multi-space', () => {
  let app: MockServer;

  beforeEach(async () => {
    app = await createMockServer({
      name: randomUUID(),
      plugins: ['field-sort', 'error-handler', 'data-source-main', 'data-source-manager', Plugin],
    });
    app.db.collection({
      name: 'posts',
      fields: [{ type: 'string', name: 'title' }],
    });
    await app.db.sync();
  });

  afterEach(async () => {
    await app.db.clean({ drop: true });
    await app.destroy();
  });

  const togglePosts = async (enabled: boolean) => {
    const res = await app
      .agent()
      .resource('multiSpace')
      .toggleCollection({
        values: { collectionName: 'posts', enabled },
      });
    expect(res.status).toBe(200);
  };

  it('should write spaceId on create with X-Space header', async () => {
    await togglePosts(true);
    expect(app.db.getCollection('posts').hasField('spaceId')).toBe(true);

    const res = await app
      .agent()
      .resource('posts')
      .create({ values: { title: 't1' } })
      .set('X-Space', '1');
    expect(res.status).toBe(200);
    expect(String(res.body.data.spaceId)).toBe('1');

    // no header: spaceId stays null
    const res2 = await app
      .agent()
      .resource('posts')
      .create({ values: { title: 't2' } });
    expect(res2.status).toBe(200);
    expect(res2.body.data.spaceId).toBeFalsy();
  });

  it('should scope list by X-Space header', async () => {
    await togglePosts(true);
    const agent = app.agent();
    await agent
      .resource('posts')
      .create({ values: { title: 'a' } })
      .set('X-Space', '1');
    await agent
      .resource('posts')
      .create({ values: { title: 'b' } })
      .set('X-Space', '2');
    await agent.resource('posts').create({ values: { title: 'free' } });

    let res = await agent.resource('posts').list().set('X-Space', '1');
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].title).toBe('a');

    // space A records are invisible in space B
    res = await agent.resource('posts').list().set('X-Space', '2');
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].title).toBe('b');

    // 'none': only unassigned records
    res = await agent.resource('posts').list().set('X-Space', 'none');
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].title).toBe('free');

    // no header: all records
    res = await agent.resource('posts').list();
    expect(res.body.data.length).toBe(3);
  });

  it('should filter update and destroy across spaces', async () => {
    await togglePosts(true);
    const agent = app.agent();
    const created = await agent
      .resource('posts')
      .create({ values: { title: 'a' } })
      .set('X-Space', '1');
    const id = created.body.data.id;
    const repo = app.db.getCollection('posts').repository;

    // update in another space is filtered
    const updated = await agent
      .resource('posts')
      .update({ filterByTk: id, values: { title: 'a2' } })
      .set('X-Space', '2');
    expect(updated.body.data.length).toBe(0);
    expect((await repo.findOne({ filterByTk: id })).get('title')).toBe('a');

    // destroy in another space is filtered
    await agent.resource('posts').destroy({ filterByTk: id }).set('X-Space', '2');
    expect(await repo.findOne({ filterByTk: id })).toBeTruthy();

    // same space works
    await agent.resource('posts').destroy({ filterByTk: id }).set('X-Space', '1');
    expect(await repo.findOne({ filterByTk: id })).toBeFalsy();
  });

  it('should reject invalid X-Space header', async () => {
    await togglePosts(true);
    const res = await app.agent().resource('posts').list().set('X-Space', 'abc');
    expect(res.status).toBe(400);
  });

  it('should toggle collection space isolation on and off', async () => {
    await togglePosts(true);
    expect(app.db.getCollection('posts').hasField('spaceId')).toBe(true);
    let meta = await app.db.getRepository('collections').findOne({ filter: { name: 'posts' } });
    expect(meta.get('usingSpace')).toBe(true);

    await togglePosts(false);
    expect(app.db.getCollection('posts').hasField('spaceId')).toBe(false);
    meta = await app.db.getRepository('collections').findOne({ filter: { name: 'posts' } });
    expect(meta.get('usingSpace')).toBe(false);
  });

  it('should list collections with usingSpace flag', async () => {
    await togglePosts(true);
    const res = await app.agent().resource('multiSpace').listCollections();
    expect(res.status).toBe(200);
    const posts = res.body.data.find((item) => item.name === 'posts');
    expect(posts.usingSpace).toBe(true);
    const spaces = res.body.data.find((item) => item.name === 'spaces');
    expect(spaces.usingSpace).toBe(false);
  });
});
