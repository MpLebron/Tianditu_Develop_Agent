const MIN_SAMPLE_VISIBLE_PIXELS = 40
const BLANK_SPREAD_THRESHOLD = 18
const BLANK_BUCKET_THRESHOLD = 3

function loadImage(base64: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('缩略图图像解码失败'))
    img.src = `data:image/png;base64,${base64}`
  })
}

export async function isLikelyBlankThumbnailBase64(base64: string): Promise<boolean> {
  const value = String(base64 || '').trim()
  if (!value) return true

  const img = await loadImage(value)
  const width = Math.max(1, img.naturalWidth || img.width || 1)
  const height = Math.max(1, img.naturalHeight || img.height || 1)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return false

  ctx.drawImage(img, 0, 0, width, height)
  const pixels = ctx.getImageData(0, 0, width, height).data
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
      const a = pixels[idx + 3]
      if (a < 8) continue
      visible += 1
      const r = pixels[idx]
      const g = pixels[idx + 1]
      const b = pixels[idx + 2]
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
  return spread <= BLANK_SPREAD_THRESHOLD && buckets.size <= BLANK_BUCKET_THRESHOLD
}
