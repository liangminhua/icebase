# 无功能锁定的多维表格 + 自定义计算工作流系统 设计方案

> 版本：v0.2（去除自研多租户；纳入商业版功能无锁化）
> 定位：以 NocoBase 为开源基座二次开发，自托管为主，核心计算能力与商业版功能全部开放、不设付费墙
> 关键诉求：从一张表取部分字段 → 跨表查询 → 按不同条件计算出结果

---

## 0. v0.2 变更说明

| 变更 | 说明 |
|---|---|
| ❌ 移除自研多租户 | 去掉 `tenant_id`、RLS、schema-per-tenant、database-per-tenant 设计 |
| ✅ 改用基座隔离模型 | 用 **应用 / 空间 / 工作区** 三层模型承担隔离与差异化入口 |
| ✅ 纳入商业版功能 | 把 NocoBase 标准版 / 专业版 / 企业版的付费功能全部列入实现范围 |
| ✅ 澄清概念 | "工作区"≠"多租户"；真正承担数据隔离的是"多空间"与"多应用" |

> **重要澄清（对应"workspace 就是多租户替代"的假设）**
> NocoBase 中三个概念容易混淆，本系统按下表使用：
>
> | 概念 | NocoBase 名称 | 作用 | 是否隔离数据 | 商业版档位 |
> |---|---|---|---|---|
> | **应用 App** | 多应用 / 应用监管器 | 物理隔离的多实例（独立库/schema/进程） | ✅ 物理隔离 | 企业版 |
> | **空间 Space** | 多空间 Multi-Space | 单应用内逻辑隔离（同库，靠"空间字段"自动过滤） | ✅ 逻辑隔离 | 企业版 |
> | **工作区 Workspace/Portal** | 多工作区 Multi-Portal | 同一应用内多个访问入口（页面/菜单/布局/权限） | ❌ 不隔离数据 | 专业版 |
>
> 结论：**"工作区"只解决"不同角色看到不同界面"，不解决"数据互不可见"。** 真正替代多租户的是 **多空间**（多门店/多工厂/多组织）与 **多应用**（独立客户/独立环境）。本方案不再自研多租户，而是实现"多空间 + 多应用"，同时提供"多工作区"做界面差异化。

---

## 1. 背景与目标

### 1.1 为什么要"无功能锁定"

现有主流产品在"计算/自动化/治理"这条链路上普遍存在功能锁定（feature gating）：

| 产品 | 锁定点 | 典型限制 |
|---|---|---|
| 飞书多维表格 | 工作流/自动化运行次数 | 免费版 200 次/月，付费版 5,000~50万次/月；单表公式+查找引用字段超过 100 个即不可用 |
| NocoDB | 外部数据库连接、SSM/SCIM、行列级权限、审计日志 | 外部库连接只在 Business+；行级安全/审计在 Scale+；许可证已从 AGPL 改为 Sustainable Use License |
| Airtable | 记录数 / 席位 | 免费 1,000 行/基础表，Pro 50,000 行，Business $45/人/月，云-only 不可自托管 |
| Teable / Baserow | 企业功能 | CE 可自托管，但 SSO、审计、高级权限等在付费版 |
| **NocoBase** | 商业版功能 | 外部数据源/Pro 导入导出（标准版）、SSO/审批/子流程/版本控制/记录历史/模板打印/AI 知识库（专业版）、多应用/多空间/审计/集群/遥测（企业版） |

**结论**：本系统的设计原则是——**计算引擎、工作流引擎、API、权限、导入导出、以及 NocoBase 商业版才有的能力（SSO、审批、子流程、版本控制、记录历史、多空间、多应用、审计、遥测、AI 知识库……）全部自行实现并开源开放，不设按次/按席位/按行数/按版本的功能锁**。

### 1.2 目标

1. **无功能锁定**：基座内核 + 全部"商业版功能"在自托管版可用，无 License 校验、无功能开关。
2. **自定义计算工作流**：可视化配置"取数 → 跨表查询 → 条件判断 → 计算 → 回写"，支持决策表（多条件分支）。
3. **三层隔离与入口**：应用（物理隔离）/ 空间（逻辑隔离）/ 工作区（界面入口）。
4. **可扩展**：一切皆插件，业务方可用代码扩展节点类型、函数、字段类型、数据源、认证方式。
5. **可迁移**：数据存标准 PostgreSQL，随时可导出，无私有格式锁定。

