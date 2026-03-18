import { createPatch } from 'diff'
import type {
  CodeDiffHunk,
  CodeDiffPayload,
  PatchApplyResult,
  PatchApplyStrategy,
  PatchBlock,
  PatchBlockReport,
  PatchMatchRange,
} from './CodePatchTypes.js'

const DEFAULT_DIFF_CONTEXT = 3
const FUZZY_MAX_RATIO = 0.12
const MIN_FUZZY_LINES = 3
const MIN_FUZZY_CHARS = 80
const FUZZY_SECOND_BEST_GAP = 0.025

interface ApplyBlockSuccess {
  nextCode: string
  occurrences: number
  strategy: PatchApplyStrategy
  range: PatchMatchRange
}

interface ApplyBlockFailure {
  occurrences: number
  message: string
  nearbyContext?: string
}

interface CandidateMatch {
  start: number
  end: number
  indentation: string
}

interface FuzzyCandidate extends CandidateMatch {
  score: number
}

export class CodePatchService {
  parseSearchReplaceBlocks(content: string): PatchBlock[] {
    const normalized = normalizeLineEndings(content)
    const blocks: PatchBlock[] = []
    const patterns = [
      /(?:^|\n)-{3,}\s*SEARCH\s*\n([\s\S]*?)\n={3,}\s*\n([\s\S]*?)\n\+{3,}\s*REPLACE/g,
      /(?:^|\n)<{3,}\s*SEARCH\s*\n([\s\S]*?)\n={3,}\s*\n([\s\S]*?)\n>{3,}\s*REPLACE/g,
    ]

    for (const pattern of patterns) {
      let match: RegExpExecArray | null = null
      while ((match = pattern.exec(normalized)) !== null) {
        blocks.push({
          blockIndex: blocks.length,
          search: trimTrailingNewlines(match[1] || ''),
          replace: trimTrailingNewlines(match[2] || ''),
        })
      }
      if (blocks.length > 0) break
    }

    return blocks
  }

  applyBlocks(params: {
    originalCode: string
    blocks: PatchBlock[]
    fileName?: string
  }): PatchApplyResult {
    const originalCode = String(params.originalCode || '')
    const originalLineEnding = detectLineEnding(originalCode)
    let workingCode = normalizeLineEndings(originalCode)
    const blockReports: PatchBlockReport[] = []

    for (const block of params.blocks) {
      const normalizedBlock = {
        ...block,
        search: normalizeLineEndings(block.search),
        replace: normalizeLineEndings(block.replace),
      }
      const outcome = this.applySingleBlock(workingCode, normalizedBlock)
      if ('nextCode' in outcome) {
        workingCode = outcome.nextCode
        blockReports.push({
          blockIndex: block.blockIndex,
          status: 'applied',
          strategy: outcome.strategy,
          occurrences: outcome.occurrences,
          message: describeSuccess(outcome.strategy),
          searchPreview: buildPreview(normalizedBlock.search),
          replacePreview: buildPreview(normalizedBlock.replace),
          range: outcome.range,
        })
        continue
      }

      blockReports.push({
        blockIndex: block.blockIndex,
        status: 'failed',
        occurrences: outcome.occurrences,
        message: outcome.message,
        searchPreview: buildPreview(normalizedBlock.search),
        replacePreview: buildPreview(normalizedBlock.replace),
        nearbyContext: outcome.nearbyContext,
      })
    }

    const afterCode = restoreLineEndings(workingCode, originalLineEnding)
    const rawUnifiedDiff = createPatch(
      params.fileName || 'preview.html',
      originalCode,
      afterCode,
      'before',
      'after',
      { context: DEFAULT_DIFF_CONTEXT },
    )
    const unifiedDiff = normalizeDiffForViewer(rawUnifiedDiff, params.fileName || 'preview.html')
    const hunks = parseUnifiedDiffHunks(unifiedDiff)
    const appliedBlockCount = blockReports.filter((report) => report.status === 'applied').length
    const failedBlockCount = blockReports.filter((report) => report.status === 'failed').length

    return {
      success: appliedBlockCount > 0 && failedBlockCount === 0,
      hadFailures: failedBlockCount > 0,
      newCode: afterCode,
      unifiedDiff,
      hunks,
      summary: buildPatchSummary(appliedBlockCount, failedBlockCount),
      blockReports,
      appliedBlockCount,
      failedBlockCount,
    }
  }

