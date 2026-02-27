# 地理编码与逆地理编码

地址 → 坐标（正向编码）、坐标 → 地址（逆向编码）。

## 天地图地理编码 API

### 正向编码（地址转坐标）

```
GET https://api.tianditu.gov.cn/geocoder?ds={"keyWord":"北京市海淀区莲花池西路28号"}&tk=${TIANDITU_TOKEN}
```

响应：
```json
{
    "status": "0",
    "location": { "lon": 116.32, "lat": 39.90 }
}
```

### 逆向编码（坐标转地址）

```
GET https://api.tianditu.gov.cn/geocoder?postStr={"lon":116.40,"lat":39.90,"ver":1}&type=geocode&tk=${TIANDITU_TOKEN}
```

响应：
```json
{
    "status": "0",
    "result": {
        "formatted_address": "北京市东城区...",
        "addressComponent": {
            "province": "北京市",
            "city": "北京市",
            "county": "东城区",
            "road": "...",
            "poi": "..."
        }
    }
}
```

## 前端直接调用

```javascript
// 正向编码
function geocode(address) {
    var url = 'https://api.tianditu.gov.cn/geocoder?ds=' +
        encodeURIComponent(JSON.stringify({ keyWord: address })) +
        '&tk=' + TIANDITU_TOKEN;

    return fetch(url).then(function(r) { return r.json(); });
}

// 逆向编码
function reverseGeocode(lng, lat) {
    var url = 'https://api.tianditu.gov.cn/geocoder?postStr=' +
        encodeURIComponent(JSON.stringify({ lon: lng, lat: lat, ver: 1 })) +
        '&type=geocode&tk=' + TIANDITU_TOKEN;

    return fetch(url).then(function(r) { return r.json(); });
}
```

## 常用模式：地址定位并标注

```javascript
geocode('北京市海淀区莲花池西路28号').then(function(data) {
    if (data.status === '0' && data.location) {
        var lng = data.location.lon;
        var lat = data.location.lat;

        map.flyTo({ center: [lng, lat], zoom: 16 });

        new TMapGL.Marker().setLngLat([lng, lat]).addTo(map);
        new TMapGL.Popup({ offset: [0, -30] })
            .setLngLat([lng, lat])
            .setHTML('<b>北京市海淀区莲花池西路28号</b>')
            .addTo(map);
    }
});
```

## 常用模式：点击地图查看地址

```javascript
map.on('click', function(e) {
    reverseGeocode(e.lngLat.lng, e.lngLat.lat).then(function(data) {
        if (data.status === '0' && data.result) {
            new TMapGL.Popup()
                .setLngLat([e.lngLat.lng, e.lngLat.lat])
                .setHTML('<b>' + data.result.formatted_address + '</b>')
                .addTo(map);
        }
    });
});
```

## 踩坑提醒

1. API 参数需要 `encodeURIComponent(JSON.stringify(...))` 编码
2. 正向编码的参数名是 `ds`，逆向是 `postStr` + `type=geocode`
3. 返回的坐标是 `{ lon, lat }` 对象，不是数组
