# 地图样式与底图类型

当前项目运行环境里，v5 个性化底图应使用 `styleId`，例如：

```javascript
var map = new TMapGL.Map("map", {
  center: [116.35, 39.91],
  zoom: 3,
  styleId: "black"
});
```

真正容易出错的是把命名样式误写进 `style` 字段，例如 `style: "black"`，这时运行时很容易触发：

```text
TypeError: Failed to construct 'Request': Failed to parse URL from black
```

因此本项目的安全约定是：

1. 默认底图可以省略 `styleId`，也可以显式写 `styleId: 'normal'`
2. 个性化底图使用 `styleId: 'black' | 'blue'`
3. 不要生成 `style: 'default' | 'black' | 'blue'`
4. 如果只是想让页面更“暗黑 / 更好看”，除了 `styleId` 之外，也可以通过页面 UI 和图层配色增强视觉效果

## 安全写法

```javascript
// 默认底图（推荐）
var map = new TMapGL.Map("map", {
  center: [116.4, 39.9],
  zoom: 12
});

// 个性化底图
var blackMap = new TMapGL.Map("dark-map", {
  center: [116.4, 39.9],
  zoom: 12,
  styleId: "black"
});
```

## 底图类型

```javascript
// 卫星影像底图
var map = new TMapGL.Map("map", { mapType: "image" });

// 地形底图
var map = new TMapGL.Map("map", { mapType: "terrain" });
```

## 常用模式：黑色个性化底图 + 数据可视化面板

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
        styleId: "black"
      });

      map.on("load", function () {
        // 个性化底图使用 styleId；
        // 页面层仍然可以继续叠加高对比度数据层和深色信息面板
        map.addControl(new TMapGL.NavigationControl(), "top-right");
      });
    </script>
  </body>
</html>
```

## 踩坑提醒

1. v5 个性化底图字段是 `styleId`，不是 `style`
2. `style: "black"` / `style: "blue"` / `style: "default"` 容易在当前运行容器里被当作 URL 解析而报错
3. 默认底图可以省略 `styleId`，如需显式声明可写 `styleId: "normal"`
4. 如果用户明确要卫星影像或地形，请用 `mapType: "image"` / `mapType: "terrain"`
