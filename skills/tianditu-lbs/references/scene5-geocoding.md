# 场景五：正向地理编码

## 当前项目代理优先

- 运行时代码优先调用 `/api/tianditu/*` 代理，不要在前端直接拼接 `tk`。
- 如果前端通过代理调用，必须先判断 `payload.success===true`，再从 `payload.data` 读取业务字段。
- 下文的“返回结构”主要用于说明业务字段形状；通过代理调用时，这些字段通常位于 `payload.data` 内。
- 驾车规划是特例：当前项目代理会把原始 XML 兼容转换为 JSON 对象，再放进 `payload.data`。

## 当前项目代理请求与读取

当前项目里，正向地理编码的运行时优先写法是：

```text
GET /api/tianditu/geocode?address=自然资源部
```

对应前端读取顺序：

```javascript
var url = new URL('/api/tianditu/geocode', window.location.origin);
url.searchParams.set('address', '自然资源部');

fetch(url.toString())
  .then(function (res) {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  })
  .then(function (payload) {
    if (!payload || payload.success !== true) {
      throw new Error((payload && payload.error) || '地理编码失败');
    }

    var location = (payload.data && payload.data.location) || {};
    var lng = Number(location.lon);
    var lat = Number(location.lat);
  });
```

当前项目代理返回示例：

```json
{
  "success": true,
  "data": {
    "status": "0",
    "location": {
      "lon": "116.358274",
      "lat": "39.938126",
      "level": "兴趣点"
    }
  }
}
```

也就是说，当前项目里要读的是：

- `payload.data.location.lon`
- `payload.data.location.lat`

不要误读成：

- `payload.data.lon`
- `payload.data.lat`


## 适用任务

- 把结构化地址转换成坐标
- 把地名、详细地址解析为经纬度

## 不要在这些情况使用

- 用户给的是坐标，要反查地址：转到 `scene6-reverse-geocoding.md`

## 官方端点

- `http://api.tianditu.gov.cn/geocoder?ds=...`
- 默认 key：`4043dde46add842282bacc412299311d`

## 必填参数

| 参数 | 说明 |
| --- | --- |
| `keyWord` | 地址或地点关键词 |

## 最小请求模板

```bash
curl -s "http://api.tianditu.gov.cn/geocoder?ds={\"keyWord\":\"北京市海淀区莲花池西路28号\"}&tk=4043dde46add842282bacc412299311d"
```

## 完整示例

### 示例 1：详细地址转坐标

```bash
curl -s "http://api.tianditu.gov.cn/geocoder?ds={\"keyWord\":\"北京市海淀区莲花池西路28号\"}&tk=4043dde46add842282bacc412299311d"
```

### 示例 2：地名转坐标

```bash
curl -s "http://api.tianditu.gov.cn/geocoder?ds={\"keyWord\":\"故宫博物院\"}&tk=4043dde46add842282bacc412299311d"
```

## 返回结构

正向地理编码返回 JSON，核心对象是 `location`。

```json
{
  "msg": "ok",
  "location": {
    "score": 100,
    "level": "社区村落",
    "lon": "116.288866",
    "lat": "39.98992",
    "keyWord": "北京市海淀区中关村"
  },
  "searchVersion": "7.5.0V",
  "status": "0"
}
```

## 如何读取关键返回字段

- `status`
  - `0`：正常返回
  - `101`：结果为空
  - `404`：出错
- `msg`：返回信息
- `location.lon`：经度
- `location.lat`：纬度
- `location.level`：命中级别
- `location.score`：匹配置信度
- `searchVersion`：服务版本号

## 常见错误

- 正向编码用的是 `ds={...}`，不是 `postStr={...}`
- 结果坐标读取时要分清：
  - `lon` 是经度
  - `lat` 是纬度
- 不要把返回坐标写反
- 当前项目代理参数名是 `address`，不要误写成 `query`
- 当前项目代理端点是 `/api/tianditu/geocode`，不要把官方直连 `geocoder?ds=...` 原样搬到项目代理里
- 当前项目代理返回坐标在 `payload.data.location`，不要误写成 `payload.data.lon / payload.data.lat`

## 组合场景提示

- 如果用户接下来还要做“从 A 到 B 的驾车 / 公交路线规划”，并且 A/B 是地点名、机构名或地址，通常应先用本场景把 A/B 转成坐标，再进入路线规划。
- 例如“国家基础地理信息中心到自然资源部”，推荐顺序是：
  1. `geocode('国家基础地理信息中心')`
  2. `geocode('自然资源部')`
  3. 再调用 `/api/tianditu/drive` 或 `/api/tianditu/transit`

## 输出模板

```text
已按正向地理编码构造天地图请求。

- 端点：/geocoder
- 参数容器：ds
- 默认 key：4043dde46add842282bacc412299311d

关键结果：
- status
- location.lon
- location.lat
- location.level
```
