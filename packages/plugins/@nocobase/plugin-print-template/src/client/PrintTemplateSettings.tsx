/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { PlusOutlined, PrinterOutlined } from '@ant-design/icons';
import { useAPIClient, useCollections, useRequest } from '@nocobase/client';
import type { Collection } from '@nocobase/client';
import { App as AntdApp, Button, Card, Drawer, Form, Input, Modal, Popconfirm, Select, Space, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import React, { useMemo, useState } from 'react';
import { usePluginTranslation } from '../locale';
import { printHtml } from './printHtml';
import type { RenderResult } from './PrintAction';

interface TemplateRecord {
  id: number;
  title: string;
  collection: string;
  engine: string;
  content: string;
  filename?: string;
}

interface FormValues {
  title: string;
  collection: string;
  content: string;
  filename?: string;
}

interface TestPrintModalProps {
  template: TemplateRecord;
  collection: Collection | undefined;
  open: boolean;
  onClose: () => void;
}

const TestPrintModal: React.FC<TestPrintModalProps> = ({ template, collection, open, onClose }) => {
  const { t } = usePluginTranslation();
  const { message } = AntdApp.useApp();
  const api = useAPIClient();
  const [recordId, setRecordId] = useState<number>();
  const [printing, setPrinting] = useState(false);

  const titleField = collection?.titleField || 'id';

  const { data, loading } = useRequest<{ data: Record<string, unknown>[] }>(
    {
      url: collection ? `${collection.name}:list` : 'printTemplates:list',
      params: { pageSize: 20, sort: ['-id'] },
    },
    { ready: !!collection },
  );

  const options = useMemo(
    () =>
      (data?.data ?? []).map((record) => ({
        label: String(record[titleField] ?? record.id ?? ''),
        value: record.id as number,
      })),
    [data, titleField],
  );

  const handlePrint = async () => {
    if (!recordId) {
      message.warning(t('Select a record first'));
      return;
    }
    setPrinting(true);
    try {
      const res = await api.request<{ data: RenderResult }>({
        url: 'printTemplates:render',
        params: { templateId: template.id, recordId },
      });
      const { filename, html } = res.data?.data ?? {};
      printHtml(html, filename);
      onClose();
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Modal
      title={`${t('Test print')} - ${template.title}`}
      open={open}
      onCancel={onClose}
      width={480}
      footer={
        <Space>
          <Button onClick={onClose}>{t('Cancel')}</Button>
          <Button type="primary" icon={<PrinterOutlined />} loading={printing} onClick={handlePrint}>
            {t('Print')}
          </Button>
        </Space>
      }
    >
      <Select
        showSearch
        optionFilterProp="label"
        aria-label={t('Select a record')}
        loading={loading}
        placeholder={t('Search records')}
        options={options}
        value={recordId}
        onChange={setRecordId}
        notFoundContent={t('No records found')}
        style={{ width: '100%' }}
      />
    </Modal>
  );
};

export const PrintTemplateSettings: React.FC = () => {
  const { t } = usePluginTranslation();
  const { message } = AntdApp.useApp();
  const api = useAPIClient();
  const collections = useCollections();

  const [form] = Form.useForm<FormValues>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<TemplateRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [testTemplate, setTestTemplate] = useState<TemplateRecord | null>(null);

  const { data, loading, refresh } = useRequest<{ data: TemplateRecord[] }>({
    url: 'printTemplates:list',
    params: { pageSize: 200, sort: ['-id'] },
  });
  const templates = data?.data ?? [];

  const collectionOptions = useMemo(
    () => collections.map((collection) => ({ label: collection.title || collection.name, value: collection.name })),
    [collections],
  );

  const testPrintCollection = useMemo(
    () => collections.find((collection) => collection.name === testTemplate?.collection),
    [collections, testTemplate],
  );

  const openDrawer = (record?: TemplateRecord) => {
    setEditing(record ?? null);
    form.resetFields();
    if (record) {
      form.setFieldsValue({
        title: record.title,
        collection: record.collection,
        content: record.content,
        filename: record.filename,
      });
    }
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editing) {
        await api.request({
          url: 'printTemplates:update',
          method: 'post',
          params: { filterByTk: editing.id },
          data: values,
        });
      } else {
        await api.request({ url: 'printTemplates:create', method: 'post', data: values });
      }
      message.success(t('Saved successfully'));
      setDrawerOpen(false);
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (record: TemplateRecord) => {
    await api.request({ url: 'printTemplates:destroy', method: 'post', params: { filterByTk: record.id } });
    message.success(t('Deleted successfully'));
    await refresh();
  };

  const columns: ColumnsType<TemplateRecord> = [
    { title: t('Title'), dataIndex: 'title', key: 'title' },
    { title: t('Collection'), dataIndex: 'collection', key: 'collection' },
    {
      title: t('Actions'),
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" onClick={() => openDrawer(record)}>
            {t('Edit')}
          </Button>
          <Button type="link" size="small" icon={<PrinterOutlined />} onClick={() => setTestTemplate(record)}>
            {t('Test print')}
          </Button>
          <Popconfirm
            title={t('Are you sure you want to delete this template?')}
            onConfirm={() => {
              return handleDelete(record);
            }}
          >
            <Button type="link" size="small" danger>
              {t('Delete')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openDrawer()}>
          {t('Add template')}
        </Button>
      </Space>
      <Table rowKey="id" columns={columns} dataSource={templates} loading={loading} />
      <Drawer
        title={editing ? t('Edit template') : t('Add template')}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={640}
        forceRender
        footer={
          <Space style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={() => setDrawerOpen(false)}>{t('Cancel')}</Button>
            <Button type="primary" loading={saving} onClick={handleSave}>
              {t('Submit')}
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label={t('Title')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="collection" label={t('Collection')} rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={collectionOptions} />
          </Form.Item>
          <Form.Item
            name="content"
            label={t('Content')}
            rules={[{ required: true }]}
            extra={t(
              'HTML template. Insert record values with placeholders that wrap a field path in double curly braces, such as title or user.name. Values are HTML-escaped when rendered.',
            )}
          >
            <Input.TextArea rows={14} style={{ fontFamily: 'monospace' }} />
          </Form.Item>
          <Form.Item
            name="filename"
            label={t('Filename')}
            extra={t(
              'Filename template using the same placeholder syntax, joined fields with underscores, such as title_orderNo. Leave empty to use the template title and date.',
            )}
          >
            <Input />
          </Form.Item>
        </Form>
      </Drawer>
      {testTemplate && (
        <TestPrintModal
          template={testTemplate}
          collection={testPrintCollection}
          open={!!testTemplate}
          onClose={() => setTestTemplate(null)}
        />
      )}
    </Card>
  );
};
