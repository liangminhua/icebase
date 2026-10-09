-- =====================================================================
-- 无功能锁定的多维表格 + 自定义计算工作流系统
-- 数据模型 DDL (PostgreSQL 16+)
--
-- 说明：
--  1. 已移除自研多租户（tenant_id / RLS / schema-per-tenant）
--  2. 【隔离与入口由基座提供，本系统不建表】
--     应用 App（多应用，物理隔离）/ 空间 Space（多空间，逻辑隔离）
--     / 工作区 Portal（多工作区，界面入口）——均由 NocoBase 提供，直接复用
--  3. app_id / space_id 仅作"范围引用列"（指向基座，不用外键、不由本系统维护）
--  4. 元数据（表/字段/规则）与业务数据分离；业务数据表由引擎按
--     sys_collection / sys_field 动态创建，本文件仅定义系统元数据
--  5. 商业版能力表一并纳入（外部数据源、SSO、审计、记录历史、发布、
--     打印、公开表单、AI 知识库、遥测等），对应"商业版功能无锁化"
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
-- CREATE EXTENSION IF NOT EXISTS "vector";  -- pgvector，AI 知识库启用

-- 说明：app_id / space_id 为基座（NocoBase）侧标识，本层仅保存引用值。

-- =====================================================================
-- 1. 数据模型元数据：表 / 字段 / 关系
-- =====================================================================

CREATE TABLE sys_collection (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id        UUID NOT NULL,                          -- 引用基座应用（多应用）
    name          TEXT NOT NULL,
    title         TEXT NOT NULL,
    description   TEXT,
    kind          TEXT NOT NULL DEFAULT 'internal',       -- internal | external | view | sql
    has_space     BOOLEAN NOT NULL DEFAULT TRUE,          -- 是否纳入空间隔离（基座空间字段）
    datasource_id UUID,                                   -- 外部数据源（见 sys_external_datasource）
    source_ref    JSONB,                                  -- 外部表映射信息
    options       JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (app_id, name)
);
CREATE INDEX idx_collection_app ON sys_collection(app_id);

