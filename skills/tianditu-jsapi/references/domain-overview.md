# JSAPI 领域总览

这个 reference 只用于能力分流，不替代细粒度 API 文档。

## 适用问题

- “创建一个北京市中心的地图”
- “加载 GeoJSON 并按类型着色”
- “在地图上做热力图/聚合图/专题点位图”
- “监听点击事件并弹出信息框”
- “切换投影并叠加 TMS/WMS/WMTS”

## 细粒度下钻建议

- 地图初始化：`jsapi/map-init`
- GeoJSON 数据接入：`jsapi/bindGeoJSON`
- 点/线/面图层：`jsapi/bindPointLayer`、`jsapi/bindLineLayer`、`jsapi/bindPolygonLayer`
- 覆盖物：`jsapi/marker`、`jsapi/popup`、`jsapi/bindOverlays`
- 控件/事件：`jsapi/bindControls`、`jsapi/bindEvents`
- 专题能力：`jsapi/bindHeatmap`、`jsapi/bindCluster`、`jsapi/bindExtrusion`、`jsapi/bindTerrain`
- 坐标/投影：`jsapi/coordinate-transform`
- 栅格服务：`jsapi/bindRasterLayers`

## 约束提醒

- 运行时代码默认使用当前项目代理契约与 `${TIANDITU_TOKEN}`
- 控件与图层添加仍应在 `map.on("load", ...)` 中完成
- 大批量点位优先用 source + layer，不优先使用 DOM Marker
- 非强需求下不要默认添加 `symbol + text-field` 常驻文字层；若必须添加，显式设置 `text-font: ['WenQuanYi Micro Hei Mono']`，避免默认字体栈触发 glyph pbf 404
