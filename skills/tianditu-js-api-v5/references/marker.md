# Marker 标注

在地图上添加可交互的标记点。

## 基础用法

```javascript
// 默认图标
var marker = new TMapGL.Marker()
    .setLngLat([116.40, 39.90])
    .addTo(map);

// 自定义 DOM 元素
var el = document.createElement('div');
el.style.backgroundImage = 'url(http://lbs.tianditu.gov.cn/js-api-v5-portal/image/marker.png)';
el.style.width = '37px';
el.style.height = '33px';
el.style.cursor = 'pointer';

var marker = new TMapGL.Marker({ element: el })
    .setLngLat([116.40, 39.90])
    .addTo(map);
```

## 配置选项

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| element | HTMLElement | - | 自定义 DOM 元素 |
| anchor | String | 'center' | 锚点：'center'/'top'/'bottom'/'left'/'right' |
| offset | Array | [0, 0] | 偏移量 `[x, y]` 像素 |
| draggable | Boolean | false | 是否可拖拽 |
| rotation | Number | 0 | 旋转角度 |

## 方法

```javascript
marker.setLngLat([lng, lat])  // 设置坐标
marker.getLngLat()             // 获取坐标 → LngLat
marker.addTo(map)              // 添加到地图
marker.remove()                // 从地图移除
marker.setDraggable(true)      // 设置可拖拽
marker.setRotation(45)         // 设置旋转
marker.setPopup(popup)         // 绑定弹窗（点击自动显示）
marker.getElement()            // 获取 DOM 元素
```

## 事件

```javascript
marker.on('click', function() { console.log('标记被点击'); });
marker.on('dragstart', function() { });
marker.on('drag', function() { });
marker.on('dragend', function() { console.log('新位置:', marker.getLngLat()); });
```

## 常用模式：多标记 + 弹窗

```javascript
var locations = [
    { name: '北京', lng: 116.40, lat: 39.90, desc: '首都' },
    { name: '上海', lng: 121.47, lat: 31.23, desc: '经济中心' },
    { name: '广州', lng: 113.26, lat: 23.13, desc: '南方门户' }
];

var bounds = new TMapGL.LngLatBounds();

locations.forEach(function(loc) {
    bounds.extend([loc.lng, loc.lat]);

    var popup = new TMapGL.Popup({ offset: [0, -30] })
        .setHTML('<b>' + loc.name + '</b><br>' + loc.desc);

    new TMapGL.Marker()
        .setLngLat([loc.lng, loc.lat])
        .setPopup(popup)
        .addTo(map);
});

map.fitBounds(bounds, { padding: 50 });
```

## 常用模式：自定义彩色标记

```javascript
function createColorMarker(color) {
    var el = document.createElement('div');
    el.style.width = '24px';
    el.style.height = '24px';
    el.style.borderRadius = '50%';
    el.style.background = color;
    el.style.border = '3px solid white';
    el.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
    el.style.cursor = 'pointer';
    return el;
}

new TMapGL.Marker({ element: createColorMarker('#ff4444') })
    .setLngLat([116.40, 39.90])
    .addTo(map);
```

## 踩坑提醒

1. 自定义元素的尺寸直接影响点击区域，建议不要太小
2. `setPopup()` 绑定后，点击 marker 自动打开弹窗，无需手动监听 click
3. marker 的 `anchor` 默认是 'center'，自定义图标时可能需要改为 'bottom'