### 1.3 非目标（本期不做）

- 不做完整 BI/报表大屏（只做基础图表与仪表盘）
- 不做移动端原生 App（先做响应式 Web / PWA）
- 不做 AI 自动生成应用（预留给后续版本）
- 不做多租户计费/订阅系统（如未来需要 SaaS 计费，在"多应用"之上单独做）

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
| 隔离模型 | **应用 / 空间 / 工作区** | 工作空间 | 工作空间 | 工作空间 | 无 | 工作空间 |
| 自托管 | 是 | 是 | 是 | 是 | 是 | 是 |

### 2.2 选型结论

**基座选择 NocoBase**，理由：

1. **Apache-2.0**：最宽松，可自由二次开发与商用，天然"无功能锁定"。
2. **插件微内核**：核心只负责生命周期、插件管理、服务注册；工作流、权限、字段类型都是插件 —— 我们的"计算引擎插件"可像官方插件一样接入，无需 fork 内核。
3. **工作流引擎提供官方扩展点**：`registerTrigger(type, Trigger)`、`registerInstruction(type, Instruction)`，正好承载"自定义计算节点"。
4. **数据模型驱动**：Collection / Field / Relation 本身即元数据，跨表查询有天然基础。
5. **社区版已含工作流与"动态计算节点"**（按记录不同条件调用不同表达式），与本项目核心诉求高度重合。
6. **商业版功能边界清晰、可对标实现**：我们照单实现，达成"社区版即全功能"。

> 备选：若团队更偏 Python 生态，可用 **Baserow（MIT core）** 或 **Grist（Apache-2.0）** 作基座，但工作流扩展性弱，需自建更多模块。

---

## 3. 总体架构

### 3.1 分层架构

```
┌──────────────────────────────────────────────────────────────────────┐
│  接入层  Web SPA (React) / 移动端工作区 / OpenAPI / GraphQL / Webhook / CLI │
├──────────────────────────────────────────────────────────────────────┤
│  应用层  NocoBase 基座：页面/区块、权限 ACL、数据源管理、插件管理       │
│          ┌────────────────────────┐  ┌───────────────────────────┐   │
│          │  计算引擎插件 (自研)    │  │  工作流引擎 (基座 + 扩展)  │   │
│          │  · 表达式引擎           │  │  · Trigger 注册           │   │
│          │  · 变量/引用系统         │  │  · Instruction 节点        │   │
│          │  · 函数库               │  │  · DAG 执行器              │   │
│          │  · 依赖图 / 增量重算     │  │  · 调度 / 重试 / 幂等      │   │
│          └────────────────────────┘  └───────────────────────────┘   │
│          ┌───────────────────────────────────────────────────────┐   │
│          │  商业版能力插件集 (自研开源)：SSO · 审批 · 子流程 ·      │   │
│          │  版本控制 · 记录历史 · 多空间 · 多应用 · 审计 · 遥测 ·   │   │
│          │  外部数据源 · 模板打印 · 公开表单 · AI 知识库 · 白标     │   │
│          └───────────────────────────────────────────────────────┘   │
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

### 3.3 隔离与入口模型（替代多租户）

```
应用 App（物理隔离：独立数据库 / 独立 schema / 独立进程）
 ├── 空间 Space A（逻辑隔离：空间字段自动过滤）—— 门店/工厂/组织
 │    ├── 数据表集合
 │    └── 计算规则
 ├── 空间 Space B
 └── 工作区 Portal（界面入口，不隔离数据）
      ├── 总部工作区（/v/admin）
      ├── 门店工作区
      └── 移动端工作区（/v/mobile）
