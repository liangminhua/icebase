/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { MockDatabase, MockServer, createMockServer } from '@nocobase/test';
import type { ExtendedAgent } from '@nocobase/test';
import path from 'path';
import Plugin from '..';
import { renderFilename, renderTemplate } from '../template';

describe('print-template', () => {
  let app: MockServer;
  let db: MockDatabase;
  let agent: ExtendedAgent;

  beforeEach(async () => {
    app = await createMockServer({
      plugins: [[Plugin, { name: 'print-template' }]],
    });
    db = app.db;
    agent = app.agent();

    // Import the plugin collection explicitly so the test also works when the
    // plugin package is not linked into node_modules yet
    await db.import({ directory: path.resolve(__dirname, '../collections') });

    db.collection({
      name: 'users',
      fields: [{ type: 'string', name: 'name' }],
    });
    db.collection({
      name: 'orders',
      fields: [
        { type: 'string', name: 'title' },
        { type: 'json', name: 'customer' },
        { type: 'belongsTo', name: 'user', target: 'users' },
      ],
    });
    await db.sync();

    await db.getRepository('printTemplates').create({
      values: {
        title: 'Order invoice',
        collection: 'orders',
        engine: 'html',
        content: '<h1>{{ title }}</h1><p>{{ customer.name }}</p><p>{{ customer.missing }}</p>',
        filename: '{{ title }}_{{ customer.name }}',
      },
    });
  });

  afterEach(async () => {
    await db.clean({ drop: true });
    await app.destroy();
  });

  const getTemplateId = async () => {
    const template = await db.getRepository('printTemplates').findOne({ filter: { title: 'Order invoice' } });
    return template.get('id') as number;
  };

  it('should render placeholders including nested paths', async () => {
    const order = await db.getRepository('orders').create({
      values: { title: 'Order 1', customer: { name: 'Alice' } },
    });

    const res = await agent.resource('printTemplates').render({
      templateId: await getTemplateId(),
      recordId: order.get('id') as number,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.html).toBe('<h1>Order 1</h1><p>Alice</p><p></p>');
  });

  it('should render missing paths as empty string', async () => {
    const order = await db.getRepository('orders').create({
      values: { title: 'Order 2' },
    });

    const res = await agent.resource('printTemplates').render({
      templateId: await getTemplateId(),
      recordId: order.get('id') as number,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.html).toBe('<h1>Order 2</h1><p></p><p></p>');
  });

  it('should escape HTML special characters in values', async () => {
    const order = await db.getRepository('orders').create({
      values: { title: '<script>alert("x")</script>', customer: { name: "O'Brien & Co <test>" } },
    });

    const res = await agent.resource('printTemplates').render({
      templateId: await getTemplateId(),
      recordId: order.get('id') as number,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.html).toContain('&lt;script&gt;');
    expect(res.body.data.html).toContain('&quot;');
    expect(res.body.data.html).toContain('O&#39;Brien &amp; Co &lt;test&gt;');
    expect(res.body.data.html).not.toContain('<script>');
  });

  it('should render the filename from placeholders', async () => {
    const order = await db.getRepository('orders').create({
      values: { title: 'Order 3', customer: { name: 'Bob' } },
    });

    const res = await agent.resource('printTemplates').render({
      templateId: await getTemplateId(),
      recordId: order.get('id') as number,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.filename).toBe('Order 3_Bob');
  });

  it('should support filterByTk as the template id', async () => {
    const order = await db.getRepository('orders').create({
      values: { title: 'Order 4', customer: { name: 'Carol' } },
    });

    const res = await agent.resource('printTemplates').render({
      filterByTk: await getTemplateId(),
      recordId: order.get('id') as number,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.html).toContain('Order 4');
    expect(res.body.data.filename).toBe('Order 4_Carol');
  });

  it('should render associated record fields', async () => {
    const user = await db.getRepository('users').create({ values: { name: 'Alice' } });
    const order = await db.getRepository('orders').create({
      values: { title: 'Order 6', userId: user.get('id') as number },
    });
    const template = await db.getRepository('printTemplates').create({
      values: {
        title: 'With user',
        collection: 'orders',
        content: 'Hello {{ user.name }} {{ user.missing }}',
      },
    });

    const res = await agent.resource('printTemplates').render({
      templateId: template.get('id') as number,
      recordId: order.get('id') as number,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.html).toBe('Hello Alice ');
  });

  it('should return 404 when the template or record does not exist', async () => {
    const order = await db.getRepository('orders').create({
      values: { title: 'Order 5' },
    });
    const templateId = await getTemplateId();

    const missingTemplate = await agent.resource('printTemplates').render({
      templateId: templateId + 999,
      recordId: order.get('id') as number,
    });
    expect(missingTemplate.status).toBe(404);

    const missingRecord = await agent.resource('printTemplates').render({
      templateId,
      recordId: (order.get('id') as number) + 999,
    });
    expect(missingRecord.status).toBe(404);
  });

  it('should return 400 when params are missing', async () => {
    const res = await agent.resource('printTemplates').render({});
    expect(res.status).toBe(400);
  });
});

describe('renderTemplate (unit)', () => {
  const record = { title: 'a<b>', user: { name: 'x&y' } };

  it('replaces simple and nested paths with escaped values', () => {
    expect(renderTemplate('<p>{{ title }}</p><p>{{ user.name }}</p>', record)).toBe('<p>a&lt;b&gt;</p><p>x&amp;y</p>');
  });

  it('renders unknown paths as empty string', () => {
    expect(renderTemplate('{{ nothing }}|{{ user.nothing }}', record)).toBe('|');
  });

  it('keeps the template unchanged when there is no record', () => {
    expect(renderTemplate('{{ title }}', null)).toBe('');
  });

  it('renders filename with fallback to title and date', () => {
    const today = new Date();
    const dateText = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
      today.getDate(),
    ).padStart(2, '0')}`;
    expect(renderFilename('{{ title }}_{{ user.name }}', record, 'Invoice')).toBe('a<b>_x&y');
    expect(renderFilename('  ', record, 'Invoice')).toBe(`Invoice_${dateText}`);
    expect(renderFilename(null, record, 'Invoice')).toBe(`Invoice_${dateText}`);
  });
});
