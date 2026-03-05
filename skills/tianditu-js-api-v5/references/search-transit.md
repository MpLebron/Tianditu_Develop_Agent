# 公交/地铁路线规划（transit）

使用天地图公交规划接口查询公交/地铁换乘方案，并在地图上展示线路与方案列表。  
优先走后端代理：`/api/tianditu/transit`（避免前端 token 暴露与参数拼写误差）。

## 接口

```text
GET https://api.tianditu.gov.cn/transit?type=busline&postStr={...}&tk=${TIANDITU_TOKEN}
```

代理接口（推荐）：

```text
GET /api/tianditu/transit?startLng=116.427562&startLat=39.939677&endLng=116.349329&endLat=39.939132&lineType=1
```

`postStr` 常用字段：

- `startposition`: `"经度,纬度"`（出发点，必填）
- `endposition`: `"经度,纬度"`（终点，必填）
- `linetype`: 规划类型（字符串）
  - `1`：较快捷
  - `2`：少换乘
  - `3`：少步行
  - `4`：不坐地铁

## 返回格式（重点字段）

- `resultCode`: `0` 表示正常返回
- `hasSubway`: 是否包含地铁（布尔/0/1）
- `results[]`: 每个策略的结果集合
- `results[].lines[]`: 可选路线方案
- `lines[].lineName`: 方案名称
- `lines[].segments[]`: 换乘分段
- `segments[].segmentType`: 分段类型（不同城市/数据源可能不稳定，建议结合线路名判断）
- `segments[].segmentLine`: 可能是对象，也可能是数组
- `segments[].segmentLine[].linePoint`: 坐标串 `"lng,lat;lng,lat;..."`
- `segments[].segmentLine[].segmentTime`: 分段时间（分钟）
- `segments[].segmentLine[].segmentDistance`: 分段距离（米）

## 易错点（0km / 0min 的根因）

`0km/0min` 通常由字段路径取错导致，常见错误：

- 误用 `line.distance`（很多返回中没有这个字段）
- 误用 `seg.segmentTime` / `seg.distance`（实际在 `seg.segmentLine[*]` 内）
- `segmentType` 用字符串比较（如 `'2'`），实际返回可能是数字 `2`

建议：

1. 每段先选一个“有效 segmentLine”（通常取第一个有 `linePoint` 的）
2. 时间和距离按分段累加（`segmentTime` / `segmentDistance`）
3. `segmentType` 一律 `Number(seg.segmentType)` 后再判断

## 红线规则

1. 不写模拟公交线路坐标（禁止手写假的 `lineCoords`）
2. 必须真实调用 transit 接口（优先代理 `/api/tianditu/transit`）
3. `resultCode !== 0` 时给出明确错误提示，不继续渲染假路线
4. 只绘制解析成功的坐标；坐标为空时展示“无可绘制线路”
5. 必须维护 `loading / ready / empty / error` 四态，避免一直停留在 loading

## 稳定解析模板（建议直接复用）

```javascript
function getSegmentLines(seg) {
  if (!seg) return [];
  if (Array.isArray(seg.segmentLine)) return seg.segmentLine;
  if (seg.segmentLine) return [seg.segmentLine];
  return [];
}

function pickSegmentLine(seg) {
  var lines = getSegmentLines(seg);
  // 优先选择有 linePoint 的线路，避免拿到空壳对象
  for (var i = 0; i < lines.length; i++) {
    if (lines[i] && lines[i].linePoint) return lines[i];
  }
  return lines[0] || null;
}

function parseLinePoint(raw) {
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

function calcLineStats(line) {
  var segments = (line && line.segments) || [];
  var totalMinutes = 0;
  var totalMeters = 0;
  var walkMeters = 0;

  segments.forEach(function (seg) {
    var sl = pickSegmentLine(seg);
    if (!sl) return;

    var minutes = Number(sl.segmentTime) || 0;
    var meters = Number(sl.segmentDistance) || 0;
    totalMinutes += minutes;
    totalMeters += meters;

    var segType = Number(seg.segmentType);
    if (segType === 1) walkMeters += meters;
  });

  return {
    totalMinutes: totalMinutes,
    totalMeters: totalMeters,
    walkMeters: walkMeters
  };
}

function flattenRouteCoords(line) {
  var segments = (line && line.segments) || [];
  var merged = [];

  segments.forEach(function (seg) {
    var sl = pickSegmentLine(seg);
    if (!sl) return;
    var coords = parseLinePoint(sl.linePoint);
    if (!coords.length) return;

    // 去重首尾连接点
    if (merged.length) {
      var last = merged[merged.length - 1];
      var first = coords[0];
      if (last[0] === first[0] && last[1] === first[1]) {
        coords = coords.slice(1);
      }
    }
    merged = merged.concat(coords);
  });

  return merged;
}
```

## 最小可用流程

1. 用绝对 URL 调代理（避免 blob/iframe 环境下相对路径失败）：

```javascript
var url = new URL('/api/tianditu/transit', window.location.origin);
```

2. 判定返回成功：

```javascript
if (!payload || payload.success !== true) throw new Error(payload?.error || '代理请求失败');
if (Number(payload.data?.resultCode) !== 0) throw new Error('公交规划失败');
```

3. 获取方案：

```javascript
var typeResult = (payload.data.results && payload.data.results[0]) || null;
var lines = (typeResult && typeResult.lines) || [];
if (!lines.length) { /* empty */ }
```

4. 渲染路线前先清理旧图层/数据源，避免 `Source already exists`：

```javascript
if (map.getLayer('route-main')) map.removeLayer('route-main');
if (map.getSource('transit-line')) map.removeSource('transit-line');
```

5. 添加图层时不要写死不存在的锚点层（例如 `waterway-label`）：

```javascript
function safeAddLayer(layerDef, beforeId) {
  if (beforeId && map.getLayer(beforeId)) {
    map.addLayer(layerDef, beforeId);
  } else {
    map.addLayer(layerDef);
  }
}

safeAddLayer({
  id: 'route-glow',
  type: 'line',
  source: 'transit-line',
  paint: { 'line-color': '#1677ff', 'line-width': 10, 'line-opacity': 0.3 }
}, 'waterway-label');
```

## 侧栏展示建议

建议展示：

- `lineName`
- 总耗时（`calcLineStats(line).totalMinutes`）
- 总距离（`calcLineStats(line).totalMeters`）
- 步行距离（`calcLineStats(line).walkMeters`）

点击侧栏方案时：

1. 解析该方案坐标并更新地图线
2. 重算统计并更新卡片
3. `fitBounds` 到该方案

## 踩坑提醒

1. 官方字段是 `linetype`；代理参数是 `lineType`（后端已映射）
2. `segmentLine` 可能是对象或数组，必须统一处理
3. `segmentType` 可能是数字或字符串，比较前先 `Number()`
4. `lineName` 中可能出现多个可选线路（如 `A路 | B路 |`），统计时不要把所有候选 `segmentLine` 全部累加
5. 返回无地铁时（`hasSubway=0/false`）属于正常场景
6. `map.addLayer(layer, beforeId)` 的 `beforeId` 必须先 `map.getLayer(beforeId)` 校验，否则会报 `Cannot add layer before non-existing layer`
