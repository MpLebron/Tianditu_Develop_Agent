# 地图控件

导航控件、比例尺、全屏、定位等交互控件。

## 导航控件 (NavigationControl)

```javascript
map.addControl(new TMapGL.NavigationControl({
    showCompass: true,       // 指南针
    showZoom: true,          // 缩放按钮
    visualizePitch: true     // 俯仰可视化
}), 'top-right');
```

## 比例尺 (ScaleControl)

```javascript
map.addControl(new TMapGL.ScaleControl({
    maxWidth: 100,
    unit: 'metric'  // 'metric' 公制 / 'imperial' 英制
}), 'bottom-left');
```

## 全屏控件 (FullscreenControl)

```javascript
map.addControl(new TMapGL.FullscreenControl(), 'top-right');
```

## 定位控件 (GeolocateControl)

```javascript
map.addControl(new TMapGL.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true
}), 'top-right');
```

## 控件位置

| 值 | 位置 |
|----|------|
| `'top-left'` | 左上角 |
| `'top-right'` | 右上角 |
| `'bottom-left'` | 左下角 |
| `'bottom-right'` | 右下角 |

## 常用组合

```javascript
map.on("load", function() {
    // 右上角：导航 + 全屏
    map.addControl(new TMapGL.NavigationControl({ showZoom: true, showCompass: true, visualizePitch: true }), 'top-right');
    map.addControl(new TMapGL.FullscreenControl(), 'top-right');

    // 左下角：比例尺
    map.addControl(new TMapGL.ScaleControl({ unit: 'metric' }), 'bottom-left');
});
```

## 移除控件

```javascript
var nav = new TMapGL.NavigationControl();
map.addControl(nav, 'top-right');
// 后续移除
map.removeControl(nav);
```

## 踩坑提醒

1. **必须在 `map.on("load", ...)` 内添加控件**，否则可能报错
2. 同一位置可添加多个控件，按添加顺序排列
3. `GeolocateControl` 需要 HTTPS 环境才能获取定位