  buildCodeDiffPayload(params: {
    beforeCode: string
    afterCode: string
    fallbackMode: 'patch' | 'rewrite'
    blockReports: PatchBlockReport[]
    patchBlocks?: PatchBlock[]
    patchText?: string
    summary?: string
    fileName?: string
  }): CodeDiffPayload {
    const rawUnifiedDiff = createPatch(
      params.fileName || 'preview.html',
      params.beforeCode,
      params.afterCode,
      'before',
      'after',
      { context: DEFAULT_DIFF_CONTEXT },
    )
    const unifiedDiff = normalizeDiffForViewer(rawUnifiedDiff, params.fileName || 'preview.html')

    return {
      beforeCode: params.beforeCode,
      afterCode: params.afterCode,
      unifiedDiff,
      hunks: parseUnifiedDiffHunks(unifiedDiff),
      summary: params.summary || buildDiffSummary(params.fallbackMode, params.blockReports),
      fallbackMode: params.fallbackMode,
      blockReports: params.blockReports,
      patchBlocks: params.patchBlocks,
      patchText: params.patchText,
    }
  }

  private applySingleBlock(code: string, block: PatchBlock): ApplyBlockSuccess | ApplyBlockFailure {
    const exact = tryExactReplacement(code, block)
    if (exact) return exact

    const flexible = tryFlexibleReplacement(code, block)
    if (flexible) return flexible

    const regex = tryRegexReplacement(code, block)
    if (regex) return regex

    const fuzzy = tryFuzzyReplacement(code, block)
    if (fuzzy) return fuzzy

    return {
      occurrences: 0,
      message: '未找到唯一可替换的代码片段，请补充更短且唯一的上下文。',
      nearbyContext: findNearbyContext(code, block.search),
    }
  }
}

function tryExactReplacement(code: string, block: PatchBlock): ApplyBlockSuccess | ApplyBlockFailure | null {
  if (!block.search) {
    return {
      occurrences: 0,
      message: 'SEARCH 片段不能为空。',
    }
  }

  const matches = findAllIndices(code, block.search)
  if (matches.length > 1) {
    if (typeof block.occurrenceIndex === 'number' && block.occurrenceIndex >= 0 && block.occurrenceIndex < matches.length) {
      const start = matches[block.occurrenceIndex]
      const end = start + block.search.length
      return {
        nextCode: `${code.slice(0, start)}${block.replace}${code.slice(end)}`,
        occurrences: matches.length,
        strategy: 'exact',
        range: buildRange(code, start, end),
      }
    }
    return {
      occurrences: matches.length,
      message: `SEARCH 片段命中 ${matches.length} 处，缺少唯一上下文。`,
      nearbyContext: findNearbyContext(code, block.search),
    }
  }
  if (matches.length === 1) {
    const start = matches[0]
    const end = start + block.search.length
    return {
      nextCode: `${code.slice(0, start)}${block.replace}${code.slice(end)}`,
      occurrences: 1,
      strategy: 'exact',
      range: buildRange(code, start, end),
    }
  }
  return null
}

