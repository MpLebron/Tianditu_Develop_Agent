import { mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { dirname } from 'path'
import { chromium } from 'playwright-core'

export interface ShareThumbnailRendererOptions {
  enabled: boolean
  baseUrl: string
  chromiumPath?: string
  timeoutMs: number
  waitAfterLoadMs: number
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
const THUMB_WIDTH = 1200
const THUMB_HEIGHT = 630

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

  constructor(opts: ShareThumbnailRendererOptions) {
    this.opts = opts
  }

  async render(input: RenderShareThumbnailInput): Promise<RenderShareThumbnailResult> {
    if (!this.opts.enabled) {
      return { ok: false, reason: 'thumbnail renderer disabled' }
    }

    const origin = String(this.opts.baseUrl || '').replace(/\/+$/, '')
    if (!origin.startsWith('http://') && !origin.startsWith('https://')) {
      return { ok: false, reason: 'invalid thumbnail base url' }
    }

    const executablePath = pickChromiumExecutablePath(this.opts.chromiumPath)
    const pageUrl = `${origin}/share-assets/${input.slug}/index.html`
    const timeout = Number.isFinite(this.opts.timeoutMs) ? Math.max(this.opts.timeoutMs, 8000) : 30000
    const waitAfterLoadMs = Number.isFinite(this.opts.waitAfterLoadMs) ? Math.max(this.opts.waitAfterLoadMs, 500) : 1800

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
      await page.waitForTimeout(1000)

      await page.waitForResponse((res) => {
        const u = res.url()
        return /tianditu\.gov\.cn/i.test(u) && res.ok()
      }, { timeout: Math.min(timeout, 12000) }).catch(() => undefined)

      await page.waitForLoadState('networkidle', { timeout: Math.min(timeout, 15000) }).catch(() => undefined)
      await page.waitForTimeout(waitAfterLoadMs)

      let mapBox: { x: number; y: number; width: number; height: number } | null = null
      const candidates = ['#map', '.map', '[id*="map"]']
      for (const sel of candidates) {
        const box = await page.locator(sel).first().boundingBox().catch(() => null)
        if (!box) continue
        if (box.width >= 180 && box.height >= 120) {
          mapBox = box
          break
        }
      }

      const view = page.viewportSize() || { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT }
      const screenshotOptions: Parameters<typeof page.screenshot>[0] = {
        path: input.outputPath,
        type: 'png',
      }

      if (mapBox) {
        const mapX = Math.max(0, Math.floor(mapBox.x))
        const mapY = Math.max(0, Math.floor(mapBox.y))
        const mapW = Math.max(1, Math.floor(mapBox.width))
        const mapH = Math.max(1, Math.floor(mapBox.height))

        const clipWidth = Math.min(THUMB_WIDTH, view.width)
        const clipHeight = Math.min(THUMB_HEIGHT, view.height)

        const preferredX = mapW >= clipWidth
          ? mapX + Math.floor((mapW - clipWidth) / 2)
          : mapX - Math.floor((clipWidth - mapW) / 2)
        const preferredY = mapH >= clipHeight
          ? mapY + Math.floor((mapH - clipHeight) / 2)
          : mapY - Math.floor((clipHeight - mapH) / 2)

        const maxX = Math.max(0, view.width - clipWidth)
        const maxY = Math.max(0, view.height - clipHeight)
        const clipX = Math.min(Math.max(0, preferredX), maxX)
        const clipY = Math.min(Math.max(0, preferredY), maxY)

        screenshotOptions.clip = {
          x: clipX,
          y: clipY,
          width: clipWidth,
          height: clipHeight,
        }
      }

      await page.screenshot({
        ...screenshotOptions,
      })

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
  }
}
