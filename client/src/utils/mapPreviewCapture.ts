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
  let canvasReadable = false
  let canvasTainted = false
  if (canvasMeta.canvas) {
    try {
      const canvasBase64 = dataUrlToBase64(canvasMeta.canvas.toDataURL('image/png'))
      if (isCaptureValid(canvasBase64, minLen)) {
        canvasReadable = true
        return {
          base64: canvasBase64,
          mode: 'canvas',
          canvasCount: canvasMeta.count,
          canvasReadable: true,
          canvasTainted: false,
        }
      }
    } catch {
      // Canvas may be tainted by cross-origin texture, fallback to html2canvas
      canvasTainted = true
    }
  }

  const rootEl = (doc.documentElement || doc.body) as HTMLElement | null
  if (!rootEl) throw new Error('地图页面根节点不存在')

  const rendered = await html2canvas(rootEl, {
    useCORS: true,
    allowTaint: true,
    logging: false,
    backgroundColor: '#ffffff',
    width: Math.max(320, rootEl.clientWidth || win.innerWidth || 0),
    height: Math.max(240, rootEl.clientHeight || win.innerHeight || 0),
    windowWidth: Math.max(320, win.innerWidth || 0),
    windowHeight: Math.max(240, win.innerHeight || 0),
    scrollX: win.scrollX || 0,
    scrollY: win.scrollY || 0,
  })

  const base64 = dataUrlToBase64(rendered.toDataURL('image/png'))
  if (!isCaptureValid(base64, minLen)) {
    throw new Error('无法生成有效截图')
  }
  return {
    base64,
    mode: 'dom',
    canvasCount: canvasMeta.count,
    canvasReadable,
    canvasTainted,
  }
}
