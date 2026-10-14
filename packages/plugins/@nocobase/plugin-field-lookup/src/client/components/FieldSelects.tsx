/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { useForm } from '@formily/react';
import { useCollectionManager_deprecated } from '@nocobase/client';
import { Select } from 'antd';
import React from 'react';

type RelationSelectProps = {
  value?: string;
  onChange?: (value: string) => void;
  useCurrentFields?: () => any[];
  relationTypes: string[];
  disabled?: boolean;
};

export const RelationSelect: React.FC<RelationSelectProps> = (props) => {
  const { value, onChange, useCurrentFields, relationTypes, disabled } = props;
  const fields = useCurrentFields?.() ?? [];
  const options = fields
    .filter((field) => relationTypes.includes(field.type))
    .map((field) => ({ label: field.uiSchema?.title ?? field.name, value: field.name }));

  return <Select value={value} onChange={onChange} options={options} disabled={disabled} placeholder=" " />;
};

type TargetFieldSelectProps = {
  value?: string;
  onChange?: (value: string) => void;
  useCurrentFields?: () => any[];
  disabled?: boolean;
};

export const TargetFieldSelect: React.FC<TargetFieldSelectProps> = (props) => {
  const { value, onChange, useCurrentFields, disabled } = props;
  const form = useForm();
  const cm = useCollectionManager_deprecated();
  const fields = useCurrentFields?.() ?? [];
  const relation = fields.find((field) => field.name === form.values?.relation);
  const target = relation?.target;
  const targetFields = target ? (cm.getCollectionFields(target) as any[]) ?? [] : [];
  const options = targetFields
    .filter((field) => field.type !== 'virtual')
    .map((field) => ({ label: field.uiSchema?.title ?? field.name, value: field.name }));

  return <Select value={value} onChange={onChange} options={options} disabled={disabled} placeholder=" " />;
};
