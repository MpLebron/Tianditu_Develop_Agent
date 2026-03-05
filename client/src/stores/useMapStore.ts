import { create } from 'zustand'

interface MapStore {
  currentCode: string | null
  /** 正在流式生成中的代码（逐步拼接） */
  streamingCode: string | null
  /** 是否正在流式生成代码 */
  codeStreaming: boolean
  executing: boolean
  execError: string | null
  fixing: boolean
  fixingSource: 'runtime' | 'visual' | null
  fixRetryCount: number
  visualChecking: boolean
  visualFixRetryCount: number
  lastVisualCheckedCodeHash: string | null
  setCode: (code: string | null) => void
  /** 开始代码流式生成 */
  startCodeStream: () => void
  /** 追加代码增量 */
  appendCodeDelta: (delta: string) => void
  /** 结束代码流式生成（用完整代码替换） */
  finishCodeStream: (finalCode: string) => void
  setExecError: (error: string | null) => void
  setExecuting: (v: boolean) => void
  setVisualChecking: (v: boolean) => void
  markVisualChecked: (hash: string | null) => void
  autoFix: (userInput?: string) => Promise<void>
}

const MAX_FIX_RETRIES = 2

export const useMapStore = create<MapStore>((set, get) => ({
  currentCode: null,
  streamingCode: null,
  codeStreaming: false,
  executing: false,
  execError: null,
  fixing: false,
  fixingSource: null,
  fixRetryCount: 0,
  visualChecking: false,
  visualFixRetryCount: 0,
  lastVisualCheckedCodeHash: null,

  setCode: (code) => set({
    currentCode: code,
    streamingCode: null,
    codeStreaming: false,
    execError: null,
    fixRetryCount: 0,
    fixingSource: null,
    visualChecking: false,
    visualFixRetryCount: 0,
    lastVisualCheckedCodeHash: null,
  }),

  startCodeStream: () => set({ streamingCode: '', codeStreaming: true }),

  appendCodeDelta: (delta) => set((s) => ({
    streamingCode: (s.streamingCode || '') + delta,
  })),

  finishCodeStream: (finalCode) => set({
    currentCode: finalCode,
    streamingCode: null,
    codeStreaming: false,
    execError: null,
    fixRetryCount: 0,
    fixingSource: null,
    visualChecking: false,
    visualFixRetryCount: 0,
    lastVisualCheckedCodeHash: null,
  }),

  setExecError: (error) => set({ execError: error }),
  setExecuting: (v) => set({ executing: v }),
  setVisualChecking: (v) => set({ visualChecking: v }),
  markVisualChecked: (hash) => set({ lastVisualCheckedCodeHash: hash }),

  autoFix: async (userInput?: string) => {
    const { currentCode, execError, fixRetryCount, fixing } = get()

    // 防止重复修复、超过重试次数、无代码/无错误
    if (fixing || !currentCode || !execError || fixRetryCount >= MAX_FIX_RETRIES) return

    set({ fixing: true, fixingSource: 'runtime' })
    console.log(`[AutoFix] 第 ${fixRetryCount + 1} 次修复尝试:`, execError)

    try {
      const res = await fetch('/api/chat/fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: currentCode,
          error: execError,
          userInput: userInput || '',
        }),
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const json = await res.json()
      if (json.success && json.data?.code && json.data?.fixed) {
        console.log('[AutoFix] 修复成功')
        // 设置修复后的代码，会触发 MapPreview 重新渲染
        set({
          currentCode: json.data.code,
          execError: null,
          fixing: false,
          fixingSource: null,
          fixRetryCount: fixRetryCount + 1,
        })
      } else {
        console.log('[AutoFix] 修复失败:', json.data?.explanation)
        set({ fixing: false, fixingSource: null, fixRetryCount: fixRetryCount + 1 })
      }
    } catch (err: any) {
      console.error('[AutoFix] 请求错误:', err.message)
      set({ fixing: false, fixingSource: null, fixRetryCount: fixRetryCount + 1 })
    }
  },
}))
