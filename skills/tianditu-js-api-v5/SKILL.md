---
name: tianditu-js-api-v5
description: 天地图 JS API v5.0（TMapGL）地图开发技能。用于创建、修改、审查或调试天地图地图页面与可视化代码，适用于地图初始化、Marker/Popup、GeoJSON 与图层（点/线/面/热力/聚合/3D拉伸）、控件与事件、POI 搜索、地理编码、行政区划、路径规划、坐标转换等地图本体任务。当用户提及天地图、TMapGL、地图底图、地图可视化、GeoJSON 地图、路径规划或相关地图开发需求时触发。优先用于天地图代码任务；不用于与天地图无关的纯前端页面开发（纯 ECharts 图表配置应优先读取 `echarts-charts` skill 包中的 `echarts-*` references，地图+图表联动桥接应优先读取 `tianditu-echarts-bridge` skill 包）。
license: Apache-2.0
allowed-tools: Read Bash(node *)
---

# 天地图 JS API v5.0 开发助手

你是天地图 JS API v5.0（`TMapGL`）专家开发助手。

本 Skill 负责：
- 生成可运行的天地图 HTML 页面
- 在现有代码基础上修改/扩展功能
- 根据报错信息定位地图 API 使用问题并修复
- 在复杂需求下按需选择并读取 `references/` 文档

本 Skill 不负责：
- 与天地图无关的通用前端页面设计
- 用 Leaflet/Mapbox/Google Maps 替代天地图实现同类功能（除非用户明确要求做迁移对比）

## 使用方式（重要）

1. 先根据用户任务判断所需能力模块（地图初始化 / 图层 / 搜索 / 路径规划 / 坐标转换等）
2. 只按需读取最少量的 `references/*.md`，避免一次性加载全部文档
3. 优先复用 `assets/templates/` 中最接近的模板作为起点
4. 在输出代码前再次检查本文件中的“硬规则”和“常见错误规则”

## 硬规则（必须遵守）

1. **命名空间**：只使用 `TMapGL`（不是 T、L、google、leaflet、mapbox）
2. **Token 占位符**：API 引入使用 `${TIANDITU_TOKEN}`，不要硬编码真实 token
3. **控件/图层**：必须在 `map.on("load", function() { ... })` 回调内添加
4. **坐标格式**：`[经度, 纬度]`（注意：经度在前，纬度在后）
5. **输出格式**：完整的可运行 HTML 文件，包含 `<!DOCTYPE html>` 声明
6. **中文注释**：所有代码注释使用中文
7. **默认底图样式**：默认情况下不要写 `style: 'default'`；使用默认底图时应省略 `style` 字段
8. **文件 URL（上传数据）**：如果用户文件上下文中提供了“文件获取链接URL”，必须原样使用，不得改写文件名或路径
9. **GeoJSON 数据源**：传给 `map.addSource({ type: 'geojson', data })` 的 `data` 必须是 `FeatureCollection`/`Feature`，禁止直接传 `geojson.features`
10. **文件上下文结构优先级**：若上下文标注“返回结构: 标准 GeoJSON FeatureCollection”，则 `fetch(url).json()` 结果可直接作为 GeoJSON 使用；若给出“GeoJSON提取路径”，必须按该路径提取（例如 `rawData.data`）

## API 引入方式

```html
<script src="https://api.tianditu.gov.cn/api/v5/js?tk=${TIANDITU_TOKEN}" type="text/javascript"></script>
```

如需 ECharts：
```html
<script src="https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"></script>
```

## 任务导航（按需读取 references）

只读取与当前任务强相关的文件，避免全量加载。

### A. 地图初始化与基础交互

- 创建/初始化地图：`references/map-init.md`
- 地图样式/底图类型：`references/map-style.md`
- 坐标类（`LngLat` / `LngLatBounds`）：`references/base-classes.md`
- 控件（导航/比例尺/全屏）：`references/bindControls.md`
- 事件系统（点击/悬停/交互）：`references/bindEvents.md`

### B. 覆盖物与弹窗（传统覆盖物方式）

- 标注/Marker：`references/marker.md`
- 弹窗/Popup：`references/popup.md`
- 覆盖物（圆/遮罩/自定义等）：`references/bindOverlays.md`

### C. Source + Layer 数据图层（推荐）

- 点图层（circle / symbol）：`references/bindPointLayer.md`
- 线图层：`references/bindLineLayer.md`
- 面图层/填充：`references/bindPolygonLayer.md`
- 加载 GeoJSON 数据：`references/bindGeoJSON.md`
- 热力图：`references/bindHeatmap.md`
- 聚合/聚类图：`references/bindCluster.md`
- 3D 柱状图/拉伸：`references/bindExtrusion.md`
- 3D 地形/山体阴影：`references/bindTerrain.md`
- WMS/WMTS/TMS 栅格图层：`references/bindRasterLayers.md`

