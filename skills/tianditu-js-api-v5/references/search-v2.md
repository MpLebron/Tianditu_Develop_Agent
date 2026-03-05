# 地名搜索 V2.0（search2）

使用天地图地名搜索 V2.0 接口（`/v2/search`）实现普通搜索、视野内搜索、周边搜索、多边形搜索、行政区划区域搜索、分类搜索、统计搜索。

## 生产建议（优先）

优先调用后端代理：

```text
GET /api/tianditu/search?...（由后端映射 queryType 与参数）
```

前端只在调试时直连官方接口。

## 统一接口

```text
GET https://api.tianditu.gov.cn/v2/search?postStr={...}&type=query&tk=${TIANDITU_TOKEN}
```

- 所有查询参数都放在 `postStr`（JSON 字符串）中
- `type` 固定为 `query`
- 推荐统一封装 URL 构造函数，避免拼参出错

## 查询类型（queryType）

- `1`：普通搜索（含地铁公交）
- `2`：视野内搜索
- `3`：周边搜索
- `7`：地名搜索（普通搜索中的地名模式）
- `10`：多边形搜索
- `12`：行政区划区域搜索
- `13`：数据分类搜索
- `14`：统计搜索

## 参数模板

### 1) 普通/地名搜索（queryType=1/7）

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

### 2) 视野内搜索（queryType=2）

```json
{
  "keyWord": "医院",
  "level": 12,
  "mapBound": "116.02524,39.83833,116.65592,39.99185",
  "queryType": 2,
  "start": 0,
  "count": 20
}
```

### 3) 周边搜索（queryType=3）

```json
{
  "keyWord": "公园",
  "pointLonlat": "116.48016,39.93136",
  "queryRadius": 5000,
  "queryType": 3,
  "start": 0,
  "count": 20
}
```

### 4) 多边形搜索（queryType=10）

```json
{
  "keyWord": "学校",
  "polygon": "x1,y1,x2,y2,x3,y3,x1,y1",
  "queryType": 10,
  "start": 0,
  "count": 20
}
```

### 5) 行政区划区域搜索（queryType=12）

```json
{
  "keyWord": "商厦",
  "specify": "156110108",
  "queryType": 12,
  "start": 0,
  "count": 20
}
```

### 6) 分类搜索（queryType=13）

```json
{
  "queryType": 13,
  "specify": "156110000",
  "mapBound": "116.02524,39.83833,116.65592,39.99185",
  "dataTypes": "法院,公园",
  "start": 0,
  "count": 20,
  "show": 2
}
```

### 7) 统计搜索（queryType=14）

```json
{
  "keyWord": "学校",
  "queryType": 14,
  "specify": "156110108"
}
```

## URL 构造函数（推荐直接复用）

```javascript
function buildSearchV2Url(postStr) {
  return 'https://api.tianditu.gov.cn/v2/search?postStr='
    + encodeURIComponent(JSON.stringify(postStr))
    + '&type=query&tk=${TIANDITU_TOKEN}';
}
```

## 响应结构与解析策略

核心返回：

- `resultType`：结果类型（1=POI，2=统计，3=行政区，4=建议词，5=线路）
- `count`：总条数
- `pois`：`resultType=1` 时返回
- `statistics`：`resultType=2` 时返回
- `area`：`resultType=3` 时返回
- `lineData`：`resultType=5` 时返回
- `status.infocode` / `status.cndesc`：服务状态码与中文描述

解析函数：

```javascript
function parseLonlat(lonlat) {
  if (!lonlat || typeof lonlat !== 'string') return null;
  var parts = lonlat.split(',');
  if (parts.length !== 2) return null;
  var lng = Number(parts[0]);
  var lat = Number(parts[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return [lng, lat];
}

function pickPois(result) {
  if (!result || Number(result.resultType) !== 1) return [];
  return Array.isArray(result.pois) ? result.pois : [];
}
```

## 结果类型分发（必须做）

