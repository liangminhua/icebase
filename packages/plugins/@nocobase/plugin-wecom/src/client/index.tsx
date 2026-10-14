/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Plugin } from '@nocobase/client';
import AuthPlugin from '@nocobase/plugin-auth/client';
import PluginNotificationManagerClient from '@nocobase/plugin-notification-manager/client';
import { tval } from '@nocobase/utils/client';
import { NAMESPACE, authType, channelType } from '../constant';
import { AdminSettingsForm } from './AdminSettingsForm';
import { ChannelConfigForm } from './notification/ChannelConfigForm';
import { MessageConfigForm } from './notification/MessageConfigForm';
import { SignInButton } from './SignInButton';

export class PluginWecomClient extends Plugin {
  async afterAdd() {}

  async beforeLoad() {}

  async load() {
    const auth = this.app.pm.get(AuthPlugin);
    if (auth) {
      auth.registerType(authType, {
        components: {
          SignInButton,
          AdminSettingsForm,
        },
      });
    }

    const notification = this.app.pm.get(PluginNotificationManagerClient);
    if (notification) {
      notification.registerChannelType({
        title: tval('WeCom', { ns: NAMESPACE }),
        type: channelType,
        components: {
          ChannelConfigForm,
          MessageConfigForm,
        },
      });
    }
  }
}

export default PluginWecomClient;
