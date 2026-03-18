import type {
  AgentToolPlan,
  AgentToolPlanStep,
} from './AgentRuntimeTypes.js'
import type { WebFetchResult } from './WebFetchService.js'
import type { WebSearchResult } from './WebSearchService.js'
import type { WorkspaceSnippetEditResult } from './WorkspaceSnippetEditService.js'

export interface ToolExecutionRecord {
  step: AgentToolPlanStep
  result: unknown
  isError: boolean
}

export function summarizeToolArgs(step: AgentToolPlanStep): Record<string, unknown> {
  if (step.tool === 'web_search') {
    return {
      tool: step.tool,
      query: step.query,
      maxResults: step.maxResults,
      reason: step.reason || undefined,
    }
  }

  if (step.tool === 'web_fetch') {
    return {
      tool: step.tool,
      url: step.url,
      reason: step.reason || undefined,
    }
  }

  return {
    tool: step.tool,
    filePath: step.filePath,
    reason: step.reason || undefined,
    oldStringChars: step.oldString.length,
    newStringChars: step.newString.length,
    expectedOccurrences: step.expectedOccurrences,
    occurrenceIndex: step.occurrenceIndex,
  }
}

export function buildToolContext(records: ToolExecutionRecord[]): string {
  const sections = records
    .filter((record) => !record.isError)
    .map((record) => formatSuccessfulToolRecord(record.step, record.result))
    .filter(Boolean)

  if (sections.length === 0) return ''
  return ['## 外部工具结果（高优先级）', ...sections].join('\n\n')
}

export function buildToolOnlySummary(plan: AgentToolPlan, records: ToolExecutionRecord[]): string {
  const success = records.filter((record) => !record.isError)
  const failures = records.filter((record) => record.isError)
  const lines: string[] = []

  if (plan.reason) {
    lines.push(plan.reason)
  }

  for (const record of success) {
    if (record.step.tool === 'snippet_edit') {
      const result = record.result as WorkspaceSnippetEditResult
      lines.push(`已修改文件 ${result.filePath}，位于第 ${result.startLine}-${result.endLine} 行附近。`)
      continue
    }
    if (record.step.tool === 'web_search') {
      const result = record.result as WebSearchResult
      lines.push(`已完成网络搜索：${result.query}（命中 ${result.results.length} 条结果）。`)
      continue
    }
    if (record.step.tool === 'web_fetch') {
      const result = record.result as WebFetchResult
      const title = result.title ? `《${result.title}》` : result.finalUrl
      lines.push(`已抓取页面 ${title}。`)
    }
  }

  for (const record of failures) {
    lines.push(`工具 ${record.step.tool} 执行失败：${String((record.result as Error)?.message || record.result || '未知错误')}`)
  }

  return lines.join('\n')
}

function formatSuccessfulToolRecord(step: AgentToolPlanStep, result: unknown): string {
  if (step.tool === 'web_search') {
    const search = result as WebSearchResult
    const lines = [
      `### web_search`,
      `查询：${search.query}`,
      ...search.results.slice(0, 5).map((item, index) => `${index + 1}. ${item.title}\nURL: ${item.url}\n摘要: ${trim(item.snippet, 240)}`),
    ]
    return lines.join('\n')
  }

  if (step.tool === 'web_fetch') {
    const fetch = result as WebFetchResult
    return [
      '### web_fetch',
      `URL: ${fetch.finalUrl}`,
      `HTTP: ${fetch.status} | Content-Type: ${fetch.contentType}`,
      fetch.title ? `标题: ${fetch.title}` : '',
      `正文摘要: ${trim(fetch.excerpt, 1600)}`,
    ].filter(Boolean).join('\n')
  }

  const edit = result as WorkspaceSnippetEditResult
  return [
    '### snippet_edit',
    `文件: ${edit.filePath}`,
    `位置: 第 ${edit.startLine}-${edit.endLine} 行附近`,
    `修改前:\n${trim(edit.previewBefore, 900)}`,
    `修改后:\n${trim(edit.previewAfter, 900)}`,
  ].join('\n')
}

function trim(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}...`
}
