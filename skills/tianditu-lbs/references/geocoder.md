# 地理编码与逆地理编码

地址 → 坐标（正向编码）、坐标 → 地址（逆向编码）。

## 推荐调用方式（优先代理）

```text
GET /api/tianditu/geocode?address=江苏省苏州市吴江区七都镇开弦弓村
GET /api/tianditu/reverse-geocode?lng=116.40&lat=39.90
```

代理返回统一结构：

```json
{ "success": true, "data": { "...": "..." } }
```

前端应先判断 `success === true`，再读取 `data`。

当前项目里，正向编码代理的参数名是 `address`，不是 `query`：

```javascript
function geocodeByProxy(address) {
    var url = new URL('/api/tianditu/geocode', window.location.origin);
    url.searchParams.set('address', address);

    return fetch(url.toString())
        .then(function(r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        })
        .then(function(payload) {
            if (!payload || payload.success !== true) {
                throw new Error((payload && payload.error) || '地理编码失败');
            }
            return payload.data || {};
        });
}
```

读取代理结果时，应写成：

```javascript
geocodeByProxy('自然资源部').then(function(data) {
    var location = data.location || {};
    var lng = Number(location.lon);
    var lat = Number(location.lat);
});
```

不要误写成：

```javascript
fetch('/api/tianditu/geocode?query=自然资源部')
// 或读取 data.lon / data.lat
```

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
4. 禁止使用 `https://api.tianditu.gov.cn/v5/geocoder`
5. 禁止使用 `https://api.tianditu.gov.cn/geocoder?address=...`（参数格式错误）
6. 必须维护 `loading / ready / empty / error` 四态，避免界面永久停在 loading
7. 当前项目代理里，正向编码只接受 `/api/tianditu/geocode?address=...`，不要误写成 `query`
8. 当前项目代理返回坐标位于 `payload.data.location.lon / lat`，不要误读成 `payload.data.lon / lat`
9. 如果编码结果会立刻 `addTo(map)`、`flyTo(...)` 或 `fitBounds(...)`，必须等 `map.on('load', ...)` 完成后再启动编码流程

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
5. 在当前项目运行时里，更推荐走 `/api/tianditu/geocode?address=...` 代理；只有离开当前项目单独写官方 demo 时，才直接使用 `geocoder?ds=...`
6. 如果后续还要做“命名地点 -> 路线规划”，先拿 `location.lon / location.lat`，再进入 `/api/tianditu/drive` 或 `/api/tianditu/transit`