```

三种层级的职责与实现：

| 层级 | 数据隔离 | 配置隔离 | 实现要点 |
|---|---|---|---|
| 应用 App | 物理（独立库/schema） | 全部（插件、页面、用户） | 应用监管器：创建/启动/停止/访问路由 `/apps/:appName` |
| 空间 Space | 逻辑（同一库，按空间字段过滤） | 数据与规则 | 集合预置"空间字段"；查询/写入自动注入空间条件 |
| 工作区 Portal | 无 | 页面/菜单/布局/权限 | 每个工作区独立菜单树与路由，按角色授权访问 |

### 3.4 部署形态

| 形态 | 说明 | 适用 |
|---|---|---|
| **单应用自托管** | Docker Compose：base + postgres + redis + worker + scheduler | 单团队、数据不出域（默认推荐） |
| **应用内多空间** | 单应用启用多空间，服务多门店/多工厂 | 多组织共用一套系统，数据逻辑隔离 |
| **多应用** | 应用监管器管理多个应用实例（可独立库/schema/域名） | 多客户 / 多环境 / 多租户用法 |
| **集群部署** | 多实例 + 负载均衡 + Redis + 共享存储 + 分布式锁 | 大并发、高可用 |

> 不再自研 RLS / schema-per-tenant。隔离由基座的"多空间 / 多应用"承担，且这两项被我们纳入开源实现，因此不构成功能锁。

---

## 4. 核心模块设计

### 4.1 数据模型层

采用 NocoBase 的模型驱动理念：

- **Collection（集合/表）**：`name`、`title`、`fields[]`、`options`、`hasSpace`（是否启用空间字段）
- **Field（字段）**：类型系统可扩展，内置类型见 4.2
- **Relation（关系）**：`belongsTo` / `hasMany` / `belongsToMany`，决定跨表查询路径

元数据（表/字段/关系/规则/空间/工作区）本身也存 PostgreSQL，做到"配置即数据"，可导出、可版本化。

### 4.2 字段类型体系

```
基础类型   text / longText / number / decimal / boolean / date / datetime
         / email / url / phone / select / multiSelect / attachment / json
系统类型   auto_number / created_at / updated_at / created_by / space(空间字段)
关系类型   belongsTo / hasMany / belongsToMany
计算类型   formula      —— 本表基于表达式实时计算
         lookup       —— 沿关系引用他表字段
         rollup       —— 沿关系对他表记录做聚合（sum/avg/count/min/max）
         computed     —— 由"计算规则"物化写入（支持跨表 + 条件分支）
```

| 字段类型 | 计算范围 | 是否存储 | 适用 |
|---|---|---|---|
| formula | 本记录（可整列引用） | 不存储，读时算 | 简单派生列 |
| lookup / rollup | 关联表 | 不存储或缓存 | 关系型取数 |
| computed | 任意表 + 条件分支 | **物化存储** | 跨表 + 多条件复杂计算 |

### 4.3 计算引擎

#### 4.3.1 表达式引擎选型

采用 **双引擎 + 统一语义层**：

| 门类 | 库 | 用途 | 许可证 |
|---|---|---|---|
| 数值/公式/数组 | **math.js** | 数学、统计、数组、符号运算；公式字段引擎 | Apache-2.0 |
| 条件/布尔/规则 | **CEL（@marcbachmann/cel-js）** | 安全、非图灵完备的条件表达式，适合决策表 | Apache-2.0 |
| （可选）Excel 兼容公式 | HyperFormula | 如需 Excel 函数兼容层 | GPLv3 或商业 |

> **安全要点**：math.js 官方明确建议禁用 `import / createUnit / reviver / evaluate / parse / simplify / derivative / resolve` 等危险函数，避免表达式注入。CEL 本身为"非图灵完备、可安全执行用户代码"的语言，天然适合用户自定义条件，支持类型检查、AST 限制（`maxAstNodes`、`maxDepth`）与自定义函数注册。
> 计算超时、最大迭代/递归深度、最大跨表扫描行数由引擎统一限制。

#### 4.3.2 变量与引用系统

| 语法 | 含义 | 示例 |
|---|---|---|
| `record.<field>` | 当前记录字段 | `record.amount` |
| `lookup('<表>', {<匹配>}).<字段>` | 跨表查一条 | `lookup('价目表', {product_id: record.product_id}).price` |
| `rollup('<表>', {<匹配>}, '<字段>', '<聚合>')` | 跨表聚合 | `rollup('订单明细', {order_id: record.id}, 'amount', 'sum')` |
| `steps.<nodeId>.result` | 上游节点结果 | `steps.findPrice.result` |
| `vars.<name>` | 流程局部变量/循环变量 | `vars.total` |
| `space.<field>` | 当前空间上下文 | `space.id` |

**跨表查询执行语义**：解析关系路径（优先 Relation，否则 `where` 匹配）→ 注入空间隔离条件 + 行级权限过滤 → 命中结果集取一条/聚合 → 同一次 run 内结果去重缓存（避免 N+1）。

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

```
Trigger ──▶ Lookup(取数) ──▶ Rules/Switch(条件分支) ──▶ Calculate(计算) ──▶ WriteBack(回写)
                │                   │                        │
                └──▶ Aggregate ─────┘                        └──▶ Notify(通知)
