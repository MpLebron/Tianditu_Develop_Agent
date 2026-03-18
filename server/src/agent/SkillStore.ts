import type { Dirent } from 'fs'
import { access, readdir, readFile } from 'fs/promises'
import { basename, resolve } from 'path'
import { config } from '../config.js'

export type SkillDomainId =
  | 'jsapi'
  | 'lbs'
  | 'ui'
  | 'error'
  | 'echarts-bridge'
  | 'echarts-charts'
  | 'root'
  | 'misc'

export interface SkillEntry {
  name: string
  canonicalName: string
  legacyNames: string[]
  refName: string
  title: string
  summary: string
  filePath: string
  location: string
  domainId: SkillDomainId
  canonicalPackageId: string
  sourcePackageId: string
  sourcePackageDirName: string
  packageDescription: string
}

export interface PackageDescriptor {
  id: string
  title: string
  description: string
  domainId: SkillDomainId
  entryPath?: string
  entryLocation?: string
  sourcePackageIds: string[]
  legacyAliases: string[]
}

interface SourceSkillPackageMeta {
  id: string
  dirName: string
  rootPath: string
  entryPath?: string
  description: string
  title: string
}

interface RawReferenceDoc {
  refName: string
  title: string
  summary: string
  filePath: string
  location: string
  sourcePackageId: string
  sourcePackageDirName: string
  sourcePackageDescription: string
  domainId: SkillDomainId
  canonicalPackageId: string
}

/**
 * Skills 文件系统索引
 *
 * 当前实现对外暴露“canonical id + legacy alias”双轨能力：
 * - canonical id: `jsapi/map-init`、`lbs/geocoder`
 * - legacy alias: `map-init`、`geocoder`、`tianditu-jsapi/map-init`
 *
 * 这样可以在不打断旧链路的前提下，把运行时切到 package/domain first 的知识组织方式。
 */
export class SkillStore {
  private skills: Map<string, SkillEntry> = new Map()
  private aliases: Map<string, string> = new Map()
  private packages: Map<string, PackageDescriptor> = new Map()
  private sourcePackages: Map<string, SourceSkillPackageMeta> = new Map()
  private packageAliases: Map<string, string> = new Map()
  private catalogText = ''
  private plannerCatalogText = ''
  private packagePlannerCatalogText = ''
  private initialized = false
  private initPromise: Promise<void> | null = null

  async init() {
    if (this.initialized) return
    if (this.initPromise) {
      await this.initPromise
      return
    }

    this.initPromise = (async () => {
      this.skills.clear()
      this.aliases.clear()
      this.packages.clear()
      this.sourcePackages.clear()
      this.packageAliases.clear()
      this.catalogText = ''
      this.plannerCatalogText = ''
      this.packagePlannerCatalogText = ''

      const sourcePackages = await this.scanSkillPackages()
      const rawRefs: RawReferenceDoc[] = []

      for (const pkg of sourcePackages) {
        this.sourcePackages.set(pkg.id, pkg)
        this.registerPackageDescriptor(pkg)
        rawRefs.push(...await this.scanReferencesForPackage(pkg))
      }

      const baseCanonicalCounts = new Map<string, number>()
      const bareRefCounts = new Map<string, number>()
      for (const ref of rawRefs) {
        const baseCanonicalName = `${ref.domainId}/${ref.refName}`
        baseCanonicalCounts.set(baseCanonicalName, (baseCanonicalCounts.get(baseCanonicalName) || 0) + 1)
        bareRefCounts.set(ref.refName, (bareRefCounts.get(ref.refName) || 0) + 1)
      }

      for (const ref of rawRefs.sort((a, b) => a.location.localeCompare(b.location))) {
        const baseCanonicalName = `${ref.domainId}/${ref.refName}`
        const canonicalName =
          (baseCanonicalCounts.get(baseCanonicalName) || 0) > 1
            ? `${ref.domainId}/${ref.sourcePackageId}/${ref.refName}`
            : baseCanonicalName

        const legacyNames = buildReferenceAliases(ref, bareRefCounts.get(ref.refName) || 0)

        const entry: SkillEntry = {
          name: canonicalName,
          canonicalName,
          legacyNames,
          refName: ref.refName,
          title: ref.title,
          summary: ref.summary,
          filePath: ref.filePath,
          location: ref.location,
          domainId: ref.domainId,
          canonicalPackageId: ref.canonicalPackageId,
          sourcePackageId: ref.sourcePackageId,
          sourcePackageDirName: ref.sourcePackageDirName,
          packageDescription: ref.sourcePackageDescription,
        }

        this.skills.set(canonicalName, entry)
        this.aliases.set(canonicalName, canonicalName)
        for (const alias of legacyNames) {
          if (!this.aliases.has(alias)) {
            this.aliases.set(alias, canonicalName)
          }
        }
      }

      this.buildCatalogTexts()
      this.initialized = true
      console.log(
        `[SkillStore] 已加载 ${this.skills.size} 个 reference 文档，来自 ${this.sourcePackages.size} 个物理 skill 包，映射为 ${this.packages.size} 个逻辑 package`,
      )
    })()

    try {
      await this.initPromise
    } finally {
      this.initPromise = null
    }
  }

