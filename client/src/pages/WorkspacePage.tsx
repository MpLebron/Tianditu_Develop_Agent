import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useLocation, Link } from 'react-router-dom'
import { ChatPanel } from '../components/chat/ChatPanel'
import { MapPreview } from '../components/map/MapPreview'
import { CodePanel } from '../components/map/CodePanel'
import { ShareModal } from '../components/share/ShareModal'
import { useWorkspaceStore } from '../stores/useWorkspaceStore'
import { useMapStore } from '../stores/useMapStore'
import { useChatStore } from '../stores/useChatStore'

export function WorkspacePage() {
  const { showCode, chatWidth, codeWidth, toggleCode, setChatWidth, setCodeWidth } = useWorkspaceStore()
  const { currentCode, codeStreaming } = useMapStore()
  const { sendMessage } = useChatStore()
  const location = useLocation()
  const [shareOpen, setShareOpen] = useState(false)
  const [activeResizeHandle, setActiveResizeHandle] = useState<'chat' | 'code' | null>(null)
  const layoutRef = useRef<HTMLDivElement>(null)
  const chatPanelRef = useRef<HTMLDivElement>(null)
  const codePanelRef = useRef<HTMLDivElement>(null)
  const chatWidthRef = useRef(chatWidth)
  const codeWidthRef = useRef(codeWidth)
  const dragCleanupRef = useRef<(() => void) | null>(null)
  const hasCodePanel = showCode && !!(currentCode || codeStreaming)

  const layoutConstraints = useMemo(() => ({
    minChatWidth: 320,
    minCodeWidth: 340,
    minMapWidth: 420,
  }), [])

  const applyChatWidth = (width: number) => {
    chatWidthRef.current = width
    if (chatPanelRef.current) {
      chatPanelRef.current.style.width = `${width}px`
    }
  }

  const applyCodeWidth = (width: number) => {
    codeWidthRef.current = width
    if (codePanelRef.current) {
      codePanelRef.current.style.width = `${width}px`
    }
  }

  useEffect(() => {
    applyChatWidth(chatWidth)
  }, [chatWidth])

  useEffect(() => {
    applyCodeWidth(codeWidth)
  }, [codeWidth])

  useEffect(() => {
    const container = layoutRef.current
    if (!container) return

    const clampWidths = () => {
      const containerWidth = container.clientWidth
      const codePanelWidth = hasCodePanel ? codeWidthRef.current : 0
      const maxChatWidth = Math.max(layoutConstraints.minChatWidth, containerWidth - layoutConstraints.minMapWidth - codePanelWidth)
      const nextChatWidth = clamp(chatWidthRef.current, layoutConstraints.minChatWidth, maxChatWidth)
      if (nextChatWidth !== chatWidthRef.current) {
        applyChatWidth(nextChatWidth)
        setChatWidth(nextChatWidth)
      }

      if (!hasCodePanel) return

      const maxCodeWidth = Math.max(layoutConstraints.minCodeWidth, containerWidth - layoutConstraints.minMapWidth - chatWidthRef.current)
      const nextCodeWidth = clamp(codeWidthRef.current, layoutConstraints.minCodeWidth, maxCodeWidth)
      if (nextCodeWidth !== codeWidthRef.current) {
        applyCodeWidth(nextCodeWidth)
        setCodeWidth(nextCodeWidth)
      }
    }

    clampWidths()
    const observer = new ResizeObserver(clampWidths)
    observer.observe(container)
    return () => observer.disconnect()
  }, [hasCodePanel, layoutConstraints, setChatWidth, setCodeWidth])

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.()
      dragCleanupRef.current = null
    }
  }, [])

  const beginResize = (side: 'chat' | 'code', pointerEvent: ReactPointerEvent<HTMLDivElement>) => {
    pointerEvent.preventDefault()
    const container = layoutRef.current
    if (!container) return

    dragCleanupRef.current?.()
    setActiveResizeHandle(side)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handleElement = pointerEvent.currentTarget
    if ('setPointerCapture' in handleElement) {
      handleElement.setPointerCapture(pointerEvent.pointerId)
    }

    let rafId = 0
    let latestClientX = pointerEvent.clientX

    const applyPointerPosition = () => {
      rafId = 0
      const rect = container.getBoundingClientRect()
      const containerWidth = rect.width

      if (side === 'chat') {
        const maxChatWidth = Math.max(
          layoutConstraints.minChatWidth,
          containerWidth - layoutConstraints.minMapWidth - (hasCodePanel ? codeWidthRef.current : 0),
        )
        const nextChatWidth = clamp(latestClientX - rect.left, layoutConstraints.minChatWidth, maxChatWidth)
        applyChatWidth(nextChatWidth)
        return
      }

      const maxCodeWidth = Math.max(
        layoutConstraints.minCodeWidth,
        containerWidth - layoutConstraints.minMapWidth - chatWidthRef.current,
      )
      const nextCodeWidth = clamp(rect.right - latestClientX, layoutConstraints.minCodeWidth, maxCodeWidth)
      applyCodeWidth(nextCodeWidth)
    }

    const handlePointerMove = (event: PointerEvent) => {
      latestClientX = event.clientX
      if (!rafId) {
        rafId = window.requestAnimationFrame(applyPointerPosition)
      }
    }

    const stopResize = () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId)
        rafId = 0
      }
      if (side === 'chat') {
        setChatWidth(chatWidthRef.current)
      } else {
        setCodeWidth(codeWidthRef.current)
      }
      setActiveResizeHandle(null)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopResize)
      window.removeEventListener('pointercancel', stopResize)
      if ('releasePointerCapture' in handleElement) {
        try {
          handleElement.releasePointerCapture(pointerEvent.pointerId)
        } catch {
          // noop
        }
      }
      dragCleanupRef.current = null
    }

    dragCleanupRef.current = stopResize
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopResize)
    window.addEventListener('pointercancel', stopResize)
  }

  // 从首页案例卡片跳转时自动发送 prompt
  const sentRef = useRef(false)
  useEffect(() => {
    const state = (location.state as { prompt?: string; sampleId?: string } | null) || {}
    const prompt = state.prompt
    const sampleId = state.sampleId

    if (!prompt || sentRef.current) return
    sentRef.current = true

    const run = async () => {
      try {
        let sampleReady = true
        let sampleFile: { name: string; size: number } | undefined
        if (sampleId) {
          const response = await fetch('/api/chat/sample-context', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sampleId }),
          })
          if (response.ok) {
            const data = await response.json()
            const fileMeta = data?.data?.file
            if (
              fileMeta &&
              typeof fileMeta.name === 'string' &&
              fileMeta.name.trim() &&
              typeof fileMeta.size === 'number'
            ) {
              useChatStore.setState({ activeFileContext: null })
              sampleFile = { name: fileMeta.name, size: fileMeta.size }
            } else {
              sampleReady = false
              useChatStore.setState({ error: `样例数据 ${sampleId} 加载失败：未返回文件信息` })
            }
          } else {
            sampleReady = false
            useChatStore.setState({ error: `样例数据 ${sampleId} 加载失败：HTTP ${response.status}` })
          }
        }

        if (!sampleReady) return
        await sendMessage(prompt, undefined, sampleFile, sampleId)
      } finally {
        window.history.replaceState({}, '')
      }
    }

    void run()
  }, [])

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* ===== 顶部导航栏 ===== */}
      <header className="flex items-center justify-between px-5 h-12 bg-white border-b border-gray-200/60 shrink-0">
        {/* 左侧：天地图 Logo + 副标题 */}
        <Link to="/" className="flex items-center gap-3 no-underline">
          <img src="/tianditu-logo.png" alt="天地图" className="h-9 object-contain" />
          <div className="w-px h-6 bg-gray-200" />
          <img src="/tianditu-agent-logo.svg" alt="天地图开发智能体" className="h-8 sm:h-9 w-auto object-contain" />
        </Link>

        {/* 右侧：导航链接 + 代码按钮 */}
        <div className="flex items-center gap-1">
          {/* 导航链接 */}
          <nav className="flex items-center gap-0.5 mr-3">
            <Link
              to="/"
              className="text-[12.5px] text-gray-500 hover:text-blue-600 px-2.5 py-1.5 rounded-md hover:bg-blue-50/60 soft-pop no-underline"
            >
              首页
            </Link>
            <Link
              to="/gallery"
              className="text-[12.5px] text-gray-500 hover:text-blue-600 px-2.5 py-1.5 rounded-md hover:bg-blue-50/60 soft-pop no-underline"
            >
              公开样例
            </Link>
            <a
              href="https://www.tianditu.gov.cn/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12.5px] text-gray-500 hover:text-blue-600 px-2.5 py-1.5 rounded-md hover:bg-blue-50/60 soft-pop no-underline"
            >
              天地图官网
            </a>
            <a
              href="http://lbs.tianditu.gov.cn/api/js4.0/class.html"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12.5px] text-gray-500 hover:text-blue-600 px-2.5 py-1.5 rounded-md hover:bg-blue-50/60 soft-pop no-underline flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
              API 文档
            </a>
          </nav>

          {/* 分隔线 */}
          {(currentCode || codeStreaming) && <div className="w-px h-5 bg-gray-200 mr-2" />}

          {/* 分享按钮 */}
          {currentCode && !codeStreaming && (
            <button
              onClick={() => setShareOpen(true)}
              className="text-[12px] px-3 py-1.5 rounded-lg border border-blue-200/80 bg-blue-50 text-blue-600 hover:bg-blue-100/70 soft-pop mr-2"
            >
              <span className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7.5 12a4.5 4.5 0 014.5-4.5h4.5a4.5 4.5 0 010 9H12M16.5 12a4.5 4.5 0 01-4.5 4.5H7.5a4.5 4.5 0 010-9H12" />
                </svg>
                分享地图
              </span>
            </button>
          )}

          {/* 代码查看按钮 */}
          {(currentCode || codeStreaming) && (
            <button
              onClick={toggleCode}
              className={`text-[12px] px-3 py-1.5 rounded-lg border soft-pop ${
                showCode
                  ? 'bg-blue-50 border-blue-200/80 text-blue-600'
                  : 'bg-white border-gray-200/80 text-gray-400 hover:text-gray-600 hover:border-gray-300'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                </svg>
                {showCode ? '隐藏代码' : '查看代码'}
              </span>
            </button>
          )}
        </div>
      </header>

      {/* ===== 主体 ===== */}
      <div ref={layoutRef} className="flex-1 flex overflow-hidden">
        {/* 聊天面板 */}
        <div
          ref={chatPanelRef}
          className={`bg-white shrink-0 border-r border-gray-200/40 ${activeResizeHandle ? 'transition-none' : 'transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]'}`}
          style={{ width: chatWidth }}
        >
          <ChatPanel />
        </div>

        <ResizeHandle
          side="chat"
          active={activeResizeHandle === 'chat'}
          onPointerDown={beginResize}
        />

        {/* 地图预览 */}
        <div className="flex-1 min-w-0 relative">
          <MapPreview />
        </div>

        {/* 代码面板 */}
        {hasCodePanel && (
          <>
            <ResizeHandle
              side="code"
              active={activeResizeHandle === 'code'}
              onPointerDown={beginResize}
            />
            <div
              ref={codePanelRef}
              className={`border-l border-gray-200/40 shrink-0 ${activeResizeHandle ? 'transition-none' : 'animate-slide-in-right'}`}
              style={{ width: codeWidth }}
            >
            <CodePanel />
            </div>
          </>
        )}
      </div>

      <ShareModal open={shareOpen} code={currentCode} onClose={() => setShareOpen(false)} />
    </div>
  )
}

function ResizeHandle(props: {
  side: 'chat' | 'code'
  active: boolean
  onPointerDown: (side: 'chat' | 'code', event: ReactPointerEvent<HTMLDivElement>) => void
}) {
  const { side, active, onPointerDown } = props

  return (
    <div
      className="group relative w-3 shrink-0 cursor-col-resize touch-none"
      onPointerDown={(event) => {
        onPointerDown(side, event)
      }}
      aria-label={side === 'chat' ? '调整聊天区宽度' : '调整代码区宽度'}
      role="separator"
      aria-orientation="vertical"
    >
      <div
        className={`absolute inset-y-0 left-1/2 -translate-x-1/2 rounded-full transition-all duration-200 ${
          active
            ? 'w-1.5 bg-blue-400/80 shadow-[0_0_0_4px_rgba(96,165,250,0.12)]'
            : 'w-px bg-slate-200 group-hover:w-1 group-hover:bg-blue-300/80'
        }`}
      />
    </div>
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