function tryFlexibleReplacement(code: string, block: PatchBlock): ApplyBlockSuccess | ApplyBlockFailure | null {
  const codeLines = splitLinesWithOffsets(code)
  const searchLines = splitLines(block.search)
  if (!searchLines.length) return null

  const candidates: CandidateMatch[] = []
  for (let index = 0; index <= codeLines.length - searchLines.length; index += 1) {
    const window = codeLines.slice(index, index + searchLines.length)
    const matches = window.every((line, lineIndex) => line.text.trim() === searchLines[lineIndex].trim())
    if (!matches) continue
    candidates.push({
      start: window[0].start,
      end: window[window.length - 1].end,
      indentation: detectIndentation(window[0].text),
    })
  }

  if (candidates.length > 1) {
    return {
      occurrences: candidates.length,
      message: `SEARCH 片段在宽松缩进匹配下命中 ${candidates.length} 处，仍不唯一。`,
      nearbyContext: findNearbyContext(code, block.search),
    }
  }
  if (candidates.length === 1) {
    const candidate = candidates[0]
    const replacement = indentReplacement(block.replace, candidate.indentation)
    return {
      nextCode: `${code.slice(0, candidate.start)}${replacement}${code.slice(candidate.end)}`,
      occurrences: 1,
      strategy: 'flexible',
      range: buildRange(code, candidate.start, candidate.end),
    }
  }
  return null
}

function tryRegexReplacement(code: string, block: PatchBlock): ApplyBlockSuccess | ApplyBlockFailure | null {
  const tokenized = tokenizeForRegex(block.search)
  if (!tokenized.length) return null

  const pattern = tokenized.map(escapeRegex).join('\\s*')
  const regex = new RegExp(pattern, 'gm')
  const matches = Array.from(code.matchAll(regex))
  if (matches.length > 1) {
    return {
      occurrences: matches.length,
      message: `SEARCH 片段在 whitespace-token 匹配下命中 ${matches.length} 处，仍不唯一。`,
      nearbyContext: findNearbyContext(code, block.search),
    }
  }
  if (matches.length === 1) {
    const match = matches[0]
    const start = match.index ?? 0
    const end = start + match[0].length
    const indentation = detectIndentationAt(code, start)
    const replacement = indentReplacement(block.replace, indentation)
    return {
      nextCode: `${code.slice(0, start)}${replacement}${code.slice(end)}`,
      occurrences: 1,
      strategy: 'regex',
      range: buildRange(code, start, end),
    }
  }
  return null
}

function tryFuzzyReplacement(code: string, block: PatchBlock): ApplyBlockSuccess | ApplyBlockFailure | null {
  const searchLines = splitLines(block.search)
  if (searchLines.length < MIN_FUZZY_LINES && block.search.length < MIN_FUZZY_CHARS) return null

  const codeLines = splitLinesWithOffsets(code)
  if (searchLines.length === 0 || codeLines.length < searchLines.length) return null

  const normalizedSearch = normalizeFuzzyText(block.search)
  if (!normalizedSearch) return null

  const candidates: FuzzyCandidate[] = []
  for (let index = 0; index <= codeLines.length - searchLines.length; index += 1) {
    const window = codeLines.slice(index, index + searchLines.length)
    const windowText = joinLineWindow(window)
    const normalizedWindow = normalizeFuzzyText(windowText)
    if (!normalizedWindow) continue

    const distance = levenshtein(normalizedSearch, normalizedWindow)
    const score = distance / Math.max(normalizedSearch.length, normalizedWindow.length, 1)
    if (score > FUZZY_MAX_RATIO) continue

    candidates.push({
      score,
      start: window[0].start,
      end: window[window.length - 1].end,
      indentation: detectIndentation(window[0].text),
    })
  }

  if (!candidates.length) return null

  candidates.sort((a, b) => a.score - b.score)
  const best = candidates[0]
  const second = candidates[1]
  if (second && Math.abs(second.score - best.score) < FUZZY_SECOND_BEST_GAP) {
    return {
      occurrences: candidates.length,
      message: 'SEARCH 片段的模糊匹配结果不够唯一，请补充更具体的上下文。',
      nearbyContext: code.slice(best.start, best.end).trim(),
    }
  }

  const replacement = indentReplacement(block.replace, best.indentation)
  return {
    nextCode: `${code.slice(0, best.start)}${replacement}${code.slice(best.end)}`,
    occurrences: 1,
    strategy: 'fuzzy',
    range: buildRange(code, best.start, best.end),
  }
}