  getCatalog(): string {
    return this.catalogText
  }

  getPlannerCatalog(): string {
    return this.plannerCatalogText
  }

  getPackagePlannerCatalog(): string {
    return this.packagePlannerCatalogText
  }

  getPlannerCatalogForPackages(packageIds: string[]): string {
    const canonical = new Set(packageIds.map((id) => this.resolvePackageAlias(id)).filter(Boolean))
    if (!canonical.size) return this.getPlannerCatalog()

    return [
      '<available_skills>',
      ...this.listPackages()
        .filter((pkg) => canonical.has(pkg.id))
        .flatMap((pkg) => {
          return this.listReferencesByPackage(pkg.id).map((skill) => [
            '  <skill>',
            `    <name>${skill.canonicalName}</name>`,
            `    <description>${escapeXml(`[domain:${skill.domainId}] [package:${pkg.id}] ${skill.title} — ${skill.summary}`)}</description>`,
            `    <location>${skill.location}</location>`,
            '  </skill>',
          ].join('\n'))
        }),
      '</available_skills>',
    ].join('\n')
  }

  getSkillNames(): string[] {
    return Array.from(this.skills.keys()).sort()
  }

  listSkills(): SkillEntry[] {
    return Array.from(this.skills.values()).sort((a, b) => a.canonicalName.localeCompare(b.canonicalName))
  }

  listPackages(): PackageDescriptor[] {
    return Array.from(this.packages.values()).sort(comparePackages)
  }

  listReferencesByPackage(packageId: string): SkillEntry[] {
    const canonicalPackageId = this.resolvePackageAlias(packageId)
    if (!canonicalPackageId) return []
    return this.listSkills().filter((skill) => skill.canonicalPackageId === canonicalPackageId)
  }

  resolveAlias(name: string): string | null {
    return this.aliases.get(name) || null
  }

  getSkill(name: string): SkillEntry | undefined {
    const resolved = this.resolveAlias(name)
    return resolved ? this.skills.get(resolved) : undefined
  }

  getPackageEntry(packageId: string): PackageDescriptor | undefined {
    const resolved = this.resolvePackageAlias(packageId)
    return resolved ? this.packages.get(resolved) : undefined
  }

  async loadDoc(name: string): Promise<string | null> {
    const skill = this.getSkill(name)
    if (!skill) return null
    return readFile(skill.filePath, 'utf-8')
  }

  async loadSkillEntry(packageId: string): Promise<string | null> {
    const pkg = this.getPackageEntry(packageId)
    if (!pkg?.entryPath) return null
    try {
      return await readFile(pkg.entryPath, 'utf-8')
    } catch {
      return null
    }
  }

