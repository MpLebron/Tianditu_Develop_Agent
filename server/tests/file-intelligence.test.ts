import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { basename, resolve } from 'path'
import { FileIntelligenceService } from '../src/agent/FileIntelligenceService.js'
import {
  buildRuntimeGeojsonContract,
  buildRuntimeJsonContract,
  formatRuntimeGeojsonContract,
  formatRuntimeJsonContract,
} from '../src/agent/FileContextContract.js'
import { config } from '../src/config.js'

const createdFiles: string[] = []

afterEach(async () => {
  await Promise.all(createdFiles.splice(0).map((file) => rm(file, { force: true })))
})

describe('FileIntelligenceService', () => {
  it('enriches direct FeatureCollection uploads with verified geometry guidance', async () => {
    const sourcePath = '/Users/mpl/Downloads/coding/project/work/tianditu-smart-map/server/assets/samples/china-flood-events.geojson'
    const source = JSON.parse(await readFile(sourcePath, 'utf-8'))
    const uploadFile = await writeUploadJson('test-china-flood-events.geojson', source)
    const service = new FileIntelligenceService()

    const runtimeContract = buildRuntimeGeojsonContract({
      fileUrl: `http://localhost:3000/uploads/${basename(uploadFile)}`,
      geojsonPath: 'rawData',
      featureCollection: source,
    })

    const fileData = [
      '文件: china-flood-events.geojson',
      `文件获取链接URL: ${runtimeContract.fileUrl}`,
      formatRuntimeGeojsonContract(runtimeContract),
    ].join('\n')

    const result = await service.enrich(fileData)
    expect(result.summary.status).toBe('ok')
    expect(result.fileData).toContain('自动数据理解结果（系统已读取真实文件，高优先级）')
    expect(result.fileData).toContain('MultiPoint: geometry.coordinates[0] -> [lng, lat]')
    expect(result.fileData).toContain('热力图')
  })

  it('supports wrapped payloads when runtime contract points to rawData.data', async () => {
    const wrapped = {
      status: 200,
      message: 'ok',
      data: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { name: 'demo', value: 12 },
            geometry: { type: 'Point', coordinates: [116.4, 39.9] },
          },
        ],
      },
    }
    const uploadFile = await writeUploadJson('test-wrapped-geojson.json', wrapped)
    const service = new FileIntelligenceService()

    const runtimeContract = buildRuntimeGeojsonContract({
      fileUrl: `http://localhost:3000/uploads/${basename(uploadFile)}`,
      geojsonPath: 'rawData.data',
      featureCollection: wrapped.data,
    })

    const fileData = [
      '文件: wrapped.json',
      `文件获取链接URL: ${runtimeContract.fileUrl}`,
      formatRuntimeGeojsonContract(runtimeContract),
    ].join('\n')

    const result = await service.enrich(fileData)
    expect(result.summary.status).toBe('ok')
    expect(result.fileData).toContain('运行时路径验证: rawData.data -> FeatureCollection（已验证）')
    expect(result.fileData).toContain('"name"')
  })

  it('understands normalized object-root JSON uploads with chinese keys and coordinate fields', async () => {
    const gb18030Hex = '7b22d6d0d1ebbaecbefca3a8baecd2bbb7bdc3e6befca3a9223a5b7b22b5d8c3fb223a22bdadcef7d3dab6bc222c22b5d8b5e3d7f8b1ea223a5b3131352e343136372c32352e39355d2c22cab1bce4223a22313933342d3130222c22b9d8bcedcac2bcfe223a22b3a4d5f7b3a4b7a2227d5d2c22baecb6feb7bdc3e6223a5b5d2c22baecc4c4b7bdc3e6223a5b5d7d'
    const uploadFile = await writeUploadBuffer('test-longmarch-gbk.json', Buffer.from(gb18030Hex, 'hex'))
    const service = new FileIntelligenceService()

    const runtimeContract = buildRuntimeJsonContract({
      fileUrl: `http://localhost:3000/uploads/${basename(uploadFile)}`,
      jsonData: {
        '中央红军（红一方面军）': [{ 地名: '江西于都', 地点坐标: [115.4167, 25.95], 时间: '1934-10', 关键事件: '长征出发' }],
        '红二方面军': [],
        '红四方面军': [],
      },
    })

    const fileData = [
      '文件: a.json',
      `文件获取链接URL: ${runtimeContract.fileUrl}`,
      formatRuntimeJsonContract(runtimeContract),
    ].join('\n')

    const result = await service.enrich(fileData)
    expect(result.summary.status).toBe('ok')
    expect(result.fileData).toContain('json-runtime-contract-v1')
    expect(result.fileData).toContain('中央红军（红一方面军）')
    expect(result.fileData).toContain('item["地点坐标"] -> [lng, lat]')
    expect(result.fileData).toContain('rawData["中央红军（红一方面军）"]')
  })
})

async function writeUploadJson(name: string, data: any): Promise<string> {
  const uploadDir = resolve(config.upload.dir)
  await mkdir(uploadDir, { recursive: true })
  const filePath = resolve(uploadDir, name)
  await writeFile(filePath, JSON.stringify(data), 'utf-8')
  createdFiles.push(filePath)
  return filePath
}

async function writeUploadBuffer(name: string, content: Buffer): Promise<string> {
  const uploadDir = resolve(config.upload.dir)
  await mkdir(uploadDir, { recursive: true })
  const filePath = resolve(uploadDir, name)
  await writeFile(filePath, content)
  createdFiles.push(filePath)
  return filePath
}
