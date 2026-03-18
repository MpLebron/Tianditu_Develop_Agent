# 3D 地形与山体阴影

加载 DEM 数据实现 3D 地形效果和山体阴影。

## 基础用法：3D 地形

```javascript
var map = new TMapGL.Map('map', {
    center: [86.92, 27.99],   // 珠穆朗玛峰附近
    zoom: 12,
    pitch: 60,
    bearing: 40
});

map.on('load', function() {
    // 添加 DEM 数据源（天地图地形瓦片）
    map.addSource('terrain-dem', {
        type: 'raster-dem',
        tiles: ['https://api.tianditu.gov.cn/api/v5/dem?tk=${TIANDITU_TOKEN}&x={x}&y={y}&z={z}'],
        tileSize: 256
    });

    // 启用 3D 地形
    map.setTerrain({ source: 'terrain-dem', exaggeration: 1.5 });
});
```

## 山体阴影 (hillshade)

```javascript
map.addSource('hillshade-source', {
    type: 'raster-dem',
    tiles: ['https://api.tianditu.gov.cn/api/v5/dem?tk=${TIANDITU_TOKEN}&x={x}&y={y}&z={z}'],
    tileSize: 256
});

map.addLayer({
    id: 'hillshade-layer',
    type: 'hillshade',
    source: 'hillshade-source',
    paint: {
        'hillshade-illumination-direction': 315,
        'hillshade-exaggeration': 0.5,
        'hillshade-shadow-color': '#473B24'
    }
});
```

## hillshade paint 属性

| 属性 | 类型 | 说明 |
|------|------|------|
| `hillshade-illumination-direction` | Number | 光照方向 0-360 |
| `hillshade-exaggeration` | Number | 阴影夸张程度 0-1 |
| `hillshade-shadow-color` | Color | 阴影颜色 |
| `hillshade-highlight-color` | Color | 高光颜色 |
| `hillshade-accent-color` | Color | 强调色 |

## 地形配置

| 参数 | 类型 | 说明 |
|------|------|------|
| `source` | String | DEM 数据源 ID |
| `exaggeration` | Number | 地形夸张系数，默认 1，越大越陡峭 |

## 踩坑提醒

1. 3D 地形需要 `pitch > 0` 才能看到效果
2. `exaggeration` 值越大地形越夸张，1.0 是真实比例
3. 地形渲染需要 WebGL 支持，低端设备可能卡顿
4. DEM 瓦片 URL 需要替换为有效的 token
