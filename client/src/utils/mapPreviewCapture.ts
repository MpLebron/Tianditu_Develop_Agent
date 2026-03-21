import html2canvas from 'html2canvas'

const DEFAULT_MIN_BASE64_LEN = 800

export interface MapPreviewCaptureResult {
  base64: string
  mode: 'canvas' | 'dom'
  canvasCount: number
  canvasReadable: boolean
  canvasTainted: boolean
}

function dataUrlToBase64(dataUrl: string): string | null {
  const raw = String(dataUrl || '')
  const marker = ';base64,'
  const idx = raw.indexOf(marker)
  if (idx < 0) return null
  const value = raw.slice(idx + marker.length).trim()
  return value || null
}

function isCaptureValid(base64?: string | null, minLen = DEFAULT_MIN_BASE64_LEN): base64 is string {
  return typeof base64 === 'string' && base64.length >= minLen
}

function pickLargestCanvas(doc: Document): { canvas: HTMLCanvasElement | null; count: number } {
  const canvases = Array.from(doc.querySelectorAll('canvas'))
  if (!canvases.length) return { canvas: null, count: 0 }
  let candidate: HTMLCanvasElement | null = null
  let maxArea = 0
  for (const canvas of canvases) {
    const width = Number(canvas.width || canvas.clientWidth || 0)
    const height = Number(canvas.height || canvas.clientHeight || 0)
    const area = width * height
    if (area > maxArea) {
      maxArea = area
      candidate = canvas as HTMLCanvasElement
    }
  }
  return { canvas: candidate, count: canvases.length }
}

interface CaptureBounds {
  left: number
  top: number
  width: number
  height: number
}

function getRect(el: Element | null): DOMRect | null {
  if (!el || typeof (el as HTMLElement).getBoundingClientRect !== 'function') return null
  const rect = (el as HTMLElement).getBoundingClientRect()
  if (!rect || rect.width <= 0 || rect.height <= 0) return null
  return rect
}

