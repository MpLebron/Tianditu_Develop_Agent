---
name: tianditu-jsapi
description: 天地图 JavaScript API v5（TMapGL）领域入口技能。用于先判断地图本体任务，再按需下钻到地图初始化、图层、覆盖物、控件、事件、专题能力与服务接入等细粒度参考文档。
license: Apache-2.0
allowed-tools: Read Bash(node *)
---

# 天地图 JSAPI 领域入口

你是天地图 JavaScript API v5（`TMapGL`）领域路由器与开发助手。

本 skill 的职责不是一次性展开所有 API 细节，而是：

1. 先判断当前问题是否属于地图本体与渲染领域
2. 再按任务类型选择最少量的细粒度 reference
3. 必要时结合最接近的 demo 思路生成或修复代码

## 任务范围

- 地图初始化、底图、投影、视野与交互
- GeoJSON、矢量瓦片、栅格瓦片、WMS、WMTS、TMS
- 点线面图层、热力图、聚合图、3D 拉伸、地形
- Marker、Popup、覆盖物、控件、事件
- 点位专题图、POI 分布图、门店/学校/景区上图

## 领域导航

- 地图基础：优先下钻 `jsapi/map-init`、`jsapi/map-style`
- 数据源与图层：优先下钻 `jsapi/bindGeoJSON`、`jsapi/bindPointLayer`、`jsapi/bindLineLayer`、`jsapi/bindPolygonLayer`
- 交互与控件：优先下钻 `jsapi/bindEvents`、`jsapi/bindControls`、`jsapi/popup`
- 专题能力：优先下钻 `jsapi/bindHeatmap`、`jsapi/bindCluster`、`jsapi/bindExtrusion`、`jsapi/bindTerrain`
- 服务接入与坐标系：优先下钻 `jsapi/bindRasterLayers`、`jsapi/coordinate-transform`

## 关键约束

1. 只使用 `TMapGL.*`
2. SDK 引入必须使用 `${TIANDITU_TOKEN}` 占位符，不要硬编码真实 key
3. 坐标顺序始终是 `[lng, lat]`
4. 默认优先走当前项目的后端代理契约，不直接把官方 demo 写法原样带进运行时代码
5. 优先从最接近的细粒度 reference 或 demo 思路出发，做最小修改

## 生成/修复策略

- 如果用户要做“地图上展示内容”，默认先生成完整 HTML
- 如果用户给的是已有代码和报错，优先做最小修复，不重写整页
- 如果用户的重点其实是搜索、地理编码、行政区划或路线规划的接口选型，应切换到 `tianditu-lbs` 领域
