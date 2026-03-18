import { readFile, writeFile } from 'fs/promises'
import { resolve, sep } from 'path'
import { config } from '../config.js'
import { CodePatchService } from './CodePatchService.js'

export interface WorkspaceSnippetEditResult {
  filePath: string
  absolutePath: string
  actualOccurrences: number
  replacedOccurrence: number
  startLine: number
  endLine: number
  previewBefore: string
  previewAfter: string
}

export class WorkspaceSnippetEditService {
  private patchService = new CodePatchService()

  async apply(params: {
    filePath: string
    oldString: string
    newString: string
    expectedOccurrences?: number
    occurrenceIndex?: number
  }): Promise<WorkspaceSnippetEditResult> {
    const absolutePath = resolveWorkspacePath(params.filePath)
    const original = await readFile(absolutePath, 'utf-8')
    const matches = findAllMatches(original, params.oldString)

    if (matches.length === 0) {
      throw new Error(`未在文件中找到待替换片段: ${params.filePath}`)
    }

    if (params.expectedOccurrences != null && matches.length !== params.expectedOccurrences) {
      throw new Error(`期望命中 ${params.expectedOccurrences} 处，实际命中 ${matches.length} 处: ${params.filePath}`)
    }

    let targetIndex = params.occurrenceIndex ?? 0
    if (matches.length > 1 && params.occurrenceIndex == null && params.expectedOccurrences == null) {
      throw new Error(`待替换片段命中 ${matches.length} 处，缺少 occurrenceIndex/expectedOccurrences 约束: ${params.filePath}`)
    }
    if (targetIndex < 0 || targetIndex >= matches.length) {
      throw new Error(`occurrenceIndex 超出范围: ${targetIndex}`)
    }

    const selectedMatch = matches[targetIndex]
    const selectedOldString = original.slice(selectedMatch, selectedMatch + params.oldString.length)
    const patchResult = this.patchService.applyBlocks({
      originalCode: original,
      fileName: params.filePath,
      blocks: [{
        blockIndex: 0,
        search: selectedOldString,
        replace: params.newString,
        occurrenceIndex: targetIndex,
      }],
    })
    const report = patchResult.blockReports[0]

    if (!patchResult.success || !report || report.status !== 'applied' || !report.range) {
      throw new Error(report?.message || `片段替换失败: ${params.filePath}`)
    }

    const updated = patchResult.newCode

    await writeFile(absolutePath, updated, 'utf-8')

    return {
      filePath: params.filePath,
      absolutePath,
      actualOccurrences: matches.length,
      replacedOccurrence: targetIndex,
      startLine: report.range.startLine,
      endLine: report.range.endLine,
      previewBefore: buildContextPreview(original, report.range.start, report.range.end),
      previewAfter: buildContextPreview(updated, report.range.start, report.range.start + params.newString.length),
    }
  }
}

function resolveWorkspacePath(filePath: string): string {
  const workspaceRoot = resolve(config.agentTools.workspaceRoot)
  const absolute = resolve(workspaceRoot, filePath)
  const normalizedRoot = workspaceRoot.endsWith(sep) ? workspaceRoot : `${workspaceRoot}${sep}`
  if (absolute !== workspaceRoot && !absolute.startsWith(normalizedRoot)) {
    throw new Error(`文件路径超出工作区范围: ${filePath}`)
  }
  return absolute
}

function findAllMatches(content: string, needle: string): number[] {
  const matches: number[] = []
  if (!needle) return matches
  let index = content.indexOf(needle)
  while (index >= 0) {
    matches.push(index)
    index = content.indexOf(needle, index + needle.length)
  }
  return matches
}

function countLines(content: string): number {
  if (!content) return 0
  return (content.match(/\n/g) || []).length
}

function buildContextPreview(content: string, start: number, end: number): string {
  const contextLines = config.agentTools.edit.contextLines
  const maxChars = config.agentTools.edit.maxSnippetChars
  const lineStarts = [0]
  for (let i = 0; i < content.length; i += 1) {
    if (content[i] === '\n') lineStarts.push(i + 1)
  }

  const startLine = lineNumberAt(lineStarts, start)
  const endLine = lineNumberAt(lineStarts, Math.max(start, end - 1))
  const previewStartLine = Math.max(1, startLine - contextLines)
  const previewEndLine = endLine + contextLines
  const previewStartIdx = lineStarts[previewStartLine - 1] ?? 0
  const previewEndIdx = lineStarts[previewEndLine] ?? content.length
  const snippet = content.slice(previewStartIdx, previewEndIdx).trim()
  if (snippet.length <= maxChars) return snippet
  return `${snippet.slice(0, maxChars)}...`
}

function lineNumberAt(lineStarts: number[], index: number): number {
  let line = 1
  for (let i = 0; i < lineStarts.length; i += 1) {
    if (lineStarts[i] <= index) {
      line = i + 1
      continue
    }
    break
  }
  return line
}
