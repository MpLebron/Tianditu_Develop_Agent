import type { Dirent } from 'fs'
import { access, readdir, readFile } from 'fs/promises'
import { resolve, basename } from 'path'
import { config } from '../config.js'

export interface SkillEntry {
  name: string        // 供 planner / tool loop 使用的文档标识（唯一）
  refName: string     // references 文件名（不含 .md）
  title: string       // 文档标题（# 行）
  summary: string     // 前 2 行描述
  filePath: string    // 完整路径
  location: string    // 相对 skills 根目录的逻辑路径（用于给 LLM 展示）
  packageId: string   // 所属 skill 包（frontmatter.name 或目录名）
  packageDirName: string // 子目录名；根 skill 包为空字符串
  packageDescription: string
}

interface SkillPackageMeta {
  id: string
  dirName: string // '' 表示根 skill 包，其他为 skills/<dirName>
  rootPath: string
  entryPath?: string
  description: string
}

interface RawReferenceDoc {
  refName: string
  title: string
  summary: string
  filePath: string
  location: string
  packageId: string
  packageDirName: string
  packageDescription: string
}

/**
 * Skills 文件系统索引（参考 OpenClaw 的多 skill 包加载思路）
 *
 * 支持两种结构并存：
 * 1. 旧结构（兼容）：skills/SKILL.md + skills/references/*.md
 * 2. 多 skill 包：skills/<skill-dir>/SKILL.md + skills/<skill-dir>/references/*.md
 *
 * 运行时对外仍暴露“可选择文档列表”，但会保留 package 元数据，
 * 以便在加载 reference 文档时自动补充对应 skill 包的 SKILL.md（类似 OpenClaw 先读 skill 再读文档）。
 */
export class SkillStore {
  private skills: Map<string, SkillEntry> = new Map()
  private packages: Map<string, SkillPackageMeta> = new Map()
  private catalogText: string = ''
  private plannerCatalogText: string = ''

  async init() {
    this.skills.clear()
    this.packages.clear()
    this.catalogText = ''
    this.plannerCatalogText = ''

    const packageMetas = await this.scanSkillPackages()
    const rawRefs: RawReferenceDoc[] = []

    for (const pkg of packageMetas) {
      this.packages.set(pkg.id, pkg)
      rawRefs.push(...await this.scanReferencesForPackage(pkg))
    }

    // 同名 reference（不同 skill 包）自动加前缀，避免冲突
    const refNameCounts = new Map<string, number>()
    for (const ref of rawRefs) {
      refNameCounts.set(ref.refName, (refNameCounts.get(ref.refName) || 0) + 1)
    }

    for (const ref of rawRefs.sort((a, b) => a.location.localeCompare(b.location))) {
      const duplicated = (refNameCounts.get(ref.refName) || 0) > 1
      const exposedName = duplicated ? `${ref.packageId}/${ref.refName}` : ref.refName
      this.skills.set(exposedName, {
        name: exposedName,
        refName: ref.refName,
        title: ref.title,
        summary: ref.summary,
        filePath: ref.filePath,
        location: ref.location,
        packageId: ref.packageId,
        packageDirName: ref.packageDirName,
        packageDescription: ref.packageDescription,
      })
    }

    this.buildCatalogTexts()
    console.log(`[SkillStore] 已加载 ${this.skills.size} 个 reference 文档，来自 ${this.packages.size} 个 skill 包`)
  }

  /** 获取目录摘要（注入系统提示） */
  getCatalog(): string {
    return this.catalogText
  }

  /** 获取给 LLM 做技能选择的目录（OpenClaw 风格） */
  getPlannerCatalog(): string {
    return this.plannerCatalogText
  }

  /** 获取所有 reference 文档标识 */
  getSkillNames(): string[] {
    return Array.from(this.skills.keys())
  }

  /** 获取所有 reference 文档条目（按名称排序） */
  listSkills(): SkillEntry[] {
    return Array.from(this.skills.values()).sort((a, b) => a.name.localeCompare(b.name))
  }

  /** 根据名称获取 reference 文档条目 */
  getSkill(name: string): SkillEntry | undefined {
    return this.skills.get(name)
  }

  /** 获取所有 skill 包（供调试/扩展用） */
  listPackages(): SkillPackageMeta[] {
    return Array.from(this.packages.values()).sort((a, b) => a.id.localeCompare(b.id))
  }

  /** 加载指定 reference 文档 */
  async loadDoc(name: string): Promise<string | null> {
    const skill = this.skills.get(name)
    if (!skill) return null
    return readFile(skill.filePath, 'utf-8')
  }

  /** 加载 skill 包入口（SKILL.md） */
  async loadSkillEntry(packageId: string): Promise<string | null> {
    const pkg = this.packages.get(packageId)
    if (!pkg?.entryPath) return null
    try {
      return await readFile(pkg.entryPath, 'utf-8')
    } catch {
      return null
    }
  }

