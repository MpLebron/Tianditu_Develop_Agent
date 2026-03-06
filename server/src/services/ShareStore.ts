import { createHash, randomUUID } from 'crypto'
import { access, copyFile, mkdir, readFile, stat, writeFile } from 'fs/promises'
import { basename, extname, resolve } from 'path'
import { ShareThumbnailRenderer } from './ShareThumbnailRenderer.js'

export type ShareVisibility = 'unlisted' | 'public'
export type ShareStatus = 'active' | 'removed'

interface ShareIndexFile {
  version: 1
  items: ShareRecord[]
}

export interface ShareRecord {
  id: string
  slug: string
  title: string
  description: string
  visibility: ShareVisibility
  status: ShareStatus
  htmlRelativePath: string
  thumbnailRelativePath: string
  assetFiles: string[]
  viewCount: number
  lastViewedAt?: number
  createdAt: number
  updatedAt: number
  manageTokenHash: string
  codeSizeBytes: number
}

export interface CreateShareInput {
  htmlCode: string
  title?: string
  description?: string
  visibility?: ShareVisibility
  thumbnailBase64?: string
}

export interface UpdateShareInput {
  title?: string
  description?: string
  visibility?: ShareVisibility
}

export interface ListPublicOptions {
  page: number
  pageSize: number
}

export interface ListPublicResult {
  total: number
  page: number
  pageSize: number
  items: ShareRecord[]
}

export interface ShareStoreOptions {
  rootDir: string
  uploadDir: string
  tiandituToken?: string
  thumbnail?: {
    enabled?: boolean
    baseUrl?: string
    chromiumPath?: string
    timeoutMs?: number
    waitAfterLoadMs?: number
  }
}

const INDEX_FILE_NAME = 'index.json'
const SNAPSHOT_DIR_NAME = 'snapshots'

function nowTs() {
  return Date.now()
}

function hashToken(raw: string) {
  return createHash('sha256').update(raw).digest('hex')
}

function normalizeVisibility(input?: string): ShareVisibility {
  return input === 'public' ? 'public' : 'unlisted'
}

function sanitizeTitle(input?: string): string {
  const raw = String(input || '').trim()
  const title = raw || `地图快照 ${new Date().toLocaleString('zh-CN', { hour12: false })}`
  return title.slice(0, 80)
}

function sanitizeDescription(input?: string): string {
  const raw = String(input || '').trim()
  return raw.slice(0, 240)
}

const MAX_THUMBNAIL_IMAGE_BYTES = 6 * 1024 * 1024
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const MIN_PNG_BYTES_PER_PIXEL = 0.03
const MIN_DENSITY_CHECK_PIXELS = 1200 * 630

function decodeThumbnailBase64(raw?: string): Buffer | null {
  const input = String(raw || '').trim()
  if (!input) return null

  const normalized = input
    .replace(/^data:image\/png;base64,/i, '')
    .replace(/\s+/g, '')
    .trim()
  if (!normalized) return null

  try {
    const buf = Buffer.from(normalized, 'base64')
    if (!buf.length || buf.length > MAX_THUMBNAIL_IMAGE_BYTES) return null
    if (buf.length < PNG_SIGNATURE.length) return null
    for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
      if (buf[i] !== PNG_SIGNATURE[i]) return null
    }
    // PNG IHDR chunk stores width/height at byte 16..23.
    if (buf.length >= 24 && buf.toString('ascii', 12, 16) === 'IHDR') {
      const width = buf.readUInt32BE(16)
      const height = buf.readUInt32BE(20)
      const pixels = width * height
      if (width > 0 && height > 0 && pixels >= MIN_DENSITY_CHECK_PIXELS) {
        const density = buf.length / pixels
        if (!Number.isFinite(density) || density < MIN_PNG_BYTES_PER_PIXEL) return null
      }
    }
    return buf
  } catch {
    return null
  }
}

function safeSlug(): string {
  const seed = randomUUID().replace(/-/g, '')
  return `${Date.now().toString(36)}-${seed.slice(0, 10)}`
}

