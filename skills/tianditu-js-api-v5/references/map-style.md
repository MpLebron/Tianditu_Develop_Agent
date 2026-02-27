# 地图样式与底图类型

天地图 v5.0 支持多种内置样式和底图类型切换。

## 内置样式

```javascript
// 默认样式（推荐）：不要显式传 style，直接省略
var map = new TMapGL.Map("map", {});

// 运行时切换样式
map.setStyle("black"); // 黑色主题
map.setStyle("blue"); // 蓝色主题
// 切回默认样式：请按当前项目约定重建地图或在初始化时省略 style（避免 setStyle('default') 导致 404）
```

| 样式值           | 效果                           |
| ---------------- | ------------------------------ |
| `（省略 style）` | 标准矢量底图（默认，推荐写法） |
| `'black'`        | 暗黑风格，适合数据可视化       |
| `'blue'`         | 蓝色风格                       |

## 底图类型

```javascript
// 卫星影像底图
var map = new TMapGL.Map("map", { mapType: "image" });

// 地形底图
var map = new TMapGL.Map("map", { mapType: "terrain" });
```

## 常用模式：暗黑风格 + 数据可视化

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>暗黑风格地图</title>
    <style>
      html,
      body,
      #map {
        width: 100%;
        height: 100%;
        margin: 0;
        padding: 0;
      }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script src="https://api.tianditu.gov.cn/api/v5/js?tk=${TIANDITU_TOKEN}"></script>
    <script>
      var map = new TMapGL.Map("map", {
        center: [116.4, 39.9],
        zoom: 12,
        style: "black",
      });

      map.on("load", function () {
        // 暗黑底图上叠加亮色数据效果更好
        map.addControl(new TMapGL.NavigationControl(), "top-right");
      });
    </script>
  </body>
</html>
```

## 踩坑提醒

1. `setStyle()` 会清除所有已添加的 source 和 layer，需要重新添加
2. 样式切换后需要重新监听 `load` 事件：`map.once("style.load", function() { ... })`
3. `mapType` 只在构造时生效，运行时切换用 `setStyle()`
