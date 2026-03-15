import { describe, expect, it } from 'vitest'
import {
  buildRuntimeJsonContract,
  extractRuntimeFileContract,
  extractRuntimeGeojsonContract,
  formatRuntimeJsonContract,
} from '../src/agent/FileContextContract.js'

describe('FileContextContract', () => {
  it('extracts the unique runtime GeoJSON contract from file context', () => {
    const fileContext = `
文件: village-renovation.geojson
文件获取链接URL: http://localhost:3000/uploads/example.geojson
## 运行时文件契约（唯一可信，代码必须只按本节读取）
\`\`\`json
{
  "version": "geojson-runtime-contract-v2",
  "kind": "geojson",
  "fileUrl": "http://localhost:3000/uploads/example.geojson",
  "responseShape": "FeatureCollection",
  "geojsonPath": "rawData",
  "forbiddenPaths": ["rawData.data", "rawData.rawData"],
  "featureCount": 268,
  "geometryTypeStats": { "MultiPolygon": 268 },
  "pointAccessorByGeometryType": {
    "MultiPolygon": "geometry.coordinates[0][0][0]"
  },
  "safeGuards": ["传入 map.addSource 的 data 必须是 FeatureCollection/Feature 对象，禁止传 features 数组"]
}
\`\`\`

## 原始来源附注（仅供溯源，禁止作为运行时代码读取路径）
- 原始文件结构说明: GeoJSON 数据（包装对象 data 字段）
`

    const contract = extractRuntimeGeojsonContract(fileContext)
    expect(contract?.geojsonPath).toBe('rawData')
    expect(contract?.forbiddenPaths).toContain('rawData.data')
    expect(contract?.featureCount).toBe(268)
  })

  it('extracts json runtime contracts with canonical access for object roots', () => {
    const jsonContract = buildRuntimeJsonContract({
      fileUrl: 'http://localhost:3000/uploads/example.json',
      jsonData: {
        '中央红军（红一方面军）': [{ 地名: '江西于都', 地点坐标: [115.4167, 25.95] }],
        '红二方面军': [],
        '红四方面军': [],
      },
    })

    const fileContext = [
      '文件: a.json',
      '文件获取链接URL: http://localhost:3000/uploads/example.json',
      formatRuntimeJsonContract(jsonContract),
    ].join('\n')

    const contract = extractRuntimeFileContract(fileContext)
    expect(contract?.kind).toBe('json')
    expect(contract?.responseShape).toBe('object')
    expect(contract && 'rootKeys' in contract ? contract.rootKeys : []).toContain('中央红军（红一方面军）')
    expect(contract && 'canonicalAccess' in contract ? contract.canonicalAccess : []).toContain('rawData["中央红军（红一方面军）"]')
  })
})
