/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import path from 'path';

import { MockDatabase } from '@nocobase/database';
import { JOB_STATUS } from '@nocobase/plugin-workflow';
import { getApp, sleep } from '@nocobase/plugin-workflow-test';
import { MockServer } from '@nocobase/test';

import Plugin from '..';

describe('workflow > instructions > rules', () => {
  let app: MockServer;
  let db: MockDatabase;
  let PostRepo;
  let WorkflowModel;
  let workflow;

  beforeEach(async () => {
    app = await getApp({
      plugins: [Plugin],
      collectionsPath: path.join(__dirname, 'collections'),
    });

    db = app.db;
    WorkflowModel = db.getCollection('workflows').model;
    PostRepo = db.getCollection('posts').repository;

    workflow = await WorkflowModel.create({
      title: 'test workflow',
      enabled: true,
      type: 'collection',
      config: {
        mode: 1,
        collection: 'posts',
      },
    });
  });

  afterEach(() => app.destroy());

  const createRulesNode = (config) => workflow.createNode({ type: 'rules', config });

  describe('first-match', () => {
    it('should return the first matched rule result', async () => {
      await createRulesNode({
        mode: 'first-match',
        rules: [
          { when: '{{$context.data.quantity}} >= 100', then: '10' },
          { when: '{{$context.data.level}} == "VIP"', then: '20' },
        ],
      });

      await PostRepo.create({ values: { title: 't1', quantity: 100, level: 'VIP' } });
      await sleep(500);

      const [execution] = await workflow.getExecutions();
      const [job] = await execution.getJobs();
      expect(job.status).toBe(1);
      expect(job.result).toBe(10);
    });

    it('should fall through rules in order until matched', async () => {
      await createRulesNode({
        mode: 'first-match',
        rules: [
          { when: '{{$context.data.quantity}} >= 100', then: '10' },
          { when: 'equalText({{$context.data.level}}, "VIP")', then: '20' },
        ],
      });

      await PostRepo.create({ values: { title: 't1', quantity: 5, level: 'VIP' } });
      await sleep(500);

      const [execution] = await workflow.getExecutions();
      const [job] = await execution.getJobs();
      expect(job.result).toBe(20);
    });

    it('should skip rules with empty condition', async () => {
      await createRulesNode({
        mode: 'first-match',
        rules: [
          { when: '', then: '10' },
          { when: '{{$context.data.quantity}} >= 1', then: '20' },
        ],
      });

      await PostRepo.create({ values: { title: 't1', quantity: 1 } });
      await sleep(500);

      const [execution] = await workflow.getExecutions();
      const [job] = await execution.getJobs();
      expect(job.result).toBe(20);
    });
  });

  describe('else', () => {
    it('should evaluate else expression when no rule matches', async () => {
      await createRulesNode({
        mode: 'first-match',
        rules: [{ when: '{{$context.data.quantity}} >= 100', then: '10' }],
        else: '0',
      });

      await PostRepo.create({ values: { title: 't1', quantity: 5 } });
      await sleep(500);

      const [execution] = await workflow.getExecutions();
      const [job] = await execution.getJobs();
      expect(job.result).toBe(0);
    });

    it('should return null when no rule matches and no else configured', async () => {
      await createRulesNode({
        mode: 'first-match',
        rules: [{ when: '{{$context.data.quantity}} >= 100', then: '10' }],
      });

      await PostRepo.create({ values: { title: 't1', quantity: 5 } });
      await sleep(500);

      const [execution] = await workflow.getExecutions();
      const [job] = await execution.getJobs();
      expect(job.result).toBeNull();
    });
  });

  describe('all-match', () => {
    it('should return all matched results as an array', async () => {
      await createRulesNode({
        mode: 'all-match',
        rules: [
          { when: '{{$context.data.quantity}} >= 10', then: '1' },
          { when: '{{$context.data.quantity}} >= 5', then: '2' },
          { when: '{{$context.data.quantity}} < 5', then: '3' },
        ],
      });

      await PostRepo.create({ values: { title: 't1', quantity: 10 } });
      await sleep(500);

      const [execution] = await workflow.getExecutions();
      const [job] = await execution.getJobs();
      expect(job.result).toEqual([1, 2]);
    });

    it('should merge matched results when all are plain objects', async () => {
      await createRulesNode({
        mode: 'all-match',
        rules: [
          { when: 'equalText({{$context.data.level}}, "VIP")', then: '{"discount": 0.9}' },
          { when: '{{$context.data.quantity}} >= 10', then: '{"freeShipping": true}' },
        ],
      });

      await PostRepo.create({ values: { title: 't1', quantity: 10, level: 'VIP' } });
      await sleep(500);

      const [execution] = await workflow.getExecutions();
      const [job] = await execution.getJobs();
      expect(job.result).toEqual({ discount: 0.9, freeShipping: true });
    });
  });

  describe('errors', () => {
    it('should return error status on invalid expression', async () => {
      await createRulesNode({
        mode: 'first-match',
        rules: [{ when: 'invalid ((', then: '1' }],
      });

      await PostRepo.create({ values: { title: 't1', quantity: 1 } });
      await sleep(500);

      const [execution] = await workflow.getExecutions();
      const [job] = await execution.getJobs();
      expect(job.status).toBe(JOB_STATUS.ERROR);
    });
  });

  describe('upstream variables', () => {
    it('should use variables from upstream query node', async () => {
      const n1 = await workflow.createNode({
        type: 'query',
        config: {
          collection: 'posts',
          params: {
            filter: {
              $and: [{ id: '{{$context.data.id}}' }],
            },
          },
        },
      });

      const n2 = await createRulesNode({
        mode: 'first-match',
        rules: [{ when: `{{$jobsMapByNodeKey.${n1.key}.quantity}} >= 100`, then: '10' }],
        else: '0',
      });
      await n1.setDownstream(n2);

      const post = await PostRepo.create({ values: { title: 't1', quantity: 100 } });
      await sleep(500);

      const [execution] = await workflow.getExecutions();
      const jobs = await execution.getJobs({ order: [['id', 'ASC']] });
      expect(jobs.length).toBe(2);
      expect(jobs[1].result).toBe(10);
    });
  });
});
