import { afterEach, describe, expect, it, vi } from 'vitest'
import { access, mkdir, rm } from 'fs/promises'
import { resolve } from 'path'
import { tmpdir } from 'os'
import { PNG } from 'pngjs'
import { ShareStore } from '../src/services/ShareStore.js'

const createdDirs: string[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(createdDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('ShareStore thumbnails', () => {
  it('uses the uploaded thumbnail immediately', async () => {
    const rootDir = await createTempDir('share')
    const uploadDir = await createTempDir('uploads')
    const store = createStore(rootDir, uploadDir)

    const created = await store.createShare({
      htmlCode: '<!DOCTYPE html><html><body><div id="map"></div></body></html>',
      title: '北京市中心地图',
      visibility: 'public',
      thumbnailBase64: createThumbnailPngBuffer().toString('base64'),
    })

    expect(created.item.thumbnailRelativePath).toBe(`${created.item.slug}/thumbnail.png`)
    await access(resolve(rootDir, 'snapshots', created.item.thumbnailRelativePath))
  })

  it('falls back to an svg placeholder when no cached preview thumbnail is provided', async () => {
    const rootDir = await createTempDir('share')
    const uploadDir = await createTempDir('uploads')
    const store = createStore(rootDir, uploadDir)

    const created = await store.createShare({
      htmlCode: '<!DOCTYPE html><html><body><div id="map"></div></body></html>',
      title: '北京市中心地图',
      visibility: 'public',
    })

    expect(created.item.thumbnailRelativePath).toBe(`${created.item.slug}/thumbnail.svg`)
    await access(resolve(rootDir, 'snapshots', created.item.thumbnailRelativePath))
  })
})

function createStore(rootDir: string, uploadDir: string) {
  return new ShareStore({
    rootDir,
    uploadDir,
    thumbnail: {
      enabled: true,
      baseUrl: 'http://127.0.0.1:3000',
      timeoutMs: 1200,
      waitAfterLoadMs: 200,
      maxConcurrentRenders: 1,
    },
  })
}

function createThumbnailPngBuffer(): Buffer {
  const png = new PNG({ width: 48, height: 48 })
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const idx = (png.width * y + x) << 2
      png.data[idx] = x < png.width / 2 ? 31 : 24
      png.data[idx + 1] = y < png.height / 2 ? 95 : 164
      png.data[idx + 2] = 255 - Math.floor((x / png.width) * 80)
      png.data[idx + 3] = 255
    }
  }
  return PNG.sync.write(png)
}

async function createTempDir(prefix: string): Promise<string> {
  const dir = resolve(tmpdir(), `tianditu-share-${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  await mkdir(dir, { recursive: true })
  createdDirs.push(dir)
  return dir
}
