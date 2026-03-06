import { ChatOpenAI } from '@langchain/openai'
import { config } from '../config.js'
import type { LlmSelection, LlmSelectionInput } from '../provider/index.js'
import { getCatalogDefaultSelection, resolveLlmSelection } from '../provider/index.js'

/**
 * 创建 LLM 实例
 * 处理不同模型的兼容性问题（如 Claude 不允许同时传 temperature + top_p）
 */
export function createLLM(options: {
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
  maxRetries?: number
  model?: string
  provider?: string
  llmSelection?: LlmSelection
} = {}) {
  let fallback: LlmSelection
  try {
    fallback = resolveLlmSelection(
      { provider: config.llm.provider, model: config.llm.model },
      getCatalogDefaultSelection(),
    )
  } catch {
    fallback = getCatalogDefaultSelection()
  }
  const selection = options.llmSelection || resolveLlmSelection(
    { provider: options.provider, model: options.model } as LlmSelectionInput,
    fallback,
  )

  const modelName = selection.model
  const modelLower = modelName.toLowerCase()
  const useQwenDedicatedEndpoint = selection.providerId === 'qwen'
  const resolvedApiKey = useQwenDedicatedEndpoint ? config.llm.qwenApiKey : config.llm.apiKey
  const resolvedBaseUrl = useQwenDedicatedEndpoint
    ? config.llm.qwenBaseUrl
    : config.llm.baseUrl
  const isOpenAIGpt5Family = selection.providerId === 'openai' && /^gpt-5(?:[.-]|$)/i.test(modelName)
  const isCodexFamily = /codex/i.test(modelLower)
  const supportsTemperature = !(isOpenAIGpt5Family || isCodexFamily)

  if (!resolvedApiKey) {
    const missingKeyHint = useQwenDedicatedEndpoint ? 'DASHSCOPE_API_KEY' : 'LLM_API_KEY'
    throw new Error(`缺少模型调用密钥，请配置环境变量 ${missingKeyHint}`)
  }

  const llmParams: Record<string, unknown> = {
    openAIApiKey: resolvedApiKey,
    configuration: { baseURL: resolvedBaseUrl },
    modelName,
    maxTokens: options.maxTokens ?? config.llm.maxOutputTokens,
    timeout: options.timeoutMs ?? config.llm.requestTimeoutMs,
    maxRetries: options.maxRetries ?? config.llm.maxRetries,
  }

  if (supportsTemperature) {
    llmParams.temperature = options.temperature ?? 0.3
  }

  const llm = new ChatOpenAI(llmParams as ConstructorParameters<typeof ChatOpenAI>[0])

  // 部分模型（Claude、gpt-5/codex）不接受 top_p，统一移除避免 400
  if (
    selection.providerId === 'claude' ||
    modelLower.startsWith('claude-') ||
    isOpenAIGpt5Family ||
    isCodexFamily
  ) {
    ;(llm as any).topP = undefined
  }

  ;(llm as any).__llmSelection = selection

  return llm
}