function parseUnifiedDiffHunks(unifiedDiff: string): CodeDiffHunk[] {
  return unifiedDiff
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.startsWith('@@'))
    .map((line) => {
      const match = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/)
      if (!match) {
        return {
          oldStart: 0,
          oldLines: 0,
          newStart: 0,
          newLines: 0,
          header: line,
        }
      }
      return {
        oldStart: Number(match[1] || 0),
        oldLines: Number(match[2] || 1),
        newStart: Number(match[3] || 0),
        newLines: Number(match[4] || 1),
        header: line,
      }
    })
}

function buildPatchSummary(appliedBlockCount: number, failedBlockCount: number): string {
  if (appliedBlockCount > 0 && failedBlockCount === 0) {
    return `已通过 ${appliedBlockCount} 个局部 patch 完成自动修复。`
  }
  if (appliedBlockCount > 0) {
    return `已应用 ${appliedBlockCount} 个局部 patch，仍有 ${failedBlockCount} 个 patch 需要重试。`
  }
  return '本轮未能应用任何局部 patch。'
}

function buildDiffSummary(fallbackMode: 'patch' | 'rewrite', blockReports: PatchBlockReport[]): string {
  const appliedCount = blockReports.filter((report) => report.status === 'applied').length
  if (fallbackMode === 'rewrite') {
    return '局部 patch 未能稳定完成，已回退为整页重写修复。'
  }
  if (appliedCount === 0) return '本轮未检测到可应用的局部改动。'
  return `本次修复共应用 ${appliedCount} 处局部改动。`
}

function normalizeDiffForViewer(diffText: string, fileName: string): string {
  const normalized = normalizeLineEndings(diffText).trim()
  if (!normalized) return ''
  if (normalized.startsWith('diff --git') || normalized.startsWith('--- ')) {
    return `${normalized}\n`
  }
  if (!normalized.startsWith('Index:')) {
    return `${normalized}\n`
  }

  const lines = normalized.split('\n')
  const hunkStartIndex = lines.findIndex((line) => line.startsWith('@@'))
  const hunkLines = hunkStartIndex >= 0 ? lines.slice(hunkStartIndex) : []
  const safeFileName = String(fileName || 'preview.html').replace(/^\/+/, '')

  return [
    `diff --git a/${safeFileName} b/${safeFileName}`,
    'index 1111111..2222222 100644',
    `--- a/${safeFileName}`,
    `+++ b/${safeFileName}`,
    ...hunkLines,
  ].join('\n').trimEnd() + '\n'
}

function buildPreview(value: string): string {
  const compact = value.trim()
  return compact.length <= 220 ? compact : `${compact.slice(0, 220)}...`
}

function trimTrailingNewlines(value: string): string {
  return value.replace(/(?:\r?\n)+$/, '')
}

function normalizeLineEndings(value: string): string {
  return String(value || '').replace(/\r\n/g, '\n')
}

function detectLineEnding(value: string): '\n' | '\r\n' {
  return value.includes('\r\n') ? '\r\n' : '\n'
}

function restoreLineEndings(value: string, lineEnding: '\n' | '\r\n'): string {
  if (lineEnding === '\n') return value
  return value.replace(/\n/g, '\r\n')
}

function splitLines(value: string): string[] {
  return normalizeLineEndings(value).split('\n')
}

function splitLinesWithOffsets(value: string): Array<{ text: string; start: number; end: number }> {
  const normalized = normalizeLineEndings(value)
  const lines: Array<{ text: string; start: number; end: number }> = []
  let offset = 0
  const parts = normalized.split('\n')
  for (let index = 0; index < parts.length; index += 1) {
    const line = parts[index]
    const hasNewline = index < parts.length - 1
    const text = hasNewline ? `${line}\n` : line
    lines.push({ text, start: offset, end: offset + text.length })
    offset += text.length
  }
  return lines
}

function joinLineWindow(lines: Array<{ text: string }>): string {
  return lines.map((line) => line.text).join('')
}

