# 插件化可行性评估 与 分阶段交付计划

> 版本：v0.3（**交付完成**：6 组 9 个插件全部实现并通过测试，见 §6）
> 目标：界定"开源仓库已有能力"与"真正缺口"，并给出可逐步交付的插件清单
> 关联：[设计方案](./bitable-no-lock-design.md) · [数据模型 DDL](./schema.sql)

---

## 0. 结论速览（v0.2 修正）

| 结论 | 内容 |
|---|---|
| ❌ 推翻 v0.1 前提 | v0.1 假设"NocoBase 商业版插件闭源、需从零重写"。**实测不成立**：v2.2.22 开源仓库已含绝大部分能力，且无 License 门控 |
| ✅ 直接复用 | 计算字段、跨表查询、条件计算、回写、审批、抄送、脚本、SQL、通知、外部数据源、公开表单、多应用、工作区、审计、备份、导入导出、认证、AI 与知识库、主题白标、遥测…… |
| 🔧 仅 4 组缺口自研 | ① `lookup`/`rollup` 字段　② 决策表 Rules 节点　③ 多空间 multi-space　④ 模板打印 / SAML·LDAP·CAS / 钉钉·企微 |
| 🎯 核心诉求已覆盖 | "从 A 表取字段 → 查询其他表 → 按条件计算 → 回写"由 core `query` + `aggregate` + `dynamic-calculation` + `update` 等节点组合即可实现 |

---

## 1. 实测证据

对 `/workspace/nocobase`（commit `a879e4d`，2026-10-09，version 2.2.22）的检查：

| 检查项 | 结果 |
|---|---|
| 插件总数 | **110 个**（`packages/plugins/@nocobase/*`） |
| 许可证 | 抽查全部为 **Apache-2.0** |
| `pro-plugins` 目录 | **不存在**（AGENTS.md 说明商业插件在独立私有仓库） |
| `nocobase.editionLevel` | 命中的 37 个全为 `0`；其余无该字段 |
| 源码中的 License 门控逻辑 | `editionLevel` 在 `*.ts` 中 **零引用** |
| 默认启用集 | `presets/nocobase` 依赖约 **85 个**插件 |
| 遥测 | 位于**内核** `packages/core/telemetry` |
| 工作流已注册节点 | core：`calculation`·`condition`·`multi-conditions`·`query`·`create`·`update`·`destroy`·`output`·`end`；插件：`aggregate`·`dynamic-calculation`·`manual`·`cc`·`request`·`javascript`·`sql`·`loop`·`parallel`·`variable`·`dateCalculation`·`json-query`·`json-variable-mapping`·`delay`·`mailer`·`notification`·`llm`·`ai-employee`·`response-message` |
| `rollup` / `lookup` 字段 | 全仓库 `*.ts/*.tsx` **无匹配** → 确认缺失 |

> 结论：**v0.1 的"重写 15 个商业版插件"计划作废**，会与仓库已有实现大面积重复。

---

## 2. 已有能力 → 直接复用（需求映射）

| 我们的需求 | 现成实现 | 备注 |
|---|---|---|
| 公式字段（含跨表整列引用） | `plugin-field-formula` | 社区 |
| **跨表查询节点** | workflow core `query`（`QueryInstruction`） | 核心诉求关键节点 |
| 跨表聚合 | `plugin-workflow-aggregate` | sum/avg/count… |
| 条件 / 多条件分支 | core `condition` / `multi-conditions` | 决策分支 |
| **按条件选不同表达式** | `plugin-workflow-dynamic-calculation` | 最接近"决策表" |
| 回写（更新/新建/删除） | core `update` / `create` / `destroy` | 核心诉求关键节点 |
| 循环 / 并行 | `plugin-workflow-loop` / `-parallel` | |
| 脚本逃生舱 / HTTP 回调 | `plugin-workflow-javascript` / `-request` | JS 沙箱、Webhook |
| SQL | `plugin-workflow-sql` | |
| 变量 / JSON | `plugin-workflow-variable` / `-json-query` / `-json-variable-mapping` | |
| 人工审批 / 抄送 | `plugin-workflow-manual` / `-cc` | 原"专业版"能力 |
| 通知 / 邮件 | `plugin-workflow-notification` / `-mailer` / `plugin-notification-*` | |
| AI 节点 | `plugin-ai`（`llm` / `ai-employee`） | |
| 外部数据源 | `plugin-collection-fdw` / `plugin-data-source-manager` | MySQL/PG 等 |
| 公开表单 | `plugin-public-forms` | 原"专业版"能力 |
| 多应用（物理隔离） | `plugin-multi-app-manager` | 原"企业版"能力 |
| 工作区 / UI 布局 | `plugin-ui-layout` + flow-engine（multi-portal 测试） | |
| 审计日志 | `plugin-audit-logs`（**已标记 deprecated**） | 见 §5 风险 |
| 备份 | `plugin-backups` / `plugin-backup-restore` | |
| 导入导出（含异步） | `plugin-action-import` / `-export` + `plugin-async-task-manager` | |
| 认证 | `plugin-auth` / `-auth-sms` / `plugin-idp-oauth` / `-api-keys` | |
| AI 知识库（RAG） | `plugin-ai`（knowledge base） | |
| 主题 / 白标 | `plugin-theme-editor` / `plugin-ui-templates` | |
| 遥测 | `packages/core/telemetry` | 内核 |
| 环境变量 / 自定义变量 / 快照字段 | `plugin-environment-variables` / `-custom-variables` / `-snapshot-field` | |

