# 线图层 (line)

渲染线要素数据：路径、轨迹、边界线等。

## 基础用法

```javascript
map.addSource('route', {
    type: 'geojson',
    data: {
        type: 'Feature',
        geometry: {
            type: 'LineString',
            coordinates: [[116.40, 39.90], [116.42, 39.92], [116.45, 39.91]]
        }
    }
});

map.addLayer({
    id: 'route-line',
    type: 'line',
    source: 'route',
    paint: {
        'line-color': '#1890ff',
        'line-width': 4,
        'line-opacity': 0.8
    },
    layout: {
        'line-cap': 'round',
        'line-join': 'round'
    }
});
```

## paint 属性

| 属性 | 类型 | 说明 |
|------|------|------|
| `line-color` | Color | 线颜色 |
| `line-width` | Number | 线宽（像素） |
| `line-opacity` | Number | 透明度 0-1 |
| `line-dasharray` | Array | 虚线模式 `[实线长, 间隔长]` |
| `line-blur` | Number | 模糊半径 |

## layout 属性

| 属性 | 类型 | 说明 |
|------|------|------|
| `line-cap` | String | 端点：'butt' / 'round' / 'square' |
| `line-join` | String | 连接：'miter' / 'round' / 'bevel' |

## 常用模式：虚线边界

```javascript
map.addLayer({
    id: 'boundary',
    type: 'line',
    source: 'my-source',
    paint: {
        'line-color': '#ff6600',
        'line-width': 2,
        'line-dasharray': [4, 2]
    }
});
```

## 常用模式：路线 + 方向箭头（发光效果）

```javascript
// 底层发光线
map.addLayer({
    id: 'route-glow',
    type: 'line',
    source: 'route',
    paint: { 'line-color': '#1890ff', 'line-width': 10, 'line-opacity': 0.3, 'line-blur': 3 }
});

// 上层实线
map.addLayer({
    id: 'route-main',
    type: 'line',
    source: 'route',
    paint: { 'line-color': '#1890ff', 'line-width': 4, 'line-opacity': 1 },
    layout: { 'line-cap': 'round', 'line-join': 'round' }
});
```

## 踩坑提醒

1. `line-dasharray` 的值是相对于线宽的倍数，`[4, 2]` 表示 4 倍线宽的实线 + 2 倍线宽的间隔
2. 多条线叠加可实现发光、描边等效果
3. LineString 至少需要 2 个坐标点
