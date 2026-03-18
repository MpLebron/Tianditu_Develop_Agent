# 覆盖物（圆、遮罩、自定义）

在地图上绘制几何覆盖物：圆形范围、区域遮罩等。

## 画圆（circle 图层模拟）

天地图 v5.0 没有直接的 Circle 覆盖物，用 GeoJSON Polygon 模拟圆形：

```javascript
function createCircleGeoJSON(center, radiusKm, steps) {
    steps = steps || 64;
    var coords = [];
    for (var i = 0; i <= steps; i++) {
        var angle = (i / steps) * 2 * Math.PI;
        var dx = radiusKm * Math.cos(angle);
        var dy = radiusKm * Math.sin(angle);
        var lng = center[0] + dx / (111.32 * Math.cos(center[1] * Math.PI / 180));
        var lat = center[1] + dy / 110.574;
        coords.push([lng, lat]);
    }
    return {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [coords] }
    };
}

map.on('load', function() {
    var circle = createCircleGeoJSON([116.40, 39.90], 5); // 5km 半径

    map.addSource('circle', { type: 'geojson', data: circle });
    map.addLayer({
        id: 'circle-fill', type: 'fill', source: 'circle',
        paint: { 'fill-color': '#1890ff', 'fill-opacity': 0.2 }
    });
    map.addLayer({
        id: 'circle-outline', type: 'line', source: 'circle',
        paint: { 'line-color': '#1890ff', 'line-width': 2 }
    });
});
```

## 区域遮罩（高亮某区域）

用一个覆盖全球的大多边形，挖去目标区域，形成"遮罩"效果：

```javascript
var maskPolygon = {
    type: 'Feature',
    geometry: {
        type: 'Polygon',
        coordinates: [
            // 外环（覆盖全球）
            [[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]],
            // 内环（目标区域，挖空）
            targetAreaCoordinates
        ]
    }
};

map.addSource('mask', { type: 'geojson', data: maskPolygon });
map.addLayer({
    id: 'mask-layer', type: 'fill', source: 'mask',
    paint: { 'fill-color': '#000000', 'fill-opacity': 0.5 }
});
```

## 自定义 DOM 覆盖物

使用 Marker 配合自定义元素实现任意 DOM 覆盖物：

```javascript
var el = document.createElement('div');
el.innerHTML = '<div style="background:white;padding:8px 12px;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,0.15);font-size:13px;">自定义内容</div>';

new TMapGL.Marker({ element: el, anchor: 'bottom' })
    .setLngLat([116.40, 39.90])
    .addTo(map);
```

## 踩坑提醒

1. 圆形通过 GeoJSON Polygon 近似，`steps` 越大越圆滑（64 足够）
2. 圆半径计算中，经度方向需要乘以 `cos(纬度)` 校正
3. 遮罩的多边形外环和内环方向需相反（外环逆时针，内环顺时针）
