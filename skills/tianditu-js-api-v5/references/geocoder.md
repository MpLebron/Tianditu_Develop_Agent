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

## 红线规则（必须遵守）

1. 正向编码（`geocoder?ds=...`）响应只保证有 `location`，不保证有 `addressComponent`
2. 逆向编码（`geocoder?postStr=...&type=geocode`）响应中的 `result.addressComponent` 才是结构化行政区字段
3. 禁止在正向编码返回上直接读取 `data.addressComponent.*`（会导致 `Cannot read properties of undefined`）

## 常用模式：地址定位并标注（推荐两步法）

```javascript
var addr = '北京市海淀区莲花池西路28号';
geocode(addr).then(function(data) {
    if (data.status !== '0' || !data.location) return;

    var lng = Number(data.location.lon);
    var lat = Number(data.location.lat);
    map.flyTo({ center: [lng, lat], zoom: 16 });
    new TMapGL.Marker().setLngLat([lng, lat]).addTo(map);

    // 需要省/市/区等结构化字段时，必须再调逆向编码
    return reverseGeocode(lng, lat).then(function(rev) {
        var result = rev && rev.result ? rev.result : {};
        var ac = result.addressComponent || {};
        var html = ''
            + '<b>' + (result.formatted_address || addr) + '</b><br>'
            + '省市区：' + (ac.province || '') + (ac.city || '') + (ac.county || '');

        new TMapGL.Popup({ offset: [0, -30] })
            .setLngLat([lng, lat])
            .setHTML(html)
            .addTo(map);
    });
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
4. 正向编码不要读取 `data.addressComponent`；需要结构化地址请走“正向取坐标 + 逆向取地址组件”