CREATE TABLE sys_field (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id        UUID NOT NULL,
    collection_id UUID NOT NULL REFERENCES sys_collection(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    title         TEXT NOT NULL,
    type          TEXT NOT NULL,
    is_stored     BOOLEAN NOT NULL DEFAULT TRUE,
    is_unique     BOOLEAN NOT NULL DEFAULT FALSE,
    is_required   BOOLEAN NOT NULL DEFAULT FALSE,
    default_value JSONB,
    -- 计算类字段配置
    expr          TEXT,
    expr_engine   TEXT DEFAULT 'mathjs',                  -- mathjs | cel | string_template
    rule_id       UUID,                                   -- computed 字段关联的计算规则
    lookup_config JSONB,                                  -- {collection, match, field, mode}
    rollup_config JSONB,                                  -- {collection, match, field, agg}
    options       JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (collection_id, name),
    CONSTRAINT ck_field_type CHECK (type IN (
        'text','long_text','number','decimal','boolean','date','datetime',
        'email','url','phone','select','multi_select','attachment','json',
        'auto_number','created_at','updated_at','created_by','space',
        'belongs_to','has_many','belongs_to_many',
        'formula','lookup','rollup','computed'
    ))
);
CREATE INDEX idx_field_collection ON sys_field(collection_id);
CREATE INDEX idx_field_app ON sys_field(app_id);

CREATE TABLE sys_relation (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id                UUID NOT NULL,
    name                  TEXT NOT NULL,
    source_collection_id  UUID NOT NULL REFERENCES sys_collection(id) ON DELETE CASCADE,
    target_collection_id  UUID NOT NULL REFERENCES sys_collection(id) ON DELETE CASCADE,
    source_field_id       UUID NOT NULL REFERENCES sys_field(id) ON DELETE CASCADE,
    target_field_id       UUID REFERENCES sys_field(id) ON DELETE SET NULL,
    rel_type              TEXT NOT NULL,                  -- belongs_to | has_many | belongs_to_many
    through_collection_id UUID REFERENCES sys_collection(id),
    on_delete             TEXT NOT NULL DEFAULT 'set_null',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_relation_type CHECK (rel_type IN ('belongs_to','has_many','belongs_to_many'))
);
CREATE INDEX idx_relation_source ON sys_relation(source_collection_id);
CREATE INDEX idx_relation_target ON sys_relation(target_collection_id);

-- =====================================================================
-- 2. 计算工作流：规则 / 版本 / 节点 / 绑定
-- =====================================================================

CREATE TABLE calc_rule (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id               UUID NOT NULL,
    space_id             UUID,                            -- 可选：限定到基座某个空间
    name                 TEXT NOT NULL,
    description          TEXT,
    target_collection_id UUID REFERENCES sys_collection(id) ON DELETE CASCADE,
    latest_version_id    UUID,
    status               TEXT NOT NULL DEFAULT 'draft',   -- draft | published | disabled
    created_by           UUID,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (app_id, name)
);
CREATE INDEX idx_rule_app ON calc_rule(app_id);
CREATE INDEX idx_rule_target ON calc_rule(target_collection_id);

CREATE TABLE calc_rule_version (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id       UUID NOT NULL,
    rule_id      UUID NOT NULL REFERENCES calc_rule(id) ON DELETE CASCADE,
    version_no   INTEGER NOT NULL,
    definition   JSONB NOT NULL,                          -- 完整 DAG 定义快照
    changelog    TEXT,
    published_by UUID,
    published_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (rule_id, version_no)
);

CREATE TABLE calc_step (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id          UUID NOT NULL,
    rule_version_id UUID NOT NULL REFERENCES calc_rule_version(id) ON DELETE CASCADE,
    key             TEXT NOT NULL,                        -- 节点标识（steps.<key>）
    type            TEXT NOT NULL,
    title           TEXT,
    config          JSONB NOT NULL DEFAULT '{}'::jsonb,
    depends_on      JSONB NOT NULL DEFAULT '[]'::jsonb,
    next_ids        JSONB NOT NULL DEFAULT '[]'::jsonb,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    on_error        TEXT NOT NULL DEFAULT 'fail',         -- fail | continue | retry
    retry_policy    JSONB NOT NULL DEFAULT '{"maxAttempts":3,"backoffMs":1000}',
    timeout_ms      INTEGER NOT NULL DEFAULT 30000,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_step_type CHECK (type IN (
        'trigger',
        'lookup',      -- 跨表查询：{collection, match, fields, mode:first|all, orderBy}
        'aggregate',   -- 跨表聚合：{collection, match, field, agg}
        'condition',   -- 单条件分支：{expr}
        'switch',      -- 多分支：{cases:[{when,next}], defaultNext}
        'rules',       -- 决策表：{mode:first_match|all_match, rules:[{when,then}], else}
        'calculate',   -- 表达式计算：{engine, expr, assignTo}
        'loop',        -- 遍历：{source, itemVar, maxIterations}
        'write_back',  -- 回写：{collection, match, assign, mode:update|create|upsert}
        'notify',      -- 通知：{channel, to, template}
        'code',        -- 沙箱脚本：{lang, entry, srcRef}
        -- 以下为原"专业版"高级工作流能力，现已自研开放
        'approval',    -- 人工审批：{approvers, mode:all|any, formSchema}
        'subflow',     -- 调用子流程：{ruleId, inputMapping}
        'webhook',     -- 出站回调：{url, method, headers, body, retry}
        'cc',          -- 抄送：{to, template}
        'end'
    )),
    UNIQUE (rule_version_id, key)
);
CREATE INDEX idx_step_version ON calc_step(rule_version_id);

CREATE TABLE calc_rule_binding (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id         UUID NOT NULL,
    rule_id        UUID NOT NULL REFERENCES calc_rule(id) ON DELETE CASCADE,
    collection_id  UUID NOT NULL REFERENCES sys_collection(id) ON DELETE CASCADE,
    trigger_type   TEXT NOT NULL,                         -- record_create|record_update|record_upsert
                                                          -- |schedule|manual|webhook
    trigger_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
    trigger_expr   TEXT,                                  -- 附加触发条件（CEL）
    cron_expr      TEXT,
    input_mapping  JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
    priority       INTEGER NOT NULL DEFAULT 100,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_binding_trigger CHECK (trigger_type IN (
        'record_create','record_update','record_upsert','schedule','manual','webhook'
    ))
);
CREATE INDEX idx_binding_collection ON calc_rule_binding(collection_id, trigger_type) WHERE is_enabled;
CREATE INDEX idx_binding_app ON calc_rule_binding(app_id);

-- =====================================================================
-- 3. 执行实例与节点记录
-- =====================================================================

CREATE TABLE calc_run (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id          UUID NOT NULL,
    space_id        UUID,                                 -- 引用基座空间
    rule_id         UUID NOT NULL REFERENCES calc_rule(id) ON DELETE CASCADE,
    rule_version_id UUID NOT NULL REFERENCES calc_rule_version(id),
    binding_id      UUID REFERENCES calc_rule_binding(id) ON DELETE SET NULL,
    collection_id   UUID REFERENCES sys_collection(id),
    record_id       UUID,
    trigger_type    TEXT NOT NULL,
    trigger_event   JSONB NOT NULL DEFAULT '{}'::jsonb,
    idempotency_key TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',      -- pending|running|waiting|success|failed|skipped|timeout|canceled
    context         JSONB NOT NULL DEFAULT '{}'::jsonb,
    error           JSONB,
    started_at      TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ,
    duration_ms     INTEGER,
    rollback_of     UUID REFERENCES calc_run(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (idempotency_key)
);
CREATE INDEX idx_run_rule_time ON calc_run(rule_id, created_at DESC);
CREATE INDEX idx_run_record ON calc_run(collection_id, record_id, created_at DESC);
CREATE INDEX idx_run_status ON calc_run(app_id, status) WHERE status IN ('pending','running','waiting','failed');

CREATE TABLE calc_step_run (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id      UUID NOT NULL,
    run_id      UUID NOT NULL REFERENCES calc_run(id) ON DELETE CASCADE,
    step_key    TEXT NOT NULL,
    step_type   TEXT NOT NULL,
    attempt     INTEGER NOT NULL DEFAULT 1,
    status      TEXT NOT NULL DEFAULT 'pending',          -- pending|running|waiting|success|failed|skipped
    input       JSONB,
    output      JSONB,
    error       JSONB,
    assignee_id UUID,                                     -- approval 节点办理人
    started_at  TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    duration_ms INTEGER,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_step_run_run ON calc_step_run(run_id, step_key);
CREATE INDEX idx_step_run_assignee ON calc_step_run(assignee_id) WHERE status = 'waiting';

-- 审批任务（高级工作流的落地表）
CREATE TABLE wf_approval_task (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id        UUID NOT NULL,
    run_id        UUID NOT NULL REFERENCES calc_run(id) ON DELETE CASCADE,
    step_run_id   UUID NOT NULL REFERENCES calc_step_run(id) ON DELETE CASCADE,
    assignee_id   UUID NOT NULL,
    mode          TEXT NOT NULL DEFAULT 'any',            -- any(或签) | all(会签)
    status        TEXT NOT NULL DEFAULT 'pending',        -- pending | approved | rejected | canceled
    comment       TEXT,
    signature     JSONB,                                  -- 手写签名（企业版能力）
    acted_at      TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_approval_assignee ON wf_approval_task(assignee_id, status);

-- 回写快照（支持按 run 回滚）
CREATE TABLE calc_write_snapshot (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id        UUID NOT NULL,
    run_id        UUID NOT NULL REFERENCES calc_run(id) ON DELETE CASCADE,
    collection_id UUID NOT NULL,
    record_id     UUID NOT NULL,
    before_values JSONB NOT NULL,
    after_values  JSONB NOT NULL,
    written_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_snapshot_run ON calc_write_snapshot(run_id);

-- =====================================================================
-- 4. 依赖图（增量重算）
-- =====================================================================

CREATE TABLE calc_dependency (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id             UUID NOT NULL,
    from_collection_id UUID NOT NULL,
    from_field_id      UUID NOT NULL,
    to_collection_id   UUID NOT NULL,
    to_field_id        UUID NOT NULL,
    rule_id            UUID REFERENCES calc_rule(id) ON DELETE CASCADE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (from_field_id, to_field_id)
);
CREATE INDEX idx_dep_from ON calc_dependency(from_collection_id, from_field_id);
CREATE INDEX idx_dep_to   ON calc_dependency(to_collection_id, to_field_id);

CREATE TABLE calc_dirty_record (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id        UUID NOT NULL,
    collection_id UUID NOT NULL,
    record_id     UUID NOT NULL,
    reason        TEXT,                                   -- field_change | rule_publish | manual
    marked_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at  TIMESTAMPTZ,
    UNIQUE (collection_id, record_id, reason)
);
CREATE INDEX idx_dirty_pending ON calc_dirty_record(app_id, marked_at) WHERE processed_at IS NULL;

-- =====================================================================
-- 5. 自定义函数注册（沙箱）
-- =====================================================================

CREATE TABLE calc_function (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id     UUID NOT NULL,
    name       TEXT NOT NULL,
    signature  TEXT,
    lang       TEXT NOT NULL DEFAULT 'expression',        -- expression | js | python
    src        TEXT,
    expr       TEXT,
    sandbox    JSONB NOT NULL DEFAULT '{"timeoutMs":2000,"memoryMb":64,"network":false}',
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (app_id, name)
);

-- =====================================================================
-- 6. 商业版能力（自研开源）
-- =====================================================================

-- 6.1 外部数据源（标准版：MySQL/PG/MariaDB；企业版：Oracle/ClickHouse/Doris/NocoBase）
CREATE TABLE sys_external_datasource (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id        UUID NOT NULL,
    name          TEXT NOT NULL,
    driver        TEXT NOT NULL,                          -- mysql|postgres|mariadb|mssql|oracle|clickhouse|doris|rest|nocobase
    connection    JSONB NOT NULL,                         -- 加密存储的连接信息
    options       JSONB NOT NULL DEFAULT '{}'::jsonb,
    status        TEXT NOT NULL DEFAULT 'enabled',        -- enabled | disabled | error
    last_checked  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (app_id, name)
);

-- 6.2 认证方式（专业版：OIDC/SAML/LDAP/CAS/SMS/钉钉/企业微信）
CREATE TABLE sys_auth_provider (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id     UUID NOT NULL,
    type       TEXT NOT NULL,                             -- password|api_key|oidc|saml|ldap|cas|sms|dingtalk|wecom
    title      TEXT NOT NULL,
    config     JSONB NOT NULL DEFAULT '{}'::jsonb,        -- 加密存储密钥
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_auth_provider_app ON sys_auth_provider(app_id);

-- 6.3 审计日志（企业版）
CREATE TABLE sys_audit_log (
    id          BIGSERIAL PRIMARY KEY,
    app_id      UUID NOT NULL,
    space_id    UUID,
    actor_id    UUID,
    actor_type  TEXT,                                     -- user | system | api
    action      TEXT NOT NULL,                            -- create|update|delete|publish|run|rollback|login
    object_type TEXT NOT NULL,
    object_id   UUID,
    before_data JSONB,
    after_data  JSONB,
    ip          INET,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_app_time ON sys_audit_log(app_id, created_at DESC);
CREATE INDEX idx_audit_object ON sys_audit_log(object_type, object_id);

-- 6.4 记录编辑历史（专业版）
CREATE TABLE sys_record_history (
    id             BIGSERIAL PRIMARY KEY,
    app_id         UUID NOT NULL,
    collection_id  UUID NOT NULL,
    record_id      UUID NOT NULL,
    changed_fields JSONB NOT NULL,                        -- {field: {before, after}}
    changed_by     UUID,
    source         TEXT NOT NULL DEFAULT 'user',          -- user | workflow | api | import
    run_id         UUID,                                  -- 若由工作流写入
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_record_history_rec ON sys_record_history(collection_id, record_id, created_at DESC);

-- 6.5 多环境迁移与发布（专业版）
CREATE TABLE sys_release (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id     UUID NOT NULL,
    from_env   TEXT NOT NULL,                             -- dev | test | prod
    to_env     TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'pending',           -- pending|applied|failed|rolled_back
    note       TEXT,
    created_by UUID,
    applied_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE sys_release_item (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    release_id  UUID NOT NULL REFERENCES sys_release(id) ON DELETE CASCADE,
    object_type TEXT NOT NULL,                            -- collection|field|rule|page|datasource
    object_id   UUID NOT NULL,
    change_type TEXT NOT NULL,                            -- create|update|delete
    payload     JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_release_item_release ON sys_release_item(release_id);

-- 6.6 配置版本控制（专业版：人机协作版本管理）
CREATE TABLE sys_config_version (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id      UUID NOT NULL,
    object_type TEXT NOT NULL,
    object_id   UUID NOT NULL,
    version_no  INTEGER NOT NULL,
    snapshot    JSONB NOT NULL,
    diff        JSONB,
    created_by  UUID,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (object_type, object_id, version_no)
);

-- 6.7 模板打印（专业版）
CREATE TABLE sys_print_template (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id        UUID NOT NULL,
    collection_id UUID REFERENCES sys_collection(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    engine        TEXT NOT NULL DEFAULT 'html',           -- html | docx | pdf
    content       TEXT,                                   -- 模板内容（含变量占位）
    variables     JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6.8 公开表单（专业版）
CREATE TABLE sys_public_form (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id        UUID NOT NULL,
    collection_id UUID NOT NULL REFERENCES sys_collection(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    token         TEXT NOT NULL UNIQUE,                   -- 对外访问令牌
    schema        JSONB NOT NULL,                         -- 表单字段与校验
    settings      JSONB NOT NULL DEFAULT '{"captcha":true,"rateLimitPerMin":30}',
    is_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
    expire_at     TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6.9 AI 知识库（专业版，RAG）
CREATE TABLE ai_knowledge_base (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id          UUID NOT NULL,
    name            TEXT NOT NULL,
    embedding_model TEXT,
    chunk_size      INTEGER NOT NULL DEFAULT 800,
    chunk_overlap   INTEGER NOT NULL DEFAULT 100,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE ai_knowledge_doc (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kb_id       UUID NOT NULL REFERENCES ai_knowledge_base(id) ON DELETE CASCADE,
    title       TEXT,
    source      TEXT,                                     -- attachment | url | collection
    source_ref  JSONB,
    status      TEXT NOT NULL DEFAULT 'pending',          -- pending | indexed | failed
    chunk_count INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- 向量表（启用 pgvector 时创建）
-- CREATE TABLE ai_knowledge_chunk (
--     id        BIGSERIAL PRIMARY KEY,
--     doc_id    UUID NOT NULL REFERENCES ai_knowledge_doc(id) ON DELETE CASCADE,
--     content   TEXT NOT NULL,
--     embedding vector(1536),
--     metadata  JSONB
-- );
-- CREATE INDEX ON ai_knowledge_chunk USING ivfflat (embedding vector_cosine_ops);

-- 6.10 白标 / 品牌（标准版）
CREATE TABLE sys_branding (
    app_id        UUID PRIMARY KEY,
    product_name  TEXT,
    logo_url      TEXT,
    favicon_url   TEXT,
    login_bg_url  TEXT,
    primary_color TEXT,
    email_from    TEXT,
    footer_text   TEXT,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6.11 遥测配置（企业版）
CREATE TABLE sys_telemetry_config (
    app_id          UUID PRIMARY KEY,
    logs_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
    metrics_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    tracing_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    otlp_endpoint   TEXT,
    sampling_ratio  NUMERIC(4,3) NOT NULL DEFAULT 0.100,
    retention_days  INTEGER NOT NULL DEFAULT 30,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6.12 异步导入导出任务（标准版 Pro）
CREATE TABLE sys_import_export_job (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id        UUID NOT NULL,
    kind          TEXT NOT NULL,                          -- import | export
    collection_id UUID NOT NULL,
    file_ref      TEXT,                                   -- 源/目标文件
    options       JSONB NOT NULL DEFAULT '{}'::jsonb,     -- 字段映射、更新策略、是否触发工作流
    status        TEXT NOT NULL DEFAULT 'pending',        -- pending|running|success|failed
    progress      INTEGER NOT NULL DEFAULT 0,
    total         INTEGER,
    error         JSONB,
    created_by    UUID,
    started_at    TIMESTAMPTZ,
    finished_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ie_job_app ON sys_import_export_job(app_id, created_at DESC);

-- =====================================================================
-- 7. 通用：调度与备份
-- =====================================================================

CREATE TABLE sys_job (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id      UUID NOT NULL,
    kind        TEXT NOT NULL,                            -- cron_rule | batch_recalc | retry_run | import_export
    cron_expr   TEXT,
    payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
    next_run_at TIMESTAMPTZ,
    last_run_at TIMESTAMPTZ,
    is_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_job_due ON sys_job(next_run_at) WHERE is_enabled;

CREATE TABLE sys_backup (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id     UUID NOT NULL,
    kind       TEXT NOT NULL DEFAULT 'full',              -- full | incremental
    file_ref   TEXT NOT NULL,
    size_bytes BIGINT,
    trigger    TEXT NOT NULL DEFAULT 'manual',            -- manual | schedule
    status     TEXT NOT NULL DEFAULT 'success',
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- 8. 业务数据表（动态生成示例）
--    引擎按 sys_collection / sys_field 自动创建；space_id 由基座空间机制注入：
-- =====================================================================
--
-- CREATE TABLE data_<collection_name> (
--     id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--     app_id      UUID NOT NULL,
--     space_id    UUID,                    -- has_space=true 时存在，查询自动过滤
--     <业务字段...>,
--     created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
--     updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
--     deleted_at  TIMESTAMPTZ
-- );
-- CREATE INDEX ON data_<collection_name>(app_id, space_id, id);

-- =====================================================================
-- 9. 隔离说明
--   空间隔离（多空间）与应用隔离（多应用）均由基座提供并执行：
--   * 本层不自研隔离逻辑，不建应用/空间/工作区表
--   * app_id / space_id 仅作范围引用，用于限定计算规则与执行实例的作用域
--   * 跨表查询继承当前基座上下文（应用 + 空间），无需本层重复注入
-- =====================================================================
