import { useEffect, useRef, useState } from 'react'
import { useLocation, Link } from 'react-router-dom'
import { ChatPanel } from '../components/chat/ChatPanel'
import { MapPreview } from '../components/map/MapPreview'
import { CodePanel } from '../components/map/CodePanel'
import { ShareModal } from '../components/share/ShareModal'
import { useWorkspaceStore } from '../stores/useWorkspaceStore'
import { useMapStore } from '../stores/useMapStore'
import { useChatStore } from '../stores/useChatStore'

export function WorkspacePage() {
  const { showCode, chatWidth, toggleCode } = useWorkspaceStore()
  const { currentCode, codeStreaming } = useMapStore()
  const { sendMessage } = useChatStore()
  const location = useLocation()
  const [shareOpen, setShareOpen] = useState(false)

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
      <div className="flex-1 flex overflow-hidden">
        {/* 聊天面板 */}
        <div
          className="bg-white shrink-0 transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] border-r border-gray-200/40"
          style={{ width: chatWidth }}
        >
          <ChatPanel />
        </div>

        {/* 地图预览 */}
        <div className="flex-1 min-w-0 relative">
          <MapPreview />
        </div>

        {/* 代码面板 */}
        {showCode && (currentCode || codeStreaming) && (
          <div className="w-[420px] border-l border-gray-200/40 shrink-0 animate-slide-in-right">
            <CodePanel />
          </div>
        )}
      </div>

      <ShareModal open={shareOpen} code={currentCode} onClose={() => setShareOpen(false)} />
    </div>
  )
}
