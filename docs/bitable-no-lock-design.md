# 无功能锁定的多维表格 + 自定义计算工作流系统 设计方案

> 版本：v0.1（方案设计稿）
> 定位：以开源为基座二次开发，自托管 / SaaS 双形态，核心计算能力全部开放、不设付费墙
> 关键诉求：从一张表取部分字段 → 跨表查询 → 按不同条件计算出结果

---

## 1. 背景与目标

### 1.1 为什么要"无功能锁定"

现有主流产品在"计算/自动化"这条链路上普遍存在功能锁定（feature gating）：

| 产品 | 锁定点 | 典型限制 |
|---|---|---|
| 飞书多维表格 | 工作流/自动化运行次数 | 免费版 200 次/月，付费版 5,000~50万次/月；单表公式+查找引用字段超过 100 个即不可用 |
| NocoDB | 外部数据库连接、SSM/SCIM、行列级权限、审计日志 | 外部库连接只在 Business+；行级安全/审计在 Scale+；许可证已从 AGPL 改为 Sustainable Use License |
| Airtable | 记录数 / 席位 | 免费 1,000 行/基础表，Pro 50,000 行，Business $45/人/月，云-only 不可自托管 |
| Teable / Baserow | 企业功能 | CE 可自托管，但 SSO、审计、高级权限等在付费版 |

**结论**：凡是把"计算/自动化/权限/API"做成付费墙的产品，长期都会卡住业务。本系统的设计原则是——**计算引擎、工作流引擎、API、权限、导出全部开源开放，不设按次/按席位/按行数的功能锁**。

### 1.2 目标

1. **无功能锁定**：核心能力（数据表、字段、跨表查询、条件计算、工作流、API、权限、导入导出）在自托管版完全可用。
2. **自定义计算工作流**：可视化配置"取数 → 跨表查询 → 条件判断 → 计算 → 回写"，支持决策表（多条件分支）。
3. **双形态部署**：既能单机 Docker 自托管（数据不出域），也能多租户 SaaS。
4. **可扩展**：一切皆插件，业务方可用代码扩展节点类型、函数、字段类型。
5. **可迁移**：数据存标准 PostgreSQL，随时可导出，无私有格式锁定。

### 1.3 非目标（本期不做）

- 不做完整 BI/报表大屏（只做基础图表与仪表盘）
- 不做移动端原生 App（先做响应式 Web / PWA）
- 不做 AI 自动生成应用（预留给后续版本）

---

## 2. 竞品能力盘点与选型

### 2.1 开源基座横向对比

| 维度 | NocoBase | Teable | Baserow | NocoDB | Directus | Grist |
|---|---|---|---|---|---|---|
| 许可证 | **Apache-2.0** | AGPL-3.0 (CE) | MIT (core) | Sustainable Use | BSL/商业 | Apache-2.0 |
| 仓库形态 | 插件微内核 | 单体应用 | 单体应用 | 单体应用 | 单体应用 | 单体应用 |
| 数据模型 | **模型驱动（Collection 优先）** | 表格驱动 | 表格驱动 | 包装现有库 | 包装现有库 | 表格驱动 |
| 工作流引擎 | **内置，可注册 Trigger/Instruction** | 内置自动化 | Automation Builder | 数据库触发自动化 | Flows（付费） | 弱 |
| 条件计算节点 | **有（Calculation + 动态计算节点）** | AI 字段/自动化 | 公式字段 | 公式字段 | Flows | Python 公式 |
| 插件/扩展 | **极强，一切皆插件** | 中 | 中 | 中 | 强 | 弱 |
| 连接现有库 | 是 | 否 | 有限 | 是 | 是 | 否 |
| 自托管 | 是 | 是 | 是 | 是 | 是 | 是 |
| 多租户 | 需自建 | 需自建 | 需自建 | 需自建 | 需自建 | 需自建 |

### 2.2 选型结论

**基座选择 NocoBase**，理由：

1. **Apache-2.0**：最宽松，可自由二次开发与商用，天然"无功能锁定"。
2. **插件微内核**：核心只负责生命周期、插件管理、服务注册；工作流、权限、字段类型都是插件 —— 我们的"计算引擎插件"可以像官方插件一样接入，无需 fork 内核。
3. **工作流引擎提供官方扩展点**：`registerTrigger(type, Trigger)` 注册新触发器、`registerInstruction(type, Instruction)` 注册新节点类型，正好承载"自定义计算节点"。
4. **数据模型驱动**：Collection（表）/Field（字段）/Relation（关系）本身就是元数据，跨表查询有天然基础。
5. **社区版已含工作流与"动态计算节点"**（根据记录不同条件调用不同表达式），与本项目核心诉求高度重合，可直接复用并增强。

