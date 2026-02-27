---
name: echarts-charts
description: ECharts 图表代码参考技能（纯图表，不含地图 API）。用于在地图侧边栏/详情面板/联动场景中生成或改写 ECharts option 与图表页面代码，适用于折线图、柱状图、饼图、散点图、雷达图、仪表盘等图表配置参考。当任务需要 ECharts 图表样式、series 配置、坐标轴、tooltip、legend、dataZoom 等图表本体能力时触发。若涉及天地图联动，请同时使用 `tianditu-echarts-bridge` skill 包中的 `bindEcharts` 参考文档。
license: Apache-2.0
---

# ECharts 图表代码参考技能（纯图表）

本 Skill 提供“图表本体”能力，不负责地图 API。

适用场景：
- 需要生成/改写 ECharts `option`
- 需要找某类图表的完整示例（折线/柱状/饼图/散点/雷达/仪表盘）
- 需要把纯图表示例嵌入地图侧边栏或详情面板

不适用场景：
- 天地图地图初始化、图层、事件、搜索、路径规划（这些应使用天地图技能）
- 地图点击事件与图表联动桥接逻辑（请使用 `tianditu-echarts-bridge` skill 包中的 `bindEcharts`）

## 使用方式（建议）

1. 先读取 `references/echarts-index.md` 选择最接近的图表类型
2. 再按需读取 1~2 个 `references/echarts-*.md`
3. 优先复用示例中的 `option` 结构，不要无依据重写复杂配置
4. 若嵌入地图页面，保留 `resize` 逻辑并确保容器尺寸明确

## 参考文档

- `references/echarts-index.md` — 图表类型索引（入口）
- `references/echarts-line-*.md` — 折线图
- `references/echarts-bar-*.md` — 柱状图/条形图
- `references/echarts-pie-*.md` — 饼图
- `references/echarts-scatter-*.md` — 散点图/气泡图
- `references/echarts-radar-*.md` — 雷达图
- `references/echarts-gauge-*.md` — 仪表盘

## 注意事项

1. 本 Skill 的示例多数是“完整 HTML 页面”，迁移到地图联动时应提取 `option` 与图表初始化部分
2. 图表容器必须有宽高，否则 `echarts.init()` 后可能不显示
3. 动态更新时优先使用 `chart.setOption(nextOption, true)` 做覆盖更新
