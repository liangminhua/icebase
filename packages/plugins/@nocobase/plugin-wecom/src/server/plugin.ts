/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import PluginNotificationManagerServer from '@nocobase/plugin-notification-manager';
import { InstallOptions, Plugin } from '@nocobase/server';
import { tval } from '@nocobase/utils';
import { NAMESPACE, authType, channelType, resourceName } from '../constant';
import { authAction, callbackAction, syncDepartmentsAction, syncUsersAction } from './actions';
import { WecomNotificationChannel } from './notification-channel';
import { getEnabledAuthenticator, syncWecomDepartments, syncWecomUsers } from './sync';
import { WecomAuth } from './wecom-auth';
import type { WecomProviderConfig } from './constants';

export class PluginWecomServer extends Plugin {
  async afterAdd() {}

  async beforeLoad() {}

  async load() {
    this.app.authManager.registerTypes(authType, {
      auth: WecomAuth,
      title: tval('WeCom', { ns: NAMESPACE }),
    });

    const notificationManager = this.pm.get(PluginNotificationManagerServer) as PluginNotificationManagerServer;
    if (notificationManager) {
      notificationManager.registerChannelType({
        type: channelType,
        Channel: WecomNotificationChannel,
      });
    } else {
      this.app.logger.warn(
        'wecom: @nocobase/plugin-notification-manager is not enabled, notification channel is not registered',
      );
    }

    this.app.resourceManager.define({
      name: resourceName,
      actions: {
        auth: authAction,
        callback: callbackAction,
        syncDepartments: syncDepartmentsAction,
        syncUsers: syncUsersAction,
      },
    });

    this.app.acl.allow(resourceName, ['auth', 'callback']);
    this.app.acl.allow(resourceName, ['syncDepartments', 'syncUsers'], 'loggedIn');
  }

  /**
   * Read the provider config from the (first enabled) authenticator options of the wecom auth type.
   */
  async getProviderConfig(name?: string): Promise<WecomProviderConfig> {
    const authenticator = await getEnabledAuthenticator(this.db, authType, name);
    if (!authenticator) {
      return null;
    }
    const options = this.app.environment.renderJsonTemplate(authenticator.options ?? {}) as WecomProviderConfig;
    return options;
  }

  async syncDepartments(): Promise<number> {
    const config = await this.getProviderConfig();
    if (!config?.corpId || !config?.secret) {
      this.app.logger.warn('wecom: authenticator is not configured, skip department sync');
      return 0;
    }
    return await syncWecomDepartments(this.app, config);
  }

  async syncUsers(): Promise<number> {
    const config = await this.getProviderConfig();
    if (!config?.corpId || !config?.secret) {
      this.app.logger.warn('wecom: authenticator is not configured, skip user sync');
      return 0;
    }
    return await syncWecomUsers(this.app, config);
  }

  async install(options?: InstallOptions) {}

  async afterEnable() {}

  async afterDisable() {}

  async remove() {}
}

export default PluginWecomServer;
