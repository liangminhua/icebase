/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { InternalAxiosRequestConfig } from 'axios';

export const CURRENT_SPACE_STORAGE_KEY = 'NOCOBASE_CURRENT_SPACE';

/**
 * Attaches the current space (read from localStorage) to every API request
 * as the `X-Space` header, so the server can scope space-enabled collections.
 */
export function spaceRequestInterceptor(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  const value = typeof localStorage !== 'undefined' ? localStorage.getItem(CURRENT_SPACE_STORAGE_KEY) : null;
  if (!value) {
    return config;
  }
  config.headers.set('X-Space', value);
  return config;
}