function escapeXml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function buildThumbnailSvg(title: string, visibility: ShareVisibility, createdAt: number): string {
  const normalizedTitle = String(title || '地图快照').replace(/\s+/g, ' ').trim() || '地图快照'
  const displayTitle = normalizedTitle.length > 16 ? `${normalizedTitle.slice(0, 15)}…` : normalizedTitle
  const safeTitle = escapeXml(displayTitle)
  const sub = visibility === 'public' ? '公开样例' : '未公开链接'
  const safeSub = escapeXml(sub)
  const date = escapeXml(new Date(createdAt).toLocaleString('zh-CN', { hour12: false }))

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1f5fff"/>
      <stop offset="100%" stop-color="#18a4ff"/>
    </linearGradient>
    <radialGradient id="r1" cx="20%" cy="15%" r="60%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.42)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
    <clipPath id="titleClip">
      <rect x="72" y="190" width="1040" height="100" rx="8"/>
    </clipPath>
  </defs>
  <rect width="1200" height="630" fill="#0f1628"/>
  <rect x="20" y="20" width="1160" height="590" rx="28" fill="url(#g1)"/>
  <rect x="20" y="20" width="1160" height="590" rx="28" fill="url(#r1)"/>
  <text x="72" y="150" font-size="38" fill="rgba(255,255,255,0.95)" font-family="PingFang SC, Microsoft YaHei, sans-serif">天地图智能开发平台</text>
  <text x="72" y="250" font-size="56" fill="#ffffff" font-weight="700" clip-path="url(#titleClip)" font-family="PingFang SC, Microsoft YaHei, sans-serif">${safeTitle}</text>
  <text x="72" y="332" font-size="30" fill="rgba(255,255,255,0.9)" font-family="PingFang SC, Microsoft YaHei, sans-serif">${safeSub}</text>
  <text x="72" y="580" font-size="24" fill="rgba(255,255,255,0.82)" font-family="PingFang SC, Microsoft YaHei, sans-serif">${date}</text>
</svg>`
}

function isPathInside(baseDir: string, candidate: string): boolean {
  const resolvedBase = resolve(baseDir)
  const resolvedCandidate = resolve(candidate)
  return resolvedCandidate.startsWith(resolvedBase)
}

export class ShareStore {
  private readonly rootDir: string
  private readonly uploadDir: string
  private readonly snapshotsDir: string
  private readonly indexPath: string
  private readonly tiandituToken?: string
  private readonly thumbnailRenderer: ShareThumbnailRenderer

  private ready = false
  private indexData: ShareIndexFile = { version: 1, items: [] }
  private opQueue: Promise<unknown> = Promise.resolve()

  constructor(opts: ShareStoreOptions) {
    this.rootDir = opts.rootDir
    this.uploadDir = opts.uploadDir
    this.snapshotsDir = resolve(this.rootDir, SNAPSHOT_DIR_NAME)
    this.indexPath = resolve(this.rootDir, INDEX_FILE_NAME)
    this.tiandituToken = opts.tiandituToken
    this.thumbnailRenderer = new ShareThumbnailRenderer({
      enabled: opts.thumbnail?.enabled !== false,
      baseUrl: opts.thumbnail?.baseUrl || 'http://127.0.0.1:3000',
      chromiumPath: opts.thumbnail?.chromiumPath || '',
      timeoutMs: opts.thumbnail?.timeoutMs || 30000,
      waitAfterLoadMs: opts.thumbnail?.waitAfterLoadMs || 1800,
    })
  }

  async init() {
    if (this.ready) return
    await mkdir(this.rootDir, { recursive: true })
    await mkdir(this.snapshotsDir, { recursive: true })

    try {
      await access(this.indexPath)
      const raw = await readFile(this.indexPath, 'utf-8')
      const parsed = JSON.parse(raw) as ShareIndexFile
      if (parsed && parsed.version === 1 && Array.isArray(parsed.items)) {
        this.indexData = {
          version: 1,
          items: parsed.items.filter((item) => item && typeof item.slug === 'string'),
        }
      } else {
        this.indexData = { version: 1, items: [] }
      }
    } catch {
      this.indexData = { version: 1, items: [] }
      await this.persistIndex()
    }

    this.ready = true
  }

  private async persistIndex() {
    await writeFile(this.indexPath, JSON.stringify(this.indexData, null, 2), 'utf-8')
  }

  private async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const task = this.opQueue.then(fn, fn)
    this.opQueue = task.then(() => undefined, () => undefined)
    return task
  }

  private normalizeHtml(rawHtml: string): string {
    let html = String(rawHtml || '')
    if (!html.includes('<!DOCTYPE html>') && !html.includes('<html')) {
      html = `<!DOCTYPE html>\n<html><head><meta charset="utf-8"></head><body>${html}</body></html>`
    }

    if (this.tiandituToken) {
      html = html.replace(/\$\{TIANDITU_TOKEN\}/g, this.tiandituToken)
      html = html.replace(/(api\.tianditu\.gov\.cn\/api\/v5\/js\?tk=)[a-f0-9]{32}/gi, `$1${this.tiandituToken}`)
    }

    return html
  }

  private extractUploadRelativePath(rawUrl: string): string | null {
    const text = String(rawUrl || '').trim()
    if (!text) return null

    let pathname = ''
    if (text.startsWith('/uploads/')) {
      pathname = text
    } else {
      try {
        const parsed = new URL(text)
        pathname = parsed.pathname || ''
      } catch {
        return null
      }
    }

    const marker = '/uploads/'
    const idx = pathname.indexOf(marker)
    if (idx < 0) return null

    const relative = pathname.slice(idx + marker.length)
    if (!relative || relative.includes('..')) return null
    return decodeURIComponent(relative)
  }

  private async rewriteUploadReferences(html: string, slug: string, snapshotDir: string): Promise<{ html: string; assetFiles: string[] }> {
    const urlRegex = /(?:https?:\/\/[^\s"'`<>]+)?\/uploads\/[^\s"'`<>]+/g
    const matched = html.match(urlRegex) || []
    if (!matched.length) return { html, assetFiles: [] }

    const assetsDir = resolve(snapshotDir, 'assets')
    await mkdir(assetsDir, { recursive: true })

    const rewriteMap = new Map<string, string>()
    const savedAssets: string[] = []
    let seq = 1

    for (const originalUrl of matched) {
      if (rewriteMap.has(originalUrl)) continue

      const relativeUploadPath = this.extractUploadRelativePath(originalUrl)
      if (!relativeUploadPath) continue

      const sourcePath = resolve(this.uploadDir, relativeUploadPath)
      if (!isPathInside(this.uploadDir, sourcePath)) continue

      try {
        await access(sourcePath)
      } catch {
        continue
      }

      const sourceBase = basename(relativeUploadPath)
      const ext = extname(sourceBase)
      const safeExt = ext && ext.length <= 12 ? ext : ''
      const targetName = `asset-${seq}${safeExt}`
      const targetPath = resolve(assetsDir, targetName)
      seq += 1

      await copyFile(sourcePath, targetPath)
      rewriteMap.set(originalUrl, `/share-assets/${slug}/assets/${targetName}`)
      savedAssets.push(`assets/${targetName}`)
    }

    if (!rewriteMap.size) return { html, assetFiles: savedAssets }

    const rewrittenHtml = html.replace(urlRegex, (raw) => rewriteMap.get(raw) || raw)
    return { html: rewrittenHtml, assetFiles: savedAssets }
  }

  private assertManageToken(item: ShareRecord, manageToken: string) {
    if (!manageToken) throw new Error('缺少管理口令')
    const hashed = hashToken(String(manageToken))
    if (hashed !== item.manageTokenHash) {
      throw new Error('管理口令无效')
    }
  }

  async createShare(input: CreateShareInput): Promise<{ item: ShareRecord; manageToken: string }> {
    await this.init()

    const rawCode = String(input.htmlCode || '').trim()
    if (!rawCode) {
      throw new Error('分享代码不能为空')
    }
    if (rawCode.length > 2_500_000) {
      throw new Error('分享代码过大，请精简后重试')
    }

    return this.runExclusive(async () => {
      const createdAt = nowTs()
      const slug = safeSlug()
      const id = randomUUID()
      const safeTitle = sanitizeTitle(input.title)
      const safeDescription = sanitizeDescription(input.description)
      const visibility = normalizeVisibility(input.visibility)
      const snapshotDir = resolve(this.snapshotsDir, slug)
      await mkdir(snapshotDir, { recursive: true })

      const normalizedHtml = this.normalizeHtml(rawCode)
      const rewritten = await this.rewriteUploadReferences(normalizedHtml, slug, snapshotDir)
      const uploadedThumbnail = decodeThumbnailBase64(input.thumbnailBase64)

      const htmlRelativePath = `${slug}/index.html`
      const htmlPath = resolve(this.snapshotsDir, htmlRelativePath)
      await writeFile(htmlPath, rewritten.html, 'utf-8')

      let thumbnailRelativePath = `${slug}/thumbnail.png`
      let thumbnailPath = resolve(this.snapshotsDir, thumbnailRelativePath)
      let usedUploadedThumbnail = false
      if (uploadedThumbnail) {
        try {
          await writeFile(thumbnailPath, uploadedThumbnail)
          usedUploadedThumbnail = true
        } catch (err: any) {
          console.warn(`[ShareStore] 前端缩略图写入失败，改用后端渲染 (${slug}): ${err?.message || 'unknown reason'}`)
        }
      }

      let rendered: { ok: boolean; reason?: string } = { ok: true }
      if (!usedUploadedThumbnail) {
        rendered = await this.thumbnailRenderer.render({
          slug,
          title: safeTitle,
          visibility,
          outputPath: thumbnailPath,
        })
      }

      if (!usedUploadedThumbnail && !rendered.ok) {
        thumbnailRelativePath = `${slug}/thumbnail.svg`
        thumbnailPath = resolve(this.snapshotsDir, thumbnailRelativePath)
        const thumbnailSvg = buildThumbnailSvg(safeTitle, visibility, createdAt)
        await writeFile(thumbnailPath, thumbnailSvg, 'utf-8')
        console.warn(`[ShareStore] 缩略图渲染失败，已回退 SVG (${slug}): ${rendered.reason || 'unknown reason'}`)
      }

      const htmlStat = await stat(htmlPath)
      const manageToken = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '').slice(0, 12)
      const item: ShareRecord = {
        id,
        slug,
        title: safeTitle,
        description: safeDescription,
        visibility,
        status: 'active',
        htmlRelativePath,
        thumbnailRelativePath,
        assetFiles: rewritten.assetFiles,
        viewCount: 0,
        createdAt,
        updatedAt: createdAt,
        manageTokenHash: hashToken(manageToken),
        codeSizeBytes: htmlStat.size,
      }

      this.indexData.items.unshift(item)
      await this.persistIndex()

      return { item, manageToken }
    })
  }

  async getBySlug(slug: string, options?: { incrementView?: boolean }): Promise<ShareRecord | null> {
    await this.init()
    const normalizedSlug = String(slug || '').trim()
    if (!normalizedSlug) return null

    if (!options?.incrementView) {
      const found = this.indexData.items.find((item) => item.slug === normalizedSlug) || null
      return found ? { ...found } : null
    }

    return this.runExclusive(async () => {
      const idx = this.indexData.items.findIndex((item) => item.slug === normalizedSlug)
      if (idx < 0) return null
      const target = this.indexData.items[idx]
      target.viewCount += 1
      target.lastViewedAt = nowTs()
      await this.persistIndex()
      return { ...target }
    })
  }

  async validateManageToken(slug: string, token?: string): Promise<boolean> {
    await this.init()
    if (!token) return false
    const found = this.indexData.items.find((item) => item.slug === slug)
    if (!found) return false
    return hashToken(token) === found.manageTokenHash
  }

  async updateShare(slug: string, manageToken: string, patch: UpdateShareInput): Promise<ShareRecord> {
    await this.init()
    return this.runExclusive(async () => {
      const idx = this.indexData.items.findIndex((item) => item.slug === slug)
      if (idx < 0) throw new Error('分享不存在')
      const target = this.indexData.items[idx]
      this.assertManageToken(target, manageToken)
      if (target.status !== 'active') throw new Error('分享已下架，无法修改')

      const nextTitle = patch.title != null ? sanitizeTitle(patch.title) : target.title
      const nextDescription = patch.description != null ? sanitizeDescription(patch.description) : target.description
      const nextVisibility = patch.visibility != null ? normalizeVisibility(patch.visibility) : target.visibility

      target.title = nextTitle
      target.description = nextDescription
      target.visibility = nextVisibility
      target.updatedAt = nowTs()

      // 仅 SVG 缩略图在更新标题/可见性时重绘，PNG 实拍图保持不变
      if (target.thumbnailRelativePath.endsWith('.svg')) {
        const thumbnailPath = resolve(this.snapshotsDir, target.thumbnailRelativePath)
        const thumbnailSvg = buildThumbnailSvg(target.title, target.visibility, target.createdAt)
        await writeFile(thumbnailPath, thumbnailSvg, 'utf-8')
      }

      await this.persistIndex()
      return { ...target }
    })
  }

  async removeShare(slug: string, manageToken: string): Promise<ShareRecord> {
    await this.init()
    return this.runExclusive(async () => {
      const idx = this.indexData.items.findIndex((item) => item.slug === slug)
      if (idx < 0) throw new Error('分享不存在')
      const target = this.indexData.items[idx]
      this.assertManageToken(target, manageToken)
      if (target.status === 'removed') return { ...target }

      target.status = 'removed'
      target.visibility = 'unlisted'
      target.updatedAt = nowTs()
      await this.persistIndex()
      return { ...target }
    })
  }

  async listPublic(options: ListPublicOptions): Promise<ListPublicResult> {
    await this.init()

    const page = Number.isFinite(options.page) && options.page > 0 ? Math.floor(options.page) : 1
    const pageSize = Number.isFinite(options.pageSize) && options.pageSize > 0 ? Math.min(Math.floor(options.pageSize), 60) : 24

    const all = this.indexData.items
      .filter((item) => item.status === 'active' && item.visibility === 'public')
      .sort((a, b) => b.updatedAt - a.updatedAt)

    const total = all.length
    const start = (page - 1) * pageSize
    const end = start + pageSize
    const items = all.slice(start, end).map((item) => ({ ...item }))

    return {
      total,
      page,
      pageSize,
      items,
    }
  }
}
