# 聚合图 (Cluster)

将密集的点数据自动聚合，缩放时动态展开。

## 基础用法

```javascript
// 开启聚合的数据源
map.addSource('cluster-source', {
    type: 'geojson',
    data: pointsGeoJSON,
    cluster: true,
    clusterMaxZoom: 14,
    clusterRadius: 50
});

// 聚合圆（按数量分级着色）
map.addLayer({
    id: 'clusters',
    type: 'circle',
    source: 'cluster-source',
    filter: ['has', 'point_count'],
    paint: {
        'circle-color': [
            'step', ['get', 'point_count'],
            '#51bbd6', 10,    // < 10: 蓝色
            '#f1f075', 50,    // 10-50: 黄色
            '#f28cb1'         // > 50: 粉色
        ],
        'circle-radius': [
            'step', ['get', 'point_count'],
            15, 10,   // < 10: 半径 15px
            20, 50,   // 10-50: 半径 20px
            25        // > 50: 半径 25px
        ]
    }
});

// 聚合数量标注
map.addLayer({
    id: 'cluster-count',
    type: 'symbol',
    source: 'cluster-source',
    filter: ['has', 'point_count'],
    layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': ['WenQuanYi Micro Hei Mono'],
        'text-size': 12
    },
    paint: { 'text-color': '#333' }
});

// 未聚合的单个点
map.addLayer({
    id: 'unclustered-point',
    type: 'circle',
    source: 'cluster-source',
    filter: ['!', ['has', 'point_count']],
    paint: {
        'circle-color': '#11b4da',
        'circle-radius': 8,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff'
    }
});
```

## Source 聚合配置

| 参数 | 类型 | 说明 |
|------|------|------|
| `cluster` | Boolean | 开启聚合 |
| `clusterMaxZoom` | Number | 聚合生效的最大缩放级别 |
| `clusterRadius` | Number | 聚合半径（像素） |

## 点击聚合圆放大查看

```javascript
map.on('click', 'clusters', function(e) {
    var features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
    var clusterId = features[0].properties.cluster_id;
    map.getSource('cluster-source').getClusterExpansionZoom(clusterId, function(err, zoom) {
        if (err) return;
        map.easeTo({ center: features[0].geometry.coordinates, zoom: zoom });
    });
});
```

## 点击单个点显示弹窗

```javascript
map.on('click', 'unclustered-point', function(e) {
    var props = e.features[0].properties;
    var html = Object.entries(props)
        .filter(function(p) { return p[1] !== null && p[1] !== ''; })
        .slice(0, 10)
        .map(function(p) { return '<b>' + p[0] + ':</b> ' + p[1]; })
        .join('<br>');
    new TMapGL.Popup({ maxWidth: '300px' })
        .setLngLat(e.features[0].geometry.coordinates)
        .setHTML(html)
        .addTo(map);
});
```

## 鼠标悬停指针

```javascript
['clusters', 'unclustered-point'].forEach(function(id) {
    map.on('mouseenter', id, function() { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', id, function() { map.getCanvas().style.cursor = ''; });
});
```

## 踩坑提醒

1. 聚合 filter 用 `['has', 'point_count']` 区分聚合/非聚合要素
2. `point_count_abbreviated` 是自动生成的缩写数字（如 1.2k）
3. `getClusterExpansionZoom` 是异步回调，不是 Promise
4. 聚合数量文本属于 `symbol + text-field`，必须显式设置 `text-font: ['WenQuanYi Micro Hei Mono']`，不要使用 `Microsoft YaHei` 之类页面字体名