  async loadPackageEntries(packageIds: string[]): Promise<string> {
    const docs: string[] = []

    for (const packageId of dedupeStrings(packageIds)) {
      const pkg = this.getPackageEntry(packageId)
      if (!pkg) continue
      const entry = await this.loadSkillEntry(pkg.id)
      if (!entry) continue
      docs.push([
        `<!-- logical-package:${pkg.id} entry:start -->`,
        entry,
        `<!-- logical-package:${pkg.id} entry:end -->`,
      ].join('\n'))
    }

    return docs.join('\n\n---\n\n')
  }

  async loadDocs(names: string[], opts?: { includePackageEntries?: boolean }): Promise<string> {
    const docs: string[] = []
    const includePackageEntries = opts?.includePackageEntries !== false
    const loadedSourcePackageEntries = new Set<string>()

    for (const name of dedupeStrings(names)) {
      const skill = this.getSkill(name)
      if (!skill) continue

      if (includePackageEntries && !loadedSourcePackageEntries.has(skill.sourcePackageId)) {
        loadedSourcePackageEntries.add(skill.sourcePackageId)
        const sourcePackage = this.sourcePackages.get(skill.sourcePackageId)
        if (sourcePackage?.entryPath) {
          try {
            const entry = await readFile(sourcePackage.entryPath, 'utf-8')
            docs.push([
              `<!-- source-package:${skill.sourcePackageId} entry:start -->`,
              entry,
              `<!-- source-package:${skill.sourcePackageId} entry:end -->`,
            ].join('\n'))
          } catch {
            // ignore per source package
          }
        }
      }

      const content = await this.loadDoc(skill.canonicalName)
      if (content) {
        docs.push([
          `<!-- reference:${skill.canonicalName} (${skill.location}) start -->`,
          content,
          `<!-- reference:${skill.canonicalName} end -->`,
        ].join('\n'))
      }
    }

    return docs.join('\n\n---\n\n')
  }

  private resolvePackageAlias(packageId: string): string | null {
    return this.packageAliases.get(packageId) || (this.packages.has(packageId) ? packageId : null)
  }

  private registerPackageDescriptor(sourcePackage: SourceSkillPackageMeta) {
    const canonicalPackageIds = inferCanonicalPackageIdsForSourcePackage(sourcePackage.id)
    for (const canonicalPackageId of canonicalPackageIds) {
      const domainId = inferDomainIdForPackage(canonicalPackageId)
      const descriptor = this.packages.get(canonicalPackageId)
      const title = getPackageTitle(canonicalPackageId)
      const description = descriptor?.description || sourcePackage.description || title
      const next: PackageDescriptor = descriptor
        ? {
          ...descriptor,
          sourcePackageIds: dedupeStrings([...descriptor.sourcePackageIds, sourcePackage.id]),
          description,
          entryPath: descriptor.entryPath || (sourcePackage.id === canonicalPackageId ? sourcePackage.entryPath : descriptor.entryPath),
          entryLocation: descriptor.entryLocation || buildPackageEntryLocation(sourcePackage),
        }
        : {
          id: canonicalPackageId,
          title,
          description,
          domainId,
          entryPath: sourcePackage.id === canonicalPackageId ? sourcePackage.entryPath : undefined,
          entryLocation: sourcePackage.id === canonicalPackageId ? buildPackageEntryLocation(sourcePackage) : undefined,
          sourcePackageIds: [sourcePackage.id],
          legacyAliases: buildPackageAliases(canonicalPackageId, domainId, sourcePackage.id),
        }

      this.packages.set(canonicalPackageId, next)
      this.packageAliases.set(canonicalPackageId, canonicalPackageId)
      for (const alias of next.legacyAliases) {
        if (!this.packageAliases.has(alias)) {
          this.packageAliases.set(alias, canonicalPackageId)
        }
      }
    }
  }

  private async scanSkillPackages(): Promise<SourceSkillPackageMeta[]> {
    const root = config.skillsDir
    const packages: SourceSkillPackageMeta[] = []

    const rootPkg = await this.buildPackageMeta(root, '')
    if (rootPkg) packages.push(rootPkg)

    let dirents: Dirent[] = []
    try {
      dirents = await readdir(root, { withFileTypes: true })
    } catch {
      return packages
    }

    for (const d of dirents) {
      if (!d.isDirectory()) continue
      const dirName = d.name
      if (dirName === 'references' || dirName === 'assets' || dirName.startsWith('.')) continue
      const pkg = await this.buildPackageMeta(resolve(root, dirName), dirName)
      if (pkg) packages.push(pkg)
    }

    return dedupePackages(packages)
  }

