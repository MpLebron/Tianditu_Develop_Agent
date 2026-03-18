# WMS/WMTS/TMS 栅格图层

加载外部栅格数据服务（WMS、WMTS、TMS 瓦片）叠加到地图上。

## TMS 瓦片

```javascript
map.addSource('tms-source', {
    type: 'raster',
    tiles: ['https://example.com/tiles/{z}/{x}/{y}.png'],
    tileSize: 256
});

map.addLayer({
    id: 'tms-layer',
    type: 'raster',
    source: 'tms-source',
    paint: { 'raster-opacity': 0.8 }
});
```

## WMTS 瓦片

```javascript
map.addSource('wmts-source', {
    type: 'raster',
    tiles: ['https://example.com/wmts?SERVICE=WMTS&REQUEST=GetTile&LAYER=layerName&TILEMATRIXSET=EPSG:3857&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png'],
    tileSize: 256
});

map.addLayer({
    id: 'wmts-layer',
    type: 'raster',
    source: 'wmts-source'
});
```

## WMS

```javascript
map.addSource('wms-source', {
    type: 'raster',
    tiles: ['https://example.com/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=layerName&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=true'],
    tileSize: 256
});

map.addLayer({
    id: 'wms-layer',
    type: 'raster',
    source: 'wms-source',
    paint: { 'raster-opacity': 0.7 }
});
```

## 图片叠加

```javascript
map.addSource('image-source', {
    type: 'image',
    url: 'https://example.com/overlay.png',
    coordinates: [
        [左上经度, 左上纬度], [右上经度, 右上纬度],
        [右下经度, 右下纬度], [左下经度, 左下纬度]
    ]
});

map.addLayer({ id: 'image-layer', type: 'raster', source: 'image-source' });
```

## raster paint 属性

| 属性 | 类型 | 说明 |
|------|------|------|
| `raster-opacity` | Number | 透明度 0-1 |
| `raster-brightness-min` | Number | 最小亮度 |
| `raster-brightness-max` | Number | 最大亮度 |
| `raster-contrast` | Number | 对比度 |
| `raster-saturation` | Number | 饱和度 |

## 踩坑提醒

1. WMS 的 `{bbox-epsg-3857}` 是特殊占位符，天地图自动替换
2. 外部瓦片服务需要支持 CORS
3. WMTS 的 `TILEMATRIXSET` 需要和地图投影一致（通常是 EPSG:3857）
