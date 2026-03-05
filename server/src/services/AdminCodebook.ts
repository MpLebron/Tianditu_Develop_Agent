import { existsSync } from 'fs'
import XLSX from 'xlsx'
import { config } from '../config.js'

type AdminLevelCode = 2 | 3 | 4

interface RawAdminRow {
  id?: number
  '省name'?: string
  '省gb'?: string | number
  '市name'?: string
  '市gb'?: string | number
  '县name'?: string
  '县gb'?: string | number
}

export interface AdminCodeEntry {
  gb: string
  name: string
  levelCode: AdminLevelCode
  levelLabel: 'province' | 'city' | 'county'
  provinceName: string
  provinceGb: string
  cityName: string
  cityGb: string
  countyName: string
  countyGb: string
  fullPath: string
}

export interface AdminCodeMatch extends AdminCodeEntry {
  score: number
  matchType:
    | 'code-exact'
    | 'code-prefix'
    | 'name-exact'
    | 'name-normalized-exact'
    | 'fullpath-exact'
    | 'fullpath-contains'
    | 'name-contains'
    | 'fullpath-normalized-contains'
}

interface SearchScoredMatch {
  entry: AdminCodeEntry
  score: number
  matchType: AdminCodeMatch['matchType']
}

function normalizeName(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, '')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/[省市区县旗盟自治州自治县特别行政区]/g, '')
    .toLowerCase()
}

function normalizeGb(value: string | number | undefined): string {
  if (value == null) return ''
  const raw = String(value).trim()
  if (!raw) return ''
  const digits = raw.replace(/\D+/g, '')
  return digits
}

function normalizeText(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim()
}

function buildFullPath(provinceName: string, cityName: string, countyName: string): string {
  const names = [provinceName, cityName, countyName].filter(Boolean)
  return names.join('/')
}

/**
 * 行政区划编码对照表（xlsx）加载与检索服务
 *
 * 默认读取：
 *   server/assets/admin/xzqh2020-03.xlsx
 * 也可通过 ADMIN_CODEBOOK_XLSX_PATH 覆盖。
 */
export class AdminCodebookService {
  private loaded = false
  private entries: AdminCodeEntry[] = []
  private byGb = new Map<string, AdminCodeEntry[]>()
  private dedupeKeys = new Set<string>()
  private loadError: string | null = null

  private ensureLoaded() {
    if (this.loaded) return
    this.loaded = true

    const filePath = config.adminCodebookXlsxPath
    if (!filePath || !existsSync(filePath)) {
      this.loadError = `行政区划编码表不存在: ${filePath || '未配置路径'}`
      console.warn(`[AdminCodebook] ${this.loadError}`)
      return
    }

    try {
      const wb = XLSX.readFile(filePath)
      const sheetName = wb.SheetNames[0]
      const sheet = wb.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json<RawAdminRow>(sheet, { defval: '' })

      for (const row of rows) {
        this.ingestRow(row)
      }

      console.log(`[AdminCodebook] 已加载 ${this.entries.length} 条行政区划索引 (${filePath})`)
    } catch (err: any) {
      this.loadError = err?.message || String(err)
      console.warn(`[AdminCodebook] 加载失败: ${this.loadError}`)
    }
  }

  private ingestRow(row: RawAdminRow) {
    const provinceName = normalizeText(row['省name'])
    const provinceGb = normalizeGb(row['省gb'])
    const cityName = normalizeText(row['市name'])
    const cityGb = normalizeGb(row['市gb'])
    const countyName = normalizeText(row['县name'])
    const countyGb = normalizeGb(row['县gb'])

    if (!provinceName || !provinceGb) return

    this.addEntry({
      gb: provinceGb,
      name: provinceName,
      levelCode: 4,
      levelLabel: 'province',
      provinceName,
      provinceGb,
      cityName,
      cityGb,
      countyName,
      countyGb,
      fullPath: buildFullPath(provinceName, cityName, countyName),
    })

    if (cityName && cityGb) {
      this.addEntry({
        gb: cityGb,
        name: cityName,
        levelCode: 3,
        levelLabel: 'city',
        provinceName,
        provinceGb,
        cityName,
        cityGb,
        countyName,
        countyGb,
        fullPath: buildFullPath(provinceName, cityName, countyName),
      })
    }

    if (countyName && countyGb) {
      this.addEntry({
        gb: countyGb,
        name: countyName,
        levelCode: 2,
        levelLabel: 'county',
        provinceName,
        provinceGb,
        cityName,
        cityGb,
        countyName,
        countyGb,
        fullPath: buildFullPath(provinceName, cityName, countyName),
      })
    }
  }

