/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Button } from 'antd';
import React from 'react';
import { useAPIClient } from '@nocobase/client';
import type { Authenticator } from '@nocobase/plugin-auth/client';
import { resourceName } from '../constant';
import { usePluginTranslation } from '../locale';

export const SignInButton: React.FC<{ authenticator: Authenticator }> = ({ authenticator }) => {
  const { t } = usePluginTranslation();
  const api = useAPIClient();
  const baseURL = api.axios?.defaults?.baseURL || '/api/';
  const redirect = `${window.location.origin}/`;
  const href = `${baseURL}${resourceName}:auth?authenticator=${encodeURIComponent(
    authenticator.name,
  )}&redirect=${encodeURIComponent(redirect)}`;

  return (
    <Button href={href} block>
      {t('Sign in with DingTalk')}
    </Button>
  );
};
