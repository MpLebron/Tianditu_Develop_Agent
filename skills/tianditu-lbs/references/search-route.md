# 路径规划（驾车）

使用天地图驾车服务 API，根据起点/终点（可选途经点）获取真实路线并渲染。  
**优先走后端代理**：`/api/tianditu/drive`（避免 token 暴露与跨域/解析差异）。

## 接口

```text
GET https://api.tianditu.gov.cn/drive?postStr={...}&type=search&tk=${TIANDITU_TOKEN}
```

代理接口（推荐）：

```text
GET /api/tianditu/drive?origLng=116.404&origLat=39.915&destLng=121.474&destLat=31.230&style=0
```

`postStr` 字段：

- `orig`: `"经度,纬度"`（必填）
- `dest`: `"经度,纬度"`（必填）
- `mid`: `"经度,纬度;经度,纬度"`（可选，途经点）
- `style`: `"0" | "1" | "2" | "3"`（0=最快,1=最短,2=避开高速,3=步行）

## 返回格式（重点）

该接口常见返回是 **XML**（不是 JSON）。核心字段：

- `<distance>`：总里程（公里）
- `<duration>`：总时长（秒）
- `<routelatlon>`：整条路线 `"lng,lat;lng,lat;..."`
- `<mapinfo><center>`：建议中心点

在当前项目里，前端通常不直接面对这段 XML，而是通过 `/api/tianditu/drive` 代理拿到：

```json
{
  "success": true,
  "data": {
    "format": "xml",
    "distance": 6400,
    "duration": 900,
    "routelatlon": "116.35506,39.92277;...",
    "mapinfo": {
      "center": "116.3762,39.9146",
      "scale": "11"
    }
  }
}
```

也就是说，项目内前端代码应直接读取 `payload.data.distance / duration / routelatlon`，不要再自行做 XML 解析。

## 红线规则（必须遵守）

1. 禁止写模拟路线（如 `var routeCoords = [...]` 占位后直接渲染）
2. 必须调用真实 `drive` API 并解析返回结果（优先代理）
3. 直连官方 `drive` 端点时，不要假设返回 JSON；默认按 XML 解析
4. 若 API 失败，应显示错误信息，不要偷偷回退成“北京-上海直线”
5. 必须维护 `loading / ready / empty / error` 四态，不允许一直 Loading
6. 如果起点、终点是地点名、机构名或地址，而不是显式经纬度，优先先走 `/api/tianditu/geocode?address=...`，不要凭印象手写坐标

## 路线坐标解析

```javascript
function parseLatLonPairs(raw) {
  if (!raw) return [];
  return raw
    .split(';')
    .map(function (pair) {
      var parts = pair.split(',');
      if (parts.length !== 2) return null;
      var lng = Number(parts[0]);
      var lat = Number(parts[1]);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
      return [lng, lat];
    })
    .filter(Boolean);
}
```

## 常用模式：命名地点先地理编码，再做路线规划

```javascript
function geocodeByProxy(address) {
  var url = new URL('/api/tianditu/geocode', window.location.origin);
  url.searchParams.set('address', address);

  return fetch(url.toString())
    .then(function (res) {
      if (!res.ok) throw new Error('地理编码失败: HTTP ' + res.status);
      return res.json();
    })
    .then(function (payload) {
      if (!payload || payload.success !== true) {
        throw new Error((payload && payload.error) || '地理编码失败');
      }

      var location = (payload.data && payload.data.location) || {};
      var lng = Number(location.lon);
      var lat = Number(location.lat);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        throw new Error('地理编码未返回有效坐标');
      }
      return [lng, lat];
    });
}

map.on('load', function () {
  Promise.all([
    geocodeByProxy('国家基础地理信息中心'),
    geocodeByProxy('自然资源部'),
  ]).then(function (coordsPair) {
    var startCoords = coordsPair[0];
    var endCoords = coordsPair[1];
    return fetch(buildDriveProxyUrl(startCoords, endCoords, 0)).then(function (res) {
      return res.json();
    });
  });
});
```

这一类场景里，默认不要直接写：

```javascript
var startCoords = [116.39751, 39.90854];
var endCoords = [116.404, 39.915];
```

除非用户已经明确给出了这两个坐标。

## XML 解析（推荐）

```javascript
function parseDriveXml(xmlText) {
  var doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('路线接口返回内容不是有效 XML');
  }

  function read(tagName) {
    var el = doc.getElementsByTagName(tagName)[0];
    return el ? (el.textContent || '').trim() : '';
  }

  var distanceKm = Number(read('distance'));
  var durationSec = Number(read('duration'));
  var routeRaw = read('routelatlon');
  var coords = parseLatLonPairs(routeRaw);

  return {
    distanceKm: Number.isFinite(distanceKm) ? distanceKm : 0,
    durationSec: Number.isFinite(durationSec) ? durationSec : 0,
    coords: coords,
    center: parseLatLonPairs(read('center'))[0] || null,
  };
}
```

