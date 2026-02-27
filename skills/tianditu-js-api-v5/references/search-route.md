# 路径规划

调用天地图路线规划 API 获取驾车/公交/步行路线并在地图上显示。

## 天地图驾车路线 API

```
GET https://api.tianditu.gov.cn/drive?postStr={"orig":"116.35,39.92","dest":"116.45,39.88","style":"0"}&type=search&tk=${TIANDITU_TOKEN}
```

## 响应结构

```json
{
    "result": {
        "routes": [{
            "distance": "12.5km",
            "duration": "25min",
            "routelatlon": "116.35,39.92;116.36,39.91;...;116.45,39.88"
        }]
    }
}
```

## 路线坐标解析

```javascript
function parseRoute(routelatlon) {
    return routelatlon.split(';').map(function(p) {
        var parts = p.split(',');
        return [parseFloat(parts[0]), parseFloat(parts[1])];
    });
}
```

## 常用模式：显示驾车路线

```javascript
var routeCoords = [...]; // 解析后的坐标数组
var originCoord = [116.35, 39.92];
var destCoord = [116.45, 39.88];

map.on('load', function() {
    // 路线
    map.addSource('route', {
        type: 'geojson',
        data: {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: routeCoords }
        }
    });
    map.addLayer({
        id: 'route-line', type: 'line', source: 'route',
        paint: { 'line-color': '#1890ff', 'line-width': 6, 'line-opacity': 0.8 },
        layout: { 'line-cap': 'round', 'line-join': 'round' }
    });

    // 起点标记
    var startEl = document.createElement('div');
    startEl.innerHTML = '<div style="background:#52c41a;color:white;padding:4px 8px;border-radius:4px;font-size:12px;">起点</div>';
    new TMapGL.Marker({ element: startEl }).setLngLat(originCoord).addTo(map);

    // 终点标记
    var endEl = document.createElement('div');
    endEl.innerHTML = '<div style="background:#f5222d;color:white;padding:4px 8px;border-radius:4px;font-size:12px;">终点</div>';
    new TMapGL.Marker({ element: endEl }).setLngLat(destCoord).addTo(map);

    // 自适应视野
    var bounds = new TMapGL.LngLatBounds();
    routeCoords.forEach(function(c) { bounds.extend(c); });
    map.fitBounds(bounds, { padding: 60 });
});
```

## 路线信息面板

```html
<div class="route-info" style="position:absolute;top:10px;left:10px;z-index:1000;background:white;padding:12px 16px;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.15);">
    <h3 style="margin:0 0 8px;">起点 → 终点</h3>
    <div style="display:flex;gap:16px;">
        <div style="text-align:center;">
            <div style="font-size:18px;font-weight:600;color:#1890ff;">12.5</div>
            <div style="font-size:12px;color:#999;">公里</div>
        </div>
        <div style="text-align:center;">
            <div style="font-size:18px;font-weight:600;color:#1890ff;">25</div>
            <div style="font-size:12px;color:#999;">分钟</div>
        </div>
    </div>
</div>
```

## API 参数

| 参数 | 说明 |
|------|------|
| `orig` | 起点 `"经度,纬度"` |
| `dest` | 终点 `"经度,纬度"` |
| `style` | 0=最快, 1=最短, 2=不走高速, 3=步行 |

## 踩坑提醒

1. `routelatlon` 格式是 `"lng,lat;lng,lat;..."` 字符串
2. `distance` 和 `duration` 是带单位的字符串（"12.5km"），需自行解析
3. 建议通过后端代理调用，结合地理编码将地名转坐标