function buildRange(content: string, start: number, end: number): PatchMatchRange {
  return {
    start,
    end,
    startLine: countLines(content.slice(0, start)) + 1,
    endLine: countLines(content.slice(0, end)) + 1,
  }
}

function countLines(value: string): number {
  return (value.match(/\n/g) || []).length
}

function detectIndentation(text: string): string {
  const match = text.match(/^([ \t]*)/)
  return match?.[1] || ''
}

function detectIndentationAt(content: string, index: number): string {
  const lineStart = content.lastIndexOf('\n', index - 1) + 1
  return detectIndentation(content.slice(lineStart))
}

function stripCommonIndentation(lines: string[]): string[] {
  const indents = lines
    .filter((line) => line.trim())
    .map((line) => detectIndentation(line).length)
  if (!indents.length) return lines
  const common = Math.min(...indents)
  if (common <= 0) return lines
  return lines.map((line) => (line.trim() ? line.slice(common) : line))
}

function indentReplacement(replacement: string, indentation: string): string {
  const lines = stripCommonIndentation(splitLines(replacement))
  return lines
    .map((line, index) => {
      if (!line.trim()) return ''
      return index === 0 ? `${indentation}${line.trimStart()}` : `${indentation}${line}`
    })
    .join('\n')
}

function findAllIndices(content: string, needle: string): number[] {
  const matches: number[] = []
  if (!needle) return matches
  let index = content.indexOf(needle)
  while (index >= 0) {
    matches.push(index)
    index = content.indexOf(needle, index + needle.length)
  }
  return matches
}

function tokenizeForRegex(value: string): string[] {
  const delimiters = ['(', ')', ':', '[', ']', '{', '}', '>', '<', '=']
  let processed = normalizeLineEndings(value)
  for (const delimiter of delimiters) {
    processed = processed.split(delimiter).join(` ${delimiter} `)
  }
  return processed.split(/\s+/).filter(Boolean)
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeFuzzyText(value: string): string {
  return normalizeLineEndings(value)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n+/g, '\n')
    .trim()
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length

  const prev = new Array<number>(b.length + 1)
  const curr = new Array<number>(b.length + 1)

  for (let index = 0; index <= b.length; index += 1) {
    prev[index] = index
  }

  for (let row = 1; row <= a.length; row += 1) {
    curr[0] = row
    for (let col = 1; col <= b.length; col += 1) {
      const cost = a[row - 1] === b[col - 1] ? 0 : 1
      curr[col] = Math.min(
        curr[col - 1] + 1,
        prev[col] + 1,
        prev[col - 1] + cost,
      )
    }
    for (let col = 0; col <= b.length; col += 1) {
      prev[col] = curr[col]
    }
  }

  return prev[b.length]
}

function findNearbyContext(content: string, search: string): string | undefined {
  const searchLines = splitLines(search)
    .map((line) => line.trim())
    .filter(Boolean)
  if (!searchLines.length) return undefined

  const codeLines = splitLinesWithOffsets(content)
  let bestScore = Number.POSITIVE_INFINITY
  let bestSlice = ''

  for (let index = 0; index < codeLines.length; index += 1) {
    const window = codeLines.slice(index, index + Math.max(searchLines.length, 4))
    const candidate = joinLineWindow(window).trim()
    if (!candidate) continue
    const score = levenshtein(
      normalizeFuzzyText(searchLines.join('\n')),
      normalizeFuzzyText(candidate),
    )
    if (score < bestScore) {
      bestScore = score
      bestSlice = candidate
    }
  }

  return bestSlice || undefined
}

function describeSuccess(strategy: PatchApplyStrategy): string {
  if (strategy === 'exact') return '已按精确匹配应用改动。'
  if (strategy === 'flexible') return '已按宽松缩进匹配应用改动。'
  if (strategy === 'regex') return '已按 whitespace-token 匹配应用改动。'
  return '已按模糊匹配应用改动。'
}
