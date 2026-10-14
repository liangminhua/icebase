/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Plugin } from '@nocobase/server';
import { tval } from '@nocobase/utils';
import { authType, namespace, resourceName } from '../constants';
import actions from './actions';
import { SAMLAuth } from './saml-auth';

export class PluginAuthSamlServer extends Plugin {
  async load() {
    this.app.authManager.registerTypes(authType, {
      auth: SAMLAuth,
      title: tval('SAML', { ns: namespace }),
    });
    Object.entries(actions).forEach(([action, handler]) => {
      this.app.resourceManager.registerActionHandler(`${resourceName}:${action}`, handler);
      this.app.acl.allow(resourceName, action);
    });
    // Define the resource after handlers are registered so the resource picks them up
    this.app.resourceManager.define({ name: resourceName });
  }
}

export default PluginAuthSamlServer;
