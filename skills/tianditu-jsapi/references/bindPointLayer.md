# 点图层 (circle / symbol)

使用 Source + Layer 模式渲染大量点数据。适合数百到数万个点的场景（少量点用 Marker 即可）。

## circle 类型（圆点）

```javascript
map.addSource('points', {
    type: 'geojson',
    data: {
        type: 'FeatureCollection',
        features: [
            { type: 'Feature', geometry: { type: 'Point', coordinates: [116.40, 39.90] }, properties: { name: '北京', value: 100 } },
            { type: 'Feature', geometry: { type: 'Point', coordinates: [121.47, 31.23] }, properties: { name: '上海', value: 200 } }
        ]
    }
});

map.addLayer({
    id: 'point-layer',
    type: 'circle',
    source: 'points',
    paint: {
        'circle-radius': 8,
        'circle-color': '#ff0000',
        'circle-opacity': 0.8,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff'
    }
});
```

## circle paint 属性

| 属性 | 类型 | 说明 |
|------|------|------|
| `circle-radius` | Number | 圆半径（像素） |
| `circle-color` | Color | 填充颜色 |
| `circle-opacity` | Number | 透明度 0-1 |
| `circle-stroke-width` | Number | 描边宽度 |
| `circle-stroke-color` | Color | 描边颜色 |

## 数据驱动样式

根据属性值动态设置样式：

```javascript
paint: {
    // 根据 value 值设置大小
    'circle-radius': ['interpolate', ['linear'], ['get', 'value'], 0, 4, 100, 12, 500, 24],
    // 根据 type 分类着色
    'circle-color': ['match', ['get', 'type'], '医院', '#ff4444', '学校', '#44aaff', '公园', '#44dd44', '#999999'],
    'circle-opacity': 0.8
}
```

## symbol 类型（文字标注）

只有在用户明确要求“地图上常驻文字标签”时再添加文本图层。否则优先用侧边栏、列表或 `Popup` 展示文字，避免无意义的字体资源请求。

```javascript
map.addLayer({
    id: 'label-layer',
    type: 'symbol',
    source: 'points',
    layout: {
        'text-field': ['get', 'name'],
        'text-font': ['WenQuanYi Micro Hei Mono'],
        'text-size': 12,
        'text-anchor': 'top',
        'text-offset': [0, 1]
    },
    paint: {
        'text-color': '#333333',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1
    }
});
```

## 常用模式：circle + symbol 组合

```javascript
// 先添加圆点图层
map.addLayer({
    id: 'dots',
    type: 'circle',
    source: 'points',
    paint: { 'circle-radius': 6, 'circle-color': '#1890ff', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' }
});

// 再添加文字标注（在圆点上方）
map.addLayer({
    id: 'labels',
    type: 'symbol',
    source: 'points',
    layout: {
        'text-field': ['get', 'name'],
        'text-font': ['WenQuanYi Micro Hei Mono'],
        'text-size': 11,
        'text-offset': [0, -1.5],
        'text-anchor': 'bottom'
    },
    paint: { 'text-color': '#333', 'text-halo-color': '#fff', 'text-halo-width': 1 }
});
```

## 字体告警说明

- `symbol + text-field` 会触发天地图 glyph/pbf 字体请求。
- 不要依赖默认字体栈，也不要把页面 CSS `font-family` 当成图层字体。
- 当前运行环境下，文本图层统一使用 `text-font: ['WenQuanYi Micro Hei Mono']`。
- 如果并不需要地图上常驻名称，直接省略文本图层，改用侧边栏或 `Popup`。

## 数据守卫模板（推荐直接复用）

```javascript
function normalizePointFeature(feature) {
    if (!feature || !feature.geometry) return null;
    var g = feature.geometry;
    if (!Array.isArray(g.coordinates)) return null;

    if (g.type === 'Point') {
        if (g.coordinates.length < 2) return null;
        return feature;
    }

    if (g.type === 'MultiPoint') {
        var first = g.coordinates[0];
        if (!Array.isArray(first) || first.length < 2) return null;
        return {
            type: 'Feature',
            properties: feature.properties || {},
            geometry: { type: 'Point', coordinates: first }
        };
    }

    return null;
}

map.on('click', 'point-layer', function(e) {
    if (!e.features || !e.features.length) return;
    // 继续处理点击逻辑...
});
```

## 踩坑提醒

1. 图层操作必须在 `map.on("load", ...)` 回调内
2. `addSource` 和 `addLayer` 的 id 不能重复
3. 数据驱动样式中 `['get', 'fieldName']` 从 Feature 的 `properties` 中读取字段
4. 点击事件里访问 `e.features[0]` 前必须判空：`if (!e.features || !e.features.length) return`
5. 坐标校验优先看 `geometry.coordinates`，禁止读取预览字段 `coordinatesPreview`
6. 如果用了 `symbol + text-field`，必须显式设置 `text-font: ['WenQuanYi Micro Hei Mono']`，避免 `vector.tianditu.gov.cn/static/font/*.pbf` 404
