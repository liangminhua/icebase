/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Plugin } from '@nocobase/client';
import { RelationSelect, TargetFieldSelect } from './components/FieldSelects';
import { LookupFieldInterface } from './interfaces/lookup';
import { RollupFieldInterface } from './interfaces/rollup';

export class PluginFieldLookupClient extends Plugin {
  async load() {
    this.app.addComponents({
      LookupRelationSelect: RelationSelect,
      LookupTargetFieldSelect: TargetFieldSelect,
      RollupRelationSelect: RelationSelect,
      RollupTargetFieldSelect: TargetFieldSelect,
    });
    this.app.dataSourceManager.addFieldInterfaces([LookupFieldInterface, RollupFieldInterface]);
  }
}

export default PluginFieldLookupClient;
