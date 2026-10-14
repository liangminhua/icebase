# plugin-workflow-rules

工作流决策表（Rules）节点插件。

## 功能

有序规则列表 `when → then`：

- **first-match（默认）**：自上而下匹配，命中第一条即返回其结果
- **all-match**：返回所有命中结果；当全部结果为普通对象时按优先级合并为一个对象
- **else**：无规则命中时求值；未配置则结果为 null
- 空条件规则视为未启用
- 支持上游节点变量（`{{$jobsMapByNodeKey.<key>}}`）与上下文变量（`{{$context.data.xxx}}`）
- 表达式引擎：默认 math.js，可配置

## 节点配置

| 配置项 | 说明 |
|---|---|
| `mode` | `first-match` / `all-match` |
| `rules` | `[{ when: 条件表达式, then: 结果表达式 }]` |
| `else` | 兜底表达式 |

## 测试

```bash
yarn test packages/plugins/@nocobase/plugin-workflow-rules/src/server/__tests__/instruction.test.ts
```
