/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { i18n } from '@nocobase/utils/client';
import { useTranslation } from 'react-i18next';

export const NAMESPACE = 'field-lookup';

export const tExpr = (str: string) => `{{t("${str}", { ns: "${NAMESPACE}" })}}`;

export function useT() {
  const { t } = useTranslation(NAMESPACE);
  return t;
}

export const tStr = (str: string, options = {}) => i18n.t(str, { ...options, ns: NAMESPACE });
