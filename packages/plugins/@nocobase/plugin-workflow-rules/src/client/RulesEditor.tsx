/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { DeleteOutlined, PlusOutlined, TableOutlined } from '@ant-design/icons';
import { Button, Space } from 'antd';
import React from 'react';
import { Variable } from '@nocobase/client';
import { useWorkflowVariableOptions } from '@nocobase/plugin-workflow/client';
import { usePluginTranslation } from '../locale';

type RuleItem = { when?: string; then?: string };

export const RulesEditor: React.FC<{ value?: RuleItem[]; onChange?: (value: RuleItem[]) => void }> = (props) => {
  const { value, onChange } = props;
  const { t } = usePluginTranslation();
  const scope = useWorkflowVariableOptions();
  const rules = value ?? [];

  const update = (index: number, key: 'when' | 'then', v: string) => {
    const next = [...rules];
    next[index] = { ...(next[index] ?? {}), [key]: v };
    onChange(next);
  };

  return (
    <div>
      {rules.map((rule, index) => (
        <Space key={index} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
          <Variable.Input
            value={rule?.when}
            onChange={(v) => update(index, 'when', v)}
            scope={scope}
            placeholder={t('When (condition expression)')}
            aria-label={t('When (condition expression)')}
          />
          <Variable.Input
            value={rule?.then}
            onChange={(v) => update(index, 'then', v)}
            scope={scope}
            placeholder={t('Then (result expression)')}
            aria-label={t('Then (result expression)')}
          />
          <Button
            icon={<DeleteOutlined />}
            aria-label={t('Delete rule')}
            onClick={() => onChange(rules.filter((_, i) => i !== index))}
          />
        </Space>
      ))}
      <Button type="dashed" block icon={<PlusOutlined />} onClick={() => onChange([...rules, { when: '', then: '' }])}>
        {t('Add rule')}
      </Button>
    </div>
  );
};

RulesEditor.displayName = 'RulesEditor';

export const RulesIcon = TableOutlined;
