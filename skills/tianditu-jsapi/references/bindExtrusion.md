# 3D 柱状图 (fill-extrusion)

将多边形区域拉伸为 3D 柱体，用高度表达数值大小。

## 基础用法

```javascript
map.addSource('bar-source', {
    type: 'geojson',
    data: {
        type: 'FeatureCollection',
        features: [{
            type: 'Feature',
            properties: { name: '北京', value: 4.3 },
            geometry: {
                type: 'Polygon',
                coordinates: [[
                    [116.0, 39.5], [116.8, 39.5],
                    [116.8, 40.3], [116.0, 40.3],
                    [116.0, 39.5]
                ]]
            }
        }]
    }
});

map.addLayer({
    id: 'bar-3d',
    type: 'fill-extrusion',
    source: 'bar-source',
    paint: {
        'fill-extrusion-color': '#ff4444',
        'fill-extrusion-height': 100000,  // 拉伸高度（米）
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.85
    }
});
```

## paint 属性

| 属性 | 类型 | 说明 |
|------|------|------|
| `fill-extrusion-color` | Color | 柱体颜色 |
| `fill-extrusion-height` | Number | 拉伸高度（米） |
| `fill-extrusion-base` | Number | 底部高度（米） |
| `fill-extrusion-opacity` | Number | 透明度 0-1 |
| `fill-extrusion-vertical-gradient` | Boolean | 垂直渐变 |

## 常用模式：多城市 GDP 3D 柱状图

```javascript
var cities = [
    { name: '北京', lng: 116.40, lat: 39.90, value: 4.3, color: '#ff4444' },
    { name: '上海', lng: 121.47, lat: 31.23, value: 4.7, color: '#44aaff' },
    { name: '广州', lng: 113.26, lat: 23.13, value: 3.0, color: '#44dd44' },
    { name: '深圳', lng: 114.06, lat: 22.54, value: 3.5, color: '#ffaa00' }
];

var map = new TMapGL.Map('map', {
    center: [116.0, 30.0], zoom: 5, pitch: 55, bearing: -15
});

map.on('load', function() {
    cities.forEach(function(city, i) {
        var size = 0.8;  // 柱体底面宽度（经纬度）
        var height = city.value * 80000;  // 数值映射到高度

        var polygon = {
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                properties: { name: city.name, value: city.value },
                geometry: {
                    type: 'Polygon',
                    coordinates: [[
                        [city.lng - size/2, city.lat - size/2],
                        [city.lng + size/2, city.lat - size/2],
                        [city.lng + size/2, city.lat + size/2],
                        [city.lng - size/2, city.lat + size/2],
                        [city.lng - size/2, city.lat - size/2]
                    ]]
                }
            }]
        };

        map.addSource('city-' + i, { type: 'geojson', data: polygon });
        map.addLayer({
            id: 'city-3d-' + i,
            type: 'fill-extrusion',
            source: 'city-' + i,
            paint: {
                'fill-extrusion-color': city.color,
                'fill-extrusion-height': height,
                'fill-extrusion-base': 0,
                'fill-extrusion-opacity': 0.9
            }
        });
    });
});
```

## 地图初始化要点

3D 柱状图需要设置 `pitch`（倾斜）才能看到效果：

```javascript
var map = new TMapGL.Map('map', {
    center: [116.0, 30.0],
    zoom: 5,
    pitch: 55,     // 必须 > 0 才能看到 3D 效果
    bearing: -15   // 适当旋转增强立体感
});
```

## 踩坑提醒

1. `pitch` 必须设置 > 0（建议 45-60），否则看不到 3D 效果
2. `fill-extrusion-height` 单位是**米**，需要将数据值乘以合适的系数
3. 每个柱体需要单独的 source + layer（id 用索引区分）
4. 柱体底面是经纬度矩形，size 需根据缩放级别调整
