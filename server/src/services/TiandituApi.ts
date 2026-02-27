import { config } from '../config.js'

const BASE_URL = 'https://api.tianditu.gov.cn'

/**
 * 天地图 Web Service API 封装
 */
export class TiandituApi {
  private token: string

  constructor() {
    this.token = config.tiandituToken
  }

  /** POI 搜索 */
  async searchPOI(keyword: string, options: {
    mapBound?: string
    level?: number
    queryType?: number
    start?: number
    count?: number
  } = {}) {
    const params = {
      keyWord: keyword,
      level: options.level || 12,
      mapBound: options.mapBound || '73.0,3.0,135.0,54.0',
      queryType: options.queryType || 1,
      start: options.start || 0,
      count: options.count || 20,
    }
    return this.request('/v2/search', params, 'query')
  }

  /** 周边搜索 */
  async searchNearby(keyword: string, lng: number, lat: number, radius = 5000) {
    const params = {
      keyWord: keyword,
      queryType: 3,
      pointLonlat: `${lng},${lat}`,
      queryRadius: radius,
      start: 0,
      count: 20,
    }
    return this.request('/v2/search', params, 'query')
  }

  /** 地理编码 */
  async geocode(address: string) {
    const url = `${BASE_URL}/geocoder?ds=${encodeURIComponent(JSON.stringify({ keyWord: address }))}&tk=${this.token}`
    const resp = await fetch(url)
    return resp.json()
  }

  /** 逆地理编码 */
  async reverseGeocode(lng: number, lat: number) {
    const url = `${BASE_URL}/geocoder?postStr=${encodeURIComponent(JSON.stringify({ lon: lng, lat: lat, ver: 1 }))}&type=geocode&tk=${this.token}`
    const resp = await fetch(url)
    return resp.json()
  }

  /** 驾车路线规划 */
  async driveRoute(origLng: number, origLat: number, destLng: number, destLat: number, style = '0') {
    const params = {
      orig: `${origLng},${origLat}`,
      dest: `${destLng},${destLat}`,
      style,
    }
    return this.request('/drive', params, 'search')
  }

  /** 行政区划查询 */
  async administrative(keyword: string, options: { needPolygon?: boolean } = {}) {
    const params = {
      searchWord: keyword,
      searchType: '1',
      needSubInfo: 'false',
      needAll: 'false',
      needPolygon: options.needPolygon !== false ? 'true' : 'false',
      needPre: 'false',
    }
    const url = `${BASE_URL}/administrative?postStr=${encodeURIComponent(JSON.stringify(params))}&tk=${this.token}`
    const resp = await fetch(url)
    return resp.json()
  }

  private async request(path: string, params: Record<string, any>, type: string) {
    const url = `${BASE_URL}${path}?postStr=${encodeURIComponent(JSON.stringify(params))}&type=${type}&tk=${this.token}`
    const resp = await fetch(url)
    return resp.json()
  }
}
