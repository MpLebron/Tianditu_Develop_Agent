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

```javascript
map.addLayer({
    id: 'label-layer',
    type: 'symbol',
    source: 'points',
    layout: {
        'text-field': ['get', 'name'],
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
    layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-offset': [0, -1.5], 'text-anchor': 'bottom' },
    paint: { 'text-color': '#333', 'text-halo-color': '#fff', 'text-halo-width': 1 }
});
```

## 踩坑提醒

1. 图层操作必须在 `map.on("load", ...)` 回调内
2. `addSource` 和 `addLayer` 的 id 不能重复
3. 数据驱动样式中 `['get', 'fieldName']` 从 Feature 的 `properties` 中读取字段
