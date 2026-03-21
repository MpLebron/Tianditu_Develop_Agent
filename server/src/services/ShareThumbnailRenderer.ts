import { mkdir, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { dirname } from 'path'
import { chromium } from 'playwright-core'
import { PNG } from 'pngjs'
import { AsyncLimiter, normalizeConcurrencyLimit } from '../utils/AsyncLimiter.js'

export interface ShareThumbnailRendererOptions {
  enabled: boolean
  baseUrl: string
  chromiumPath?: string
  timeoutMs: number
  waitAfterLoadMs: number
  maxConcurrentRenders?: number
}

export interface RenderShareThumbnailInput {
  slug: string
  title: string
  visibility: 'public' | 'unlisted'
  outputPath: string
}

export interface RenderShareThumbnailResult {
  ok: boolean
  reason?: string
}

const VIEWPORT_WIDTH = 1920
const VIEWPORT_HEIGHT = 1080
const MIN_VALID_PNG_BYTES = 9000
const MAX_CAPTURE_RETRIES = 1
const MIN_SAMPLE_VISIBLE_PIXELS = 40
const BLANK_SPREAD_THRESHOLD = 18
const BLANK_BUCKET_THRESHOLD = 3
const INITIAL_SETTLE_WAIT_MS = 350
const MAP_ATTACH_WAIT_MS = 1800
const NETWORK_SETTLE_WAIT_MS = 2500
const RETRY_WAIT_BASE_MS = 500

export function isLikelyBlankThumbnailBuffer(buffer: Buffer): boolean {
  try {
    const png = PNG.sync.read(buffer)
    const width = Math.max(1, png.width || 1)
    const height = Math.max(1, png.height || 1)
    const stepX = Math.max(1, Math.floor(width / 96))
    const stepY = Math.max(1, Math.floor(height / 96))

    let minR = 255
    let minG = 255
    let minB = 255
    let maxR = 0
    let maxG = 0
    let maxB = 0
    let visible = 0
    const buckets = new Set<number>()

    for (let y = 0; y < height; y += stepY) {
      for (let x = 0; x < width; x += stepX) {
        const idx = (width * y + x) << 2
        const a = png.data[idx + 3]
        if (a < 8) continue
        visible += 1
        const r = png.data[idx]
        const g = png.data[idx + 1]
        const b = png.data[idx + 2]
        if (r < minR) minR = r
        if (g < minG) minG = g
        if (b < minB) minB = b
        if (r > maxR) maxR = r
        if (g > maxG) maxG = g
        if (b > maxB) maxB = b
        buckets.add(((r >> 5) << 10) | ((g >> 5) << 5) | (b >> 5))
      }
    }

    if (visible < MIN_SAMPLE_VISIBLE_PIXELS) return true
    const spread = (maxR - minR) + (maxG - minG) + (maxB - minB)
    if (spread <= BLANK_SPREAD_THRESHOLD && buckets.size <= BLANK_BUCKET_THRESHOLD) return true
    return false
  } catch {
    return false
  }
}

function pickChromiumExecutablePath(configPath?: string): string | undefined {
  const explicit = String(configPath || '').trim()
  if (explicit) return explicit

  const candidates = [
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ]

  for (const p of candidates) {
    if (existsSync(p)) return p
  }

  return undefined
}

export class ShareThumbnailRenderer {
  private readonly opts: ShareThumbnailRendererOptions
  private readonly limiter: AsyncLimiter

  constructor(opts: ShareThumbnailRendererOptions) {
    this.opts = opts
    this.limiter = new AsyncLimiter(normalizeConcurrencyLimit(opts.maxConcurrentRenders, 2))
  }

  async render(input: RenderShareThumbnailInput): Promise<RenderShareThumbnailResult> {
    return this.limiter.run(async () => {
      if (!this.opts.enabled) {
        return { ok: false, reason: 'thumbnail renderer disabled' }
      }

      const origin = String(this.opts.baseUrl || '').replace(/\/+$/, '')
      if (!origin.startsWith('http://') && !origin.startsWith('https://')) {
        return { ok: false, reason: 'invalid thumbnail base url' }
      }

      const executablePath = pickChromiumExecutablePath(this.opts.chromiumPath)
      const pageUrl = `${origin}/share-assets/${input.slug}/index.html`
      const timeout = Number.isFinite(this.opts.timeoutMs)
        ? Math.min(Math.max(this.opts.timeoutMs, 4000), 15000)
        : 12000
      const waitAfterLoadMs = Number.isFinite(this.opts.waitAfterLoadMs)
        ? Math.min(Math.max(this.opts.waitAfterLoadMs, 150), 1500)
        : 600

      await mkdir(dirname(input.outputPath), { recursive: true })

      let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null

      try {
        browser = await chromium.launch({
          headless: true,
          executablePath,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--ignore-gpu-blocklist',
            '--enable-webgl',
            '--use-angle=swiftshader',
            '--font-render-hinting=medium',
          ],
        })

        const context = await browser.newContext({
          viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
          deviceScaleFactor: 1,
        })
        const page = await context.newPage()

        page.setDefaultTimeout(timeout)
        page.setDefaultNavigationTimeout(timeout)

        await page.goto(pageUrl, { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(Math.min(INITIAL_SETTLE_WAIT_MS, waitAfterLoadMs))

        await Promise.allSettled([
          page.locator('canvas, #map, .map, [id*="map"]').first().waitFor({
            state: 'attached',
            timeout: Math.min(timeout, MAP_ATTACH_WAIT_MS),
          }),
          page.waitForLoadState('networkidle', {
            timeout: Math.min(timeout, NETWORK_SETTLE_WAIT_MS),
          }),
        ])
        await page.waitForTimeout(waitAfterLoadMs)

        // 分享封面要保留标题栏、侧边栏、统计卡片等整页 UI，
        // 这里不再裁到 map 节点，只截取当前可见应用页面。
        const screenshotOptions: Parameters<typeof page.screenshot>[0] = { type: 'png' }

        let screenshotBuffer: Buffer | null = null
        let lastByteLength = 0
        let blankRejected = 0

        for (let attempt = 0; attempt <= MAX_CAPTURE_RETRIES; attempt += 1) {
          const buffer = await page.screenshot({
            ...screenshotOptions,
          }) as Buffer
          lastByteLength = buffer.byteLength

          if (lastByteLength >= MIN_VALID_PNG_BYTES) {
            const blank = isLikelyBlankThumbnailBuffer(buffer)
            if (!blank) {
              screenshotBuffer = buffer
              break
            }
            blankRejected += 1
          }

          if (attempt < MAX_CAPTURE_RETRIES) {
            await page.waitForTimeout(RETRY_WAIT_BASE_MS + attempt * 450)
          }
        }

        if (!screenshotBuffer) {
          await context.close()
          await browser.close()
          browser = null
          return { ok: false, reason: `blank thumbnail screenshot (bytes=${lastByteLength}, blankRejected=${blankRejected})` }
        }

        await writeFile(input.outputPath, screenshotBuffer)

        await context.close()
        await browser.close()
        browser = null

        return { ok: true }
      } catch (err: any) {
        return {
          ok: false,
          reason: err?.message || 'thumbnail render failed',
        }
      } finally {
        if (browser) {
          try {
            await browser.close()
          } catch {
            // ignore close error
          }
        }
      }
    })
  }
}