## 常用模式：北京 → 上海（真实驾车路线）

```javascript
var beijing = [116.404, 39.915];
var shanghai = [121.474, 31.230];

function buildDriveProxyUrl(orig, dest, style) {
  var url = new URL('/api/tianditu/drive', window.location.origin);
  url.searchParams.set('origLng', String(orig[0]));
  url.searchParams.set('origLat', String(orig[1]));
  url.searchParams.set('destLng', String(dest[0]));
  url.searchParams.set('destLat', String(dest[1]));
  url.searchParams.set('style', String(style || 0));
  return url.toString();
}

map.on('load', function () {
  fetch(buildDriveProxyUrl(beijing, shanghai, 0))
    .then(function (res) {
      if (!res.ok) throw new Error('路线请求失败: HTTP ' + res.status);
      return res.json();
    })
    .then(function (payload) {
      if (!payload || payload.success !== true) {
        throw new Error((payload && payload.error) || '代理请求失败');
      }
      var route = payload.data || {};
      // 代理已兼容 XML，统一返回 distance / duration / routelatlon
      var distanceKm = Number(route.distance);
      var durationSec = Number(route.duration);
      var coords = parseLatLonPairs(route.routelatlon || '');
      if (coords.length < 2) {
        throw new Error('未获取到可绘制的路线坐标');
      }

      var hasLayerApi = map && map.getLayer;
      var hasSourceApi = map && map.getSource;
      if (hasLayerApi && map.getLayer('route-line')) map.removeLayer('route-line');
      if (hasSourceApi && map.getSource('route')) map.removeSource('route');

      map.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
        },
      });

      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        paint: {
          'line-color': '#1890ff',
          'line-width': 6,
          'line-opacity': 0.85,
        },
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
      });

      new TMapGL.Marker().setLngLat(beijing).addTo(map);
      new TMapGL.Marker().setLngLat(shanghai).addTo(map);

      var bounds = new TMapGL.LngLatBounds();
      var hasBoundsPoint = false;
      coords.forEach(function (c) {
        if (!Array.isArray(c) || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) return;
        bounds.extend(c);
        hasBoundsPoint = true;
      });
      if (hasBoundsPoint) {
        map.fitBounds(bounds, { padding: 60 });
      }

      // 路线信息面板（真实数据）
      var hours = Number.isFinite(durationSec) ? (durationSec / 3600) : 0;
      document.getElementById('distanceVal').textContent = Number.isFinite(distanceKm) ? distanceKm.toFixed(1) : '-';
      document.getElementById('durationVal').textContent = Number.isFinite(hours) ? hours.toFixed(1) : '-';
    })
    .catch(function (err) {
      document.getElementById('routeError').textContent = '路线规划失败：' + err.message;
    });
});
```

## 路线信息面板（动态值）

```html
<div class="route-info" style="position:absolute;top:10px;left:10px;z-index:1000;background:#fff;padding:12px 16px;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.15);">
  <h3 style="margin:0 0 8px;">北京 → 上海</h3>
  <div style="display:flex;gap:16px;">
    <div style="text-align:center;">
      <div id="distanceVal" style="font-size:18px;font-weight:600;color:#1890ff;">-</div>
      <div style="font-size:12px;color:#999;">公里</div>
    </div>
    <div style="text-align:center;">
      <div id="durationVal" style="font-size:18px;font-weight:600;color:#1890ff;">-</div>
      <div style="font-size:12px;color:#999;">小时</div>
    </div>
  </div>
  <div id="routeError" style="margin-top:8px;color:#d4380d;font-size:12px;"></div>
</div>
```

## 踩坑提醒

1. `drive` 常见返回 XML：不要直接 `res.json()`
2. `routelatlon` 是字符串，需按 `;` 和 `,` 解析为 `[lng, lat]`
3. 在当前项目代理里，前端直接读 `payload.data.distance / duration / routelatlon`
4. `distance` 视为公里、`duration` 视为秒；不要把 `distance` 先 `/1000`
5. `style` 建议传字符串 `"0"~"3"`，避免类型歧义
6. 只要拿不到真实路线，就报错，不要回退假坐标
7. 若后续会重复规划路线，重绘前先清理已有 source/layer，避免重复 ID 报错
8. 命名地点路线规划时，当前项目的地理编码代理参数名是 `address`，不是 `query`
9. 当前项目的地理编码代理结果要读 `payload.data.location.lon / lat`，不是 `payload.data.lon / lat`
10. 起终点标记与弹窗仍然使用标准 TMapGL v5 写法：`new TMapGL.Marker().setLngLat(...).addTo(map)`，以及 `new TMapGL.Popup().setLngLat(...).setHTML(...).addTo(map)`
11. `TMapGL.LngLatBounds` 没有 `isValid()` 方法；路线坐标自动缩放时先确认至少 extend 过一个有效坐标，再决定是否 `fitBounds`
