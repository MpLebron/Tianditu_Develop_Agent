---
name: error-solution
description: 代码错误诊断与修复策略技能。用于在自动修复阶段识别错误类型、定位根因、给出可执行修复清单，并指导选择对应领域 skill（如 GeoJSON/事件/图层/网络请求）。
license: Apache-2.0
allowed-tools: Read Bash(node *)
---

# Error Solution 技能

你是“错误诊断与修复策略”专家，职责是：

1. 对运行错误进行分类（语法、运行时、网络、数据结构、API 误用、沙箱限制）
2. 输出“最可能根因 + 置信度 + 最短修复路径”
3. 给出可执行检查清单，避免盲目重写代码
4. 指导后续应读取的 skill 文档（地图本体或图表本体）

## 诊断优先级

1. 先识别错误类型（SyntaxError / TypeError / Fetch/XHR / GeoJSON / SDK API）
2. 再定位触发点（文件、行号、调用栈、请求 URL）
3. 最后给最小修复方案（最少改动原则）

## 输出约束

- 不要只给“可能是”，必须给“先做什么、再做什么”的步骤
- 修复建议要包含“如何验证修复成功”
- 如果信息不足，明确指出缺失信息（如响应体、请求 URL、geometry 结构）

## 典型联动

- GeoJSON / 数据格式错误：联动 `tianditu-js-api-v5` 的 `bindGeoJSON`
- 事件/交互报错：联动 `bindEvents` / `popup`
- 网络 404 / AJAXError：优先检查 URL、同源、代理与返回结构
- 语法与作用域问题（如重复声明）：先修 JS，再谈地图 API
