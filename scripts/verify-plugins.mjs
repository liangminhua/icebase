#!/usr/bin/env node
/**
 * IceBase 插件构建/验证入口。
 *
 * 背景：IceBase 的自研插件以 NocoBase 为基座，基座以引用形式保留在 `icebase/nocobase`
 * （本脚本不会修改其受版本控制的文件）。插件的真实源码位于
 * `icebase/packages/plugins/@nocobase/<plugin>`。
 *
 * 为让基座自带的 vitest / tsconfig 路径发现逻辑能加载这些插件，需要在基座内部建立
 * junction 链接（Windows 目录联接，仅本地开发用，已被 .gitignore 忽略）。
 *
 * 用法：
 *   node scripts/verify-plugins.mjs            # 验证全部插件
 *   node scripts/verify-plugins.mjs field-lookup wecom   # 只验证指定插件
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const NOCOBASE = path.join(ROOT, 'nocobase');
const BASE_PLUGINS = path.join(NOCOBASE, 'packages', 'plugins', '@nocobase');
const REAL_PLUGINS = path.join(ROOT, 'packages', 'plugins', '@nocobase');

const ALL_PLUGINS = [
  'field-lookup',
  'workflow-rules',
  'multi-space',
  'print-template',
  'auth-saml',
  'auth-ldap',
  'auth-cas',
  'dingtalk',
  'wecom',
];

function lstatKind(p) {
  try {
    return fs.lstatSync(p).isSymbolicLink() ? 'link' : 'dir';
  } catch {
    return 'none';
  }
}

/** 建立目录联接：linkPath -> targetPath（幂等；遇到真实目录则跳过，避免误删） */
function ensureJunction(linkPath, targetPath, label) {
  const kind = lstatKind(linkPath);
  if (kind === 'link') {
    return true;
  }
  if (kind === 'dir') {
    console.warn(`  ! 跳过 ${label}：${linkPath} 已存在真实目录（非链接）`);
    return false;
  }
  fs.symlinkSync(targetPath, linkPath, 'junction');
  console.log(`  + 链接 ${label}: ${linkPath} -> ${targetPath}`);
  return true;
}

/** 本脚本会创建的全部链接路径（均为纯本地产物，结束时统一清理，保证基座仓库工作区干净） */
function linkPaths() {
  return [...ALL_PLUGINS.map((name) => path.join(BASE_PLUGINS, `plugin-${name}`)), path.join(ROOT, 'node_modules')];
}

/** 清理链接：只删除链接本身（rmdir 不递归），遇到真实目录一律跳过，避免误删 */
function teardown() {
  let removed = 0;
  for (const link of linkPaths()) {
    if (lstatKind(link) !== 'link') {
      continue;
    }
    try {
      fs.rmdirSync(link);
      removed += 1;
    } catch (e) {
      console.warn(`  ! 清理链接失败：${link}（${e.message}）`);
    }
  }
  console.log(`\n已清理 ${removed} 个本地链接，基座仓库工作区保持干净。`);
}

function bootstrap() {
  if (!fs.existsSync(NOCOBASE)) {
    console.error('未找到基座目录 nocobase/，请先克隆 NocoBase 基座。');
    process.exit(1);
  }
  if (!fs.existsSync(path.join(NOCOBASE, 'node_modules'))) {
    console.error('基座依赖尚未安装，请先在 nocobase/ 执行 yarn install。');
    process.exit(1);
  }
  // 依赖声明校验：服务端测试需要 sqlite3
  try {
    createRequire(path.join(NOCOBASE, 'index.js')).resolve('sqlite3');
  } catch {
    console.warn('  ! 未检测到 sqlite3，服务端测试可能失败：');
    console.warn('    请在 nocobase/ 执行  yarn add sqlite3 --no-save -W');
  }

  console.log('准备本地链接：');
  // 让插件源码在 icebase 顶层可直接被基座发现
  for (const name of ALL_PLUGINS) {
    ensureJunction(path.join(BASE_PLUGINS, `plugin-${name}`), path.join(REAL_PLUGINS, `plugin-${name}`), `plugin-${name}`);
  }
  // 让 icebase 侧源码解析基座已安装的依赖
  ensureJunction(path.join(ROOT, 'node_modules'), path.join(NOCOBASE, 'node_modules'), 'node_modules');
}

function runOne(name) {
  // vitest 的位置过滤参数需使用正斜杠，否则 glob 匹配失败会报 "No test files found"
  const rel = `packages/plugins/@nocobase/plugin-${name}`;
  const vitest = path.join(NOCOBASE, 'node_modules', 'vitest', 'vitest.mjs');
  const start = Date.now();
  const res = spawnSync(
    process.execPath,
    ['--no-node-snapshot', '--max_old_space_size=14096', vitest, rel, '--run', '--poolOptions.threads.singleThread=true'],
    {
      cwd: NOCOBASE,
      env: { ...process.env, TEST_ENV: 'server-side', NODE_ENV: 'test', LOGGER_LEVEL: 'error' },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const out = `${res.stdout || ''}\n${res.stderr || ''}`.replace(/\u001b\[[0-9;]*m/g, '');
  const tests = out.match(/^\s*Tests\s+(.+)$/m);
  const files = out.match(/^\s*Test Files\s+(.+)$/m);
  const ok = res.status === 0 && /passed/.test(tests?.[1] || '');
  const secs = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`  ${ok ? 'PASS' : 'FAIL'} plugin-${name} | ${files?.[1]?.trim() || 'N/A'} | ${tests?.[1]?.trim() || 'N/A'} | ${secs}s`);
  if (!ok) {
    console.log(`      status=${res.status} signal=${res.signal} error=${res.error ? res.error.message : 'none'}`);
    const lines = out.split('\n').filter((l) => l.trim()).slice(0, 25);
    console.log(lines.map((l) => `      ${l.trim()}`).join('\n'));
  }
  return ok;
}

const requested = process.argv.slice(2);
const targets = requested.length ? requested : ALL_PLUGINS;

bootstrap();

let failed = 0;
try {
  console.log(`\n运行插件测试（串行）：${targets.join(', ')}\n`);
  for (const name of targets) {
    if (!runOne(name)) {
      failed += 1;
    }
  }
} finally {
  teardown();
}

console.log(`\n结果：${targets.length - failed}/${targets.length} 通过`);
process.exit(failed === 0 ? 0 : 1);
