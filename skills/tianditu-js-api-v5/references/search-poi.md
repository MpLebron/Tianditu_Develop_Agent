# POI 搜索（V2，代理优先）

基于天地图搜索服务 V2 做 POI 检索。  
**默认优先后端代理**：`/api/tianditu/search`（避免 token 暴露、参数拼写差异和跨域问题）。

## 推荐接口（代理）

```text
GET /api/tianditu/search?keyword=医院&type=nearby&lng=116.404&lat=39.915&radius=3000&count=20&show=2
```

常用 `type`（代理会映射 queryType）：

- `type=normal` -> `queryType=1`（普通搜索）
- `type=view` -> `queryType=2`（视野内搜索）
- `type=nearby` -> `queryType=3`（周边搜索）
- `type=polygon` -> `queryType=10`（多边形搜索）

## 官方直连（仅调试）

```text
GET https://api.tianditu.gov.cn/v2/search?postStr={...}&type=query&tk=${TIANDITU_TOKEN}
```

> 生产页面不要优先用直连。

## 参数模板

### A. 普通搜索（queryType=1）

```json
{
  "keyWord": "北京大学",
  "level": 12,
  "mapBound": "116.02524,39.83833,116.65592,39.99185",
  "queryType": 1,
  "start": 0,
  "count": 20,
  "show": 2
}
```

### B. 视野内搜索（queryType=2）

```json
{
  "keyWord": "医院",
  "level": 12,
  "mapBound": "116.02524,39.83833,116.65592,39.99185",
  "queryType": 2,
  "start": 0,
  "count": 20,
  "show": 2
}
```

### C. 周边搜索（queryType=3）

```json
{
  "keyWord": "公园",
  "pointLonlat": "116.404,39.915",
  "queryRadius": 3000,
  "queryType": 3,
  "start": 0,
  "count": 20,
  "show": 2
}
```

## 统一状态机（必须）

必须维护四态：

- `loading`
- `ready`
- `empty`
- `error`

禁止“请求结束后仍显示正在加载”。

## 稳健响应判定（避免“服务正常却报错”）

代理响应是两层结构：

- 第一层：`payload.success / payload.error`
- 第二层：`payload.data.resultType / payload.data.pois / payload.data.status`

禁止直接用 `res.json()` 顶层对象读取 `resultType/pois`。

```javascript
function unwrapProxyPayload(payload) {
  if (!payload || payload.success !== true) {
    throw new Error((payload && payload.error) || '代理请求失败');
  }
  return payload.data || {};
}

function normalizeStatus(status) {
  // 天地图 status 可能是对象、数组、或缺失
  if (!status) return { code: 1000, message: 'OK' };
  if (Array.isArray(status)) {
    var s0 = status[0] || {};
    return {
      code: Number(s0.infocode),
      message: String(s0.cndesc || ''),
    };
  }
  return {
    code: Number(status.infocode),
    message: String(status.cndesc || ''),
  };
}

function assertSearchSuccess(data) {
  var st = normalizeStatus(data && data.status);
  // 只有 infocode !== 1000 才是错误；"服务正常" 不是错误
  if (!Number.isFinite(st.code)) return;
  if (st.code !== 1000) throw new Error(st.message || ('搜索失败，infocode=' + st.code));
}

function extractPoiList(data) {
  var resultType = Number(data && data.resultType);
  if (resultType !== 1) return [];
  return Array.isArray(data.pois) ? data.pois : [];
}
```

## 周边 POI 搜索示例（代理 + 四态）

```javascript
var state = 'loading'; // loading | ready | empty | error

function setState(next, message) {
  state = next;
  var el = document.getElementById('stateBox');
  if (el) el.textContent = next + (message ? ('：' + message) : '');
}

function parseLonlat(lonlat) {
  if (!lonlat || typeof lonlat !== 'string') return null;
  var parts = lonlat.split(',');
  if (parts.length !== 2) return null;
  var lng = Number(parts[0]);
  var lat = Number(parts[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return [lng, lat];
}

function searchNearbyPois(keyword, center, radius) {
  setState('loading', '正在搜索');

  var url = new URL('/api/tianditu/search', window.location.origin);
  url.searchParams.set('keyword', keyword);
  url.searchParams.set('type', 'nearby');
  url.searchParams.set('lng', String(center[0]));
  url.searchParams.set('lat', String(center[1]));
  url.searchParams.set('radius', String(radius));
  url.searchParams.set('count', '20');
  url.searchParams.set('show', '2');

  return fetch(url.toString())
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(payload) {
      var data = unwrapProxyPayload(payload);
      assertSearchSuccess(data);
      var pois = extractPoiList(data);

      if (!pois.length) {
        setState('empty', '未找到匹配结果');
        return [];
      }

      var features = pois
        .map(function(p) {
          var coord = parseLonlat(p.lonlat);
          if (!coord) return null;
          return {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: coord },
            properties: {
              name: p.name || '',
              address: p.address || '',
              distance: p.distance || '',
            },
          };
        })
        .filter(Boolean);

      if (!features.length) {
        setState('empty', '结果存在但坐标不可用');
        return [];
      }

      setState('ready', '加载完成');
      return features;
    })
    .catch(function(err) {
      setState('error', err.message);
      throw err;
    });
}
```

## 红线规则（必须遵守）

1. 优先走 `/api/tianditu/search` 代理，不要默认直连官方接口。
2. `queryType=3` 必须有 `pointLonlat` + `queryRadius`（或代理的 `lng/lat/radius`）。
3. `infocode=1000` 视为成功；`cndesc="服务正常"` 不是异常。
4. `resultType !== 1` 时不要强行按 POI 渲染点图层。
5. 请求结束必须收敛状态到 `ready/empty/error`，不得卡在 `loading`。
6. 代理返回必须先解包 `payload.data`，严禁把 `res.json()` 顶层对象直接当 `resultType/pois` 读取。