> 备选：若团队更偏 Python 生态，可用 **Baserow（MIT core）** 或 **Grist（Apache-2.0）** 作基座，但工作流扩展性弱于 NocoBase，需自建更多模块。
> 若不接受 NocoBase 的企业版插件边界，可只用其 Apache-2.0 内核 + 社区版插件集，把本方案的计算引擎作为独立插件开发，确保不受企业版边界影响。

---

## 3. 总体架构

### 3.1 分层架构

```
┌──────────────────────────────────────────────────────────────────────┐
│  接入层  Web SPA (React) / OpenAPI / GraphQL / Webhook / CLI          │
├──────────────────────────────────────────────────────────────────────┤
│  应用层  NocoBase 基座：页面/区块、权限 ACL、数据源管理、插件市场      │
│          ┌────────────────────────┐  ┌───────────────────────────┐   │
│          │  计算引擎插件 (自研)    │  │  工作流引擎 (基座 + 扩展)  │   │
│          │  · 表达式引擎           │  │  · Trigger 注册           │   │
│          │  · 变量/引用系统         │  │  · Instruction 节点        │   │
│          │  · 函数库               │  │  · DAG 执行器              │   │
│          │  · 依赖图 / 增量重算     │  │  · 调度 / 重试 / 幂等      │   │
│          └────────────────────────┘  └───────────────────────────┘   │
├──────────────────────────────────────────────────────────────────────┤
│  存算层  PostgreSQL(业务数据+元数据) · Redis(缓存/队列) · S3(附件)    │
├──────────────────────────────────────────────────────────────────────┤
│  运行层  Worker(计算/流程执行) · Scheduler(定时) · Queue(异步任务)    │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.2 计算引擎与工作流引擎的分工

| | 计算引擎 | 工作流引擎 |
|---|---|---|
| 触发方式 | 字段级、记录变更、被动求值 | 事件/定时/手动/Webhook 主动触发 |
| 粒度 | 单记录、单字段 | 跨记录、跨表、多步骤 |
| 典型场景 | 公式字段、查找引用、汇总（rollup） | 批量重算、审批、通知、跨表回写 |
| 状态 | 无状态（可重算） | 有状态（run/job 持久化） |
| 关系 | 工作流的"计算节点"复用计算引擎 | 工作流可批量调用计算引擎 |

### 3.3 部署形态

**形态 A：单机 / 私有化自托管**

```
docker compose:  nocodb-base + postgres + redis + worker + scheduler + minio
```
- 单租户，数据不出域，无 License 校验、无功能开关。

**形态 B：多租户 SaaS**

- 数据库隔离采用 **混合策略**：
  - 中小租户：**共享库 + `tenant_id` + PostgreSQL RLS**（迁移 O(1)，连接池友好）
  - 大客户/合规租户：**schema-per-tenant**（可单独备份、单独恢复、物理隔离）
  - 契约要求物理隔离的：database-per-tenant
- 从第一天起每张表都带 `tenant_id` 列，避免后期回填。

---

## 4. 核心模块设计

### 4.1 数据模型层

采用 NocoBase 的模型驱动理念：

- **Collection（集合/表）**：`name`、`title`、`fields[]`、`options`
- **Field（字段）**：类型系统可扩展，内置类型见 4.2
- **Relation（关系）**：`belongsTo` / `hasMany` / `belongsToMany`，决定跨表查询的路径

元数据（表/字段/关系/规则）本身也存 PostgreSQL，做到"配置即数据"，可导出、可版本化。

### 4.2 字段类型体系

```
基础类型   text / longText / number / decimal / boolean / date / datetime
         / email / url / phone / select / multiSelect / attachment / json
关系类型   belongsTo / hasMany / belongsToMany
计算类型   formula      —— 本表基于表达式实时计算（光标所在行的字段参与）
         lookup       —— 沿关系引用他表字段的字段
         rollup       —— 沿关系对他表记录做聚合（sum/avg/count/min/max）
         computed     —— 由"计算规则"物化写入的字段（支持跨表 + 条件分支）