---

## 3. 真正缺口 → 自研清单

| # | 缺口 | 自研插件 | NocoBase 扩展点 | 验收标准 |
|---|---|---|---|---|
| 1 | `lookup` / `rollup` 字段类型 | `@nocobase/plugin-field-lookup` | 服务端 `db.registerFieldTypes()`、`db.interfaceManager.registerInterfaceType()`；客户端 `dataSourceManager.addFieldInterfaces()`、`FieldModel` + `bindModelToInterface()` | 可配置来源表 / 匹配条件 / 返回字段；`rollup` 支持 sum·avg·count·min·max；跨表引用正确解析 |
| 2 | 决策表（Rules）节点 | `@nocobase/plugin-workflow-rules` | `workflowPlugin.registerInstruction('rules', RulesInstruction)` | 有序规则 `when`(表达式)→`then`(值/表达式)，支持 `first-match` / `all-match`，含 `else` 分支；规则表可 CSV 导入导出 |
| 3 | 多空间（逻辑隔离） | `@nocobase/plugin-multi-space` | `defineCollection()` + 查询/写入钩子 + 中间件 + 客户端区块 | 集合可选启用空间字段；创建自动关联当前空间；查询自动过滤；支持空间切换与"未分配空间" |
| 4 | 模板打印 | `@nocobase/plugin-print-template` | 自定义 Action + 模板渲染 | 支持模板占位变量，输出 PDF/DOCX |
| 5 | 企业认证 | `@nocobase/plugin-auth-saml` / `-auth-ldap` / `-auth-cas` | `authManager.registerTypes()` + 继承 `BaseAuth` | 各协议可登录并映射用户/角色 |
| 6 | IM 集成 | `@nocobase/plugin-dingtalk` / `plugin-wecom` | `SyncSource`（用户同步）+ 通知渠道 | 认证 + 通知渠道 + 用户/部门同步 |

---

## 4. 分阶段交付

### 批次 A（核心诉求优先，建议先做）
```
plugin-field-lookup  ──▶  plugin-workflow-rules
（查找引用/汇总字段）      （决策表节点：多条件 → 多结果）
```
交付后即可用"字段 + 决策表节点"完整表达：**从 A 表取字段 → 查 B 表 → 按条件算出结果 → 回写**。

### 批次 B（隔离）
```
plugin-multi-space（逻辑隔离：多门店 / 多工厂 / 多组织）
```

### 批次 C（企业能力）
```
plugin-print-template  ·  plugin-auth-saml / -ldap / -cas  ·  plugin-dingtalk / plugin-wecom
```

---

## 5. 风险与约束

| 风险 | 说明 | 缓解 |
|---|---|---|
| **审计日志插件已废弃** | `plugin-audit-logs` 标记 deprecated（`supportedVersions: 1.x`），官方称将有新插件 | 本方案未列入自研范围；如需独立替代，后续单列（当前复用 deprecated 版） |
| 双客户端运行时 | 仓库并存 `src/client`(v1) 与 `src/client-v2`(v2)，**依赖单向**：v1 可 import v2，v2 不可 import v1 | 客户端代码按所在目录选择运行时；官方文档称 v2 仍在开发 |
| 新集合无需迁移 | AGENTS.md：新增集合/列/索引由 `yarn nocobase upgrade` 自动同步 | 仅当改动既有结构时才写 `src/server/migrations/` |
| 服务端测试不可并行 | 官方要求串行 | 用 `yarn test <path>` 逐文件运行 |
| 缺口判定时效 | 基于 commit `a879e4d`；上游可能已补齐 | 动手前再次 grep 确认 |
| 交付需依赖安装 | 运行/测试需 `yarn install`（monorepo 体量大） | 后台安装并轮询状态 |

---

## 6. 交付进度（v0.3，2026-10-11）

### 6.1 交付清单