function rectsIntersect(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

function fillCaptureBackground(ctx: CanvasRenderingContext2D, target: HTMLElement | null, width: number, height: number) {
  let color = '#ffffff'
  try {
    const view = target?.ownerDocument?.defaultView || window
    const computed = target ? view.getComputedStyle(target).backgroundColor : ''
    if (computed && computed !== 'rgba(0, 0, 0, 0)' && computed !== 'transparent') {
      color = computed
    }
  } catch {
    // ignore
  }
  ctx.fillStyle = color
  ctx.fillRect(0, 0, width, height)
}

async function capturePreviewDomBase64(
  win: Window,
  doc: Document,
  bounds: CaptureBounds,
  minLen: number,
): Promise<string | null> {
  const rootEl = (doc.documentElement || doc.body) as HTMLElement | null
  if (!rootEl) return null

  const rendered = await html2canvas(rootEl, {
    useCORS: true,
    allowTaint: true,
    logging: false,
    backgroundColor: null,
    ignoreElements: (el) => el instanceof HTMLCanvasElement || el.id === 'codex-app-fullscreen-button',
    width: bounds.width,
    height: bounds.height,
    windowWidth: Math.max(bounds.width, win.innerWidth || 0),
    windowHeight: Math.max(bounds.height, win.innerHeight || 0),
    scrollX: win.scrollX || 0,
    scrollY: win.scrollY || 0,
  })

  const base64 = dataUrlToBase64(rendered.toDataURL('image/png'))
  if (!isCaptureValid(base64, minLen)) return null
  return base64
}

function findPreviewIframe(): HTMLIFrameElement | null {
  const exact = document.querySelector('iframe[title="地图预览"]')
  if (exact instanceof HTMLIFrameElement) return exact

  const fallback = document.querySelector('iframe')
  if (fallback instanceof HTMLIFrameElement) return fallback
  return null
}

export async function captureMapPreviewPngBase64(minLen = DEFAULT_MIN_BASE64_LEN): Promise<MapPreviewCaptureResult> {
  const iframe = findPreviewIframe()
  if (!iframe) throw new Error('未找到地图预览容器')

  const win = iframe.contentWindow
  const doc = iframe.contentDocument
  if (!win || !doc) throw new Error('地图预览尚未就绪')

  await new Promise<void>((resolve) => {
    win.requestAnimationFrame(() => resolve())
  })
  await new Promise((resolve) => setTimeout(resolve, 220))

  const canvasMeta = pickLargestCanvas(doc)
  const rootEl = (doc.documentElement || doc.body) as HTMLElement | null
  const captureBounds: CaptureBounds = {
    left: 0,
    top: 0,
    width: Math.max(320, rootEl?.clientWidth || win.innerWidth || 0),
    height: Math.max(240, rootEl?.clientHeight || win.innerHeight || 0),
  }

  let canvasReadable = false
  let canvasTainted = false
  const output = document.createElement('canvas')
  output.width = Math.max(1, Math.round(captureBounds.width))
  output.height = Math.max(1, Math.round(captureBounds.height))
  const ctx = output.getContext('2d')
  if (!ctx) throw new Error('无法创建截图画布')

  const mapHost = doc.querySelector('#map, .map, [id*="map"], [class*="map"]') as HTMLElement | null
  fillCaptureBackground(ctx, mapHost, output.width, output.height)

  let drawnCount = 0
  let overlayMerged = false
  const canvases = Array.from(doc.querySelectorAll('canvas'))
  for (const canvas of canvases) {
    const rect = getRect(canvas)
    if (!rect) continue
    const regionRect = {
      left: captureBounds.left,
      top: captureBounds.top,
      right: captureBounds.left + captureBounds.width,
      bottom: captureBounds.top + captureBounds.height,
    } as DOMRect
    if (!rectsIntersect(rect, regionRect)) continue

    const scaleX = rect.width > 0 ? canvas.width / rect.width : 1
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1
    const left = Math.max(rect.left, captureBounds.left)
    const top = Math.max(rect.top, captureBounds.top)
    const right = Math.min(rect.right, captureBounds.left + captureBounds.width)
    const bottom = Math.min(rect.bottom, captureBounds.top + captureBounds.height)
    const width = right - left
    const height = bottom - top
    if (width <= 0 || height <= 0) continue

    try {
      ctx.drawImage(
        canvas,
        (left - rect.left) * scaleX,
        (top - rect.top) * scaleY,
        width * scaleX,
        height * scaleY,
        left - captureBounds.left,
        top - captureBounds.top,
        width,
        height,
      )
      drawnCount += 1
      canvasReadable = true
    } catch {
      canvasTainted = true
    }
  }

  try {
    const domBase64 = await capturePreviewDomBase64(win, doc, captureBounds, minLen)
    if (domBase64) {
      const overlayImage = new Image()
      await new Promise<void>((resolve, reject) => {
        overlayImage.onload = () => resolve()
        overlayImage.onerror = () => reject(new Error('DOM 叠加层解码失败'))
        overlayImage.src = `data:image/png;base64,${domBase64}`
      })
      ctx.drawImage(overlayImage, 0, 0, output.width, output.height)
      overlayMerged = true
    }
  } catch {
    // ignore and keep canvas-only result
  }

  if (!drawnCount) {
    const fallbackBase64 = dataUrlToBase64(output.toDataURL('image/png'))
    if (isCaptureValid(fallbackBase64, minLen)) {
      return {
        base64: fallbackBase64,
        mode: 'dom',
        canvasCount: canvasMeta.count,
        canvasReadable,
        canvasTainted,
      }
    }
    throw new Error('未能从地图渲染画布导出有效截图')
  }

  const base64 = dataUrlToBase64(output.toDataURL('image/png'))
  if (!isCaptureValid(base64, minLen)) throw new Error('无法生成有效截图')

  return {
    base64,
    mode: overlayMerged ? 'dom' : 'canvas',
    canvasCount: canvasMeta.count,
    canvasReadable,
    canvasTainted,
  }
}
