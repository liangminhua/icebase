-- =====================================================================
-- 无功能锁定的多维表格 + 自定义计算工作流系统
-- 数据模型 DDL (PostgreSQL 16+)
--
-- 说明：
--  1. 所有业务/元数据表均带 tenant_id，从第一天支持多租户隔离（RLS）
--  2. 自托管单租户场景：写入固定 tenant_id，RLS 可关闭
--  3. 元数据（表/字段/规则）与业务数据分离，业务数据表由引擎按
--     sys_collection / sys_field 动态创建，本文件仅定义系统元数据
-- =====================================================================

-- ---------- 扩展 ----------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()

-- =====================================================================
-- 1. 租户与工作空间
-- =====================================================================

CREATE TABLE sys_tenant (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code          TEXT NOT NULL UNIQUE,                  -- 租户标识
    name          TEXT NOT NULL,
    isolation     TEXT NOT NULL DEFAULT 'rls',           -- rls | schema | database
    schema_name   TEXT,                                  -- isolation=schema 时使用
    status        TEXT NOT NULL DEFAULT 'active',        -- active | suspended | deleted
    settings      JSONB NOT NULL DEFAULT '{}'::jsonb,    -- 资源限额等（非功能锁）
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sys_workspace (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES sys_tenant(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    description   TEXT,
    created_by    UUID,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name)
);
CREATE INDEX idx_workspace_tenant ON sys_workspace(tenant_id);

-- =====================================================================
-- 2. 数据模型元数据：表 / 字段 / 关系
-- =====================================================================

CREATE TABLE sys_collection (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES sys_tenant(id) ON DELETE CASCADE,
    workspace_id  UUID NOT NULL REFERENCES sys_workspace(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,                         -- 物理表名/逻辑名
    title         TEXT NOT NULL,                         -- 显示名
    description   TEXT,
    kind          TEXT NOT NULL DEFAULT 'internal',      -- internal | external | view
    source_ref    JSONB,                                 -- external 时：连接串引用
    options       JSONB NOT NULL DEFAULT '{}'::jsonb,    -- 排序、索引、软删除等
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name)
);
CREATE INDEX idx_collection_tenant_ws ON sys_collection(tenant_id, workspace_id);

CREATE TABLE sys_field (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES sys_tenant(id) ON DELETE CASCADE,
    collection_id UUID NOT NULL REFERENCES sys_collection(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,                         -- 字段名
    title         TEXT NOT NULL,                         -- 显示名
    type          TEXT NOT NULL,                         -- 见下方 type 取值
    is_stored     BOOLEAN NOT NULL DEFAULT TRUE,         -- 是否物化存储
    is_unique     BOOLEAN NOT NULL DEFAULT FALSE,
    is_required   BOOLEAN NOT NULL DEFAULT FALSE,
    default_value JSONB,
    -- 计算类字段配置 ------------------------------------------------
    expr          TEXT,                                  -- formula：表达式源码
    expr_engine   TEXT DEFAULT 'mathjs',                 -- mathjs | cel | string_template
    rule_id       UUID,                                  -- computed：关联的计算规则
    lookup_config JSONB,                                 -- lookup：{collection, match, field, mode}
    rollup_config JSONB,                                 -- rollup：{collection, match, field, agg}
    -- 类型与展示 ----------------------------------------------------
    options       JSONB NOT NULL DEFAULT '{}'::jsonb,    -- 选项集、精度、格式等
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (collection_id, name),
    CONSTRAINT ck_field_type CHECK (type IN (
        'text','long_text','number','decimal','boolean','date','datetime',
        'email','url','phone','select','multi_select','attachment','json',
        'belongs_to','has_many','belongs_to_many',
        'formula','lookup','rollup','computed','auto_number','created_at','updated_at'
    ))
);
CREATE INDEX idx_field_collection ON sys_field(collection_id);
CREATE INDEX idx_field_tenant ON sys_field(tenant_id);

-- 表间关系（决定跨表查询路径）
CREATE TABLE sys_relation (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES sys_tenant(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    source_collection_id UUID NOT NULL REFERENCES sys_collection(id) ON DELETE CASCADE,
    target_collection_id UUID NOT NULL REFERENCES sys_collection(id) ON DELETE CASCADE,
    source_field_id UUID NOT NULL REFERENCES sys_field(id) ON DELETE CASCADE,
    target_field_id UUID REFERENCES sys_field(id) ON DELETE SET NULL,
    rel_type        TEXT NOT NULL,                       -- belongs_to | has_many | belongs_to_many
    through_collection_id UUID REFERENCES sys_collection(id),  -- 多对多的中间表
    on_delete       TEXT NOT NULL DEFAULT 'set_null',    -- cascade | restrict | set_null
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_relation_type CHECK (rel_type IN ('belongs_to','has_many','belongs_to_many'))
);
CREATE INDEX idx_relation_source ON sys_relation(source_collection_id);
CREATE INDEX idx_relation_target ON sys_relation(target_collection_id);

-- =====================================================================
-- 3. 计算工作流：规则 / 版本 / 节点 / 绑定
-- =====================================================================

-- 3.1 计算规则（逻辑实体，指向当前生效版本）
CREATE TABLE calc_rule (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL REFERENCES sys_tenant(id) ON DELETE CASCADE,
    workspace_id   UUID NOT NULL REFERENCES sys_workspace(id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    description    TEXT,
    target_collection_id UUID REFERENCES sys_collection(id) ON DELETE CASCADE,
    latest_version_id    UUID,                            -- 当前发布版本
    status         TEXT NOT NULL DEFAULT 'draft',         -- draft | published | disabled
    created_by     UUID,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, workspace_id, name)
);
CREATE INDEX idx_rule_tenant ON calc_rule(tenant_id);
CREATE INDEX idx_rule_target ON calc_rule(target_collection_id);

-- 3.2 规则版本（发布快照，保证 run 可追溯、可回滚）
CREATE TABLE calc_rule_version (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL REFERENCES sys_tenant(id) ON DELETE CASCADE,
    rule_id        UUID NOT NULL REFERENCES calc_rule(id) ON DELETE CASCADE,
    version_no     INTEGER NOT NULL,
    definition     JSONB NOT NULL,                        -- 完整 DAG 定义快照
    changelog      TEXT,
    published_by   UUID,
    published_at   TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (rule_id, version_no)
);

-- 3.3 规则节点（DAG 节点）
CREATE TABLE calc_step (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL REFERENCES sys_tenant(id) ON DELETE CASCADE,
    rule_version_id UUID NOT NULL REFERENCES calc_rule_version(id) ON DELETE CASCADE,
    key            TEXT NOT NULL,                         -- 节点标识（表达式内引用 steps.<key>）
    type           TEXT NOT NULL,
    title          TEXT,
    config         JSONB NOT NULL DEFAULT '{}'::jsonb,    -- 节点配置（见注释）
    depends_on     JSONB NOT NULL DEFAULT '[]'::jsonb,    -- 前置节点 key 列表
    next_ids       JSONB NOT NULL DEFAULT '[]'::jsonb,    -- 后继节点 key 列表（分支用）
    sort_order     INTEGER NOT NULL DEFAULT 0,
    on_error       TEXT NOT NULL DEFAULT 'fail',          -- fail | continue | retry
    retry_policy   JSONB NOT NULL DEFAULT '{"maxAttempts":3,"backoffMs":1000}',
    timeout_ms     INTEGER NOT NULL DEFAULT 30000,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_step_type CHECK (type IN (
        'trigger',      -- 触发（也可由 binding 承担）
        'lookup',       -- 跨表查询：{collection, match, fields, mode:first|all, orderBy}
        'aggregate',    -- 跨表聚合：{collection, match, field, agg}
        'condition',    -- 单条件分支：{expr}
        'switch',       -- 多分支：{cases:[{when,next}], defaultNext}
        'rules',        -- 决策表：{mode:first_match|all_match, rules:[{when,then}], else}
        'calculate',    -- 表达式计算：{engine, expr, assignTo}
        'loop',         -- 遍历：{source, itemVar, maxIterations}
        'write_back',   -- 回写：{collection, target:{by,match}, assign:{field:expr}, mode:update|create|upsert}
        'notify',       -- 通知：{channel, to, template}
        'code',         -- 沙箱脚本：{lang, entry, srcRef}
        'end'
    )),
    UNIQUE (rule_version_id, key)
);
CREATE INDEX idx_step_version ON calc_step(rule_version_id);

-- 3.4 规则绑定：什么事件、在哪张表、满足什么条件时触发
CREATE TABLE calc_rule_binding (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL REFERENCES sys_tenant(id) ON DELETE CASCADE,
    rule_id        UUID NOT NULL REFERENCES calc_rule(id) ON DELETE CASCADE,
    collection_id  UUID NOT NULL REFERENCES sys_collection(id) ON DELETE CASCADE,
    trigger_type   TEXT NOT NULL,                         -- record_create | record_update | record_upsert
                                                          -- | schedule | manual | webhook
    trigger_fields JSONB NOT NULL DEFAULT '[]'::jsonb,    -- 关注变更的字段（update 触发）
    trigger_expr   TEXT,                                  -- 附加触发条件（CEL）
    cron_expr      TEXT,                                  -- schedule 触发
    input_mapping  JSONB NOT NULL DEFAULT '{}'::jsonb,    -- 触发上下文 → 流程变量映射
    is_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
    priority       INTEGER NOT NULL DEFAULT 100,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_binding_trigger CHECK (trigger_type IN (
        'record_create','record_update','record_upsert','schedule','manual','webhook'
    ))
);
CREATE INDEX idx_binding_collection ON calc_rule_binding(collection_id, trigger_type) WHERE is_enabled;
CREATE INDEX idx_binding_tenant ON calc_rule_binding(tenant_id);

-- =====================================================================
-- 4. 执行实例与节点记录
-- =====================================================================

CREATE TABLE calc_run (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES sys_tenant(id) ON DELETE CASCADE,
    rule_id         UUID NOT NULL REFERENCES calc_rule(id) ON DELETE CASCADE,
    rule_version_id UUID NOT NULL REFERENCES calc_rule_version(id),
    binding_id      UUID REFERENCES calc_rule_binding(id) ON DELETE SET NULL,
    collection_id   UUID REFERENCES sys_collection(id),
    record_id       UUID,                                 -- 目标记录（记录级触发）
    trigger_type    TEXT NOT NULL,
    trigger_event   JSONB NOT NULL DEFAULT '{}'::jsonb,   -- 触发事件快照
    idempotency_key TEXT NOT NULL,                         -- 幂等键
    status          TEXT NOT NULL DEFAULT 'pending',       -- pending|running|success|failed|skipped|timeout
    context         JSONB NOT NULL DEFAULT '{}'::jsonb,    -- 运行上下文
    error           JSONB,
    started_at      TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ,
    duration_ms     INTEGER,
    rollback_of     UUID REFERENCES calc_run(id),          -- 回滚记录
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (idempotency_key)
);
CREATE INDEX idx_run_rule_time ON calc_run(rule_id, created_at DESC);
CREATE INDEX idx_run_record ON calc_run(collection_id, record_id, created_at DESC);
CREATE INDEX idx_run_status ON calc_run(tenant_id, status) WHERE status IN ('pending','running','failed');

CREATE TABLE calc_step_run (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES sys_tenant(id) ON DELETE CASCADE,
    run_id        UUID NOT NULL REFERENCES calc_run(id) ON DELETE CASCADE,
    step_key      TEXT NOT NULL,
    step_type     TEXT NOT NULL,
    attempt       INTEGER NOT NULL DEFAULT 1,
    status        TEXT NOT NULL DEFAULT 'pending',        -- pending|running|success|failed|skipped
    input         JSONB,
    output        JSONB,
    error         JSONB,
    started_at    TIMESTAMPTZ,
    finished_at   TIMESTAMPTZ,
    duration_ms   INTEGER,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_step_run_run ON calc_step_run(run_id, step_key);

-- 回写前的原值快照（支持按 run 回滚）
CREATE TABLE calc_write_snapshot (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES sys_tenant(id) ON DELETE CASCADE,
    run_id        UUID NOT NULL REFERENCES calc_run(id) ON DELETE CASCADE,
    collection_id UUID NOT NULL,
    record_id     UUID NOT NULL,
    before_values JSONB NOT NULL,                         -- 变更前
    after_values  JSONB NOT NULL,                         -- 变更后
    written_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_snapshot_run ON calc_write_snapshot(run_id);

-- =====================================================================
-- 5. 依赖图（增量重算）
-- =====================================================================

CREATE TABLE calc_dependency (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID NOT NULL REFERENCES sys_tenant(id) ON DELETE CASCADE,
    from_collection_id UUID NOT NULL,                     -- 上游表
    from_field_id      UUID NOT NULL,                     -- 上游字段
    to_collection_id   UUID NOT NULL,                     -- 下游表
    to_field_id        UUID NOT NULL,                     -- 下游字段（计算字段）
    rule_id            UUID REFERENCES calc_rule(id) ON DELETE CASCADE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (from_field_id, to_field_id)
);
CREATE INDEX idx_dep_from ON calc_dependency(from_collection_id, from_field_id);
CREATE INDEX idx_dep_to   ON calc_dependency(to_collection_id, to_field_id);

-- 脏数据标记（上游变更后，下游待重算）
CREATE TABLE calc_dirty_record (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES sys_tenant(id) ON DELETE CASCADE,
    collection_id UUID NOT NULL,
    record_id     UUID NOT NULL,
    reason        TEXT,                                   -- field_change | rule_publish | manual
    marked_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at  TIMESTAMPTZ,
    UNIQUE (collection_id, record_id, reason)
);
CREATE INDEX idx_dirty_pending ON calc_dirty_record(tenant_id, marked_at) WHERE processed_at IS NULL;

-- =====================================================================
-- 6. 自定义函数注册（沙箱）
-- =====================================================================

CREATE TABLE calc_function (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES sys_tenant(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    signature     TEXT,                                   -- 如 'discount(price number, level text) -> number'
    lang          TEXT NOT NULL DEFAULT 'expression',     -- expression | js | python
    src           TEXT,                                   -- 脚本源码（lang=js/python）
    expr          TEXT,                                   -- 表达式（lang=expression）
    sandbox       JSONB NOT NULL DEFAULT '{"timeoutMs":2000,"memoryMb":64,"network":false}',
    is_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name)
);

-- =====================================================================
-- 7. 调度与审计
-- =====================================================================

CREATE TABLE sys_job (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES sys_tenant(id) ON DELETE CASCADE,
    kind          TEXT NOT NULL,                          -- cron_rule | batch_recalc | retry_run
    cron_expr     TEXT,
    payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
    next_run_at   TIMESTAMPTZ,
    last_run_at   TIMESTAMPTZ,
    is_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_job_due ON sys_job(next_run_at) WHERE is_enabled;

CREATE TABLE audit_log (
    id            BIGSERIAL PRIMARY KEY,
    tenant_id     UUID NOT NULL,
    actor_id      UUID,
    actor_type    TEXT,                                   -- user | system | api
    action        TEXT NOT NULL,                          -- create/update/delete/publish/run/rollback
    object_type   TEXT NOT NULL,                          -- collection/field/rule/run...
    object_id     UUID,
    before_data   JSONB,
    after_data    JSONB,
    ip            INET,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_tenant_time ON audit_log(tenant_id, created_at DESC);
CREATE INDEX idx_audit_object ON audit_log(object_type, object_id);

-- =====================================================================
-- 8. 多租户 RLS（共享库模式）
--    isolation='schema' / 'database' 的租户不走此策略
-- =====================================================================

-- 示例：对核心表启用 RLS。应用连接需先执行：
--   SELECT set_config('app.current_tenant_id', '<uuid>', true);
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sys_workspace','sys_collection','sys_field','sys_relation',
    'calc_rule','calc_rule_version','calc_step','calc_rule_binding',
    'calc_run','calc_step_run','calc_write_snapshot',
    'calc_dependency','calc_dirty_record','calc_function','sys_job'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation_%1$s ON %1$I
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
    $f$, t);
  END LOOP;
END $$;

-- 注意：
--  * 索引均以 tenant_id 或 collection_id 前缀，避免跨租户索引膨胀
--  * 应用层必须保证每请求 SET LOCAL app.current_tenant_id
--  * 需配套"跨租户越权"自动化测试，RLS 策略遗漏等于数据泄漏

-- =====================================================================
-- 9. 业务数据表（动态生成示例）
--    引擎按 sys_collection / sys_field 自动创建，形如：
-- =====================================================================
--
-- CREATE TABLE data_<collection_name> (
--     id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--     tenant_id   UUID NOT NULL,
--     <业务字段...>,
--     created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
--     updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
--     deleted_at  TIMESTAMPTZ
-- );
-- CREATE INDEX ON data_<collection_name>(tenant_id, id);