```

**关键区分**

| 字段类型 | 计算范围 | 是否存储 | 适用 |
|---|---|---|---|
| formula | 本记录（可整列引用） | 不存储，读时算 | 简单派生列 |
| lookup / rollup | 关联表 | 不存储或缓存 | 关系型取数 |
| computed | 任意表 + 条件分支 | **物化存储** | 跨表 + 多条件复杂计算 |

`computed` 是本项目为"根据不同情况计算出结果"新增的核心字段类型。

### 4.3 计算引擎

#### 4.3.1 表达式引擎选型

采用 **双引擎 + 统一语义层**：

| 门类 | 库 | 用途 | 许可证 |
|---|---|---|---|
| 数值/公式/数组 | **math.js** | 数学、统计、数组、符号运算；可作为公式字段引擎 | Apache-2.0 |
| 条件/布尔/规则 | **CEL（@marcbachmann/cel-js）** | 安全、非图灵完备的条件表达式，适合决策表 | Apache-2.0 |
| （可选）Excel 兼容公式 | HyperFormula | 如需 Excel 函数兼容层 | GPLv3 或商业 |

> **安全要点**：math.js 官方明确建议禁用 `import / createUnit / reviver / evaluate / parse / simplify / derivative / resolve` 等危险函数，避免表达式注入。CEL 本身为"非图灵完备、可安全执行用户代码"的语言，天然适合用户自定义条件，支持类型检查、AST 限制（`maxAstNodes`、`maxDepth`）与自定义函数注册。
> 计算超时、最大迭代/递归深度、最大跨表扫描行数均由引擎统一限制，防止慢查询拖垮系统（对标飞书"计算慢的公式"治理）。

#### 4.3.2 变量与引用系统

统一引用语法（前端可视化点选，后端编译为 AST）：

| 语法 | 含义 | 示例 |
|---|---|---|
| `record.<field>` | 当前记录字段 | `record.amount` |
| `lookup('<表>', {<匹配>}).<字段>` | 跨表查一条 | `lookup('价目表', {product_id: record.product_id}).price` |
| `rollup('<表>', {<匹配>}, '<字段>', '<聚合>')` | 跨表聚合 | `rollup('订单明细', {order_id: record.id}, 'amount', 'sum')` |
| `steps.<nodeId>.result` | 上游节点结果 | `steps.findPrice.result` |
| `vars.<name>` | 流程局部变量/循环变量 | `vars.total` |
| `tenant.<field>` | 租户上下文 | `tenant.id` |

**跨表查询是核心能力**，其执行语义：

1. 解析关系路径（优先走 Relation；无关系时走 `where` 条件匹配）
2. 注入租户隔离条件 + 行级权限过滤
3. 命中结果集 → 取一条 / 聚合
4. 结果缓存（同一次 run 内去重，避免 N+1）

#### 4.3.3 函数库

```
数学      SUM AVG MIN MAX ROUND ABS POW SQRT
文本      LEFT RIGHT MID LEN TEXT CONCAT SPLIT REGEX
日期      DATE TODAY NOW DATEDIF NETWORKDAYS EDATE EOMONTH
逻辑      IF IFERROR AND OR NOT SWITCH
聚合      ROLLUP_COUNT SUM AVG MIN MAX MEDIAN SUMPRODUCT
数组      FILTER MAP JOIN LIST LEN
财务      PMT NPV IRR RATE（选配）
自定义    calc_function 表注册，沙箱执行
```

#### 4.3.4 计算模式

| 模式 | 触发 | 延迟 | 场景 |
|---|---|---|---|
| 实时（读时算） | 查询时 | 低 | formula / lookup |
| 物化（写时算） | 记录变更 / 定时 | 秒级 | computed 字段 |
| 批量重算 | 手动 / 定时 / 依赖变更 | 分钟级 | 规则变更后全表刷新 |

#### 4.3.5 依赖图与增量重算

- 每次计算记录"读了哪些表/字段" → 构建 **字段依赖有向图**（`calc_dependency`）
- 上游字段变更 → 标记下游为脏（dirty）+ 入队
- 拓扑排序批量重算，避免全表扫描
- 检测循环依赖（A→B→A）并报错阻断

### 4.4 自定义计算工作流（核心）

#### 4.4.1 概念模型

一条"计算工作流"= 一张 **DAG**，由若干节点组成：

```
Trigger ──▶ Lookup(取数) ──▶ Switch/Rules(条件分支) ──▶ Calculate(计算) ──▶ WriteBack(回写)
                │                   │                        │
                └──▶ Aggregate ─────┘                        └──▶ Notify(通知)