  /**
   * 批量加载多个 reference 文档
   * 会自动在每个包的第一个文档前补充对应 SKILL.md，模拟 OpenClaw 的“先读 skill 再读细节文档”。
   */
  async loadDocs(names: string[]): Promise<string> {
    const docs: string[] = []
    const loadedPackageEntries = new Set<string>()

    for (const name of dedupeStrings(names)) {
      const skill = this.skills.get(name)
      if (!skill) continue

      if (!loadedPackageEntries.has(skill.packageId)) {
        loadedPackageEntries.add(skill.packageId)
        const entry = await this.loadSkillEntry(skill.packageId)
        if (entry) {
          docs.push([
            `<!-- skill-package:${skill.packageId} entry:start -->`,
            entry,
            `<!-- skill-package:${skill.packageId} entry:end -->`,
          ].join('\n'))
        }
      }

      const content = await this.loadDoc(name)
      if (content) {
        docs.push([
          `<!-- reference:${skill.name} (${skill.location}) start -->`,
          content,
          `<!-- reference:${skill.name} end -->`,
        ].join('\n'))
      }
    }

    return docs.join('\n\n---\n\n')
  }

  private async scanSkillPackages(): Promise<SkillPackageMeta[]> {
    const root = config.skillsDir
    const packages: SkillPackageMeta[] = []

    // 兼容旧结构：skills/ 目录本身作为一个 skill 包（若存在 SKILL.md 或 references）
    const rootPkg = await this.buildPackageMeta(root, '')
    if (rootPkg) packages.push(rootPkg)

    // 多包结构：skills/<dir>/SKILL.md + skills/<dir>/references/
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

  private async buildPackageMeta(packageRoot: string, dirName: string): Promise<SkillPackageMeta | null> {
    const skillMdPath = resolve(packageRoot, 'SKILL.md')
    const refsDir = resolve(packageRoot, 'references')

    const hasSkillMd = await pathExists(skillMdPath)
    const hasRefs = await pathExists(refsDir)
    if (!hasSkillMd && !hasRefs) return null

    let packageId = dirName || 'root-skill'
    let description = ''

    if (hasSkillMd) {
      try {
        const raw = await readFile(skillMdPath, 'utf-8')
        const fm = parseFrontmatter(raw)
        if (typeof fm.name === 'string' && fm.name.trim()) packageId = fm.name.trim()
        if (typeof fm.description === 'string') description = fm.description.trim()
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
    }
  }

  private async scanReferencesForPackage(pkg: SkillPackageMeta): Promise<RawReferenceDoc[]> {
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

      const location = pkg.dirName
        ? `skills/${pkg.dirName}/references/${refName}.md`
        : `skills/references/${refName}.md`

      docs.push({
        refName,
        title,
        summary,
        filePath,
        location,
        packageId: pkg.id,
        packageDirName: pkg.dirName,
        packageDescription: pkg.description,
      })
    }

    return docs
  }

  private buildCatalogTexts() {
    const grouped = new Map<string, SkillEntry[]>()
    for (const skill of this.skills.values()) {
      const arr = grouped.get(skill.packageId) || []
      arr.push(skill)
      grouped.set(skill.packageId, arr)
    }

    const packageOrder = Array.from(this.packages.values()).sort((a, b) => a.id.localeCompare(b.id))

    this.catalogText = packageOrder
      .map((pkg) => {
        const docs = (grouped.get(pkg.id) || []).sort((a, b) => a.name.localeCompare(b.name))
        if (!docs.length) return ''
        const header = `### ${pkg.id}${pkg.description ? ` — ${pkg.description}` : ''}`
        const items = docs.map((s) => `- **${s.name}**: ${s.title} — ${s.summary}`)
        return [header, ...items].join('\n')
      })
      .filter(Boolean)
      .join('\n\n')

    this.plannerCatalogText = [
      '<available_skills>',
      ...packageOrder.flatMap((pkg) => {
        const docs = (grouped.get(pkg.id) || []).sort((a, b) => a.name.localeCompare(b.name))
        return docs.map((s) => [
          '  <skill>',
          `    <name>${s.name}</name>`,
          `    <description>${escapeXml(`[package:${pkg.id}] ${s.title} — ${s.summary}`)}</description>`,
          `    <location>${s.location}</location>`,
          '  </skill>',
        ].join('\n'))
      }),
      '</available_skills>',
    ].join('\n')
  }
}

function dedupePackages(items: SkillPackageMeta[]): SkillPackageMeta[] {
  const out: SkillPackageMeta[] = []
  const used = new Set<string>()

  for (const item of items) {
    let id = item.id
    if (used.has(id)) {
      // 与 OpenClaw 的“按名字合并/覆盖”思路类似，但这里优先保留根 skill，子 skill 重名时加目录前缀避免冲突
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

  // 为 echarts 示例生成更有区分度的摘要，避免 planner 看到一堆“纯图表示例（完整 HTML）”后难以决策
  if (packageId === 'echarts-charts' && /^echarts-/.test(refName) && refName !== 'echarts-index') {
    const chartType = inferEchartsChartType(refName)
    const titleCore = title.replace(/^ECharts\s*示例[:：]\s*/, '').trim() || refName
    const featureHints = inferEchartsFeatureHints(content, titleCore)
    const featureText = featureHints.length ? `；特性：${featureHints.join('、')}` : ''
    return `ECharts ${chartType} 示例，适合图表 option 参考${featureText}；标题特征：${titleCore}`
  }

  return rawSummary
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
  const push = (v: string) => { if (!hints.includes(v)) hints.push(v) }

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
