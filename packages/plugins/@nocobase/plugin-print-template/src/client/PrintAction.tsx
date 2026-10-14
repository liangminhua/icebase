/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { PrinterOutlined } from '@ant-design/icons';
import { useAPIClient } from '@nocobase/client';
import { Button } from 'antd';
import type { ButtonProps } from 'antd';
import React, { useState } from 'react';
import { usePluginTranslation } from '../locale';
import { printHtml } from './printHtml';

export interface RenderResult {
  filename: string;
  html: string;
}

export interface PrintActionProps {
  templateId: number | string;
  recordId: number | string;
  /** Button text, defaults to the localized "Print" */
  title?: React.ReactNode;
  buttonProps?: Omit<ButtonProps, 'onClick' | 'loading' | 'icon'>;
}

/**
 * Reusable print button: renders a record with a print template and opens the browser print dialog.
 */
export const PrintAction: React.FC<PrintActionProps> = (props) => {
  const { templateId, recordId, title, buttonProps } = props;
  const api = useAPIClient();
  const { t } = usePluginTranslation();
  const [loading, setLoading] = useState(false);

  const handlePrint = async () => {
    setLoading(true);
    try {
      const res = await api.request<{ data: RenderResult }>({
        url: 'printTemplates:render',
        params: { templateId, recordId },
      });
      const { filename, html } = res.data?.data ?? {};
      printHtml(html, filename);
    } finally {
      setLoading(false);
    }
  };

  const ariaLabel = typeof title === 'string' ? title : t('Print');

  return (
    <Button {...buttonProps} icon={<PrinterOutlined />} loading={loading} onClick={handlePrint} aria-label={ariaLabel}>
      {title ?? t('Print')}
    </Button>
  );
};
