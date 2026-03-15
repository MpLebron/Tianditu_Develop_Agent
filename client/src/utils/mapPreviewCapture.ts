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

function getRect(el: Element | null): DOMRect | null {
  if (!el || typeof (el as HTMLElement).getBoundingClientRect !== 'function') return null
  const rect = (el as HTMLElement).getBoundingClientRect()
  if (!rect || rect.width <= 0 || rect.height <= 0) return null
  return rect
}

function rectsIntersect(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

function pickCaptureRegion(doc: Document, fallbackCanvas: HTMLCanvasElement | null): DOMRect | null {
  const hostSelectors = ['#map', '.map', '[id*="map"]', '[class*="map"]']
  for (const selector of hostSelectors) {
    const rect = getRect(doc.querySelector(selector))
    if (rect && rect.width >= 180 && rect.height >= 120) return rect
  }
  return getRect(fallbackCanvas)
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
  const captureRegion = pickCaptureRegion(doc, canvasMeta.canvas)
  if (!captureRegion) throw new Error('未找到可截图的地图渲染区域')

  let canvasReadable = false
  let canvasTainted = false
  const output = document.createElement('canvas')
  output.width = Math.max(1, Math.round(captureRegion.width))
  output.height = Math.max(1, Math.round(captureRegion.height))
  const ctx = output.getContext('2d')
  if (!ctx) throw new Error('无法创建截图画布')

  const mapHost = doc.querySelector('#map, .map, [id*="map"], [class*="map"]') as HTMLElement | null
  fillCaptureBackground(ctx, mapHost, output.width, output.height)

  let drawnCount = 0
  const canvases = Array.from(doc.querySelectorAll('canvas'))
  for (const canvas of canvases) {
    const rect = getRect(canvas)
    if (!rect || !rectsIntersect(rect, captureRegion)) continue

    const scaleX = rect.width > 0 ? canvas.width / rect.width : 1
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1
    const left = Math.max(rect.left, captureRegion.left)
    const top = Math.max(rect.top, captureRegion.top)
    const right = Math.min(rect.right, captureRegion.right)
    const bottom = Math.min(rect.bottom, captureRegion.bottom)
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
        left - captureRegion.left,
        top - captureRegion.top,
        width,
        height,
      )
      drawnCount += 1
      canvasReadable = true
    } catch {
      canvasTainted = true
    }
  }

  if (!drawnCount) {
    throw new Error('未能从地图渲染画布导出有效截图')
  }

  const base64 = dataUrlToBase64(output.toDataURL('image/png'))
  if (!isCaptureValid(base64, minLen)) throw new Error('无法生成有效截图')

  return {
    base64,
    mode: 'canvas',
    canvasCount: canvasMeta.count,
    canvasReadable,
    canvasTainted,
  }
}
