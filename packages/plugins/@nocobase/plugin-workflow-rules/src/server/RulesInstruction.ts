/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { FlowNodeModel, Instruction, JOB_STATUS, Processor } from '@nocobase/plugin-workflow';
import evaluators, { Evaluator } from '@nocobase/evaluators';
import { lodash, parse } from '@nocobase/utils';

export type RuleMode = 'first-match' | 'all-match';

export interface RuleItem {
  /** condition expression, evaluated as boolean; empty means the rule is disabled */
  when?: string;
  /** result expression, evaluated when the rule matches */
  then?: string;
}

export interface RulesConfig {
  engine?: string;
  mode?: RuleMode;
  rules?: RuleItem[];
  else?: string;
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Decision table instruction: an ordered list of rules (when -> then).
 *
 * - first-match (default): evaluate rules in order, return the first matched result.
 * - all-match: return every matched result; when all results are plain objects,
 *   they are merged into one object by priority order.
 * - else: evaluated when no rule matches; result is null when not configured.
 */
export class RulesInstruction extends Instruction {
  async run(node: FlowNodeModel, prevJob, processor: Processor) {
    const {
      engine = 'math.js',
      mode = 'first-match',
      rules = [],
      else: elseExpression = '',
    }: RulesConfig = node.config ?? {};
    const scope = processor.getScope(node.id);

    const evaluator = <Evaluator | undefined>evaluators.get(engine);
    if (!evaluator) {
      return {
        status: JOB_STATUS.ERROR,
        result: `unknown calculation engine: ${engine}`,
      };
    }

    // Resolve `{{variable}}` into literal values. String variables are JSON-encoded
    // (quoted) so expression engines like math.js can compare them properly.
    const evaluate = (expression: string) => {
      if (!expression || !expression.trim()) {
        return null;
      }
      const trimmed = expression.trim();
      const singleVariable = trimmed.match(/^\{\{\s*([^:{}]+?)\s*(?::([^}]*))?\}\}$/);
      if (singleVariable) {
        const value = lodash.get(scope, singleVariable[1]);
        if (value !== undefined) {
          return value;
        }
        return singleVariable[2] !== undefined && singleVariable[2] !== '' ? singleVariable[2] : null;
      }

      const template = parse(trimmed);
      let resolved = trimmed;
      for (const parameter of template.parameters) {
        const value = lodash.get(scope, parameter.key, parameter.defaultValue);
        const replacement = value === undefined || value === null ? 'null' : JSON.stringify(value);
        resolved = resolved.replace(
          new RegExp(`\\{\\{\\s*${escapeRegExp(parameter.key)}\\s*(?::[^}]*)?\\}\\}`, 'g'),
          () => replacement,
        );
      }
      return evaluator(resolved, scope);
    };

    try {
      const matched: any[] = [];
      for (const rule of rules ?? []) {
        if (!rule?.when || !rule.when.trim()) {
          continue;
        }
        if (!evaluate(rule.when)) {
          continue;
        }
        const value = evaluate(rule.then);
        if (mode === 'first-match') {
          return { status: JOB_STATUS.RESOLVED, result: value ?? null };
        }
        matched.push(value);
      }

      if (matched.length === 0) {
        const value = elseExpression ? evaluate(elseExpression) : null;
        return { status: JOB_STATUS.RESOLVED, result: value ?? null };
      }

      const allPlainObjects = matched.every(
        (value) => value !== null && typeof value === 'object' && !Array.isArray(value),
      );
      const result = allPlainObjects ? Object.assign({}, ...matched) : matched;
      return { status: JOB_STATUS.RESOLVED, result };
    } catch (e) {
      return {
        status: JOB_STATUS.ERROR,
        result: e instanceof Error ? e.message : String(e),
      };
    }
  }
}
