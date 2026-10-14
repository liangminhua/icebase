# plugin-field-lookup

Lookup（查找引用）与 Rollup（汇总）字段类型插件。

## 功能

- **lookup**：沿 `belongsTo` / `hasOne` 关系，读取关联表的一个字段值（读取时计算，不落库）
- **rollup**：沿 `hasMany` / `belongsToMany` 关系，对关联记录聚合（sum / avg / count / min / max，读取时计算）

## 服务端选项

| 选项 | 说明 |
|---|---|
| `relation` | 当前集合上的关系字段名 |
| `targetField` | 目标集合字段名（lookup 必填；rollup 在 aggregate=count 时可省略） |
| `aggregate` | rollup 聚合方式 |
| `filter` | 附加过滤条件（对象或 JSON 字符串） |

## 已知限制

- 读取时逐批查询（每批一条 IN 查询），未做缓存与依赖图增量重算
- 虚拟字段不支持数据库级排序/过滤
- 目标集合需与当前集合在同一数据源（主数据源）

## 测试

```bash
yarn test packages/plugins/@nocobase/plugin-field-lookup/src/server/__tests__/lookup-field.test.ts
```
