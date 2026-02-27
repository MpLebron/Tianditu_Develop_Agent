# Popup 信息弹窗

在地图上显示 HTML 内容的信息窗口。

## 基础用法

```javascript
var popup = new TMapGL.Popup({
    closeOnClick: true,
    closeButton: true,
    offset: [0, -10]
})
.setLngLat([116.40, 39.90])
.setHTML('<h3>标题</h3><p>内容</p>')
.addTo(map);
```

## 配置选项

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| closeButton | Boolean | true | 显示关闭按钮 |
| closeOnClick | Boolean | true | 点击地图关闭 |
| closeOnMove | Boolean | false | 地图移动时关闭 |
| anchor | String | 'bottom' | 锚点位置 |
| offset | Array/Number | 0 | 偏移量 `[x, y]` |
| className | String | - | 自定义 CSS 类名 |
| maxWidth | String | '240px' | 最大宽度 |

## 方法

```javascript
popup.setLngLat([lng, lat])       // 设置位置
popup.setHTML('<p>HTML内容</p>')  // 设置 HTML
popup.setText('纯文本')            // 设置纯文本
popup.addTo(map)                   // 添加到地图
popup.remove()                     // 移除
popup.isOpen()                     // 是否打开
popup.getLngLat()                  // 获取位置
```

## 与 Marker 绑定

```javascript
var popup = new TMapGL.Popup({ offset: [0, -30] })
    .setHTML('<p>点击标记显示此弹窗</p>');

marker.setPopup(popup);  // 绑定后点击 marker 自动弹出
```

## 常用模式：图层点击弹窗

```javascript
map.on('click', 'my-layer', function(e) {
    var feature = e.features[0];
    var props = feature.properties;

    new TMapGL.Popup({ maxWidth: '300px' })
        .setLngLat(e.lngLat)
        .setHTML(
            '<b>' + props.name + '</b><br>' +
            '<span style="color:#666;">' + props.address + '</span>'
        )
        .addTo(map);
});
```

## 常用模式：富内容弹窗

```javascript
var html = '<div style="padding:8px;min-width:200px;">' +
    '<h3 style="margin:0 0 8px;font-size:15px;">' + name + '</h3>' +
    '<p style="margin:4px 0;color:#666;font-size:13px;">' + address + '</p>' +
    '<div style="margin-top:8px;padding-top:8px;border-top:1px solid #eee;">' +
    '<span style="color:#1890ff;">详情 →</span>' +
    '</div></div>';

new TMapGL.Popup({ maxWidth: '300px', offset: [0, -30] })
    .setLngLat([lng, lat])
    .setHTML(html)
    .addTo(map);
```

## 踩坑提醒

1. `offset` 通常设为 `[0, -30]` 来避免弹窗遮盖 marker 图标
2. 多个弹窗可以同时存在，如需互斥关闭，需自行管理引用并调用 `remove()`
3. `setHTML` 中的内容会被直接插入 DOM，注意 XSS 防护
