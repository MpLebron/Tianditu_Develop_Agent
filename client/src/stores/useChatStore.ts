import { create } from 'zustand'
import type { Message, ThoughtChainItem } from '../types/chat'
import { useMapStore } from './useMapStore'
import { useWorkspaceStore } from './useWorkspaceStore'
import { useModelStore } from './useModelStore'

interface ChatStore {
  messages: Message[]
  loading: boolean
  error: string | null
  activeFileContext: string | null
  sendMessage: (content: string, file?: File, syntheticFile?: { name: string; size: number }) => Promise<void>
  autoFixMapError: (userInputHint?: string) => Promise<void>
  clearMessages: () => void
}

/** 从消息数组构建对话历史字符串（最近 10 条） */
function buildHistory(messages: Message[]): string | undefined {
  const recent = messages.slice(-10)
  if (recent.length === 0) return undefined
  return recent
    .map((m) => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
    .join('\n')
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  loading: false,
  error: null,
  activeFileContext: null,

  sendMessage: async (content, file, syntheticFile) => {
    const displayFile = file ? { name: file.name, size: file.size } : syntheticFile
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: Date.now(),
      file: displayFile,
    }

    const history = buildHistory(get().messages)
    const activeFileContext = get().activeFileContext
    const existingCode = useMapStore.getState().currentCode || undefined
    const modelSelection = useModelStore.getState().getRequestSelection()

    set((s) => ({ messages: [...s.messages, userMsg], loading: true, error: null }))

    // 不提前创建空的 assistant 消息，等第一个 text chunk 到达再创建
    const assistantId = crypto.randomUUID()
    let assistantCreated = false
    let textContent = ''
    let receivedCode = false
    let receivedCodeDelta = false

    const ensureAssistantMessage = () => {
      if (assistantCreated) return
      assistantCreated = true
      set((s) => ({
        messages: [...s.messages, {
          id: assistantId,
          role: 'assistant' as const,
          content: '',
          timestamp: Date.now(),
          streaming: true,
          thoughtChain: [],
        }],
      }))
    }

    const upsertThoughtChainItem = (patch: Partial<ThoughtChainItem> & Pick<ThoughtChainItem, 'toolCallId' | 'toolName'>) => {
      ensureAssistantMessage()
      set((s) => ({
        messages: s.messages.map((m) => {
          if (m.id !== assistantId) return m

          const chain = [...(m.thoughtChain || [])]
          const idx = chain.findIndex((item) => item.toolCallId === patch.toolCallId)
          if (idx === -1) {
            chain.push({
              toolCallId: patch.toolCallId,
              toolName: patch.toolName,
              status: patch.status || 'running',
              args: patch.args,
              result: patch.result,
              isError: patch.isError,
              startedAt: patch.startedAt,
              endedAt: patch.endedAt,
            })
          } else {
            chain[idx] = { ...chain[idx], ...patch }
          }

          return { ...m, thoughtChain: chain }
        }),
      }))
    }

    /** 处理单个 SSE data line */
    const processLine = (line: string) => {
      if (!line.startsWith('data: ')) return
      const data = line.slice(6)
      if (data === '[DONE]') return

      try {
        const chunk = JSON.parse(data) as Record<string, any>

        if (chunk.type === 'tool_execution_start') {
          upsertThoughtChainItem({
            toolCallId: String(chunk.toolCallId || ''),
            toolName: String(chunk.toolName || 'unknown'),
            args: chunk.args,
            status: 'running',
            startedAt: Date.now(),
          })
          return
        }

        if (chunk.type === 'tool_execution_end') {
          upsertThoughtChainItem({
            toolCallId: String(chunk.toolCallId || ''),
            toolName: String(chunk.toolName || 'unknown'),
            result: chunk.result,
            isError: !!chunk.isError,
            status: chunk.isError ? 'error' : 'done',
            endedAt: Date.now(),
          })
          return
        }

        if (chunk.type === 'file_context') {
          const content = typeof chunk.content === 'string' ? chunk.content.trim() : ''
          if (content) {
            set({ activeFileContext: content })
          }
          return
        }

        if (chunk.type === 'text') {
          // 第一个 text chunk 时创建 assistant 消息
          ensureAssistantMessage()
          textContent += chunk.content
          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === assistantId ? { ...m, content: textContent } : m,
            ),
          }))
        } else if (chunk.type === 'code_start') {
          // 代码开始生成 → 立即展开代码面板，开始流式显示
          useMapStore.getState().startCodeStream()
          useWorkspaceStore.getState().setShowCode(true)
        } else if (chunk.type === 'code_delta') {
          // 代码增量 → 追加到流式代码缓冲
          receivedCodeDelta = true
          useMapStore.getState().appendCodeDelta(chunk.content)
        } else if (chunk.type === 'code') {
          receivedCode = true
          // 收到完整代码 → 结束流式，渲染地图
          ensureAssistantMessage()
          // 更新消息的 code 字段，并标记流式结束
          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === assistantId ? { ...m, code: chunk.content, streaming: false } : m,
            ),
          }))
          // 完成流式：设置最终代码并渲染地图
          useMapStore.getState().finishCodeStream(chunk.content)
        } else if (chunk.type === 'error') {
          set({ error: chunk.content })
        }
      } catch {
        // 忽略无效 JSON
      }
    }

    /** 流结束后清理状态 */
    const finalize = () => {
      // 兜底：如果服务端只返回了 code_delta 没有最终 code，则使用已拼接代码收尾
      const mapState = useMapStore.getState()
      if (!receivedCode && receivedCodeDelta) {
        const recoveredCode = (mapState.streamingCode || '').trim()
        if (recoveredCode) {
          useMapStore.getState().finishCodeStream(recoveredCode)
          ensureAssistantMessage()
          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    code: recoveredCode,
                    content: `${textContent}\n\n[系统提示] 模型输出在代码中途结束，已自动使用当前代码收尾。`,
                    streaming: false,
                  }
                : m,
            ),
          }))
          receivedCode = true
        }
      }

      // 没拿到最终代码且没有可恢复代码时，强制关闭代码流状态，避免 UI 一直“生成中”
      if (!receivedCode && mapState.codeStreaming) {
        useMapStore.setState({ codeStreaming: false, streamingCode: null })
      }

      if (assistantCreated) {
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === assistantId ? { ...m, streaming: false } : m,
          ),
        }))
      }
      set({ loading: false })
    }

    try {
      const formData = new FormData()
      formData.append('message', content)
      if (file) formData.append('file', file)
      if (existingCode) formData.append('existingCode', existingCode)
      if (history) formData.append('conversationHistory', history)
      if (!file && activeFileContext) formData.append('fileContext', activeFileContext)
      if (modelSelection?.provider) formData.append('provider', modelSelection.provider)
      if (modelSelection?.model) formData.append('model', modelSelection.model)

      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const reader = response.body?.getReader()
      if (!reader) throw new Error('无法获取响应流')

      const decoder = new TextDecoder()
      let buffer = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            processLine(line)
          }
        }

        // 处理 buffer 中剩余内容
        if (buffer.trim()) {
          processLine(buffer)
        }
      } catch (streamErr: any) {
        // "Premature close" 或网络中断 — 如果已经收到了内容，则静默处理
        if (assistantCreated && (textContent || receivedCode)) {
          console.warn('[SSE] 流意外关闭，但已有内容，继续显示:', streamErr.message)
        } else {
          throw streamErr
        }
      }

      finalize()
    } catch (err: any) {
      // 如果已经部分接收了数据，只 finalize 不报错
      if (assistantCreated && (textContent || receivedCode)) {
        console.warn('[SSE] 请求出错，但已有部分数据:', err.message)
        finalize()
      } else {
        set({ loading: false, error: err.message || '请求失败' })
      }
    }
  },

  autoFixMapError: async (userInputHint) => {
    const mapState = useMapStore.getState()
    const { currentCode, execError, fixRetryCount, fixing } = mapState
    const MAX_FIX_RETRIES = 2

    if (fixing || !currentCode || !execError || fixRetryCount >= MAX_FIX_RETRIES) return

    const attempt = fixRetryCount + 1
    const modelSelection = useModelStore.getState().getRequestSelection()
    const assistantId = crypto.randomUUID()
    let assistantCreated = false
    let receivedCode = false
    let explanationStarted = false
    let textContent = ''

    const ensureAssistantMessage = () => {
      if (assistantCreated) return
      assistantCreated = true
      const prefix = [
        `检测到地图运行错误，正在自动修复（第 ${attempt}/${MAX_FIX_RETRIES} 次）。`,
        '',
        '错误信息：',
        '```text',
        execError,
        '```',
      ].join('\n')
      textContent = prefix

      set((s) => ({
        messages: [...s.messages, {
          id: assistantId,
          role: 'assistant',
          content: prefix,
          timestamp: Date.now(),
          streaming: true,
          thoughtChain: [],
        }],
      }))
    }

    const upsertThoughtChainItem = (patch: Partial<ThoughtChainItem> & Pick<ThoughtChainItem, 'toolCallId' | 'toolName'>) => {
      ensureAssistantMessage()
      set((s) => ({
        messages: s.messages.map((m) => {
          if (m.id !== assistantId) return m
          const chain = [...(m.thoughtChain || [])]
          const idx = chain.findIndex((item) => item.toolCallId === patch.toolCallId)
          if (idx === -1) {
            chain.push({
              toolCallId: patch.toolCallId,
              toolName: patch.toolName,
              status: patch.status || 'running',
              args: patch.args,
              result: patch.result,
              isError: patch.isError,
              startedAt: patch.startedAt,
              endedAt: patch.endedAt,
            })
          } else {
            chain[idx] = { ...chain[idx], ...patch }
          }
          return { ...m, thoughtChain: chain }
        }),
      }))
    }

    const appendText = (delta: string) => {
      ensureAssistantMessage()
      if (!delta) return
      if (!explanationStarted) {
        textContent += '\n\n修复分析：\n'
        explanationStarted = true
      }
      textContent += delta
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === assistantId ? { ...m, content: textContent } : m,
        ),
      }))
    }

    const finalizeMessage = () => {
      if (!assistantCreated) return
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === assistantId ? { ...m, streaming: false } : m,
        ),
      }))
    }

    useMapStore.setState({ fixing: true })
    console.log(`[AutoFixStream] 第 ${attempt} 次修复尝试:`, execError)

    try {
      const response = await fetch('/api/chat/fix/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: currentCode,
          error: execError,
          userInput: userInputHint || '',
          fileContext: get().activeFileContext || undefined,
          provider: modelSelection?.provider,
          model: modelSelection?.model,
        }),
      })

      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const reader = response.body?.getReader()
      if (!reader) throw new Error('无法获取响应流')

      const decoder = new TextDecoder()
      let buffer = ''

      const processLine = (line: string) => {
        if (!line.startsWith('data: ')) return
        const data = line.slice(6)
        if (data === '[DONE]') return

        try {
          const chunk = JSON.parse(data) as Record<string, any>

          if (chunk.type === 'tool_execution_start') {
            upsertThoughtChainItem({
              toolCallId: String(chunk.toolCallId || ''),
              toolName: String(chunk.toolName || 'unknown'),
              args: chunk.args,
              status: 'running',
              startedAt: Date.now(),
            })
            return
          }

          if (chunk.type === 'tool_execution_end') {
            upsertThoughtChainItem({
              toolCallId: String(chunk.toolCallId || ''),
              toolName: String(chunk.toolName || 'unknown'),
              result: chunk.result,
              isError: !!chunk.isError,
              status: chunk.isError ? 'error' : 'done',
              endedAt: Date.now(),
            })
            return
          }

          if (chunk.type === 'text') {
            appendText(String(chunk.content || ''))
            return
          }

          if (chunk.type === 'code_start') {
            useWorkspaceStore.getState().setShowCode(true)
            useMapStore.getState().startCodeStream()
            return
          }

          if (chunk.type === 'code_delta') {
            useMapStore.getState().appendCodeDelta(String(chunk.content || ''))
            return
          }

          if (chunk.type === 'code') {
            ensureAssistantMessage()
            receivedCode = true
            const code = String(chunk.content || '')
            set((s) => ({
              messages: s.messages.map((m) =>
                m.id === assistantId ? { ...m, code, streaming: false } : m,
              ),
            }))
            // 修复成功后直接替换代码并清空 execError；计数递增防止连续无限重试
            useMapStore.setState({
              currentCode: code,
              streamingCode: null,
              codeStreaming: false,
              execError: null,
              fixing: false,
              fixRetryCount: attempt,
            })
            return
          }

          if (chunk.type === 'error') {
            appendText(`\n\n修复失败：${String(chunk.content || '')}`)
            set({ error: String(chunk.content || '自动修复失败') })
          }
        } catch {
          // ignore invalid json
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) processLine(line)
      }
      if (buffer.trim()) processLine(buffer)

      if (!receivedCode) {
        const partial = (useMapStore.getState().streamingCode || '').trim()
        if (partial) {
          appendText('\n\n检测到修复输出在代码中途结束，本轮未自动应用截断代码。')
        }
        useMapStore.setState({
          fixing: false,
          fixRetryCount: attempt,
          codeStreaming: false,
          streamingCode: null,
        })
      }
      finalizeMessage()
    } catch (err: any) {
      console.error('[AutoFixStream] 请求错误:', err.message)
      ensureAssistantMessage()
      appendText(`\n\n修复请求失败：${err.message || '未知错误'}`)
      useMapStore.setState({
        fixing: false,
        fixRetryCount: attempt,
        codeStreaming: false,
        streamingCode: null,
      })
      finalizeMessage()
    }
  },

  clearMessages: () => set({ messages: [], error: null, activeFileContext: null }),
}))
