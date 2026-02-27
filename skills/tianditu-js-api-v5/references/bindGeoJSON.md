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
    filter: ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'MultiPolygon']],
    paint: { 'fill-color': 'rgba(66,133,244,0.5)', 'fill-outline-color': '#1a73e8' }
});

// 线
map.addLayer({
    id: 'data-line', type: 'line', source: 'my-data',
    filter: ['any', ['==', ['geometry-type'], 'LineString'], ['==', ['geometry-type'], 'MultiLineString'],
             ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'MultiPolygon']],
    paint: { 'line-color': '#1a73e8', 'line-width': 2 }
});

// 点
map.addLayer({
    id: 'data-point', type: 'circle', source: 'my-data',
    filter: ['any', ['==', ['geometry-type'], 'Point'], ['==', ['geometry-type'], 'MultiPoint']],
    paint: { 'circle-radius': 6, 'circle-color': '#ea4335', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' }
});
```

## 自动定位到数据范围

```javascript
function fitToGeoJSON(map, geojson) {
    var bounds = new TMapGL.LngLatBounds();
    function processCoords(coords) {
        if (typeof coords[0] === 'number') { bounds.extend(coords); }
        else { coords.forEach(processCoords); }
    }
    geojson.features.forEach(function(f) {
        if (f.geometry && f.geometry.coordinates) processCoords(f.geometry.coordinates);
    });
    map.fitBounds(bounds, { padding: 50, maxZoom: 16 });
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

## 坐标系检测与转换

如果数据坐标超出 `[-180, -90] ~ [180, 90]` 范围，说明可能是 EPSG:3857 投影坐标，需要转换。详见 `coordinate-transform.md`。

## 踩坑提醒

1. Source 和 Layer 操作必须在 `map.on("load", ...)` 内
2. GeoJSON 的 Polygon 坐标必须闭合（首尾相同）
3. 使用 URL 加载时注意 CORS 跨域问题
4. `addSource` 的 id 必须唯一，重复会报错