  private async buildPackageMeta(packageRoot: string, dirName: string): Promise<SourceSkillPackageMeta | null> {
    const skillMdPath = resolve(packageRoot, 'SKILL.md')
    const refsDir = resolve(packageRoot, 'references')

    const hasSkillMd = await pathExists(skillMdPath)
    const hasRefs = await pathExists(refsDir)
    if (!hasSkillMd && !hasRefs) return null

    let packageId = dirName || 'root-skill'
    let description = ''
    let title = packageId

    if (hasSkillMd) {
      try {
        const raw = await readFile(skillMdPath, 'utf-8')
        const fm = parseFrontmatter(raw)
        if (typeof fm.name === 'string' && fm.name.trim()) packageId = fm.name.trim()
        if (typeof fm.description === 'string' && fm.description.trim()) description = fm.description.trim()
        title = packageId
      } catch {
        // ignore malformed skill entry, keep fallback metadata
      }
    }

    return {
      id: packageId,
      dirName,
      rootPath: packageRoot,
      entryPath: hasSkillMd ? skillMdPath : undefined,
      description,
      title,
    }
  }

  private async scanReferencesForPackage(pkg: SourceSkillPackageMeta): Promise<RawReferenceDoc[]> {
    const refsDir = resolve(pkg.rootPath, 'references')
    if (!(await pathExists(refsDir))) return []

    const files = await readdir(refsDir)
    const mdFiles = files.filter((f) => f.endsWith('.md')).sort()
    const docs: RawReferenceDoc[] = []

    for (const file of mdFiles) {
      const filePath = resolve(refsDir, file)
      const content = await readFile(filePath, 'utf-8')
      const lines = content.split('\n').filter((l) => l.trim())

      const refName = basename(file, '.md')
      const title = (lines[0] || '').replace(/^#+\s*/, '').trim() || refName
      const rawSummary = (lines[1] || '').trim() || pkg.description || '技能参考文档'
      const summary = buildReferenceSummary({
        refName,
        title,
        rawSummary,
        content,
        packageId: pkg.id,
      })
      const domainId = inferReferenceDomain(pkg.id, refName)
      const canonicalPackageId = inferCanonicalPackageIdForReference(pkg.id, refName)

      docs.push({
        refName,
        title,
        summary,
        filePath,
        location: pkg.dirName
          ? `skills/${pkg.dirName}/references/${refName}.md`
          : `skills/references/${refName}.md`,
        sourcePackageId: pkg.id,
        sourcePackageDirName: pkg.dirName,
        sourcePackageDescription: pkg.description,
        domainId,
        canonicalPackageId,
      })
    }

    return docs
  }

  private buildCatalogTexts() {
    const packageOrder = this.listPackages()

    this.catalogText = packageOrder
      .map((pkg) => {
        const docs = this.listReferencesByPackage(pkg.id)
        if (!docs.length) return ''
        const header = `### ${pkg.title} [${pkg.domainId}]${pkg.description ? ` — ${pkg.description}` : ''}`
        const items = docs.map((s) => `- **${s.canonicalName}**: ${s.title} — ${s.summary}`)
        return [header, ...items].join('\n')
      })
      .filter(Boolean)
      .join('\n\n')

    this.packagePlannerCatalogText = [
      '<available_packages>',
      ...packageOrder.map((pkg) => [
        '  <package>',
        `    <id>${pkg.id}</id>`,
        `    <domain>${pkg.domainId}</domain>`,
        `    <title>${escapeXml(pkg.title)}</title>`,
        `    <description>${escapeXml(pkg.description || pkg.title)}</description>`,
        `    <skills>${this.listReferencesByPackage(pkg.id).length}</skills>`,
        '  </package>',
      ].join('\n')),
      '</available_packages>',
    ].join('\n')

    this.plannerCatalogText = [
      '<available_skills>',
      ...packageOrder.flatMap((pkg) => {
        const docs = this.listReferencesByPackage(pkg.id)
        return docs.map((s) => [
          '  <skill>',
          `    <name>${s.canonicalName}</name>`,
          `    <description>${escapeXml(`[domain:${s.domainId}] [package:${pkg.id}] ${s.title} — ${s.summary}`)}</description>`,
          `    <location>${s.location}</location>`,
          '  </skill>',
        ].join('\n'))
      }),
      '</available_skills>',
    ].join('\n')
  }
}

function dedupePackages(items: SourceSkillPackageMeta[]): SourceSkillPackageMeta[] {
  const out: SourceSkillPackageMeta[] = []
  const used = new Set<string>()

  for (const item of items) {
    let id = item.id
    if (used.has(id)) {
      id = item.dirName ? `${item.dirName}/${item.id}` : `root/${item.id}`
    }
    used.add(id)
    out.push({ ...item, id })
  }

  return out
}

async function pathExists(pathLike: string): Promise<boolean> {
  try {
    await access(pathLike)
    return true
  } catch {
    return false
  }
}

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return {}

