import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, rm, writeFile } from 'fs/promises'
import { resolve } from 'path'
import { tmpdir } from 'os'
import { FileParser } from '../src/services/FileParser.js'

const createdDirs: string[] = []

afterEach(async () => {
  await Promise.all(createdDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('FileParser', () => {
  it('parses standard UTF-8 JSON objects without changing existing behavior', async () => {
    const filePath = await writeTempFile('utf8.json', Buffer.from('{"teams":[{"name":"demo"}]}', 'utf-8'))
    const parser = new FileParser()

    const result = await parser.parse(filePath)

    expect(result.type).toBe('json')
    expect(result.headers).toEqual(['teams'])
    expect(result.rows[0]).toEqual({ teams: [{ name: 'demo' }] })
    expect(result.rootShape).toBe('object')
    expect(result.topLevelKeys).toEqual(['teams'])
  })

  it('parses standard UTF-8 JSON arrays and records array metadata', async () => {
    const filePath = await writeTempFile('array.json', Buffer.from('[{"name":"demo","lng":116.4,"lat":39.9}]', 'utf-8'))
    const parser = new FileParser()

    const result = await parser.parse(filePath)

    expect(result.type).toBe('json')
    expect(result.rootShape).toBe('array')
    expect(result.arrayLength).toBe(1)
    expect(result.headers).toEqual(['name', 'lng', 'lat'])
  })

  it('recognizes wrapped GeoJSON payloads and preserves original root metadata', async () => {
    const filePath = await writeTempFile(
      'wrapped.geojson.json',
      Buffer.from('{"status":200,"message":"ok","data":{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"name":"demo"},"geometry":{"type":"Point","coordinates":[116.4,39.9]}}]}}', 'utf-8'),
    )
    const parser = new FileParser()

    const result = await parser.parse(filePath)

    expect(result.type).toBe('geojson')
    expect(result.rootShape).toBe('object')
    expect(result.topLevelKeys).toContain('data')
    expect(result.geojson?.type).toBe('FeatureCollection')
  })

  it('parses GB18030/GBK encoded JSON objects with Chinese keys', async () => {
    const gb18030Hex = '7b22d6d0d1ebbaecbefca3a8baecd2bbb7bdc3e6befca3a9223a5b7b22b5d8c3fb223a22bdadcef7d3dab6bc227d5d7d'
    const filePath = await writeTempFile('gb18030.json', Buffer.from(gb18030Hex, 'hex'))
    const parser = new FileParser()

    const result = await parser.parse(filePath)

    expect(result.type).toBe('json')
    expect(result.headers).toEqual(['中央红军（红一方面军）'])
    expect(result.rows[0]['中央红军（红一方面军）'][0]).toEqual({ 地名: '江西于都' })
    expect(result.encoding).toBe('gb18030')
  })

  it('rejects geojson files whose content is not a valid GeoJSON structure', async () => {
    const filePath = await writeTempFile('invalid.geojson', Buffer.from('{"foo":"bar"}', 'utf-8'))
    const parser = new FileParser()

    await expect(parser.parse(filePath)).rejects.toThrow('GeoJSON 文件内容不合法')
  })

  it('rejects json objects that cannot support current visualization flow', async () => {
    const filePath = await writeTempFile('invalid.json', Buffer.from('{"foo":"bar"}', 'utf-8'))
    const parser = new FileParser()

    await expect(parser.parse(filePath)).rejects.toThrow('JSON 文件内容不合法')
  })

  it('accepts object-root json files that contain top-level object arrays', async () => {
    const filePath = await writeTempFile(
      'long-march-like.json',
      Buffer.from('{"中央红军":[{"地名":"江西于都","经度":114.9,"纬度":25.95}],"红二方面军":[{"地名":"湖南","经度":111.7,"纬度":27.3}]}', 'utf-8'),
    )
    const parser = new FileParser()

    const result = await parser.parse(filePath)

    expect(result.type).toBe('json')
    expect(result.rootShape).toBe('object')
    expect(result.topLevelKeys).toEqual(['中央红军', '红二方面军'])
  })
})

async function writeTempFile(name: string, content: Buffer): Promise<string> {
  const dir = resolve(tmpdir(), `tianditu-smart-map-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  await mkdir(dir, { recursive: true })
  createdDirs.push(dir)
  const filePath = resolve(dir, name)
  await writeFile(filePath, content)
  return filePath
}
