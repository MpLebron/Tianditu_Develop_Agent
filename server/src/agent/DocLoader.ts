import { readFile } from 'fs/promises'
import { resolve } from 'path'
import { config } from '../config.js'
import type { SkillStore } from './SkillStore.js'

/**
 * 按需加载 references 文档（渐进式披露）
 * 系统提示只含 skill 目录摘要（~500 tokens）
 * 匹配到具体 skill 后才加载完整文档（可来自多个 skill 包）
 */
export class DocLoader {
  constructor(private skillStore: SkillStore) {}

  /**
   * 加载匹配到的 skill 文档
   * @param skillNames skill 名称数组（最多 3 个）
   * @returns 拼接后的文档文本
   */
  async loadMatchedDocs(skillNames: string[]): Promise<string> {
    return this.skillStore.loadDocs(skillNames)
  }

  /**
   * 加载 skill 包入口文件（SKILL.md）
   */
  async loadSkillEntry(packageId = 'tianditu-js-api-v5'): Promise<string> {
    return (await this.skillStore.loadSkillEntry(packageId)) || ''
  }

  /**
   * 加载 HTML 模板
   */
  async loadTemplate(templateName: string): Promise<string | null> {
    const candidatePaths = [
      // 新结构：独立天地图 skill 包
      resolve(config.skillsDir, 'tianditu-js-api-v5', 'assets/templates', templateName),
      // 旧结构兼容：根 skills/assets/templates
      resolve(config.skillsDir, 'assets/templates', templateName),
    ]

    for (const templatePath of candidatePaths) {
      try {
        return await readFile(templatePath, 'utf-8')
      } catch {
        // try next candidate
      }
    }

    return null
  }
}
