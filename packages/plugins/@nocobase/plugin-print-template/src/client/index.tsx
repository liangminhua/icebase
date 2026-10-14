/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Plugin } from '@nocobase/client';
import { NAMESPACE } from '../locale';
import { PrintAction } from './PrintAction';
import { PrintTemplateSettings } from './PrintTemplateSettings';

export class PluginPrintTemplateClient extends Plugin {
  async load() {
    this.app.addComponents({ PrintAction });
    this.app.pluginSettingsManager.add(NAMESPACE, {
      title: `{{t("Print templates", { ns: "${NAMESPACE}" })}}`,
      icon: 'PrinterOutlined',
      Component: PrintTemplateSettings,
      aclSnippet: `pm.${NAMESPACE}.templates`,
    });
  }
}

export default PluginPrintTemplateClient;
