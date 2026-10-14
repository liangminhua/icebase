/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { useAPIClient, useRequest } from '@nocobase/client';
import { Button, Switch, Table } from 'antd';
import React, { useState } from 'react';
import { usePluginTranslation } from '../locale';

interface CollectionRecord {
  name: string;
  title?: string;
  usingSpace: boolean;
}

export const CollectionsToggle: React.FC = () => {
  const { t } = usePluginTranslation();
  const api = useAPIClient();
  const [toggling, setToggling] = useState<Record<string, boolean>>({});

  const { data, loading, refresh } = useRequest<{ data: CollectionRecord[] }>({
    resource: 'multiSpace',
    action: 'listCollections',
  });
  const dataSource: CollectionRecord[] = data?.data ?? [];

  const handleToggle = async (record: CollectionRecord, enabled: boolean) => {
    setToggling((prev) => ({ ...prev, [record.name]: true }));
    try {
      await api.resource('multiSpace').toggleCollection({ values: { collectionName: record.name, enabled } });
      refresh();
    } catch {
      // error already notified by the response interceptor
    } finally {
      setToggling((prev) => ({ ...prev, [record.name]: false }));
    }
  };

  const columns = [
    {
      title: t('Collection title'),
      dataIndex: 'title',
      key: 'title',
      render: (value: string, record: CollectionRecord) => value || record.name,
    },
    {
      title: t('Collection name'),
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: t('Enable space isolation'),
      dataIndex: 'usingSpace',
      key: 'usingSpace',
      width: 180,
      render: (_: unknown, record: CollectionRecord) => (
        <Switch
          aria-label={`${t('Enable space isolation')}: ${record.title || record.name}`}
          checked={record.usingSpace}
          loading={!!toggling[record.name]}
          onChange={(enabled) => handleToggle(record, enabled)}
        />
      ),
    },
  ];

  return (
    <Table
      aria-label={t('Collection settings')}
      rowKey="name"
      size="small"
      loading={loading}
      columns={columns}
      dataSource={dataSource}
      pagination={false}
    />
  );
};
