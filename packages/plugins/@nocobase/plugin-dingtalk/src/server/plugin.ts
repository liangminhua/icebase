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
import { DingTalkAuth } from './dingtalk-auth';
import { DingTalkNotificationChannel } from './notification-channel';
import { getEnabledAuthenticator, syncDingTalkDepartments, syncDingTalkUsers } from './sync';
import type { DingTalkProviderConfig } from './constants';

export class PluginDingtalkServer extends Plugin {
  async afterAdd() {}

  async beforeLoad() {}

  async load() {
    this.app.authManager.registerTypes(authType, {
      auth: DingTalkAuth,
      title: tval('DingTalk', { ns: NAMESPACE }),
    });

    const notificationManager = this.pm.get(PluginNotificationManagerServer) as PluginNotificationManagerServer;
    if (notificationManager) {
      notificationManager.registerChannelType({
        type: channelType,
        Channel: DingTalkNotificationChannel,
      });
    } else {
      this.app.logger.warn(
        'dingtalk: @nocobase/plugin-notification-manager is not enabled, notification channel is not registered',
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
   * Read the provider config from the (first enabled) authenticator options of the dingtalk auth type.
   */
  async getProviderConfig(name?: string): Promise<DingTalkProviderConfig> {
    const authenticator = await getEnabledAuthenticator(this.db, authType, name);
    if (!authenticator) {
      return null;
    }
    const options = this.app.environment.renderJsonTemplate(authenticator.options ?? {}) as DingTalkProviderConfig;
    return options;
  }

  async syncDepartments(): Promise<number> {
    const config = await this.getProviderConfig();
    if (!config?.appKey || !config?.appSecret) {
      this.app.logger.warn('dingtalk: authenticator is not configured, skip department sync');
      return 0;
    }
    return await syncDingTalkDepartments(this.app, config);
  }

  async syncUsers(): Promise<number> {
    const config = await this.getProviderConfig();
    if (!config?.appKey || !config?.appSecret) {
      this.app.logger.warn('dingtalk: authenticator is not configured, skip user sync');
      return 0;
    }
    return await syncDingTalkUsers(this.app, config);
  }

  async install(options?: InstallOptions) {}

  async afterEnable() {}

  async afterDisable() {}

  async remove() {}
}

export default PluginDingtalkServer;