```

#### 4.4.2 节点类型

| 节点 | 作用 | 关键配置 |
|---|---|---|
| **Trigger** | 启动流程 | 记录新增/修改/满足条件、定时、按钮、Webhook |
| **Lookup** | 从其他表查询 | 目标表、匹配条件、返回字段、取一条/多条 |
| **Aggregate** | 跨表聚合 | 目标表、过滤、字段、聚合函数 |
| **Condition / Switch** | 条件分支 | CEL 表达式，多分支 |
| **Rules（决策表）** | **多条件 → 多结果** | 有序规则列表 `when → then`，命中即停或全部 |
| **Calculate** | 表达式计算 | 计算引擎 + 表达式 |
| **Branch** | 流程分支 | 条件成立/否则 |
| **WriteBack** | 写回 | 目标表/字段、赋值表达式、创建/更新 |
| **Loop** | 遍历集合 | 来源集、局部变量 |
| **Notify** | 通知 | 站内/邮件/Webhook/IM |
| **Code** | 逃生舱 | 沙箱脚本（JS/Python），供高级用户 |

#### 4.4.3 决策表（Rules 节点）详解 —— 直接回答"根据不同情况计算"

规则是一个**有序列表**，每条 = 条件（CEL） + 结果（表达式）：

```yaml
rules:
  - when: "record.quantity >= 100"
    then: "lookup('价目表', {product_id: record.product_id}).price * 0.6"
  - when: "record.customer_level == 'VIP' && record.amount > 5000"
    then: "lookup('价目表', {product_id: record.product_id}).price * 0.8"
  - when: "record.customer_level == 'VIP'"
    then: "lookup('价目表', {product_id: record.product_id}).price * 0.9"
  - else: "lookup('价目表', {product_id: record.product_id}).price"
```

执行语义：
- 自上而下匹配，命中第一条即返回（`first-match`），或配置为全部命中后按优先级合并
- `when` 用 CEL 求布尔；`then` / `else` 用计算引擎求值
- 规则表可导出/导入 CSV，便于业务人员维护

#### 4.4.4 端到端示例（对齐用户诉求）

**场景**：订单表有一条记录，需根据"客户等级 + 数量"从价目表查出基准价，再计算出最终单价并写回。

```
Trigger: 订单表 · 修改记录时（关注字段：product_id, quantity, customer_level）
   │
   ├─ Lookup:  from 价目表 where product_id = record.product_id
   │           return price, cost            → steps.price.result
   │
   ├─ Rules:   多条件决策（见上）             → steps.finalPrice.result
   │
   ├─ Calculate: total = steps.finalPrice * record.quantity
   │
   └─ WriteBack: 更新订单表 record.unit_price = steps.finalPrice
                更新订单表 record.total      = steps.total
```

#### 4.4.5 执行语义

| 维度 | 设计 |
|---|---|
| 幂等 | 每次 run 带幂等键（表+记录+规则版本+触发事件 id），重复触发不重复写 |
| 重试 | 节点级可重试，指数退避；区分可重试/不可重试错误 |
| 超时 | 节点级 + 流程级超时，超时终止并记录 |
| 并发 | 同一记录串行（避免竞态）；不同记录可并行；全局限流 |
| 版本化 | 规则每次发布生成新版本，run 记录所用版本，可回滚 |
| 可观测 | 每次 run 记录每节点输入/输出/耗时/错误，保留 N 天 |
| 调试 | "试运行"模式：不写回，只展示各节点结果 |
| 回滚 | WriteBack 前记录原值，支持按 run 回滚 |

#### 4.4.6 触发与调度

- 事件触发：数据库变更钩子（NocoBase 模型事件）
- 定时触发：cron（scheduler 进程）
- 手动触发：按钮 / API
- Webhook：外部系统调用
- 队列：Redis / PostgreSQL 队列（如 pg-boss），worker 消费

### 4.5 权限体系（无锁定）

- 角色 × 对象 × 操作 的 RBAC，含字段级权限与数据范围（行级过滤）
- 自托管版全部开放，不做"行级安全"付费解锁
- 多租户下叠加 RLS，双重隔离
- 审计日志默认开启

### 4.6 "无功能锁定"落地策略

1. **许可证**：基座 Apache-2.0；自研插件同样开源（建议 Apache-2.0 / MIT），不引入按次计费。
2. **无配额勒索**：不做"运行次数/记录数/API 次数"的功能性封顶（仅做资源保护性限流，可配置）。
3. **API 全开放**：REST + GraphQL + Webhook 全量可用。
4. **数据可导出**：一键导出 SQL/CSV/JSON，元数据可导出。
5. **可扩展**：节点、函数、字段类型均可通过插件注册。
6. **差异化的商业点**（如需要）只放在"托管、SLA、专家服务、合规认证"，而非锁功能。

---

## 5. 数据模型（系统元数据）

> 完整可执行 DDL 见同目录 [schema.sql](./schema.sql)。

### 5.1 ER 概览

```
tenant 1─* workspace 1─* collection 1─* field
                                      └─* relation
