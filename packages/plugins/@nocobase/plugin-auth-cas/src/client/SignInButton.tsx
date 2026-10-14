/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { useAPIClient } from '@nocobase/client';
import type { Authenticator } from '@nocobase/plugin-auth/client';
import { Button } from 'antd';
import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuthTranslation } from './locale';

export const SignInButton = (props: { authenticator: Authenticator }) => {
  const { name, title } = props.authenticator;
  const api = useAPIClient();
  const { t } = useAuthTranslation();
  const [searchParams] = useSearchParams();

  const handleSignIn = async () => {
    const { data } = await api.request('cas:getAuthUrl', {
      method: 'get',
      params: { authenticator: name, redirect: searchParams.get('redirect') || '/admin' },
    });
    const authUrl = data?.data?.authUrl;
    if (authUrl) {
      window.location.href = authUrl;
    }
  };

  return (
    <Button block htmlType="button" onClick={handleSignIn}>
      {title || t('Sign in with CAS')}
    </Button>
  );
};
