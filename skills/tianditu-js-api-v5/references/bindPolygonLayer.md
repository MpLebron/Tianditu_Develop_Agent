# 面图层 (fill)

渲染多边形区域：行政区划、地块、覆盖范围等。

## 基础用法

```javascript
map.addSource('area', {
    type: 'geojson',
    data: {
        type: 'Feature',
        geometry: {
            type: 'Polygon',
            coordinates: [[
                [116.35, 39.85], [116.45, 39.85],
                [116.45, 39.95], [116.35, 39.95],
                [116.35, 39.85]  // 闭合：首尾坐标相同
            ]]
        }
    }
});

map.addLayer({
    id: 'area-fill',
    type: 'fill',
    source: 'area',
    paint: {
        'fill-color': '#1890ff',
        'fill-opacity': 0.5,
        'fill-outline-color': '#004080'
    }
});
```

## paint 属性

| 属性 | 类型 | 说明 |
|------|------|------|
| `fill-color` | Color | 填充颜色 |
| `fill-opacity` | Number | 透明度 0-1 |
| `fill-outline-color` | Color | 轮廓线颜色 |

## 常用模式：fill + line 组合（更粗的边界线）

`fill-outline-color` 只有 1px 宽度。要更粗的边界线，单独添加 line 图层：

```javascript
// 填充层
map.addLayer({
    id: 'region-fill',
    type: 'fill',
    source: 'region',
    paint: { 'fill-color': '#1890ff', 'fill-opacity': 0.3 }
});

// 边界线层（在填充层上方）
map.addLayer({
    id: 'region-outline',
    type: 'line',
    source: 'region',
    paint: { 'line-color': '#1890ff', 'line-width': 3, 'line-opacity': 0.8 }
});
```

## 常用模式：按属性分类着色

```javascript
paint: {
    'fill-color': [
        'match', ['get', 'type'],
        '住宅', '#ff9800',
        '商业', '#2196f3',
        '工业', '#9e9e9e',
        '绿地', '#4caf50',
        '#cccccc'  // 默认色
    ],
    'fill-opacity': 0.6
}
```

## 常用模式：GeoJSON 几何类型过滤

当数据源包含混合几何类型时，用 `filter` 只渲染多边形：

```javascript
map.addLayer({
    id: 'polygons-only',
    type: 'fill',
    source: 'mixed-data',
    filter: ['any',
        ['==', ['geometry-type'], 'Polygon'],
        ['==', ['geometry-type'], 'MultiPolygon']
    ],
    paint: { 'fill-color': '#1890ff', 'fill-opacity': 0.5 }
});
```

## 踩坑提醒

1. Polygon 坐标必须**闭合**（首尾坐标相同）
2. `fill-outline-color` 只在 `fill-opacity < 1` 时可见
3. 要更粗的边界线效果，使用 fill + line 组合