```

#### 4.4.2 节点类型

| 节点 | 作用 | 关键配置 | 档位来源 |
|---|---|---|---|
| **Trigger** | 启动流程 | 记录新增/修改/满足条件、定时、按钮、Webhook | 社区 |
| **Lookup** | 从其他表查询 | 目标表、匹配条件、返回字段、取一条/多条 | 社区 |
| **Aggregate** | 跨表聚合 | 目标表、过滤、字段、聚合函数 | 社区 |
| **Condition / Switch** | 条件分支 | CEL 表达式，多分支 | 社区 |
| **Rules（决策表）** | **多条件 → 多结果** | 有序规则 `when → then`，命中即停或全部 | 社区 |
| **Calculate** | 表达式计算 | 计算引擎 + 表达式 | 社区 |
| **WriteBack** | 写回 | 目标表/字段、赋值表达式、创建/更新/upsert | 社区 |
| **Loop** | 遍历集合 | 来源集、局部变量、最大迭代 | 社区 |
| **Notify** | 通知 | 站内/邮件/Webhook/IM | 社区 |
| **Code** | 逃生舱 | 沙箱脚本（JS/Python） | 社区 |
| **Approval** | 人工审批 | 审批人、会签/或签、办理意见 | 专业版 → **自研开放** |
| **Subflow** | 调用子流程 | 子流程 id、入参映射 | 专业版 → **自研开放** |
| **Webhook** | 出站回调 | URL、方法、鉴权、重试 | 专业版 → **自研开放** |
| **CC** | 抄送 | 抄送人、模板 | 专业版 → **自研开放** |

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

执行语义：自上而下匹配，命中第一条即返回（`first-match`），或配置为全部命中后按优先级合并；`when` 用 CEL 求布尔，`then` / `else` 用计算引擎求值；规则表可导出/导入 CSV。

#### 4.4.4 端到端示例

```
Trigger: 订单表 · 修改记录时（关注字段：product_id, quantity, customer_level）
   ├─ Lookup:  from 价目表 where product_id = record.product_id → steps.price
   ├─ Rules:   多条件决策 → steps.finalPrice
   ├─ Calculate: total = steps.finalPrice * record.quantity → steps.total
   ├─ WriteBack: 更新订单表 unit_price / total
   └─ Notify:   金额超阈值时抄送主管（CC 节点）
