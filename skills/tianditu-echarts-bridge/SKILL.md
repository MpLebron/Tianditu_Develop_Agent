---
name: tianditu-echarts-bridge
description: 天地图（TMapGL）与 ECharts 联动桥接技能。用于地图+图表双栏布局、地图事件驱动图表更新、图表初始化时机与 resize 稳定性处理。不负责纯 ECharts option 细节（请配合 echarts-charts skill 包）。
license: Apache-2.0
---

# 天地图 + ECharts 联动桥接技能

本 Skill 只负责“地图 API 与图表实例之间的桥接层”，不负责图表本体样式设计。

适用场景：
- 在天地图页面中嵌入 ECharts 图表（侧栏/弹窗/浮层）
- 地图点击/悬停后驱动图表更新
- 地图与图表容器联动布局、尺寸变化、初始化时机

不适用场景：
- 纯 ECharts 图表页面
- 图表类型选型与复杂 `option` 细节（折线/柱状/饼图等配置）

## 使用方式（建议）

1. 先读 `references/bindEcharts.md` 解决桥接与布局问题
2. 再结合 `echarts-charts` skill 包读取 `echarts-index.md` + 1~2 个具体图表示例
3. 输出时保持“桥接逻辑”和“图表 option”职责分离，避免把所有代码糅在一个长函数里

## 参考文档

- `references/bindEcharts.md` — 天地图与 ECharts 联动桥接（布局、事件、更新、resize）
