# 地图初始化与配置

创建天地图 v5.0 地图实例，设置中心点、缩放、视角等参数。

## 基础用法

```javascript
var map = new TMapGL.Map("mapDiv", {
    center: [116.40, 39.90],  // [经度, 纬度]
    zoom: 12                   // 缩放级别 1-18
});
```

## 配置选项

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| center | Array | [116.40, 39.90] | 中心点 `[lng, lat]` |
| zoom | Number | 10 | 缩放级别 1-18 |
| minZoom | Number | 1 | 最小缩放 |
| maxZoom | Number | 18 | 最大缩放 |
| pitch | Number | 0 | 倾斜角 0-60 |
| bearing | Number | 0 | 旋转角 0-360 |
| styleId | String | （省略或 `'normal'`） | 个性化底图样式，当前已验证示例值：`'normal'` / `'black'` / `'blue'`，见 `map-style.md` |
| mapType | String | - | 底图类型：`'image'`(卫星) / `'terrain'`(地形) |

## 视图操作方法

```javascript
// 飞行动画到目标
map.flyTo({ center: [121.47, 31.23], zoom: 15, pitch: 45, bearing: 30, duration: 2000 });

// 无动画跳转
map.jumpTo({ center: [121.47, 31.23], zoom: 15 });

// 缓动过渡
map.easeTo({ center: [121.47, 31.23], zoom: 12, duration: 1000 });

// 适应边界范围
map.fitBounds([[115.7, 39.4], [117.4, 41.1]], { padding: 50, maxZoom: 15 });
```

## 属性读写

```javascript
map.getCenter()            // 获取中心 → LngLat
map.setCenter([lng, lat])  // 设置中心
map.getZoom()              // 获取缩放
map.setZoom(15)            // 设置缩放
map.getBounds()            // 获取可视范围 → LngLatBounds
map.getPitch() / map.setPitch(45)
map.getBearing() / map.setBearing(90)
```

## 坐标转换

```javascript
var pixel = map.project([116.40, 39.90]);    // 经纬度 → 屏幕像素 {x, y}
var lngLat = map.unproject([400, 300]);      // 屏幕像素 → 经纬度
```

## 踩坑提醒

1. `center` 是 `[经度, 纬度]`，不是 `[纬度, 经度]`
2. 图层、控件、数据源操作必须在 `map.on("load", ...)` 回调内执行
3. `fitBounds` 的参数是 `[[西南lng, 西南lat], [东北lng, 东北lat]]`
4. 个性化底图优先使用 `styleId`；不要把 `black` / `blue` / `normal` 这类命名样式误写成 `style: 'black'`

## 完整示例

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>基础地图</title>
    <style>html, body, #map { width: 100%; height: 100%; margin: 0; padding: 0; }</style>
</head>
<body>
    <div id="map"></div>
    <script src="https://api.tianditu.gov.cn/api/v5/js?tk=${TIANDITU_TOKEN}"></script>
    <script>
        var map = new TMapGL.Map("map", {
            center: [116.40, 39.90],
            zoom: 12,
            pitch: 0,
            bearing: 0
        });

        map.on("load", function() {
            // 地图加载完成，可以添加图层和控件
            map.addControl(new TMapGL.NavigationControl(), "top-right");
            map.addControl(new TMapGL.ScaleControl(), "bottom-left");
        });
    </script>
</body>
</html>
```