collection 1─* calc_rule 1─* calc_rule_version 1─* calc_step
calc_rule_binding *─1 calc_rule   (绑定到表/触发条件)
calc_run 1─* calc_step_run
calc_dependency (from_field → to_field)
calc_function (自定义函数注册)
audit_log
```

### 5.2 表清单

| 表 | 说明 |
|---|---|
| `sys_tenant` | 租户 |
| `sys_workspace` | 工作空间（多租户隔离单元） |
| `sys_collection` | 数据表定义 |
| `sys_field` | 字段定义（含 formula/lookup/rollup/computed） |
| `sys_relation` | 表间关系 |
| `calc_rule` | 计算规则（逻辑实体，指向最新版本） |
| `calc_rule_version` | 规则版本（发布快照） |
| `calc_step` | 规则内节点（DAG 节点，JSON 配置） |
| `calc_rule_binding` | 规则绑定：表 + 触发类型 + 触发条件 |
| `calc_run` | 一次工作流执行实例 |
| `calc_step_run` | 单节点执行记录（输入/输出/耗时/错误） |
| `calc_dependency` | 字段依赖图（增量重算用） |
| `calc_function` | 自定义函数注册与沙箱配置 |
| `sys_job` | 定时/异步任务 |
| `audit_log` | 审计日志 |

### 5.3 关键字段说明（摘）

**sys_field**（核心）

| 字段 | 说明 |
|---|---|
| `type` | 字段类型，含 `formula`/`lookup`/`rollup`/`computed` |
| `expr` | formula 的表达式 |
| `rule_id` | computed 字段关联的计算规则 |
| `rollup_config` | `{target, filter, field, agg}` |
| `is_stored` | 是否物化存储 |

**calc_step**（节点）

| 字段 | 说明 |
|---|---|
| `type` | `lookup`/`aggregate`/`switch`/`rules`/`calculate`/`write_back`/`notify`/`code` |
| `config` | JSONB，节点配置（目标表、条件、表达式、规则列表等） |
| `next` | 后继节点（支撑分支/DAG） |
| `depends_on` | 前置节点 id 列表 |

**calc_run**（执行实例）

| 字段 | 说明 |
|---|---|
| `idempotency_key` | 幂等键，唯一索引 |
| `rule_version_id` | 使用的规则版本 |
| `trigger_event` | 触发来源 |
| `status` | pending/running/success/failed/skipped |
| `context` | JSONB，运行上下文快照 |
| `error` | 错误信息 |

---

## 6. 关键流程时序（示例）

```
业务方修改"订单表"某记录
        │
        ▼
[模型事件钩子] ──▶ 匹配 calc_rule_binding（表=订单表, 事件=update, 条件命中）
        │
        ▼
[calc_run 创建] 生成幂等键，落库 status=running，锁记录（串行）
        │
        ▼
[Step1 Lookup]  查价目表 → 结果缓存 → calc_step_run 记录
        │
        ▼
[Step2 Rules]   CEL 逐条匹配 → 命中 → math.js 求值 → 结果
        │
        ▼
[Step3 Calculate] total = finalPrice * quantity
        │
        ▼
[Step4 WriteBack] 事务内更新 unit_price / total，记录原值（可回滚）
        │
        ▼
