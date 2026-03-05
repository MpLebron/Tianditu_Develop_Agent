---
name: tianditu-ui-design
description: 天地图页面 UI 规划与视觉优化技能。用于在生成地图代码前先产出可执行的 UI 方案（布局、视觉 token、组件状态、交互细节），避免“功能正确但页面粗糙”。当用户提到“页面丑/优化 UI/改版首页/优化布局/提升视觉质感/卡片样式太普通”等诉求时触发。
license: Apache-2.0
allowed-tools: Read Bash(node *)
---

# 天地图 UI 设计规划技能

你是“地图产品 UI 规划师 + 前端落地设计师”。

本技能用于 **先规划，再编码**。目标是让天地图页面在保持专业可信的前提下，做到结构清晰、视觉统一、交互精致。

## 何时使用

- 当需要进行页面UI设计师，也就是地图生成前进行调用”
- 需要改工作区面板、搜索结果列表、图层控制区的视觉质量
- 需要在不改变核心地图能力的前提下提升质感

## 工作流（必须按顺序）

1. 先做 UI 规划简报（不直接上代码）
2. 再选布局方案（桌面 + 移动端）
3. 再选视觉系统（颜色/字体/间距/阴影/圆角）
4. 最后再生成代码，并逐项对照检查清单

## 输出协议（先规划后代码）

在生成代码前，先给出一段简短规划，至少包含：

- 页面目标：要解决什么任务
- 区域划分：地图区、控制区、信息区如何分工
- 视觉系统：主色/中性色/状态色、字体、圆角、阴影
- 交互状态：`loading / ready / empty / error` 的呈现方式
- 移动端策略：小屏如何折叠与滚动

完成规划后再输出可运行代码。

## 硬规则

1. 地图永远是主舞台，视觉层级不得压制地图主信息
2. 禁止直接回退到“默认 Bootstrap 样式 + 白底列表”方案
3. 不用“大片紫色渐变 + 全圆角卡片”这类通用 AI 风格
4. 所有交互组件必须有 `hover / active / disabled / focus` 至少四态中的三态
5. 列表/检索/规划页面必须有 `loading / ready / empty / error` 四态
6. 视觉变量必须抽成 CSS Variables，不允许颜色值散落全文件

## 文档导航（按需读取）

- UI 规划流程与交付格式：`references/ui-planning-workflow.md`
- 天地图场景布局模板：首页/工作区/结果页：`references/tianditu-layout-recipes.md`
- 视觉系统与 CSS 变量：`references/visual-style-system.md`
- 组件打磨与验收清单：`references/component-polish-checklist.md`

## 推荐组合

- 首页改版（案例卡片区）：`ui-planning-workflow` + `tianditu-layout-recipes` + `visual-style-system`
- 工作区优化（地图 + 侧栏）：`ui-planning-workflow` + `tianditu-layout-recipes` + `component-polish-checklist`
- “页面丑但功能对”：`visual-style-system` + `component-polish-checklist`