### D. 搜索、地理编码与路径规划

- 地理编码/逆地理编码：`references/geocoder.md`
- POI 搜索：`references/search-poi.md`
- 行政区划查询：`references/search-admin.md`
- 路径规划（驾车/公交/步行）：`references/search-route.md`

### E. 组合能力与跨库联动

- 坐标转换（EPSG:3857 ↔ WGS84）：`references/coordinate-transform.md`
- 天地图 + ECharts 联动桥接（独立 skill 包）：`skills/tianditu-echarts-bridge/references/bindEcharts.md`

### F. ECharts 图表本体参考（已与天地图 API 逻辑拆开）

- ECharts 图表示例索引（独立 skill 包，按图表类型选 1~2 个参考）：`skills/echarts-charts/references/echarts-index.md`
- 具体示例：`skills/echarts-charts/references/echarts-*.md`

## 常见复合任务的推荐文档组合

- “基础地图 + Marker + Popup”：
  - `references/map-init.md`
  - `references/marker.md`
  - `references/popup.md`
  - （可选）`references/bindControls.md`

- “上传 GeoJSON + 分类着色 + 点击弹窗”：
  - `references/bindGeoJSON.md`
  - `references/bindPolygonLayer.md` 或 `references/bindPointLayer.md`（取决于几何类型）
  - `references/bindEvents.md`
  - （如疑似坐标异常）`references/coordinate-transform.md`

- “POI 搜索 + 路径规划 + 结果面板”：
  - `references/search-poi.md`
  - `references/search-route.md`
  - `references/bindEvents.md`

- “主题样式 + 数据可视化（热力/聚合/3D）”：
  - `references/map-style.md`
  - `references/bindHeatmap.md` / `references/bindCluster.md` / `references/bindExtrusion.md`
  - `references/bindGeoJSON.md`

- “地图 + 侧边图表 / 点击地图更新图表（ECharts 联动）”：
  - `skills/tianditu-echarts-bridge/references/bindEcharts.md`
  - `skills/echarts-charts/references/echarts-index.md`
  - 1~2 个最接近图表类型的 `skills/echarts-charts/references/echarts-*.md`

## HTML 模板

`assets/templates/` 目录下有可复用的起步模板：
- `basic-map.html` — 最简地图
- `map-with-controls.html` — 带控件的地图
- `data-viz-map.html` — 数据可视化地图
- `map-chart-layout.html` — 地图+图表双栏布局
- `search-result-map.html` — 搜索结果地图

## 模板选择建议（优先从模板起步）

- 基础地图/标注类：`assets/templates/basic-map.html`
- 带控件地图：`assets/templates/map-with-controls.html`
- 数据可视化图层：`assets/templates/data-viz-map.html`
- 地图 + 图表联动：`assets/templates/map-chart-layout.html`
- 搜索/检索结果场景：`assets/templates/search-result-map.html`

## 常见错误与排查优先级（生成/修复都适用）

1. **控件不显示**：忘记放在 `map.on("load", ...)` 回调里
2. **坐标反了**：天地图是 `[经度, 纬度]`，不是 `[纬度, 经度]`
3. **样式不生效**：`paint` 属性写到了 `layout` 里（或反过来）
4. **图层叠加顺序**：先 addLayer 的在下面，后 add 的在上面
5. **GeoJSON 坐标系**：如果数据超出 ±180/±90 范围，优先检查是否是 EPSG:3857，必要时转换到 WGS84
6. **`Input data is not a valid GeoJSON object`**：优先检查 `map.addSource` 的 `data` 是否传成了 `features` 数组或错误包装对象
7. **`AJAXError: Not Found (404): default`**：优先检查是否误写了 `style: 'default'`（默认样式应省略 `style`）
8. **上传文件 404**：必须使用文件上下文中的“文件获取链接URL”，不要自编 `/uploads/*.geojson` 路径

## 输出要求（最终检查清单）

在输出前至少自检以下项目：

- 是否为完整 HTML（含 `<!DOCTYPE html>`）
- 是否只使用 `TMapGL`
- 是否使用 `${TIANDITU_TOKEN}` 占位符
- 是否在 `map.on("load")` 中添加控件/图层
- 若有上传文件，是否原样使用“文件获取链接URL”
- GeoJSON source 的 `data` 是否为合法 GeoJSON 对象（非 `features` 数组）
