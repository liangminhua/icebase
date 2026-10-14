/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Plugin } from '@nocobase/client';
import WorkflowPlugin from '@nocobase/plugin-workflow/client';

import RulesInstruction from './Rules';
import { RulesEditor } from './RulesEditor';

export default class PluginWorkflowRulesClient extends Plugin {
  async load() {
    this.app.addComponents({
      RulesEditor,
    });

    const workflow = this.app.pm.get('workflow') as WorkflowPlugin;
    const instruction = new RulesInstruction();
    workflow.instructions.register(instruction.type, instruction);
  }
}
