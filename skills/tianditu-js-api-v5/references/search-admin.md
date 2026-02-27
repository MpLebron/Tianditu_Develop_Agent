# 行政区划查询

查询行政区划信息和边界 GeoJSON，在地图上显示行政区域。

## 天地图行政区划 API

```
GET https://api.tianditu.gov.cn/administrative?postStr={"searchWord":"北京市","searchType":"1","needSubInfo":"false","needAll":"false","needPolygon":"true","needPre":"false"}&tk=${TIANDITU_TOKEN}
```

## 响应结构

```json
{
    "data": [{
        "name": "北京市",
        "adminCode": "110000",
        "center": { "lng": 116.40, "lat": 39.90 },
        "polygon": "116.10,39.70;116.80,39.70;116.80,40.20;116.10,40.20"
    }]
}
```

## 常用模式：显示行政区划边界

```javascript
var adminGeoJSON = { /* 从 API 解析的 GeoJSON */ };

map.on('load', function() {
    map.addSource('admin', { type: 'geojson', data: adminGeoJSON });

    // 填充
    map.addLayer({
        id: 'admin-fill', type: 'fill', source: 'admin',
        paint: { 'fill-color': '#1890ff', 'fill-opacity': 0.2 }
    });

    // 边界线
    map.addLayer({
        id: 'admin-line', type: 'line', source: 'admin',
        paint: { 'line-color': '#1890ff', 'line-width': 3, 'line-opacity': 0.8 }
    });

    // 自适应视野
    var bounds = new TMapGL.LngLatBounds();
    function addCoords(coords) {
        if (typeof coords[0] === 'number') bounds.extend(coords);
        else coords.forEach(addCoords);
    }
    addCoords(adminGeoJSON.geometry.coordinates);
    map.fitBounds(bounds, { padding: 30 });
});
```

## 搜索参数

| 参数 | 说明 |
|------|------|
| `searchWord` | 搜索关键词（如"北京市"） |
| `searchType` | 1=按名称, 2=按编码 |
| `needPolygon` | "true"=返回边界坐标 |
| `needSubInfo` | "true"=返回子级信息 |

## polygon 解析为 GeoJSON

```javascript
function polygonToGeoJSON(polygonStr) {
    var coords = polygonStr.split(';').map(function(p) {
        var parts = p.split(',');
        return [parseFloat(parts[0]), parseFloat(parts[1])];
    });
    coords.push(coords[0]); // 闭合
    return {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [coords] }
    };
}
```

## 踩坑提醒

1. `polygon` 返回格式是 `"lng,lat;lng,lat;..."` 字符串，需自行解析
2. 需要将 polygon 字符串转为 GeoJSON 的 Polygon 格式
3. 建议通过后端代理调用 API
