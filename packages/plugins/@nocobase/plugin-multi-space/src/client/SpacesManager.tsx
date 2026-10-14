/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { useAPIClient, useRequest } from '@nocobase/client';
import { Button, Form, Input, InputNumber, message, Modal, Popconfirm, Space, Table } from 'antd';
import React, { useState } from 'react';
import { usePluginTranslation } from '../locale';

interface SpaceRecord {
  id: number;
  name: string;
  title?: string;
  description?: string;
  sortOrder?: number;
}

interface SpaceFormValues {
  name: string;
  title?: string;
  description?: string;
  sortOrder?: number;
}

export const SpacesManager: React.FC = () => {
  const { t } = usePluginTranslation();
  const api = useAPIClient();
  const [form] = Form.useForm<SpaceFormValues>();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<SpaceRecord | null>(null);

  const { data, loading, refresh } = useRequest<{ data: SpaceRecord[] }>({
    resource: 'spaces',
    action: 'list',
    params: { sort: ['sortOrder', 'id'], pageSize: 200 },
  });
  const dataSource: SpaceRecord[] = data?.data ?? [];

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setOpen(true);
  };

  const openEdit = (record: SpaceRecord) => {
    setEditing(record);
    form.setFieldsValue({
      name: record.name,
      title: record.title,
      description: record.description,
      sortOrder: record.sortOrder,
    });
    setOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editing) {
        await api.resource('spaces').update({ filterByTk: editing.id, values });
      } else {
        await api.resource('spaces').create({ values });
      }
      message.success(t('Saved successfully'));
      setOpen(false);
      refresh();
    } catch {
      // error already notified by the response interceptor, keep the modal open
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (record: SpaceRecord) => {
    await api.resource('spaces').destroy({ filterByTk: record.id });
    message.success(t('Deleted successfully'));
    refresh();
  };

  const columns = [
    {
      title: t('Name'),
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: t('Title'),
      dataIndex: 'title',
      key: 'title',
      render: (value: string, record: SpaceRecord) => value || record.name,
    },
    {
      title: t('Description'),
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: t('Sort order'),
      dataIndex: 'sortOrder',
      key: 'sortOrder',
      width: 100,
    },
    {
      title: t('Actions'),
      key: 'actions',
      width: 140,
      render: (_: unknown, record: SpaceRecord) => (
        <Space>
          <Button type="link" size="small" onClick={() => openEdit(record)}>
            {t('Edit')}
          </Button>
          <Popconfirm title={t('Confirm delete')} onConfirm={() => handleDelete(record)}>
            <Button type="link" size="small" danger>
              {t('Delete')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" onClick={openCreate}>
          {t('Add space')}
        </Button>
      </div>
      <Table
        aria-label={t('Space management')}
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={dataSource}
        pagination={false}
      />
      <Modal
        title={editing ? t('Edit space') : t('Add space')}
        open={open}
        confirmLoading={saving}
        onOk={handleSave}
        onCancel={() => setOpen(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label={t('Name')} rules={[{ required: true, message: t('Name is required') }]}>
            <Input disabled={!!editing} />
          </Form.Item>
          <Form.Item name="title" label={t('Title')}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label={t('Description')}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="sortOrder" label={t('Sort order')}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
