# LngLat 与 LngLatBounds 基础类

天地图 v5.0 的坐标和边界核心类。

## TMapGL.LngLat

表示一个经纬度坐标点。

```javascript
var lngLat = new TMapGL.LngLat(116.40, 39.90);

lngLat.lng           // 经度 → 116.40
lngLat.lat           // 纬度 → 39.90
lngLat.toArray()     // → [116.40, 39.90]
lngLat.distanceTo(otherLngLat)  // 计算两点距离（米）
```

大多数 API 也接受数组形式 `[lng, lat]`，无需显式创建 LngLat 对象。

## TMapGL.LngLatBounds

表示一个矩形地理范围。

```javascript
// 创建空边界，逐步扩展
var bounds = new TMapGL.LngLatBounds();
bounds.extend([116.40, 39.90]);
bounds.extend([121.47, 31.23]);
bounds.extend([113.26, 23.13]);

// 从两个角点创建
var bounds = new TMapGL.LngLatBounds([115.7, 39.4], [117.4, 41.1]);
```

### 方法

```javascript
bounds.getCenter()      // 中心点 → LngLat
bounds.getSouthWest()   // 西南角
bounds.getNorthEast()   // 东北角
bounds.toArray()        // → [[sw_lng, sw_lat], [ne_lng, ne_lat]]
bounds.contains([lng, lat])  // 是否包含某点
```

### 常用模式：自动适应多个点

```javascript
var points = [[116.40, 39.90], [121.47, 31.23], [113.26, 23.13]];
var bounds = new TMapGL.LngLatBounds();
points.forEach(function(p) { bounds.extend(p); });
map.fitBounds(bounds, { padding: 50, maxZoom: 15 });
```

## 踩坑提醒

1. `LngLat` 构造函数参数顺序是 `(经度, 纬度)`，和数组形式 `[lng, lat]` 一致
2. `distanceTo()` 返回值单位是**米**
3. `fitBounds()` 的 `padding` 可以是数字（四边相同）或对象 `{ top, bottom, left, right }`
