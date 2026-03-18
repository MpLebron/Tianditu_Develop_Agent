# GeoJSON 数据加载与渲染

加载 GeoJSON 数据到地图，自动识别几何类型并渲染。

## 基础用法：内联数据

```javascript
map.addSource('my-data', {
    type: 'geojson',
    data: {
        type: 'FeatureCollection',
        features: [
            { type: 'Feature', geometry: { type: 'Point', coordinates: [116.40, 39.90] }, properties: { name: '北京' } }
        ]
    }
});
```

## 基础用法：URL 加载

```javascript
map.addSource('my-data', {
    type: 'geojson',
    data: 'https://example.com/data.geojson'
});
```

## 按几何类型自动渲染

GeoJSON 可能包含 Point、LineString、Polygon 等混合类型，用 `filter` 分层渲染：

```javascript
// 面填充
map.addLayer({
    id: 'data-fill', type: 'fill', source: 'my-data',
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: { 'fill-color': 'rgba(66,133,244,0.5)', 'fill-outline-color': '#1a73e8' }
});

// 线
map.addLayer({
    id: 'data-line', type: 'line', source: 'my-data',
    filter: ['any', ['==', ['geometry-type'], 'LineString'], ['==', ['geometry-type'], 'Polygon']],
    paint: { 'line-color': '#1a73e8', 'line-width': 2 }
});

// 点
map.addLayer({
    id: 'data-point', type: 'circle', source: 'my-data',
    filter: ['==', ['geometry-type'], 'Point'],
    paint: { 'circle-radius': 6, 'circle-color': '#ea4335', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' }
});
```

## 自动定位到数据范围

```javascript
function fitToGeoJSON(map, geojson) {
    var bounds = new TMapGL.LngLatBounds();
    var hasBoundsPoint = false;
    function processCoords(coords) {
        if (!Array.isArray(coords) || !coords.length) return;
        if (typeof coords[0] === 'number') {
            if (!Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) return;
            bounds.extend(coords);
            hasBoundsPoint = true;
            return;
        }
        coords.forEach(processCoords);
    }
    geojson.features.forEach(function(f) {
        if (f.geometry && f.geometry.coordinates) processCoords(f.geometry.coordinates);
    });
    if (hasBoundsPoint) {
        map.fitBounds(bounds, { padding: 50, maxZoom: 16 });
    }
}
```

## 点击显示属性弹窗

```javascript
function bindPopup(map, layerId) {
    map.on('click', layerId, function(e) {
        if (!e.features || !e.features.length) return;
        var props = e.features[0].properties;
        var html = Object.entries(props)
            .filter(function(p) { return p[1] !== null && p[1] !== ''; })
            .slice(0, 10)
            .map(function(p) { return '<b>' + p[0] + ':</b> ' + p[1]; })
            .join('<br>');
        new TMapGL.Popup({ maxWidth: '300px' })
            .setLngLat(e.lngLat)
            .setHTML(html || '无属性信息')
            .addTo(map);
    });
    map.on('mouseenter', layerId, function() { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layerId, function() { map.getCanvas().style.cursor = ''; });
}

bindPopup(map, 'data-fill');
bindPopup(map, 'data-point');
bindPopup(map, 'data-line');
```

## fetch 加载远程数据

```javascript
fetch(geojsonUrl)
    .then(function(r) { return r.json(); })
    .then(function(data) {
        map.addSource('remote', { type: 'geojson', data: data });
        // 添加图层 ...
        fitToGeoJSON(map, data);
    })
    .catch(function(err) { console.error('加载失败:', err); });
```

## Point / MultiPoint 安全提取模板（避免 reading '0'）

```javascript
function pickPointFromGeometry(geometry) {
    if (!geometry || !Array.isArray(geometry.coordinates)) return null;
    if (geometry.type === 'Point') {
        var c = geometry.coordinates;
        return (Array.isArray(c) && c.length >= 2) ? c : null;
    }
    if (geometry.type === 'MultiPoint') {
        var first = geometry.coordinates[0];
        return (Array.isArray(first) && first.length >= 2) ? first : null;
    }
    return null;
}

// 注意：coordinatesPreview 仅用于文件预览，运行时禁止读取
var pt = pickPointFromGeometry(feature.geometry);
if (!pt) return; // 先判空再访问索引
var lng = pt[0];
var lat = pt[1];
```

## 坐标系检测与转换

如果数据坐标超出 `[-180, -90] ~ [180, 90]` 范围，说明可能是 EPSG:3857 投影坐标，需要转换。详见 `coordinate-transform.md`。

## 踩坑提醒

1. Source 和 Layer 操作必须在 `map.on("load", ...)` 内
2. `TMapGL.LngLatBounds` 没有 `isValid()` 方法；自动定位范围时，先维护 `hasBoundsPoint`，不要写 `bounds.isValid()`
3. `['geometry-type']` 过滤表达式在当前运行环境里使用单类型名：`Point` / `LineString` / `Polygon`；不要写 `MultiPoint` / `MultiLineString` / `MultiPolygon`
4. GeoJSON 的 Polygon 坐标必须闭合（首尾相同）
5. 使用 URL 加载时注意 CORS 跨域问题
6. `addSource` 的 id 必须唯一，重复会报错
7. 不要在运行时代码中使用 `coordinatesPreview`，统一从 `geometry.coordinates` 提取
