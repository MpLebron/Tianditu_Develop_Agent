# 坐标转换 (EPSG:3857 ↔ WGS84)

检测和转换非 WGS84 坐标的 GeoJSON 数据。

## 为什么需要转换

天地图使用 WGS84 (EPSG:4326) 坐标系，范围 `[-180, -90] ~ [180, 90]`。
部分数据使用 Web Mercator (EPSG:3857)，坐标值远超此范围（如 `12958000, 4852000`）。

## EPSG:3857 → WGS84

```javascript
function mercatorToWGS84(x, y) {
    var lng = (x / 20037508.34) * 180;
    var lat = (y / 20037508.34) * 180;
    lat = 180 / Math.PI * (2 * Math.atan(Math.exp(lat * Math.PI / 180)) - Math.PI / 2);
    return [lng, lat];
}
```

## 自动检测是否需要转换

```javascript
function needsProjectionConvert(geojson) {
    // 检查 CRS 声明
    if (geojson.crs && geojson.crs.properties && geojson.crs.properties.name) {
        var crs = geojson.crs.properties.name;
        if (crs.indexOf('3857') !== -1 || crs.indexOf('900913') !== -1) return true;
    }
    // 检查坐标范围
    if (geojson.features && geojson.features.length > 0) {
        var coord = getFirstCoordinate(geojson.features[0].geometry);
        if (coord && (Math.abs(coord[0]) > 180 || Math.abs(coord[1]) > 90)) return true;
    }
    return false;
}

function getFirstCoordinate(geometry) {
    var c = geometry.coordinates;
    while (Array.isArray(c[0])) c = c[0];
    return c;
}
```

## 递归转换所有坐标

```javascript
function convertCoordinates(coords, type) {
    if (type === 'Point') return mercatorToWGS84(coords[0], coords[1]);
    if (type === 'LineString' || type === 'MultiPoint')
        return coords.map(function(c) { return mercatorToWGS84(c[0], c[1]); });
    if (type === 'Polygon' || type === 'MultiLineString')
        return coords.map(function(ring) { return ring.map(function(c) { return mercatorToWGS84(c[0], c[1]); }); });
    if (type === 'MultiPolygon')
        return coords.map(function(poly) { return poly.map(function(ring) { return ring.map(function(c) { return mercatorToWGS84(c[0], c[1]); }); }); });
    return coords;
}
```

## 完整转换流程

```javascript
function convertGeoJSON(geojson) {
    if (!needsProjectionConvert(geojson)) return geojson;
    console.log('检测到投影坐标，正在转换为 WGS84...');
    geojson.features.forEach(function(f) {
        f.geometry.coordinates = convertCoordinates(f.geometry.coordinates, f.geometry.type);
    });
    delete geojson.crs;
    return geojson;
}
```

## 属性中的经纬度字段

部分数据把经纬度存在 `properties` 而非 `geometry` 中：

```javascript
function getLatLngFromProps(props) {
    var fields = [['LONGITUDE','LATITUDE'], ['longitude','latitude'], ['lng','lat'], ['lon','lat']];
    for (var i = 0; i < fields.length; i++) {
        if (props[fields[i][0]] !== undefined && props[fields[i][1]] !== undefined)
            return [props[fields[i][0]], props[fields[i][1]]];
    }
    return null;
}
```

## 踩坑提醒

1. 坐标超出 `[-180, 180]` 范围 99% 是 EPSG:3857
2. 转换后删除 `geojson.crs`，避免地图库再次误判
3. 经纬度字段名不统一（LONGITUDE/longitude/lng/lon），需多种匹配
