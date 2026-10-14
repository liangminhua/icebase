/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { FieldConfigurePropertyComponentProps } from '@nocobase/client-v2';
import { Form, Select } from 'antd';
import React from 'react';

function resolveDataSourceManager(props: FieldConfigurePropertyComponentProps): any {
  const manager = (props.fieldInterface as any)?.collectionFieldInterfaceManager;
  return manager?.dataSourceManager ?? null;
}

function resolveTargetFields(props: FieldConfigurePropertyComponentProps, relationName: string): any[] {
  const relation = (props.collection?.fields ?? []).find((field: any) => field?.name === relationName);
  const target = relation?.target;
  if (!target) {
    return [];
  }
  const dsm = resolveDataSourceManager(props);
  const ds = dsm?.getDataSource?.('main') ?? dsm;
  const collection = ds?.getCollection?.(target) ?? dsm?.collectionManager?.getCollection?.(target);
  return collection?.fields ?? [];
}

export const LookupRelationConfigureField: React.FC<FieldConfigurePropertyComponentProps> = (props) => {
  const options = (props.collection?.fields ?? [])
    .filter((field: any) => ['belongsTo', 'hasOne'].includes(field?.type))
    .map((field: any) => ({ label: field.uiSchema?.title ?? field.name, value: field.name }));

  return (
    <Form.Item
      name={props.namePath}
      label={props.title}
      rules={props.schema?.required ? [{ required: true }] : undefined}
    >
      <Select options={options} disabled={props.disabled} />
    </Form.Item>
  );
};

export const LookupTargetFieldConfigureField: React.FC<FieldConfigurePropertyComponentProps> = (props) => {
  const relationName = Form.useWatch('relation', props.form);
  const options = resolveTargetFields(props, relationName)
    .filter((field: any) => field?.type !== 'virtual')
    .map((field: any) => ({ label: field.uiSchema?.title ?? field.name, value: field.name }));

  return (
    <Form.Item
      name={props.namePath}
      label={props.title}
      rules={props.schema?.required ? [{ required: true }] : undefined}
    >
      <Select options={options} disabled={props.disabled || !relationName} />
    </Form.Item>
  );
};

export const RollupRelationConfigureField: React.FC<FieldConfigurePropertyComponentProps> = (props) => {
  const options = (props.collection?.fields ?? [])
    .filter((field: any) => ['hasMany', 'belongsToMany'].includes(field?.type))
    .map((field: any) => ({ label: field.uiSchema?.title ?? field.name, value: field.name }));

  return (
    <Form.Item
      name={props.namePath}
      label={props.title}
      rules={props.schema?.required ? [{ required: true }] : undefined}
    >
      <Select options={options} disabled={props.disabled} />
    </Form.Item>
  );
};

export const RollupTargetFieldConfigureField: React.FC<FieldConfigurePropertyComponentProps> = (props) => {
  const relationName = Form.useWatch('relation', props.form);
  const aggregate = Form.useWatch('aggregate', props.form);
  const options = resolveTargetFields(props, relationName)
    .filter((field: any) => field?.type !== 'virtual')
    .map((field: any) => ({ label: field.uiSchema?.title ?? field.name, value: field.name }));

  return (
    <Form.Item
      name={props.namePath}
      label={props.title}
      rules={aggregate !== 'count' && props.schema?.required ? [{ required: true }] : undefined}
    >
      <Select options={options} disabled={props.disabled || !relationName || aggregate === 'count'} />
    </Form.Item>
  );
};