  const out: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^([a-zA-Z][\w-]*):\s*(.+)$/)
    if (!kv) continue
    out[kv[1]] = kv[2].trim().replace(/^['"]|['"]$/g, '')
  }
  return out
}

function escapeXml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function dedupeStrings(items: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of items) {
    if (!seen.has(item)) {
      seen.add(item)
      out.push(item)
    }
  }
  return out
}

function buildReferenceSummary(params: {
  refName: string
  title: string
  rawSummary: string
  content: string
  packageId: string
}): string {
  const { refName, title, rawSummary, content, packageId } = params

  if (packageId === 'tianditu-lbs') {
    if (refName === 'api-overview') {
      return 'LBS 总览；说明官方端点、queryType、代理 envelope、编码表与返回结构阅读约定'
    }
    if (refName === 'scene-routing') {
      return 'LBS 场景分流入口；先判搜索/编码/行政区划/路线，再选择对应 scene 文档'
    }
    if (/^scene\d+-/.test(refName)) {
      const firstTask = content.match(/## 适用任务[\s\S]*?^- (.+)$/m)?.[1]?.trim()
      if (firstTask) {
        return `${title}；适用任务：${firstTask}`
      }
      return `${title}；按场景说明端点、参数、返回结构和关键字段读取方式`
    }
  }

  if (packageId === 'echarts-charts' && /^echarts-/.test(refName) && refName !== 'echarts-index') {
    const chartType = inferEchartsChartType(refName)
    const titleCore = title.replace(/^ECharts\s*示例[:：]\s*/, '').trim() || refName
    const featureHints = inferEchartsFeatureHints(content, titleCore)
    const featureText = featureHints.length ? `；特性：${featureHints.join('、')}` : ''
    return `ECharts ${chartType} 示例，适合图表 option 参考${featureText}；标题特征：${titleCore}`
  }

  return rawSummary
}

function buildReferenceAliases(ref: RawReferenceDoc, bareRefCount: number): string[] {
  const aliases = [
    ref.refName,
    `${ref.sourcePackageId}/${ref.refName}`,
    `${ref.canonicalPackageId}/${ref.refName}`,
  ]

  if (ref.domainId && ref.domainId !== 'misc' && ref.domainId !== 'root') {
    aliases.push(`${ref.domainId}/${ref.refName}`)
  }
  if (bareRefCount > 1) {
    return dedupeStrings(aliases.filter((alias) => alias !== ref.refName))
  }
  return dedupeStrings(aliases)
}

function buildPackageAliases(canonicalPackageId: string, domainId: SkillDomainId, sourcePackageId: string): string[] {
  const aliases = [canonicalPackageId, sourcePackageId]
  if (domainId === 'jsapi') aliases.push('jsapi')
  if (domainId === 'lbs') aliases.push('lbs')
  if (domainId === 'ui') aliases.push('ui')
  if (domainId === 'error') aliases.push('error')
  if (domainId === 'echarts-bridge') aliases.push('echarts-bridge')
  if (domainId === 'echarts-charts') aliases.push('echarts-charts')
  return dedupeStrings(aliases)
}

function buildPackageEntryLocation(sourcePackage: SourceSkillPackageMeta): string | undefined {
  if (!sourcePackage.entryPath) return undefined
  return sourcePackage.dirName
    ? `skills/${sourcePackage.dirName}/SKILL.md`
    : 'skills/SKILL.md'
}

function inferCanonicalPackageIdsForSourcePackage(sourcePackageId: string): string[] {
  return [sourcePackageId]
}

function inferCanonicalPackageIdForReference(sourcePackageId: string, refName: string): string {
  return sourcePackageId
}

function inferDomainIdForPackage(packageId: string): SkillDomainId {
  if (packageId === 'tianditu-jsapi') return 'jsapi'
  if (packageId === 'tianditu-lbs') return 'lbs'
  if (packageId === 'tianditu-ui-design') return 'ui'
  if (packageId === 'error-solution') return 'error'
  if (packageId === 'echarts-charts') return 'echarts-charts'
  if (packageId === 'root-skill') return 'root'
  return 'misc'
}

function inferReferenceDomain(sourcePackageId: string, refName: string): SkillDomainId {
  return inferDomainIdForPackage(sourcePackageId)
}

function getPackageTitle(packageId: string): string {
  if (packageId === 'tianditu-jsapi') return '天地图 JSAPI'
  if (packageId === 'tianditu-lbs') return '天地图 LBS'
  if (packageId === 'tianditu-ui-design') return '地图 UI 设计'
  if (packageId === 'error-solution') return '错误修复'
  if (packageId === 'echarts-charts') return 'ECharts 图表'
  return packageId
}

function comparePackages(a: PackageDescriptor, b: PackageDescriptor): number {
  const order = packageSortWeight(a.id) - packageSortWeight(b.id)
  if (order !== 0) return order
  return a.id.localeCompare(b.id)
}

function packageSortWeight(id: string): number {
  const ordered = [
    'tianditu-jsapi',
    'tianditu-lbs',
    'tianditu-ui-design',
    'error-solution',
    'echarts-charts',
  ]
  const idx = ordered.indexOf(id)
  return idx >= 0 ? idx : ordered.length + 1
}

function inferEchartsChartType(refName: string): string {
  if (refName.startsWith('echarts-line-')) return '折线图'
  if (refName.startsWith('echarts-bar-')) return '柱状图/条形图'
  if (refName.startsWith('echarts-pie-')) return '饼图'
  if (refName.startsWith('echarts-scatter-')) return '散点图'
  if (refName.startsWith('echarts-radar-')) return '雷达图'
  if (refName.startsWith('echarts-gauge-')) return '仪表盘'
  return '图表'
}

function inferEchartsFeatureHints(content: string, titleCore: string): string[] {
  const source = `${titleCore}\n${content}`.toLowerCase()
  const hints: string[] = []
  const push = (value: string) => {
    if (!hints.includes(value)) hints.push(value)
  }

  if (source.includes('datazoom')) push('dataZoom')
  if (source.includes('polar') || source.includes('极坐标')) push('极坐标')
  if (source.includes('radar') || source.includes('雷达')) push('雷达坐标')
  if (source.includes('gauge') || source.includes('仪表盘')) push('仪表盘')
  if (source.includes('log') || source.includes('对数')) push('对数轴')
  if (source.includes('area') || source.includes('areastyle') || source.includes('面积')) push('面积填充')
  if (source.includes('stack') || source.includes('堆叠')) push('堆叠')
  if (source.includes('animation') || source.includes('动画')) push('动画')
  if (source.includes('visualmap')) push('visualMap')
  if (source.includes('tooltip')) push('tooltip')
  if (source.includes('legend')) push('legend')
  if (source.includes('双y轴') || source.includes('yaxisindex')) push('双轴')

  return hints.slice(0, 4)
}
