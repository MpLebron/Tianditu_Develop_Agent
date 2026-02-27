# 事件系统

地图事件和图层事件的监听与处理。

## 地图事件

```javascript
// 地图加载完成（添加图层/控件的时机）
map.on('load', function() { /* ... */ });

// 点击事件
map.on('click', function(e) {
    console.log('坐标:', e.lngLat);   // { lng, lat }
    console.log('像素:', e.point);     // { x, y }
});

// 鼠标移动
map.on('mousemove', function(e) { });

// 缩放
map.on('zoom', function() { console.log('缩放:', map.getZoom()); });
map.on('zoomstart', function() { });
map.on('zoomend', function() { });

// 视图移动
map.on('move', function() { });
map.on('movestart', function() { });
map.on('moveend', function() { });

// 旋转和俯仰
map.on('rotate', function() { });
map.on('pitch', function() { });
```

## 图层事件

```javascript
// 点击图层要素
map.on('click', 'layer-id', function(e) {
    var feature = e.features[0];
    var props = feature.properties;
    // 显示弹窗
    new TMapGL.Popup().setLngLat(e.lngLat).setHTML('<b>' + props.name + '</b>').addTo(map);
});

// 鼠标进入/离开图层要素（常用于切换光标样式）
map.on('mouseenter', 'layer-id', function() {
    map.getCanvas().style.cursor = 'pointer';
});
map.on('mouseleave', 'layer-id', function() {
    map.getCanvas().style.cursor = '';
});
```

## 常用模式：多图层统一绑定

```javascript
function bindLayerEvents(map, layerId) {
    map.on('click', layerId, function(e) {
        if (!e.features || !e.features.length) return;
        var props = e.features[0].properties;
        var html = Object.entries(props)
            .filter(function(p) { return p[1] !== null; })
            .slice(0, 8)
            .map(function(p) { return '<b>' + p[0] + ':</b> ' + p[1]; })
            .join('<br>');
        new TMapGL.Popup({ maxWidth: '300px' }).setLngLat(e.lngLat).setHTML(html).addTo(map);
    });
    map.on('mouseenter', layerId, function() { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layerId, function() { map.getCanvas().style.cursor = ''; });
}

// 为多个图层绑定
['fill-layer', 'point-layer', 'line-layer'].forEach(function(id) { bindLayerEvents(map, id); });
```

## 查询要素

```javascript
// 点击位置查询指定图层的要素
var features = map.queryRenderedFeatures(e.point, { layers: ['my-layer'] });

// 查询矩形范围
var features = map.queryRenderedFeatures([[x1, y1], [x2, y2]], { layers: ['my-layer'] });
```

## 踩坑提醒

1. 图层事件的 `e.features` 可能为空，务必判空
2. `map.on('click', 'layer-id', handler)` 只在点击该图层有要素的地方触发
3. 移除事件用 `map.off('click', 'layer-id', handler)`
