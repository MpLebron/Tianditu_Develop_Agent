# 热力图 (heatmap)

将点密度或权重值可视化为连续的色彩渐变效果。

## 基础用法

```javascript
function normalizeHeatmapFeatures(featureCollection) {
    var input = featureCollection && Array.isArray(featureCollection.features) ? featureCollection.features : [];
    var normalized = [];

    input.forEach(function(feature) {
        if (!feature || !feature.geometry || !Array.isArray(feature.geometry.coordinates)) return;
        var props = feature.properties || {};

        if (feature.geometry.type === 'Point') {
            normalized.push(feature);
            return;
        }

        if (feature.geometry.type === 'MultiPoint') {
            feature.geometry.coordinates.forEach(function(point, index) {
                if (!Array.isArray(point) || point.length < 2) return;
                normalized.push({
                    type: 'Feature',
                    properties: Object.assign({}, props, { __pointIndex: index }),
                    geometry: { type: 'Point', coordinates: point }
                });
            });
        }
    });

    return { type: 'FeatureCollection', features: normalized };
}

var heatData = normalizeHeatmapFeatures(rawGeoJSON);

// 数据源（GeoJSON 点 + weight 属性）
map.addSource('heat-source', {
    type: 'geojson',
    data: heatData
});

// 热力图层
map.addLayer({
    id: 'heat-layer',
    type: 'heatmap',
    source: 'heat-source',
    paint: {
        'heatmap-weight': ['get', 'weight'],
        'heatmap-intensity': 1,
        'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(0,0,255,0)',
            0.2, 'rgb(0,255,255)',
            0.4, 'rgb(0,255,0)',
            0.6, 'rgb(255,255,0)',
            0.8, 'rgb(255,128,0)',
            1, 'rgb(255,0,0)'
        ],
        'heatmap-radius': 30,
        'heatmap-opacity': 0.8
    }
});
```

## paint 属性

| 属性 | 类型 | 说明 |
|------|------|------|
| `heatmap-weight` | Number/Expression | 每个点的权重 0-1 |
| `heatmap-intensity` | Number | 整体强度 |
| `heatmap-color` | Expression | 色彩梯度（基于 density 插值） |
| `heatmap-radius` | Number | 影响半径（像素） |
| `heatmap-opacity` | Number | 透明度 0-1 |

## 常用色彩方案

```javascript
// 红黄绿（默认）
[0, 'rgba(0,0,255,0)', 0.2, 'cyan', 0.4, 'lime', 0.6, 'yellow', 0.8, 'orange', 1, 'red']

// 暖色
[0, 'rgba(255,255,0,0)', 0.4, '#ffcc00', 0.7, '#ff6600', 1, '#ff0000']

// 冷色
[0, 'rgba(0,0,255,0)', 0.3, '#4444ff', 0.6, '#0088ff', 1, '#00ffff']
```

## 常用模式：随机示例数据

```javascript
var features = [];
for (var i = 0; i < 200; i++) {
    features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [centerLng + (Math.random() - 0.5) * 0.4, centerLat + (Math.random() - 0.5) * 0.4] },
        properties: { weight: Math.random() }
    });
}
```

## 踩坑提醒

1. `heatmap-color` 的插值基于 `heatmap-density`（0-1），不是数据值
2. `heatmap-weight` 用 `['get', 'weight']` 从属性读取，确保值在 0-1 范围
3. `heatmap-radius` 是像素单位，放大缩小地图时圆的屏幕大小不变
4. 热力图输入最稳的是 **Point FeatureCollection**；如果原始数据含 `MultiPoint`，先归一化成 `Point` 再 `addSource`
5. 不要用 `['==', ['geometry-type'], 'MultiPoint']` 过滤热力图点；当前运行环境里应统一按 `Point` 处理
6. 如果热力图要插到某个图层前面，先 `map.getLayer(beforeId)`，存在时再传 `beforeId`