```javascript
function handleSearchResult(result) {
  var type = Number(result && result.resultType);

  if (type === 1) {
    // POI 点：渲染 Marker / 点图层
    return { mode: 'poi', data: result.pois || [] };
  }

  if (type === 2) {
    // 统计：渲染侧栏统计卡片，通常不绘制点图层
    return { mode: 'statistics', data: result.statistics || [] };
  }

  if (type === 3) {
    // 行政区：使用 area[].bound / area[].lonlat 做定位
    return { mode: 'admin', data: result.area || [] };
  }

  if (type === 4) {
    // 建议词：引导用户跳转建议行政区
    return { mode: 'prompt', data: result.prompt || null };
  }

  if (type === 5) {
    // 线路结果：公交线/站点相关
    return { mode: 'line', data: result.lineData || [] };
  }

  return { mode: 'unknown', data: result };
}
```

## 服务状态码（常见）

- `1000`：成功
- `2001`：参数错误
- `2002`：参数 JSON 格式错误
- `2003`：缺少必填参数
- `2004`：枚举值错误
- `2005`：经纬度错误
- `2006`：经纬度越界 / 点量超限
- `2007`：分页或条数越界
- `3000`：服务端错误
- `3001`：无数据

建议统一错误处理：

```javascript
function unwrapSearchStatus(result) {
  var status = result && result.status;
  if (!status) return { ok: true, code: 1000, message: 'OK' };
  var code = Number(status.infocode);
  var message = status.cndesc || '未知状态';
  return { ok: code === 1000, code: code, message: message };
}
```

> 注意：`status.cndesc = "服务正常"` 不代表错误；只有 `infocode !== 1000` 才算失败。

## 常用场景代码片段

### A. 视野内搜索（随地图范围变化）

```javascript
function boundsToMapBound(bounds) {
  var sw = bounds.getSouthWest();
  var ne = bounds.getNorthEast();
  return [sw.lng, sw.lat, ne.lng, ne.lat].join(',');
}

function searchInView(map, keyword) {
  var level = Math.round(map.getZoom());
  var mapBound = boundsToMapBound(map.getBounds());

  var postStr = {
    keyWord: keyword,
    level: level,
    mapBound: mapBound,
    queryType: 2,
    start: 0,
    count: 20,
    show: 2,
  };

  return fetch(buildSearchV2Url(postStr)).then(function (r) { return r.json(); });
}
```

### B. 周边搜索（点选中心 + 半径）

```javascript
function searchNearby(keyword, center, radius) {
  var postStr = {
    keyWord: keyword,
    pointLonlat: center[0] + ',' + center[1],
    queryRadius: radius,
    queryType: 3,
    start: 0,
    count: 20,
  };
  return fetch(buildSearchV2Url(postStr)).then(function (r) { return r.json(); });
}
```

## 红线规则（必须遵守）

1. `postStr` 必须 `JSON.stringify` 后再 `encodeURIComponent`。
2. `count` 合法范围是 `1-300`，`start` 合法范围是 `0-300`。
3. `queryType` 与参数必须匹配：
   - `2` 必须有 `mapBound` + `level`
   - `3` 必须有 `pointLonlat` + `queryRadius`
   - `10` 必须有闭合 `polygon`
   - `12/13/14` 涉及行政区时需 `specify`
4. `resultType` 不同要走不同渲染分支，禁止把统计/行政结果当 POI 画点。
5. `status.infocode !== 1000` 或 `3001` 无数据时要给可见提示，不要静默失败。
6. 必须维护 `loading / ready / empty / error` 四态，禁止请求结束后仍显示 loading。

## 与现有文档的关系

- 需要公交/地铁换乘路径规划：读取 `references/search-transit.md`
- 需要驾车/步行路径规划：读取 `references/search-route.md`
- 需要地理编码：读取 `references/geocoder.md`

`search-v2` 负责“地名搜索 V2.0 全家桶”的查询类能力，不替代路线规划接口；行政区轮廓/层级查询优先看 `references/search-admin.md`（`/v2/administrative`）。
