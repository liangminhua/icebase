/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Plugin } from '@nocobase/client';
import { tval } from '@nocobase/utils/client';
import { NAMESPACE } from '../locale';
import { MultiSpaceSettings } from './MultiSpaceSettings';
import { spaceRequestInterceptor } from './space-interceptor';

export class PluginMultiSpaceClient extends Plugin {
  async load() {
    this.app.pluginSettingsManager.add('multi-space', {
      title: tval('Multi-space management', { ns: NAMESPACE }),
      icon: 'AppstoreOutlined',
      Component: MultiSpaceSettings,
      aclSnippet: 'pm.multi-space',
      sort: 260,
    });
    this.app.apiClient.axios.interceptors.request.use(spaceRequestInterceptor);
  }
}

export default PluginMultiSpaceClient;
