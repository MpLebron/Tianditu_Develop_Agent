import { useEffect } from 'react'
import { useChatStore } from '../../stores/useChatStore'
import { useMapStore } from '../../stores/useMapStore'
import { useAutoScroll } from '../../hooks/useAutoScroll'
import { ChatMessage } from './ChatMessage'
import { ChatInput } from './ChatInput'
import { WorkspaceExampleGallery } from './WorkspaceExampleGallery'

export function ChatPanel() {
  const { messages, loading, error, sendMessage, clearMessages } = useChatStore()
  const { visualChecking, fixing, fixingSource } = useMapStore()
  const scrollRef = useAutoScroll([messages])
  const inputLocked = visualChecking || (fixing && fixingSource === 'visual')
  const inputLockReason = visualChecking
    ? 'AI 正在进行视觉巡检，请稍候后再发送消息'
    : (fixing && fixingSource === 'visual'
        ? 'AI 正在处理视觉补修，请稍候后再发送消息'
        : null)

  // 判断是否在 "等待响应"（loading 但还没创建 assistant 消息）
  const lastMsg = messages[messages.length - 1]
  const isWaiting = loading && (!lastMsg || lastMsg.role === 'user')

  useEffect(() => {
    if (messages.length === 0 && scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
  }, [messages.length, scrollRef])

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 消息列表 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <WorkspaceExampleGallery
            disabled={loading || inputLocked}
            onSelectExample={(prompt, sampleId) => {
              void sendMessage(prompt, undefined, undefined, sampleId)
            }}
          />
        ) : (
          /* 消息列表 */
          <div className="px-4 py-5 space-y-1">
            {/* 清空按钮 */}
            <div className="flex justify-center mb-3">
              <button
                onClick={clearMessages}
                className="text-[11px] text-gray-300 hover:text-gray-500 px-3 py-1 rounded-full hover:bg-gray-50 soft-pop"
              >
                清空对话
              </button>
            </div>

            {messages.map((msg) => (
              <ChatMessage key={msg.id} msg={msg} />
            ))}

            {/* 思考中指示器 */}
            {isWaiting && (
              <div className="flex items-start gap-2.5 mb-3 animate-msg-in">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 mt-0.5 soft-surface">
                  <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.893 13.393l-1.135-1.135a2.252 2.252 0 01-.421-.585l-1.08-2.16a.414.414 0 00-.663-.107.827.827 0 01-.812.21l-1.273-.363a.89.89 0 00-.738 1.595l.587.39c.59.395.674 1.23.172 1.732l-.2.2c-.212.212-.33.498-.33.796v.41c0 .409-.11.809-.32 1.158l-1.315 2.191a2.11 2.11 0 01-1.81 1.025 1.055 1.055 0 01-1.055-1.055v-1.172c0-.92-.56-1.747-1.414-2.089l-.655-.261a2.25 2.25 0 01-1.383-2.46l.007-.042a2.25 2.25 0 01.29-.787l.09-.15a2.25 2.25 0 012.37-1.048l1.178.236a1.125 1.125 0 001.302-.795l.208-.73a1.125 1.125 0 00-.578-1.315l-.665-.332-.091.091a2.25 2.25 0 01-1.591.659h-.18c-.249 0-.487.1-.662.274a.931.931 0 01-1.458-1.137l1.411-2.353a2.25 2.25 0 00.286-.76m11.928 9.869A9 9 0 008.965 3.525m11.928 9.868A9 9 0 118.965 3.525" />
                  </svg>
                </div>
                <div className="bg-gray-50 rounded-2xl rounded-tl-md px-4 py-3 soft-surface">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-blue-400 rounded-full thinking-dot" />
                    <div className="w-1.5 h-1.5 bg-blue-400 rounded-full thinking-dot" />
                    <div className="w-1.5 h-1.5 bg-blue-400 rounded-full thinking-dot" />
                  </div>
                </div>
              </div>
            )}

            {/* 错误提示 */}
            {error && (
              <div className="animate-msg-in ml-9">
                <div className="inline-flex items-center gap-2 bg-red-50 text-red-500 text-[12px] px-3 py-2 rounded-xl soft-surface">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                  {error}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 输入区 */}
      <ChatInput
        onSend={sendMessage}
        loading={loading}
        disabled={inputLocked}
        disabledReason={inputLockReason}
      />
    </div>
  )
}
