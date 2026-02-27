import type { SkillStore } from './SkillStore.js'

/**
 * 关键词 → Skill 名称映射（规则优先）
 * 迁移自旧项目 knowledgeLoader.js 的 KEYWORD_INDEX
 */
const KEYWORD_MAP: Record<string, string[]> = {
  // 地图基础
  'map-init': ['地图', '初始化', '创建地图', '新建地图', 'TMapGL.Map', 'center', 'zoom', 'flyTo', '飞行', '跳转', 'jumpTo', 'easeTo', 'fitBounds', 'setCenter', 'setZoom', '视角', '定位', '定位到', '飞到', '移到', '切换到', '看看', '缩放'],
  'map-style': ['样式', 'styleId', '黑色', '蓝色', '个性化', '影像', '卫星', '地形', '底图', 'black', 'blue', 'dark'],
  'base-classes': ['LngLat', 'LngLatBounds', 'Point', '经纬度', '坐标', '距离', '边界', 'bounds'],

  // 覆盖物
  'marker': ['标记', 'Marker', '图标', '点标记', '标注', '打点', 'marker', '拖拽标记'],
  'popup': ['弹窗', 'Popup', '信息框', '气泡', '弹出', '信息窗'],

  // 图层
  'bindGeoJSON': ['GeoJSON', 'geojson', '数据加载', '加载数据', '上传数据', '加载文件'],
  'bindPointLayer': ['点图层', 'circle', 'symbol', '圆点', '文字标注'],
  'bindLineLayer': ['线图层', 'line', '路径', '轨迹', '线条'],
  'bindPolygonLayer': ['面图层', 'fill', '多边形', '区域填充', '地块'],

  // 数据可视化
  'bindHeatmap': ['热力图', '热度', '密度图', 'heatmap', '热点分布'],
  'bindCluster': ['聚合', '聚类', 'cluster', '集群', '点聚合'],
  'bindExtrusion': ['3D柱状图', '柱状图', '拉伸', 'extrusion', '3D', '立体', '3d'],

  // 控件和事件
  'bindControls': ['控件', '导航', '比例尺', '全屏', '缩放控件', 'control'],
  'bindEvents': ['事件', 'click', '点击', '监听', '鼠标', 'mouseenter'],

  // 高级
  'bindTerrain': ['地形', '3D地形', '山体', 'DEM', 'terrain', '阴影'],
  'bindRasterLayers': ['栅格', 'WMS', 'WMTS', 'TMS', '瓦片', 'raster', '图片叠加'],
  'bindEcharts': ['echarts', 'ECharts', '图表', '柱状图', '折线图', '饼图', '联动', '雷达图', '散点图'],
  'bindOverlays': ['覆盖物', '圆', '遮罩', '画圆', '圆形'],

  // 搜索服务
  'geocoder': ['地理编码', '逆地理', '地址转坐标', '坐标转地址', 'geocode'],
  'search-poi': ['搜索', 'POI', '附近', '查找', '周边'],
  'search-admin': ['行政区', '行政区划', '区划', '边界', '区域查询'],
  'search-route': ['路线', '路径规划', '导航', '驾车', '公交', '步行', '怎么走'],

  // 坐标转换
  'coordinate-transform': ['坐标转换', 'EPSG', '3857', '投影', 'Mercator', 'WGS84'],
}

/**
 * 关键词 → Skill 文档匹配
 * 用于检索相关的参考文档，不做意图分类（意图由 LLM 自主判断）
 */
export class SkillMatcher {
  constructor(private skillStore: SkillStore) {}

  /**
   * 基于关键词规则匹配 skill
   * 返回匹配到的 skill 名称数组（按相关度排序）
   */
  matchByKeywords(userInput: string): string[] {
    const input = userInput.toLowerCase()
    const scores: { name: string; score: number }[] = []

    for (const [skillName, keywords] of Object.entries(KEYWORD_MAP)) {
      let score = 0
      for (const kw of keywords) {
        if (input.includes(kw.toLowerCase())) {
          score += kw.length // 长关键词权重更高
        }
      }
      if (score > 0) {
        scores.push({ name: skillName, score })
      }
    }

    scores.sort((a, b) => b.score - a.score)
    return scores.slice(0, 3).map(s => s.name)
  }
}