[calc_run] status=success，写 audit_log，更新依赖图脏标记
```

---

## 7. 技术选型清单

| 层 | 选型 | 说明 |
|---|---|---|
| 基座 | NocoBase (Apache-2.0) | Node.js + React + Koa |
| 语言 | TypeScript | 前后端同构 |
| 数据库 | PostgreSQL 16 | 业务数据 + 元数据 + RLS |
| 缓存/队列 | Redis | 缓存、限流、队列（或 pg-boss） |
| 公式引擎 | math.js | 数值/数组/统计 |
| 条件引擎 | CEL (@marcbachmann/cel-js) | 安全条件判断 |
| 对象存储 | MinIO / S3 | 附件 |
| 部署 | Docker Compose / K8s | 自托管 & SaaS |
| 可观测 | OpenTelemetry + 日志 | run/step 级追踪 |

---

## 8. 演进路线

**MVP（可用）**
- 基座部署 + 字段类型（formula / lookup / rollup）
- 计算引擎：math.js + CEL，变量引用系统
- 工作流：Trigger / Lookup / Rules / Calculate / WriteBack
- 单机自托管

**V1（完善）**
- 依赖图 + 增量重算
- 决策表可视化编辑器 + CSV 导入导出
- 版本化 / 回滚 / 试运行
- 多租户（RLS）+ 权限细化

**V2（规模化）**
- schema-per-tenant 混合隔离
- Code 节点沙箱、自定义函数市场
- AI 辅助生成规则（自然语言 → 决策表）
- 可观测与性能优化（对标大队列、海量记录）

---

## 9. 风险与开放问题

| 风险 | 说明 | 缓解 |
|---|---|---|
| 计算性能 | 跨表 + 多条件在大数据量下慢 | 依赖图增量重算、结果缓存、扫描行数上限 |
| 表达式安全 | 用户自定义表达式可能注入 | math.js 禁用危险函数；CEL 非图灵完备 + AST 限制 + 沙箱 |
| 循环依赖 | A→B→A | 依赖图环检测，阻断并告警 |
| 多租户数据泄漏 | RLS 策略遗漏 | 从第一天带 `tenant_id`；自动化跨租户越权测试 |
| 基座许可证边界 | NocoBase 企业版插件边界 | 只用 Apache-2.0 内核与社区插件；核心计算引擎独立开发 |
| 幂等/竞态 | 并发写回 | 记录级串行 + 幂等键唯一索引 |

---

## 10. 参考来源

- [飞书多维表格公式字段概述](https://www.feishu.cn/hc/zh-CN/articles/360049067853)
- [飞书多维表格工作流和自动化触发条件与执行操作一览](https://www.feishu.cn/hc/zh-CN/articles/740947703250)
- [飞书多维表格工作流和自动化流程常见问题（运行次数限制）](https://www.feishu.cn/hc/zh-CN/articles/949255360693)
- [NocoDB Pricing（功能分档）](https://nocodb.com/pricing)
- [NocoDB vs Baserow vs Directus 2026](https://www.pistack.xyz/posts/nocodb-vs-baserow-vs-directus/)
- [Best Self-Hosted Airtable Alternatives in 2026（许可证对比）](https://www.bitdoze.com/self-hosted-airtable-alternatives/)
- [NocoBase FlowEngine 文档](https://docs.nocobase.com/plugin-development/client/flow-engine)
- [NocoBase 工作流开发 API（registerTrigger / registerInstruction）](https://docs.nocobase.com/cn/workflow/development/api)
- [NocoBase Calculation 节点](https://docs.nocobase.com/workflow/nodes/calculation)
- [NocoBase 插件清单（动态计算节点等）](https://www.nocobase.com/en/plugins)
- [math.js 官方文档（表达式安全）](https://mathjs.org/)
- [HyperFormula 文档（许可与 API）](https://hyperformula.handsontable.com/docs/)
- [CEL 通用表达式语言](https://cel.dev/)
- [@marcbachmann/cel-js](https://www.npmjs.com/package/@marcbachmann/cel-js)
- [Multi-Tenant PostgreSQL: RLS vs Schema-per-Tenant](https://dev.to/usman_khan_io/multi-tenant-database-isolation-schema-per-tenant-vs-row-level-security-in-postgres-2f6j)
- [SaaS Multi-Tenancy: Database, Schema, or RLS?](https://blog.codercops.com/blog/multi-tenancy-saas-architecture-patterns-2026)