```

#### 4.4.5 执行语义

| 维度 | 设计 |
|---|---|
| 幂等 | 每次 run 带幂等键（表+记录+规则版本+触发事件 id），重复触发不重复写 |
| 重试 | 节点级可重试，指数退避；区分可重试/不可重试错误 |
| 超时 | 节点级 + 流程级超时 |
| 并发 | 同一记录串行（避免竞态）；不同记录可并行；全局限流 |
| 版本化 | 规则发布生成新版本，run 记录所用版本，可回滚 |
| 可观测 | 每次 run 记录每节点输入/输出/耗时/错误，保留 N 天 |
| 调试 | "试运行"模式：不写回，只展示各节点结果 |
| 回滚 | WriteBack 前记录原值（`calc_write_snapshot`），支持按 run 回滚 |
| 人工介入 | Approval 节点停等（`JOB_STATUS.PENDING`），`resume()` 恢复 |

#### 4.4.6 触发与调度

事件触发（模型事件钩子）/ 定时触发（cron）/ 手动触发（按钮、API）/ Webhook；队列用 Redis 或 PostgreSQL 队列（如 pg-boss），worker 消费。

### 4.5 权限体系（无锁定）

- **角色 × 对象 × 操作** 的 RBAC，含字段级权限与数据范围（行级过滤）
- **空间隔离**：查询/写入自动注入空间条件
- **工作区权限**：角色控制可访问哪些工作区
- **AI 员工权限**：独立授权
- 自托管版全部开放，不做"字段级权限/行级安全/审计"的付费解锁
- 审计日志默认开启（详见 4.6）

### 4.6 商业版功能无锁化实现清单（本版重点）

把 NocoBase 各商业档位的功能全部自行实现并开源。下表为**实现清单与优先级**：

#### 标准版（Standard）→ 全部纳入 P0/P1

| 功能 | 实现方式 | 优先级 |
|---|---|---|
| 白标 / 自定义品牌 | 主题与品牌配置（logo、名称、登录页、邮件模板），去第三方标识 | P1 |
| 外部数据源 MySQL / PostgreSQL / MariaDB | 数据源插件 + FDW / 直连适配器，元数据映射为 Collection | P0 |
| 大数据量 Excel 导入导出（Pro） | 异步任务 + 流式读写 + 附件导出 + 识别数据处理/更新/工作流触发 | P1 |

#### 专业版（Professional）→ 全部纳入 P1/P2

| 功能 | 实现方式 | 优先级 |
|---|---|---|
| SSO（OIDC / SAML / LDAP / CAS） | 认证插件，统一 `authProvider` 抽象 | P1 |
| 钉钉 / 企业微信集成 | 认证 + 通知渠道 + 用户同步 | P2 |
| 高级工作流：审批 / 子流程 / Webhook / 抄送 | 新增 `calc_step.type`：approval / subflow / webhook / cc | P0 |
| 版本控制（人机协作开发） | 配置与规则版本化 + diff + 发布/回滚（复用 `calc_rule_version` 思路扩展到全配置） | P1 |
| 记录编辑历史 | `sys_record_history` 全量变更留痕 + 记录详情页展示 | P1 |
| 多环境（开发/测试/生产） | `环境` 维度 + 配置迁移与发布管理（`sys_release` / `sys_release_item`） | P2 |
| 模板打印 | `sys_print_template` + 变量渲染 + PDF/浏览器打印 | P2 |
| 公开表单 | `sys_public_form` + 匿名提交 + 限流/验证码 | P2 |
| AI 知识库（RAG） | 向量库（pgvector）+ 文档切片 + 检索；供 AI 员工使用 | P2 |
| AI 员工高阶能力 | AI 员工插件 + 工具调用 + MCP | P2 |
| 多工作区 | `sys_portal` / `sys_portal_menu`，独立菜单树、布局、路由、权限 | P1 |

#### 企业版（Enterprise）→ 全部纳入 P1/P2

| 功能 | 实现方式 | 优先级 |
|---|---|---|
| 多应用（物理隔离） | 应用监管器：创建/启动/停止、独立库/schema、路由 `/apps/:name`、独立 JWT 密钥 | **P0** |
| 多空间（逻辑隔离） | `sys_space` + 集合"空间字段" + 查询/写入自动过滤 | **P0** |
| 审计日志 | `sys_audit_log`：谁、何时、对什么、做了什么、前后值、IP | P1 |
| 外部数据源 Oracle / ClickHouse / Doris / NocoBase | 数据源适配器扩展 | P2 |
| 集群架构 | 多实例 + 负载均衡 + Redis 缓存/消息 + 共享存储 + 分布式锁 | P2 |
| 遥测（日志/指标/链路） | OpenTelemetry：trace/metric/log，run/step 级追踪 | P1 |
| Gmail/Outlook 邮箱集成、手写签名审批 | IMAP/SMTP + OAuth；签名组件 | P2 |
| 信创支持（KingBaseES / OceanBase 等） | 数据源适配器扩展 | P2 |

> **实现策略**：全部以 NocoBase 插件形式开发（`registerTrigger` / `registerInstruction` / 认证插件 / 数据源适配器 / 页面区块），与基座解耦；不 fork 内核，确保可随基座升级。

### 4.7 "无功能锁定"落地策略

1. **许可证**：基座 Apache-2.0；自研插件同样开源（建议 Apache-2.0 / MIT），不引入按次计费。
2. **无配额勒索**：不做"运行次数/记录数/API 次数"的功能性封顶（仅做资源保护性限流，可配置）。
3. **API 全开放**：REST + GraphQL + Webhook 全量可用。
4. **数据可导出**：一键导出 SQL/CSV/JSON，元数据可导出。
5. **可扩展**：节点、函数、字段类型、数据源、认证方式均可通过插件注册。
6. **商业点后移**：如确有营收需要，只放在"托管、SLA、专家服务、合规认证"，而非锁功能。

---

## 5. 数据模型（系统元数据）

> 完整可执行 DDL 见同目录 [schema.sql](./schema.sql)。已移除 `tenant_id` / RLS，改用 `app_id` / `space_id`。

### 5.1 ER 概览

```
app 1─* space
app 1─* portal 1─* portal_menu
app 1─* collection 1─* field
                    └─* relation
