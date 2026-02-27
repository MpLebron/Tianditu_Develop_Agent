import { Router } from 'express'
import { TiandituApi } from '../services/TiandituApi.js'

const router = Router()
const api = new TiandituApi()

// GET /api/tianditu/search — POI 搜索
router.get('/search', async (req, res, next) => {
  try {
    const { keyword, type, lng, lat, radius, adminCode, mapBound } = req.query

    if (!keyword) {
      return res.status(400).json({ success: false, error: '缺少搜索关键词' })
    }

    let result
    if (type === 'nearby' && lng && lat) {
      result = await api.searchNearby(
        keyword as string,
        parseFloat(lng as string),
        parseFloat(lat as string),
        parseInt(radius as string || '5000'),
      )
    } else {
      result = await api.searchPOI(keyword as string, {
        mapBound: mapBound as string,
        queryType: type === 'admin' ? 7 : 1,
      })
    }

    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

// GET /api/tianditu/geocode — 地理编码
router.get('/geocode', async (req, res, next) => {
  try {
    const { address } = req.query
    if (!address) return res.status(400).json({ success: false, error: '缺少地址' })
    const result = await api.geocode(address as string)
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

// GET /api/tianditu/reverse-geocode — 逆地理编码
router.get('/reverse-geocode', async (req, res, next) => {
  try {
    const { lng, lat } = req.query
    if (!lng || !lat) return res.status(400).json({ success: false, error: '缺少坐标' })
    const result = await api.reverseGeocode(parseFloat(lng as string), parseFloat(lat as string))
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

// GET /api/tianditu/drive — 驾车路线
router.get('/drive', async (req, res, next) => {
  try {
    const { origLng, origLat, destLng, destLat, style } = req.query
    if (!origLng || !origLat || !destLng || !destLat) {
      return res.status(400).json({ success: false, error: '缺少起终点坐标' })
    }
    const result = await api.driveRoute(
      parseFloat(origLng as string), parseFloat(origLat as string),
      parseFloat(destLng as string), parseFloat(destLat as string),
      (style as string) || '0',
    )
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

// GET /api/tianditu/administrative — 行政区划
router.get('/administrative', async (req, res, next) => {
  try {
    const { keyword } = req.query
    if (!keyword) return res.status(400).json({ success: false, error: '缺少关键词' })
    const result = await api.administrative(keyword as string)
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

export default router