| # | 插件 | 位置 | 服务端测试 | 状态 |
|---|---|---|---|---|
| 1 | `@nocobase/plugin-field-lookup` | `packages/plugins/@nocobase/plugin-field-lookup` | 18/18 | ✅ 完成 |
| 2 | `@nocobase/plugin-workflow-rules` | `packages/plugins/@nocobase/plugin-workflow-rules` | 9/9 | ✅ 完成 |
| 3 | `@nocobase/plugin-multi-space` | `packages/plugins/@nocobase/plugin-multi-space` | 6/6 | ✅ 完成 |
| 4 | `@nocobase/plugin-print-template` | `packages/plugins/@nocobase/plugin-print-template` | 12/12 | ✅ 完成 |
| 5 | `@nocobase/plugin-auth-saml` | `packages/plugins/@nocobase/plugin-auth-saml` | 4/4 | ✅ 完成 |
| 6 | `@nocobase/plugin-auth-ldap` | `packages/plugins/@nocobase/plugin-auth-ldap` | 4/4 | ✅ 完成 |
| 7 | `@nocobase/plugin-auth-cas` | `packages/plugins/@nocobase/plugin-auth-cas` | 4/4 | ✅ 完成 |
| 8 | `@nocobase/plugin-dingtalk` | `packages/plugins/@nocobase/plugin-dingtalk` | 10/10 | ✅ 完成 |
| 9 | `@nocobase/plugin-wecom` | `packages/plugins/@nocobase/plugin-wecom` | 8/8 | ✅ 完成 |

合计 9 个插件、75 个服务端用例全部通过（vitest 串行、`TEST_ENV=server-side`）；全部源码通过 `eslint --fix` 与 prettier（printWidth 120）检查，文件均带 AGPL-3.0/NocoBase Commercial 双许可头。

### 6.2 各插件实现要点

| 插件 | 实现要点 |
|---|---|
| field-lookup | `db.registerFieldTypes()` 注册 `lookup`/`rollup`；服务端加载时按 `target`/`foreignKey` 动态追加关系字段并重写查询输出；rollup 支持 sum/avg/count/min/max |
| workflow-rules | `registerInstruction('rules')` 决策表节点；有序规则 `when`→`then`，`first-match`/`all-match` 模式，`else` 兜底；变量替换兼容 `{{$context.*}}`/`{{$jobsMapByNodeKey.*}}`，表达式走 mathjs |
| multi-space | `spaces` 集合 + 集合级 `usingSpace` 开关；全局中间件注入 `spaceId` 过滤、写入自动打标；内存 options 即时生效 + 元数据持久化 |
| print-template | 模板集合 + `render` Action；占位变量渲染，PDF/DOCX 输出 |
| auth-saml/-ldap/-cas | `authManager.registerTypes()` + 继承 `BaseAuth`；`registerActionHandler` 之后才 `define` 资源（Resourcer Resource 构造时才摄入全局 handler）；单测分别 mock `@node-saml/node-saml` / `ldapts` / `fetch` |
| dingtalk/-wecom | OAuth 认证 + 通知渠道 + 部门/用户同步（幂等 upsert）；钉钉走 v1.0 contact API 分页，企微走 `gettoken` + department/user list |

### 6.3 已知风险与后续事项（复核记录）

| 插件 | 风险 | 建议 |
|---|---|---|
| multi-space | 关联资源（relationship）动作不经过空间过滤；disable 集合时保留列仅隐藏 | 关联场景需在业务侧约束或后续增强中间件 |
| print-template | `render` 直接按目标集合取数，绕过行级 ACL | 生产使用前为 render action 加权限校验 |
| auth 三件套 | SAML RelayState 上限 80 字节；CAS 假设 service URL 为前缀匹配 | 部署时确认 IdP/CAS 服务端约定 |
| dingtalk/-wecom | 企微 webhook 通知渠道无加签；同步幂等按唯一键 upsert；钉钉分页语义（cursor/offset）需对齐实际账号权限 | 接入真实租户前联调 |

### 6.4 复现验证命令

```bash
# Windows（Node 装在含空格路径下需绕过 yarn test:server 的 execa bug）
$env:TEST_ENV='server-side'; $env:NODE_ENV='test'; $env:LOGGER_LEVEL='error'
node --no-node-snapshot --max_old_space_size=14096 ./node_modules/vitest/vitest.mjs `
  packages/plugins/@nocobase/plugin-field-lookup --run --poolOptions.threads.singleThread=true
# 其余 8 个插件同理，逐插件运行（vitest 多路径参数只跑第一个）
```

---

## 7. 参考

- NocoBase 源码（本地）：`/workspace/nocobase`，commit `a879e4d`，version `2.2.22`
- [NocoBase 插件开发 Cheatsheet](https://docs.nocobase.com/plugin-development/client/appendix/cheatsheet)
- [NocoBase 工作流开发 API（registerInstruction / registerTrigger）](https://docs.nocobase.com/cn/workflow/development/api)
- [NocoBase Collections（defineCollection / extendCollection）](https://docs.nocobase.com/plugin-development/server/collections)
- [NocoBase 自定义字段类型（registerFieldTypes / interfaceManager）](https://docs.nocobase.com/en/development/server/collections-fields)
- [NocoBase 认证扩展（AuthManager / BaseAuth）](https://docs.nocobase.com/en/handbook/auth/dev)
