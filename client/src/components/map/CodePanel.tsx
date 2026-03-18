import { useState, useRef, useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import { useMapStore } from '../../stores/useMapStore'
import { extractFirstCompleteHtmlDocument } from '../../utils/extractFirstCompleteHtmlDocument'
import {
  Diff,
  Hunk,
  parseDiff,
  textLinesToHunk,
  computeOldLineNumber,
  computeNewLineNumber,
  isDelete,
  isInsert,
} from 'react-diff-view'
import 'react-diff-view/style/index.css'

export function CodePanel() {
  const {
    currentCode,
    previewCode,
    streamingCode,
    codeStreaming,
    fixing,
    fixingSource,
    lastFixDiff,
  } = useMapStore()
  const [copied, setCopied] = useState(false)
  const [downloaded, setDownloaded] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const lastAutoScrolledDiffRef = useRef<string | null>(null)

  const resolvedCurrentCode = currentCode
    ? extractFirstCompleteHtmlDocument(currentCode) || currentCode
    : null
  const resolvedPreviewCode = previewCode
    ? extractFirstCompleteHtmlDocument(previewCode) || previewCode
    : null
  const resolvedStreamingCode = streamingCode
    ? extractFirstCompleteHtmlDocument(streamingCode) || streamingCode
    : null

  const showDiff = !codeStreaming && !!lastFixDiff
  const diffFiles = useMemo(() => {
    if (!lastFixDiff?.unifiedDiff) return []
    try {
      return parseDiff(normalizeDiffForViewer(lastFixDiff.unifiedDiff), { nearbySequences: 'zip' })
    } catch (error) {
      console.error('Failed to parse code diff payload:', error)
      return []
    }
  }, [lastFixDiff])
  const diffFile = diffFiles[0]
  const renderDiff = showDiff && !!diffFile
  const fullDiffHunks = useMemo(() => {
    if (!diffFile || !lastFixDiff?.beforeCode) return diffFile?.hunks || []
    return expandHunksToFullFile(diffFile.hunks, lastFixDiff.beforeCode)
  }, [diffFile, lastFixDiff])
  const diffStats = useMemo(() => {
    if (!lastFixDiff?.unifiedDiff) return { additions: 0, deletions: 0 }
    return countDiffStats(lastFixDiff.unifiedDiff)
  }, [lastFixDiff])

  // 显示的代码：流式生成中用 streamingCode，否则用 currentCode
  const displayCode = codeStreaming
    ? (resolvedPreviewCode || resolvedStreamingCode)
    : resolvedCurrentCode
  const plainCodeLines = useMemo(
    () => buildPlainCodeLines(displayCode, codeStreaming),
    [displayCode, codeStreaming],
  )

  // 流式生成时自动滚动到底部
  useEffect(() => {
    if (codeStreaming && !resolvedPreviewCode && panelRef.current) {
      panelRef.current.scrollTop = panelRef.current.scrollHeight
    }
  }, [streamingCode, codeStreaming, resolvedPreviewCode])

  // 首份完整 HTML 出现后锁定到顶部查看
  useEffect(() => {
    if (codeStreaming && resolvedPreviewCode && panelRef.current) {
      panelRef.current.scrollTop = 0
    }
  }, [codeStreaming, resolvedPreviewCode])

  // 最终代码更新时滚动到顶部
  useEffect(() => {
    if (!codeStreaming && currentCode && panelRef.current) {
      panelRef.current.scrollTop = 0
    }
  }, [currentCode, codeStreaming])

  useEffect(() => {
    if (!renderDiff || !lastFixDiff?.unifiedDiff || !panelRef.current) return
    if (lastAutoScrolledDiffRef.current === lastFixDiff.unifiedDiff) return
    lastAutoScrolledDiffRef.current = lastFixDiff.unifiedDiff

    const container = panelRef.current
    requestAnimationFrame(() => {
      const target = container.querySelector('.diff-code-insert, .diff-code-delete')?.closest('tr')
      if (target instanceof HTMLElement) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    })
  }, [renderDiff, lastFixDiff])

  // codeStreaming 时 streamingCode 可能是空字符串（刚开始），也需要显示面板
  if (!displayCode && !codeStreaming) return null

  const handleCopy = async () => {
    if (!resolvedCurrentCode) return
    await navigator.clipboard.writeText(resolvedCurrentCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    if (!resolvedCurrentCode) return
    const blob = new Blob([resolvedCurrentCode], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'tianditu-map.html'
    a.click()
    URL.revokeObjectURL(url)
    setDownloaded(true)
    setTimeout(() => setDownloaded(false), 2000)
  }

  const lineCount = (displayCode || '').split('\n').length
  const streamStatusLabel = resolvedPreviewCode
    ? (fixing ? '已预渲染修复方案，收尾中...' : '已预渲染，收尾中...')
    : (fixing
      ? `正在${fixingSource === 'visual' ? '视觉回灌补修' : '自动修复'}...`
      : '生成中...')

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50 text-slate-900">
      {/* 工具栏 */}
      <div className="flex items-center justify-between px-4 py-2.5 shrink-0 border-b border-slate-200 bg-white/90 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          {/* 文件类型标识 */}
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-orange-100 text-orange-600">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M1.5 0h21l-1.91 21.563L11.977 24l-8.565-2.438L1.5 0zm7.031 9.75l-.232-2.718 10.059.003.071-.757.089-.998.063-.728H6.905l.601 6.863h6.822l-.361 3.694-2.213.668-2.172-.656-.142-1.494H7.414l.228 3.115L11.8 17.97l4.15-1.15.673-7.07H8.531z" />
            </svg>
            <span className="text-[11px] font-mono font-medium">HTML</span>
          </div>
          {codeStreaming ? (
            <span className="flex items-center gap-1.5 text-[11px] text-blue-400">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              {streamStatusLabel}
            </span>
          ) : renderDiff && lastFixDiff ? (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[11px] text-slate-500 truncate">{lastFixDiff.summary}</span>
              {(diffStats.additions > 0 || diffStats.deletions > 0) && (
                <span className="text-[11px] font-medium text-slate-400 whitespace-nowrap">
                  <span className="text-emerald-600">+{diffStats.additions}</span>
                  <span className="mx-1 text-slate-300">/</span>
                  <span className="text-rose-500">-{diffStats.deletions}</span>
                </span>
              )}
              {lastFixDiff.fallbackMode === 'rewrite' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-md border border-amber-200 bg-amber-50 text-amber-700">
                  整页重写兜底
                </span>
              )}
            </div>
          ) : (
            <span className="text-[11px] text-slate-500">{lineCount} 行</span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* 复制按钮 */}
          <button
            onClick={handleCopy}
            disabled={codeStreaming}
            className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg transition-all duration-200 ${
              copied
                ? 'bg-green-500/15 text-green-400'
                : codeStreaming
                  ? 'text-gray-600 cursor-not-allowed'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
            }`}
          >
            {copied ? (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                已复制
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                </svg>
                复制
              </>
            )}
          </button>

          {/* 下载按钮 */}
          <button
            onClick={handleDownload}
            disabled={codeStreaming}
            className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg transition-all duration-200 ${
              downloaded
                ? 'bg-green-500/15 text-green-400'
                : codeStreaming
                  ? 'text-gray-600 cursor-not-allowed'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
            }`}
          >
            {downloaded ? (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                已下载
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                下载
              </>
            )}
          </button>
        </div>
      </div>

      {/* 代码区域 */}
      <div ref={panelRef} className="flex-1 overflow-auto">
        {renderDiff && diffFile ? (
          <div className="h-full bg-[#fbfbfd]">
            <div className="inline-code-diff">
              <div className="text-[12px]">
                <Diff
                  viewType="unified"
                  diffType={diffFile.type}
                  hunks={fullDiffHunks}
                  renderGutter={renderSingleLineGutter}
                >
                  {(hunks) => hunks.map((hunk) => (
                    <Hunk key={hunk.content} hunk={hunk} />
                  ))}
                </Diff>
              </div>
            </div>
          </div>
        ) : (
          <div className="inline-code-plain">
            <table className="inline-code-plain-table">
              <tbody>
                {plainCodeLines.map((line, index) => {
                  const isLastLine = index === plainCodeLines.length - 1
                  const showCursor = codeStreaming && !resolvedPreviewCode && isLastLine
                  return (
                    <tr key={`plain-line-${index + 1}`} className="inline-code-plain-row">
                      <td className="inline-code-plain-gutter">{index + 1}</td>
                      <td className="inline-code-plain-code">
                        <span>{line || '\u00A0'}</span>
                        {showCursor && (
                          <span className="inline-code-plain-cursor" />
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function normalizeDiffForViewer(diffText: string): string {
  const normalized = String(diffText || '').replace(/\r\n/g, '\n').trim()
  if (!normalized) return ''
  if (normalized.startsWith('diff --git') || normalized.startsWith('--- ')) {
    return `${normalized}\n`
  }
  if (!normalized.startsWith('Index:')) {
    return `${normalized}\n`
  }

  const lines = normalized.split('\n')
  const oldLine = lines.find((line) => line.startsWith('--- '))
  const newLine = lines.find((line) => line.startsWith('+++ '))
  const hunkStartIndex = lines.findIndex((line) => line.startsWith('@@'))
  const oldPath = oldLine?.replace(/^---\s+/, '').split(/\s+/)[0] || 'preview.html'
  const newPath = newLine?.replace(/^\+\+\+\s+/, '').split(/\s+/)[0] || oldPath
  const hunkLines = hunkStartIndex >= 0 ? lines.slice(hunkStartIndex) : []

  return [
    `diff --git a/${oldPath} b/${newPath}`,
    'index 1111111..2222222 100644',
    `--- a/${oldPath}`,
    `+++ b/${newPath}`,
    ...hunkLines,
  ].join('\n').trimEnd() + '\n'
}

function countDiffStats(diffText: string): { additions: number; deletions: number } {
  const normalized = String(diffText || '').replace(/\r\n/g, '\n')
  let additions = 0
  let deletions = 0

  for (const line of normalized.split('\n')) {
    if (!line) continue
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) continue
    if (line.startsWith('+')) additions += 1
    if (line.startsWith('-')) deletions += 1
  }

  return { additions, deletions }
}

function expandHunksToFullFile(hunks: any[], sourceCode: string): any[] {
  if (!Array.isArray(hunks) || hunks.length === 0) return []

  const sourceLines = normalizeCodeLines(sourceCode)
  const expanded: any[] = []
  const sortedHunks = [...hunks].sort((a, b) => a.oldStart - b.oldStart)

  let oldCursor = 1
  let newCursor = 1

  for (const hunk of sortedHunks) {
    if (hunk.oldStart > oldCursor) {
      const contextLines = sourceLines.slice(oldCursor - 1, hunk.oldStart - 1)
      const contextHunk = textLinesToHunk(contextLines, oldCursor, newCursor)
      if (contextHunk) expanded.push(contextHunk)
    }

    expanded.push(hunk)
    oldCursor = hunk.oldStart + hunk.oldLines
    newCursor = hunk.newStart + hunk.newLines
  }

  if (oldCursor <= sourceLines.length) {
    const tailLines = sourceLines.slice(oldCursor - 1)
    const tailHunk = textLinesToHunk(tailLines, oldCursor, newCursor)
    if (tailHunk) expanded.push(tailHunk)
  }

  return expanded
}

function normalizeCodeLines(sourceCode: string): string[] {
  const normalized = String(sourceCode || '').replace(/\r\n/g, '\n')
  if (!normalized) return []
  return normalized.split('\n')
}

function buildPlainCodeLines(sourceCode: string | null | undefined, preserveEmptyLine = false): string[] {
  const normalized = String(sourceCode || '').replace(/\r\n/g, '\n')
  if (!normalized) {
    return preserveEmptyLine ? [''] : []
  }
  return normalized.split('\n')
}

function renderSingleLineGutter(options: {
  change: any
  side: 'old' | 'new'
  wrapInAnchor: (element: ReactNode) => ReactNode
}) {
  const { change, side, wrapInAnchor } = options

  if (side === 'old') {
    let marker = ''
    let markerClass = 'inline-code-diff-marker'
    if (isDelete(change)) {
      marker = '−'
      markerClass += ' is-delete'
    } else if (isInsert(change)) {
      marker = '+'
      markerClass += ' is-insert'
    }
    return <span className={markerClass}>{marker}</span>
  }

  const currentLine = computeNewLineNumber(change)
  const fallbackLine = computeOldLineNumber(change)
  const lineNumber = currentLine === -1 ? fallbackLine : currentLine
  if (lineNumber === -1) return null

  return wrapInAnchor(<span>{lineNumber}</span>)
}
