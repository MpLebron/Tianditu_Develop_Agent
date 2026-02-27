/**
 * GeoJSON 处理 + 坐标转换
 */
export class GeoJSONParser {
  /**
   * 从表格数据生成 GeoJSON
   * 自动检测经纬度字段
   */
  static fromTableData(rows: Record<string, any>[]): any | null {
    if (!rows.length) return null

    const lngField = this.findField(rows[0], ['longitude', 'lng', 'lon', 'x', '经度', 'LONGITUDE', 'LNG'])
    const latField = this.findField(rows[0], ['latitude', 'lat', 'y', '纬度', 'LATITUDE', 'LAT'])

    if (!lngField || !latField) return null

    const features = rows
      .filter(row => row[lngField] != null && row[latField] != null)
      .map(row => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [parseFloat(row[lngField]), parseFloat(row[latField])],
        },
        properties: { ...row },
      }))

    return { type: 'FeatureCollection', features }
  }

  /**
   * EPSG:3857 → WGS84
   */
  static mercatorToWGS84(x: number, y: number): [number, number] {
    const lng = (x / 20037508.34) * 180
    let lat = (y / 20037508.34) * 180
    lat = (180 / Math.PI) * (2 * Math.atan(Math.exp((lat * Math.PI) / 180)) - Math.PI / 2)
    return [lng, lat]
  }

  /**
   * 检测 GeoJSON 是否需要投影转换
   */
  static needsConversion(geojson: any): boolean {
    if (geojson.crs?.properties?.name) {
      const crs = geojson.crs.properties.name
      if (crs.includes('3857') || crs.includes('900913')) return true
    }
    if (geojson.features?.length > 0) {
      const coord = this.getFirstCoordinate(geojson.features[0].geometry)
      if (coord && (Math.abs(coord[0]) > 180 || Math.abs(coord[1]) > 90)) return true
    }
    return false
  }

  /**
   * 转换整个 GeoJSON 的坐标
   */
  static convertGeoJSON(geojson: any): any {
    if (!this.needsConversion(geojson)) return geojson

    const converted = JSON.parse(JSON.stringify(geojson))
    converted.features.forEach((f: any) => {
      f.geometry.coordinates = this.convertCoords(f.geometry.coordinates, f.geometry.type)
    })
    delete converted.crs
    return converted
  }

  private static findField(row: Record<string, any>, candidates: string[]): string | null {
    const keys = Object.keys(row).map(k => k.toLowerCase())
    for (const c of candidates) {
      const idx = keys.indexOf(c.toLowerCase())
      if (idx !== -1) return Object.keys(row)[idx]
    }
    return null
  }

  private static getFirstCoordinate(geometry: any): number[] | null {
    let c = geometry.coordinates
    while (Array.isArray(c?.[0])) c = c[0]
    return c
  }

  private static convertCoords(coords: any, type: string): any {
    if (type === 'Point') return this.mercatorToWGS84(coords[0], coords[1])
    if (type === 'LineString' || type === 'MultiPoint')
      return coords.map((c: number[]) => this.mercatorToWGS84(c[0], c[1]))
    if (type === 'Polygon' || type === 'MultiLineString')
      return coords.map((ring: number[][]) => ring.map((c: number[]) => this.mercatorToWGS84(c[0], c[1])))
    if (type === 'MultiPolygon')
      return coords.map((poly: number[][][]) => poly.map((ring: number[][]) => ring.map((c: number[]) => this.mercatorToWGS84(c[0], c[1]))))
    return coords
  }
}
