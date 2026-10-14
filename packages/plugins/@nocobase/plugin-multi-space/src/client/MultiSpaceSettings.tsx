/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Tabs } from 'antd';
import React from 'react';
import { usePluginTranslation } from '../locale';
import { CollectionsToggle } from './CollectionsToggle';
import { SpacesManager } from './SpacesManager';

export const MultiSpaceSettings: React.FC = () => {
  const { t } = usePluginTranslation();
  return (
    <Tabs
      defaultActiveKey="spaces"
      destroyInactiveTabPane
      items={[
        {
          key: 'spaces',
          label: t('Space management'),
          children: <SpacesManager />,
        },
        {
          key: 'collections',
          label: t('Collection settings'),
          children: <CollectionsToggle />,
        },
      ]}
    />
  );
};
