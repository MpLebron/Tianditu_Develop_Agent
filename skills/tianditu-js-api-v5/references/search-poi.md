# POI 搜索

调用天地图搜索 API 查找兴趣点（POI），并在地图上标注。

## 天地图搜索 API

### 普通搜索

```
GET https://api.tianditu.gov.cn/v2/search?postStr={"keyWord":"医院","level":12,"mapBound":"116.02,39.60,116.78,40.20","queryType":1,"start":0,"count":20}&type=query&tk=${TIANDITU_TOKEN}
```

### 周边搜索

```
GET https://api.tianditu.gov.cn/v2/search?postStr={"keyWord":"餐厅","queryType":3,"pointLonlat":"116.40,39.90","queryRadius":5000,"start":0,"count":20}&type=query&tk=${TIANDITU_TOKEN}
```

## 响应结构

```json
{
    "count": "20",
    "pois": [
        {
            "name": "北京协和医院",
            "lonlat": "116.42,39.91",
            "address": "东城区帅府园1号"
        }
    ]
}
```

## 常用模式：搜索并标注

```javascript
var poiData = [...]; // 从后端 API 获取的 POI 列表

map.on('load', function() {
    var bounds = new TMapGL.LngLatBounds();

    poiData.forEach(function(poi) {
        var coords = poi.lonlat.split(',');
        var lng = parseFloat(coords[0]);
        var lat = parseFloat(coords[1]);
        bounds.extend([lng, lat]);

        // 创建标记
        var el = document.createElement('div');
        el.style.backgroundImage = 'url(http://lbs.tianditu.gov.cn/js-api-v5-portal/image/marker.png)';
        el.style.width = '37px';
        el.style.height = '33px';
        el.style.cursor = 'pointer';

        var marker = new TMapGL.Marker({ element: el })
            .setLngLat([lng, lat])
            .addTo(map);

        // 点击弹窗
        var popup = new TMapGL.Popup({ offset: [0, -30] })
            .setHTML('<b>' + poi.name + '</b><br><span style="color:#666;font-size:12px;">' + (poi.address || '') + '</span>');

        el.addEventListener('click', function() {
            popup.setLngLat([lng, lat]).addTo(map);
        });
    });

    // 自适应视野
    if (poiData.length > 1) {
        map.fitBounds(bounds, { padding: 50 });
    }
});
```

## 搜索参数说明

| 参数 | 说明 |
|------|------|
| `keyWord` | 搜索关键词 |
| `level` | 地图级别 |
| `mapBound` | 搜索范围 `"西经,南纬,东经,北纬"` |
| `queryType` | 1=普通搜索, 3=周边搜索, 7=行政区搜索 |
| `pointLonlat` | 周边搜索中心 `"经度,纬度"` |
| `queryRadius` | 周边搜索半径（米） |
| `start` | 分页起始 |
| `count` | 每页数量（最大 20） |

## 踩坑提醒

1. POI 的坐标格式是 `"lng,lat"` 字符串，需要 `split(',')` 解析
2. 搜索 API 的参数需要 JSON 字符串 + URL 编码
3. 建议通过后端代理调用，避免前端暴露 token