collection 1─* calc_rule 1─* calc_rule_version 1─* calc_step
calc_rule_binding *─1 calc_rule
calc_run 1─* calc_step_run
calc_dependency / calc_dirty_record
sys_external_datasource / sys_auth_provider / sys_audit_log
sys_record_history / sys_release / sys_print_template / sys_public_form
ai_knowledge_base / sys_telemetry_config / sys_branding
```

### 5.2 表清单

| 分类 | 表 | 说明 |
|---|---|---|
| 隔离与入口 | `sys_app` | 应用（物理隔离单元） |
| | `sys_space` | 空间（逻辑隔离单元） |
| | `sys_portal` | 工作区（界面入口） |
| | `sys_portal_menu` | 工作区菜单 |
| | `sys_user_space` | 用户-空间关联 |
| 数据模型 | `sys_collection` | 数据表定义（含 `has_space`） |
| | `sys_field` | 字段定义（含 formula/lookup/rollup/computed） |
| | `sys_relation` | 表间关系 |
| 计算工作流 | `calc_rule` / `calc_rule_version` / `calc_step` / `calc_rule_binding` | 规则、版本、节点、绑定 |
| | `calc_run` / `calc_step_run` / `calc_write_snapshot` | 执行实例、节点记录、回滚快照 |
| | `calc_dependency` / `calc_dirty_record` | 依赖图、脏标记 |
| | `calc_function` | 自定义函数注册 |
| 商业版能力 | `sys_external_datasource` | 外部数据源（MySQL/PG/MariaDB/MSSQL/Oracle/ClickHouse/Doris/REST） |
| | `sys_auth_provider` | 认证方式（OIDC/SAML/LDAP/CAS/SMS/钉钉/企业微信/API Key） |
| | `sys_audit_log` | 审计日志 |
| | `sys_record_history` | 记录编辑历史 |
| | `sys_release` / `sys_release_item` | 多环境迁移与发布 |
| | `sys_print_template` | 模板打印 |
| | `sys_public_form` | 公开表单 |
| | `ai_knowledge_base` / `ai_knowledge_doc` | AI 知识库（RAG） |
| | `sys_branding` | 白标配置 |
| | `sys_telemetry_config` | 遥测配置 |
| | `sys_import_export_job` | 异步导入导出 |
| 通用 | `sys_job` | 定时/异步任务 |
| | `sys_backup` | 备份记录（社区版已有） |

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
        ├─[Step1 Lookup]   查价目表 → 缓存 → calc_step_run 记录
        ├─[Step2 Rules]    CEL 逐条匹配 → 命中 → math.js 求值
        ├─[Step3 Calculate] total = finalPrice * quantity
        ├─[Step4 WriteBack]事务内更新 unit_price / total，写 calc_write_snapshot
        └─[Step5 Approval]（可选）停等审批 → resume() 后继续
        │
        ▼
[calc_run] status=success，写 sys_audit_log 与 sys_record_history，更新依赖脏标记
```

---

## 7. 技术选型清单

| 层 | 选型 | 说明 |
|---|---|---|
| 基座 | NocoBase (Apache-2.0) | Node.js + React + Koa |
| 语言 | TypeScript | 前后端同构 |
| 数据库 | PostgreSQL 16 | 业务数据 + 元数据 |
| 缓存/队列 | Redis | 缓存、限流、队列（或 pg-boss） |
| 公式引擎 | math.js | 数值/数组/统计 |
| 条件引擎 | CEL (@marcbachmann/cel-js) | 安全条件判断 |
| 向量检索 | pgvector | AI 知识库 RAG |
| 对象存储 | MinIO / S3 | 附件 |
| 可观测 | OpenTelemetry | trace/metric/log |
| 部署 | Docker Compose / K8s | 单机 / 集群 |