  private addEntry(entry: AdminCodeEntry) {
    const key = `${entry.levelCode}|${entry.gb}|${entry.name}`
    if (this.dedupeKeys.has(key)) return
    this.dedupeKeys.add(key)

    this.entries.push(entry)
    const list = this.byGb.get(entry.gb) || []
    list.push(entry)
    this.byGb.set(entry.gb, list)
  }

  getMeta() {
    this.ensureLoaded()
    return {
      enabled: Boolean(config.adminCodebookXlsxPath),
      path: config.adminCodebookXlsxPath || null,
      loaded: this.loaded,
      loadError: this.loadError,
      entryCount: this.entries.length,
    }
  }

  search(keyword: string, limit = 20): AdminCodeMatch[] {
    this.ensureLoaded()
    const q = keyword.trim()
    if (!q) return []

    const normQ = normalizeName(q)
    const isCodeQuery = /^\d{3,12}$/.test(q)
    const scored: SearchScoredMatch[] = []

    for (const entry of this.entries) {
      const match = this.scoreEntry(entry, q, normQ, isCodeQuery)
      if (match) scored.push(match)
    }

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      // 匹配分相同时，优先更细粒度（县 > 市 > 省）
      if (a.entry.levelCode !== b.entry.levelCode) return a.entry.levelCode - b.entry.levelCode
      return a.entry.gb.localeCompare(b.entry.gb)
    })

    const out: AdminCodeMatch[] = []
    const seen = new Set<string>()
    for (const item of scored) {
      const unique = `${item.entry.levelCode}|${item.entry.gb}|${item.entry.name}`
      if (seen.has(unique)) continue
      seen.add(unique)
      out.push({
        ...item.entry,
        score: item.score,
        matchType: item.matchType,
      })
      if (out.length >= Math.max(1, Math.min(limit, 100))) break
    }
    return out
  }

  resolveBest(keyword: string): AdminCodeMatch | null {
    const matches = this.search(keyword, 5)
    if (!matches.length) return null

    const top = matches[0]
    const second = matches[1]
    const query = keyword.trim()
    const isFullCode = /^\d{9}$/.test(query)

    if (isFullCode && top.matchType === 'code-exact') return top
    if (top.matchType === 'name-exact' || top.matchType === 'name-normalized-exact' || top.matchType === 'fullpath-exact') {
      return top
    }

    // 置信度门限：避免误把模糊词自动转成错误 gb
    if (top.score >= 160 && (!second || top.score - second.score >= 20)) {
      return top
    }

    return null
  }

  getByGb(gb: string): AdminCodeEntry[] {
    this.ensureLoaded()
    return this.byGb.get(normalizeGb(gb)) || []
  }

  private scoreEntry(
    entry: AdminCodeEntry,
    query: string,
    normQuery: string,
    isCodeQuery: boolean,
  ): SearchScoredMatch | null {
    const name = entry.name
    const fullPath = entry.fullPath
    const normName = normalizeName(name)
    const normPath = normalizeName(fullPath)

    if (isCodeQuery) {
      if (entry.gb === query) {
        return { entry, score: 220, matchType: 'code-exact' }
      }
      if (entry.gb.startsWith(query)) {
        return { entry, score: 170, matchType: 'code-prefix' }
      }
      return null
    }

    if (name === query) return { entry, score: 210, matchType: 'name-exact' }
    if (normName === normQuery) return { entry, score: 200, matchType: 'name-normalized-exact' }
    if (fullPath === query) return { entry, score: 195, matchType: 'fullpath-exact' }
    if (fullPath.includes(query)) return { entry, score: 155, matchType: 'fullpath-contains' }
    if (name.includes(query)) return { entry, score: 150, matchType: 'name-contains' }
    if (normPath.includes(normQuery)) return { entry, score: 130, matchType: 'fullpath-normalized-contains' }

    return null
  }
}
