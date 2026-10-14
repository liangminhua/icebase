/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { InstallOptions, Plugin } from '@nocobase/server';
import { render } from './render';

export class PluginPrintTemplateServer extends Plugin {
  afterAdd() {}

  beforeLoad() {}

  async load() {
    this.app.resourceManager.registerActionHandler('printTemplates:render', render);
    // Template CRUD is managed through the settings page (admin snippet)
    this.app.acl.registerSnippet({
      name: `pm.${this.name}.templates`,
      actions: ['printTemplates:*'],
    });
    // Rendering is available to any logged-in user
    this.app.acl.allow('printTemplates', 'render', 'loggedIn');
  }

  async install(options?: InstallOptions) {}

  async afterEnable() {}

  async afterDisable() {}

  async remove() {}
}

export default PluginPrintTemplateServer;
