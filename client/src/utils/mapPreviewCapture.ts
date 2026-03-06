import html2canvas from 'html2canvas'

const DEFAULT_MIN_BASE64_LEN = 800

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

function pickLargestCanvas(doc: Document): HTMLCanvasElement | null {
  const canvases = Array.from(doc.querySelectorAll('canvas'))
  if (!canvases.length) return null
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
  return candidate
}

function findPreviewIframe(): HTMLIFrameElement | null {
  const exact = document.querySelector('iframe[title="地图预览"]')
  if (exact instanceof HTMLIFrameElement) return exact

  const fallback = document.querySelector('iframe')
  if (fallback instanceof HTMLIFrameElement) return fallback
  return null
}

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片解码失败'))
    img.src = dataUrl
  })
}

async function isLikelyBlankDataUrl(dataUrl: string): Promise<boolean> {
  try {
    const img = await loadImageFromDataUrl(dataUrl)
    const sampleWidth = Math.max(8, Math.min(64, img.naturalWidth || img.width || 64))
    const sampleHeight = Math.max(8, Math.min(64, img.naturalHeight || img.height || 64))
    const canvas = document.createElement('canvas')
    canvas.width = sampleWidth
    canvas.height = sampleHeight
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return false

    ctx.drawImage(img, 0, 0, sampleWidth, sampleHeight)
    const { data } = ctx.getImageData(0, 0, sampleWidth, sampleHeight)

    let minR = 255
    let minG = 255
    let minB = 255
    let maxR = 0
    let maxG = 0
    let maxB = 0
    let visiblePixels = 0
    const buckets = new Set<number>()

    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3]
      if (a < 8) continue
      visiblePixels += 1
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      if (r < minR) minR = r
      if (g < minG) minG = g
      if (b < minB) minB = b
      if (r > maxR) maxR = r
      if (g > maxG) maxG = g
      if (b > maxB) maxB = b
      buckets.add(((r >> 5) << 10) | ((g >> 5) << 5) | (b >> 5))
    }

    if (!visiblePixels) return true

    const spread = (maxR - minR) + (maxG - minG) + (maxB - minB)
    if (spread <= 16) return true
    if (buckets.size <= 2 && spread <= 28) return true

    return false
  } catch {
    return false
  }
}

export async function captureMapPreviewPngBase64(minLen = DEFAULT_MIN_BASE64_LEN): Promise<string> {
  const iframe = findPreviewIframe()
  if (!iframe) throw new Error('未找到地图预览容器')

  const win = iframe.contentWindow
  const doc = iframe.contentDocument
  if (!win || !doc) throw new Error('地图预览尚未就绪')

  await new Promise<void>((resolve) => {
    win.requestAnimationFrame(() => resolve())
  })
  await new Promise((resolve) => setTimeout(resolve, 220))

  const largestCanvas = pickLargestCanvas(doc)
  if (largestCanvas) {
    try {
      const canvasDataUrl = largestCanvas.toDataURL('image/png')
      const canvasBase64 = dataUrlToBase64(canvasDataUrl)
      if (isCaptureValid(canvasBase64, minLen)) {
        const blank = await isLikelyBlankDataUrl(canvasDataUrl)
        if (!blank) return canvasBase64
      }
    } catch {
      // Canvas may be tainted by cross-origin texture, fallback to html2canvas
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

  const renderedDataUrl = rendered.toDataURL('image/png')
  const base64 = dataUrlToBase64(renderedDataUrl)
  if (!isCaptureValid(base64, minLen)) {
    throw new Error('无法生成有效截图')
  }
  const blank = await isLikelyBlankDataUrl(renderedDataUrl)
  if (blank) {
    throw new Error('截图疑似空白图像')
  }
  return base64
}