---

## 8. 演进路线

**MVP（可用）**
- 基座部署 + 字段类型（formula / lookup / rollup）
- 计算引擎：math.js + CEL，变量引用系统
- 工作流：Trigger / Lookup / Rules / Calculate / WriteBack
- **多空间**（逻辑隔离）+ **多应用**（物理隔离）
- 单机自托管

**V1（完善）**
- 依赖图 + 增量重算；决策表可视化编辑器 + CSV 导入导出
- 版本化 / 回滚 / 试运行
- 高级工作流：审批 / 子流程 / Webhook / 抄送
- 权限细化：字段级 + 数据范围；多工作区；审计日志；记录编辑历史
- 快速见效能力：外部数据源（MySQL/PG/MariaDB）、异步导入导出、白标

**V2（规模化与全功能）**
- 集群部署 + 遥测（OTel）
- SSO（OIDC/SAML/LDAP/CAS）、钉钉/企业微信
- 多环境（开发/测试/生产）迁移与发布管理
- 模板打印、公开表单、AI 知识库、AI 员工高阶能力
- 更多外部数据源（Oracle/ClickHouse/Doris/信创库）

---

## 9. 风险与开放问题

| 风险 | 说明 | 缓解 |
|---|---|---|
| 计算性能 | 跨表 + 多条件在大数据量下慢 | 依赖图增量重算、结果缓存、扫描行数上限 |
| 表达式安全 | 用户自定义表达式可能注入 | math.js 禁用危险函数；CEL 非图灵完备 + AST 限制 + 沙箱 |
| 循环依赖 | A→B→A | 依赖图环检测，阻断并告警 |
| **商业版功能工作量大** | 自研 SSO/审批/多应用/审计等成本高 | 按 P0→P2 分批；优先复用基座插件机制与开源库；P0 先出多空间+多应用+高级工作流 |
| 多应用资源占用 | 共享内存模式下单应用异常影响其他应用 | 生产用多环境模式，独立进程/库；按需扩容 |
| 空间过滤遗漏 | 未带空间字段的表不参与隔离 | 集合创建默认预置空间字段；跨空间越权自动化测试 |
| 基座升级兼容 | 自研插件随基座演进 | 只用公开扩展点，不 fork 内核 |
| 幂等/竞态 | 并发写回 | 记录级串行 + 幂等键唯一索引 |

---

## 10. 参考来源

- [NocoBase 定价与版本对比](https://www.nocobase.com/cn/commercial)
- [NocoBase 插件中心（各插件版本标识）](https://docs.nocobase.com/cn/plugins/)
- [NocoBase 多应用管理](https://docs.nocobase.com/cn/multi-app/multi-app/)
- [NocoBase 多空间](https://docs.nocobase.com/cn/multi-app/multi-space/)
- [NocoBase 多工作区](https://docs.nocobase.com/cn/multi-app/multi-portal/)
- [NocoBase 共享内存多应用模式](https://docs.nocobase.com/multi-app/multi-app/local)
- [NocoBase 工作流开发 API（registerTrigger / registerInstruction）](https://docs.nocobase.com/cn/workflow/development/api)
- [NocoBase Calculation 节点](https://docs.nocobase.com/workflow/nodes/calculation)
- [NocoBase FlowEngine 文档](https://docs.nocobase.com/plugin-development/client/flow-engine)
- [飞书多维表格公式字段概述](https://www.feishu.cn/hc/zh-CN/articles/360049067853)
- [飞书多维表格工作流和自动化触发条件与执行操作一览](https://www.feishu.cn/hc/zh-CN/articles/740947703250)
- [NocoDB Pricing](https://nocodb.com/pricing)
- [math.js](https://mathjs.org/)
- [CEL 通用表达式语言](https://cel.dev/)
- [@marcbachmann/cel-js](https://www.npmjs.com/package/@marcbachmann/cel-js)
