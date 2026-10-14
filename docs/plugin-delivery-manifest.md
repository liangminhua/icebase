# IceBase 插件交付清单

> 基座：NocoBase v2.2.22（`nocobase/`，子模块 gitlink `a4eac04`）
> 交付范围：6 组 9 个插件，均位于 `d:\icebase\packages\plugins\@nocobase\`
> 结论：**9 个插件全部实现并通过服务端测试，13 个测试文件 / 75 个用例全绿**

---

## 1. 交付摘要

| 批次 | 插件 | 包名 | 测试文件 | 用例 | 结果 |
|---|---|---|---|---|---|
| A | field-lookup | `@nocobase/plugin-field-lookup` | 1 | 18 | ✅ 通过 |
| A | workflow-rules | `@nocobase/plugin-workflow-rules` | 1 | 9 | ✅ 通过 |
| B | multi-space | `@nocobase/plugin-multi-space` | 1 | 6 | ✅ 通过 |
| C | print-template | `@nocobase/plugin-print-template` | 1 | 12 | ✅ 通过 |
| C | auth-saml | `@nocobase/plugin-auth-saml` | 1 | 4 | ✅ 通过 |
| C | auth-ldap | `@nocobase/plugin-auth-ldap` | 1 | 4 | ✅ 通过 |
| C | auth-cas | `@nocobase/plugin-auth-cas` | 1 | 4 | ✅ 通过 |
| C | dingtalk | `@nocobase/plugin-dingtalk` | 3 | 10 | ✅ 通过 |
| C | wecom | `@nocobase/plugin-wecom` | 3 | 8 | ✅ 通过 |
| | **合计** | | **13** | **75** | **9/9** |

规模：源码 234 个文件；每个插件统一包含 `src/server`、`src/client`、`src/client-v2`、`src/locale` 五层结构（i18n 支持 en-US / zh-CN）。

---

## 2. 验证环境与方法

| 项 | 值 |
|---|---|
| 运行位置 | icebase 仓库（`yarn verify`，脚本 `scripts/verify-plugins.mjs`） |
| 测试框架 | vitest，**串行单线程**（`--poolOptions.threads.singleThread=true`） |
| 环境变量 | `TEST_ENV=server-side`、`NODE_ENV=test`、`LOGGER_LEVEL=error` |
| 数据库 | SQLite（服务端测试 `sqlite3` 依赖） |
| 最近一次结果 | 9/9 通过，退出码 0，耗时约 3 分 50 秒 |

复现命令：

```bash
yarn verify                        # 全部 9 个插件
node scripts/verify-plugins.mjs field-lookup wecom   # 只验证指定插件
```

说明：插件源码唯一副本位于 icebase；基座 `nocobase/` 在运行时建立目录联接（junction）以便其 vitest / tsconfig 路径发现机制加载插件，运行结束后自动回收，基座工作区始终零改动。

---

## 3. 插件详情

### 3.1 `@nocobase/plugin-field-lookup`（批次 A）

**定位**：[plugin-field-lookup](file:///d:/icebase/packages/plugins/@nocobase/plugin-field-lookup)

**功能说明**：新增两类计算字段。**Lookup 字段**读取关联集合中的某个字段值；**Rollup 字段**对关联记录做聚合（`sum` / `avg` / `count` / `min` / `max`）。二者均在**读取时计算**，不落库、不物化存储，因此无需后台任务重算。

**服务端实现要点**：通过 `db.registerFieldTypes()` 注册 `lookup` / `rollup` 字段类型；查询输出阶段按 `target` / `foreignKey` 解析关联并对整批记录做映射（避免 N+1）；支持 `belongsTo` / `hasOne` / `hasMany` / `belongsToMany` 四种关系；可附加过滤条件；关系配置非法时静默忽略而不中断 `find`。

**客户端**：提供字段类型接口定义（`src/client/interfaces/lookup.ts`、`rollup.ts`）与字段选择组件（`FieldSelects.tsx`）。

**验证用例（18）**：
- 通过 belongsTo 关系读取目标字段值；外键为空/悬空、目标记录不存在时返回 null
- 批量记录（不同外键）映射正确；附加 filter 生效；显式 fields 未包含该字段时跳过填充
- 支持 hasOne 关系；非法关系配置不破坏 find
- Rollup：hasMany 上的 `sum` 聚合；`count`/`avg`/`min`/`max` 四种聚合（`it.each` 展开为 4 例）
- Rollup：空集合返回 SQL 语义结果（`count`→0，其余→null）；对空子集 `sum` 返回 null
- Rollup：附加 filter 生效；支持 belongsToMany 关系；非法关系配置不破坏 find

---

### 3.2 `@nocobase/plugin-workflow-rules`（批次 A）

**定位**：[plugin-workflow-rules](file:///d:/icebase/packages/plugins/@nocobase/plugin-workflow-rules)

**功能说明**：为工作流新增**决策表（Rules）节点**：按顺序逐条求值 `when → then` 规则表。默认 `first-match`（命中即返回）；`all-match` 返回全部命中结果，若全为普通对象则按优先顺序合并为一个对象；未命中时走 `else` 分支（未配置则为 `null`）。

**服务端实现要点**：`registerInstruction('rules')` 注册指令并继承 `Instruction`；表达式经 mathjs 引擎求值（`@nocobase/evaluators`）；变量替换同时支持工作流官方约定 `{{$context.*}}` 与 `{{$jobsMapByNodeKey.*}}`；字符串相等比较使用 mathjs 的 `equalText()`（mathjs 的 `==` 不支持字符串）；求值异常返回 `JOB_STATUS.ERROR`（本版本为 `-2`）并将错误信息置于 `result`。

**客户端**：决策表可视化编辑器（`Rules.tsx`、`RulesEditor.tsx`）。

**验证用例（9）**：
- 返回首个命中规则结果；按顺序贯穿直到命中；跳过条件为空的规则
- 无规则命中时求值 `else` 表达式；无 else 配置时返回 `null`
- `all-match` 返回全部命中结果数组；结果均为普通对象时合并
- 表达式非法时返回错误状态
- 使用来自上游查询节点的变量（`{{$jobsMapByNodeKey.*}}`）

---

### 3.3 `@nocobase/plugin-multi-space`（批次 B）

**定位**：[plugin-multi-space](file:///d:/icebase/packages/plugins/@nocobase/plugin-multi-space)

**功能说明**：**多空间逻辑数据隔离**。可按集合开启空间隔离；开启后，记录的读写以请求头 `X-Space` 划分作用域——创建自动关联当前空间，查询/更新/删除自动按空间过滤。

**服务端实现要点**：新增 `spaces` 集合（经 `db.import({ directory })` 加载）；集合级 `usingSpace` 开关同时写入元数据（跨重启保留）与内存 `options`（即时生效）；全局中间件注入 `spaceId` 过滤条件并在写入时自动打标；校验 `X-Space` 头合法性。

**客户端**：空间管理界面（`SpacesManager.tsx`）、集合隔离开关（`CollectionsToggle.tsx`）、请求拦截器（`space-interceptor.ts`）。

**验证用例（6）**：
- 携带 `X-Space` 头创建时写入 `spaceId`
- 列表按 `X-Space` 头过滤
- 跨空间的更新与删除被过滤（他空间不可改、不可删）
- 非法 `X-Space` 头被拒绝
- 集合空间隔离开关可开可关
- 集合列表正确反映 `usingSpace` 标记

---

### 3.4 `@nocobase/plugin-print-template`（批次 C）

**定位**：[plugin-print-template](file:///d:/icebase/packages/plugins/@nocobase/plugin-print-template)

**功能说明**：管理 HTML **打印模板**，用占位符渲染集合记录并通过浏览器打印。

**服务端实现要点**：新增 `printTemplates` 集合与 `render` Action；占位符支持含嵌套路径；渲染时对值做 HTML 特殊字符转义（防注入）；缺失路径渲染为空字符串；无记录时模板保持不变；支持文件名占位符（回退为标题+日期）；模板或记录不存在返回 404，参数缺失返回 400。

**客户端**：打印动作按钮（`PrintAction.tsx`）与模板设置界面（`PrintTemplateSettings.tsx`）。

**验证用例（12）**：
- 渲染占位符（含嵌套路径）；缺失路径渲染为空串；HTML 特殊字符被转义
- 按占位符渲染文件名；支持以 `filterByTk` 作为模板 id；渲染关联记录字段
- 模板或记录不存在返回 404；参数缺失返回 400
- 单元级：简单与嵌套路径替换为转义值；未知路径为空串；无记录时模板不变；文件名回退到 title+日期

---

### 3.5 `@nocobase/plugin-auth-saml`（批次 C）

**定位**：[plugin-auth-saml](file:///d:/icebase/packages/plugins/@nocobase/plugin-auth-saml)

**功能说明**：**SAML 2.0 单点登录**认证。

**服务端实现要点**：经 `authManager.registerTypes()` 注册认证类型并继承 `BaseAuth`；依赖 `@node-saml/node-saml`；从 IdP 元数据解析 authorize url；回调阶段创建新用户或按 email 关联既有用户；响应非法时回退到登录页。资源动作注册顺序为「先 `registerActionHandler`、后 `resourceManager.define`」（Resourcer 的资源构造只在当时摄入已注册的全局 handler，顺序颠倒会导致 404）。

**验证用例（4）**：
- 从元数据解析出 IdP 授权 URL
- 回调创建新用户并登录
- 按 email 关联既有用户
- 非法 SAML 响应被拒并回退登录页

---

### 3.6 `@nocobase/plugin-auth-ldap`（批次 C）

**定位**：[plugin-auth-ldap](file:///d:/icebase/packages/plugins/@nocobase/plugin-auth-ldap)

**功能说明**：**LDAP 目录认证**。

**服务端实现要点**：经 `authManager.registerTypes()` 注册并继承 `BaseAuth`；依赖 `ldapts` 执行 bind 校验；bind 成功则创建用户，并按用户名或 email 关联既有用户。

**验证用例（4）**：
- LDAP bind 成功时创建新用户
- 密码错误被拒
- LDAP 中未找到用户被拒
- 按用户名或 email 关联既有用户

---

### 3.7 `@nocobase/plugin-auth-cas`（批次 C）

**定位**：[plugin-auth-cas](file:///d:/icebase/packages/plugins/@nocobase/plugin-auth-cas)

**功能说明**：**CAS（中央认证服务）单点登录**认证。

**服务端实现要点**：经 `authManager.registerTypes()` 注册并继承 `BaseAuth`；返回 CAS 登录 URL；回调阶段校验票据并创建/关联用户；校验失败被拒。同样遵循「先注册 handler、后 define 资源」的顺序约束。

**验证用例（4）**：
- 返回 CAS 登录 URL
- 回调创建新用户并登录
- 按用户名关联既有用户
- CAS 校验失败被拒

---

### 3.8 `@nocobase/plugin-dingtalk`（批次 C）

**定位**：[plugin-dingtalk](file:///d:/icebase/packages/plugins/@nocobase/plugin-dingtalk)

**功能说明**：**钉钉集成**三项能力——扫码/网页授权登录、自定义机器人 Webhook 通知渠道、部门与用户同步。

**服务端实现要点**：依赖 `axios`；OAuth 授权页跳转；首次登录建号、再次登录复用；自定义机器人 Webhook 支持**加签**（追加 `timestamp` 与对 `${timestamp}\n${secret}` 的 HMAC-SHA256 签名，URL 无查询串时以 `?` 拼接）；部门/用户同步按唯一键幂等 upsert；部门树按 `parentDeptId` 递归拉取（v1.0 contact API 分页）。

**验证用例（10）**：
- 认证（2）：跳转钉钉授权页；首次登录建号、再次复用
- 通知渠道（6）：追加 timestamp 与 HMAC-SHA256 签名；URL 无查询串时用 `?` 拼接；发送 markdown 载荷；配置 secret 时对请求加签；Webhook url 缺失时失败；机器人返回错误码时返回失败
- 同步（2）：部门幂等同步（不重复）；用户幂等同步（不重复）

---

### 3.9 `@nocobase/plugin-wecom`（批次 C）

**定位**：[plugin-wecom](file:///d:/icebase/packages/plugins/@nocobase/plugin-wecom)

**功能说明**：**企业微信集成**三项能力——网页授权登录、群机器人 Webhook 通知渠道、部门与用户同步。

**服务端实现要点**：依赖 `axios`；`gettoken` 获取凭证后走部门/用户 list 接口；网页授权登录；首次登录建号、再次登录复用；群机器人 Webhook 发送 markdown（有标题时加粗前缀，无标题时发原始内容）；部门/用户同步按唯一键幂等 upsert。

**验证用例（8）**：
- 认证（2）：跳转企微授权页；首次登录建号、再次复用
- 通知渠道（4）：有标题时加粗前缀发送 markdown；无标题时发送原始内容；Webhook url 缺失时失败；机器人返回错误码时返回失败
- 同步（2）：部门幂等同步（不重复）；用户幂等同步（不重复）

---

## 4. 已知风险（交付说明引用）

| 插件 | 风险 | 建议 |
|---|---|---|
| multi-space | 关联资源（relationship）动作不经过空间过滤；集合 disable 时保留列仅隐藏 | 关联场景需在业务侧约束，或后续增强中间件 |
| print-template | `render` 直接按目标集合取数，绕过行级 ACL | 生产使用前为 render action 增加权限校验 |
| auth-saml | SAML RelayState 上限 80 字节 | 部署时确认 IdP 约定 |
| auth-cas | 假设 CAS service URL 为前缀匹配 | 部署时确认 CAS 服务端约定 |
| dingtalk / wecom | 企微 Webhook 无加签（钉钉有加签）；同步幂等依赖唯一键；钉钉分页语义需对齐实际账号权限 | 接入真实租户前需联调 |

---

## 5. 仓库与提交

| 项 | 说明 |
|---|---|
| 源码位置 | `d:\icebase\packages\plugins\@nocobase\`（234 文件，已被 git 跟踪） |
| 基座引用 | `nocobase/` 为子模块 gitlink（`a4eac04` = v2.2.22） |
| 配置文件 | `.gitignore`、`.yarnrc`（npmmirror）、`package.json`（sqlite3 + `yarn verify`）、`scripts/verify-plugins.mjs` |

提交历史：

```
f175f13 chore: 验证脚本运行后自动清理本地链接
c69bce9 docs: 更新交付文档至 v0.3（9 插件交付清单与验证记录）
ccf5ad7 feat: 批次C 插件（模板打印 / 企业认证 / 钉钉企微）
25a315e feat: 批次B 插件 multi-space（多空间逻辑隔离）
4dcab4c feat: 批次A 插件 field-lookup 与 workflow-rules
1a0a359 chore: 建立 icebase 插件目录结构与 NocoBase 基座引用
```
