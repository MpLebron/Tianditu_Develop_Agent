import { useState, useRef, useEffect } from 'react'
import { useMapStore } from '../../stores/useMapStore'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { extractFirstCompleteHtmlDocument } from '../../utils/extractFirstCompleteHtmlDocument'

export function CodePanel() {
  const { currentCode, previewCode, streamingCode, codeStreaming } = useMapStore()
  const [copied, setCopied] = useState(false)
  const [downloaded, setDownloaded] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const resolvedCurrentCode = currentCode
    ? extractFirstCompleteHtmlDocument(currentCode) || currentCode
    : null
  const resolvedPreviewCode = previewCode
    ? extractFirstCompleteHtmlDocument(previewCode) || previewCode
    : null
  const resolvedStreamingCode = streamingCode
    ? extractFirstCompleteHtmlDocument(streamingCode) || streamingCode
    : null

  // 显示的代码：流式生成中用 streamingCode，否则用 currentCode
  const displayCode = codeStreaming
    ? (resolvedPreviewCode || resolvedStreamingCode)
    : resolvedCurrentCode

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

  return (
    <div className="flex flex-col h-full bg-[#1e1e2e] text-gray-100 overflow-hidden dark-scrollbar">
      {/* 工具栏 */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06] bg-[#1e1e2e]/80 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-2.5">
          {/* 文件类型标识 */}
          <div className="flex items-center gap-1.5 bg-orange-500/10 text-orange-400 px-2 py-0.5 rounded-md">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M1.5 0h21l-1.91 21.563L11.977 24l-8.565-2.438L1.5 0zm7.031 9.75l-.232-2.718 10.059.003.071-.757.089-.998.063-.728H6.905l.601 6.863h6.822l-.361 3.694-2.213.668-2.172-.656-.142-1.494H7.414l.228 3.115L11.8 17.97l4.15-1.15.673-7.07H8.531z" />
            </svg>
            <span className="text-[11px] font-mono font-medium">HTML</span>
          </div>
          {codeStreaming ? (
            <span className="flex items-center gap-1.5 text-[11px] text-blue-400">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              {resolvedPreviewCode ? '已预渲染，收尾中...' : '生成中...'}
            </span>
          ) : (
            <span className="text-[11px] text-gray-500">{lineCount} 行</span>
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
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.06]'
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
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.06]'
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
        {codeStreaming ? (
          /* 流式生成中：用轻量级 <pre> 渲染，避免 SyntaxHighlighter 高频重解析卡顿 */
          <pre
            className="p-4 text-[12.5px] leading-[1.6] text-gray-300 whitespace-pre-wrap break-all"
            style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, monospace" }}
          >
            {displayCode}
            {!resolvedPreviewCode && (
              <span className="inline-block w-[2px] h-[14px] bg-blue-400 animate-pulse ml-px align-middle" />
            )}
          </pre>
        ) : (
          /* 生成完成：用 SyntaxHighlighter 做完整语法高亮 */
          <SyntaxHighlighter
            language="html"
            style={oneDark}
            showLineNumbers
            lineNumberStyle={{
              minWidth: '2.5em',
              paddingRight: '1em',
              color: '#4a4a5a',
              fontSize: '11px',
              userSelect: 'none',
            }}
            customStyle={{
              margin: 0,
              padding: '16px 0',
              background: 'transparent',
              fontSize: '12.5px',
              lineHeight: '1.6',
            }}
            codeTagProps={{
              style: { fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, monospace" },
            }}
            wrapLongLines
          >
            {resolvedCurrentCode!}
          </SyntaxHighlighter>
        )}
      </div>
    </div>
  )
}
