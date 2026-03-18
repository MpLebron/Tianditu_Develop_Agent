import { ChatOpenAI } from '@langchain/openai'
import { config } from '../config.js'

/**
 * 创建固定的 Qwen LLM 实例
 */
export function createLLM(options: {
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
  maxRetries?: number
  modelKwargs?: Record<string, unknown>
} = {}) {
  const modelName = config.llm.model
  const modelLower = modelName.toLowerCase()

  if (!config.llm.apiKey) {
    throw new Error('缺少模型调用密钥，请配置环境变量 DASHSCOPE_API_KEY')
  }

  const llmParams: Record<string, unknown> = {
    openAIApiKey: config.llm.apiKey,
    configuration: { baseURL: config.llm.baseUrl },
    modelName,
    maxTokens: options.maxTokens ?? config.llm.maxOutputTokens,
    timeout: options.timeoutMs ?? config.llm.requestTimeoutMs,
    maxRetries: options.maxRetries ?? config.llm.maxRetries,
  }
  llmParams.temperature = options.temperature ?? 0.3
  if (options.modelKwargs && Object.keys(options.modelKwargs).length > 0) {
    llmParams.modelKwargs = options.modelKwargs
  }

  const llm = new ChatOpenAI(llmParams as ConstructorParameters<typeof ChatOpenAI>[0])

  // 如果临时切回 qwen3-coder-next，走 OpenAI 兼容接口时统一移除 top_p，避免部分网关 400。
  if (modelLower.includes('qwen3-coder-next')) {
    ;(llm as any).topP = undefined
  }

  ;(llm as any).__llmModel = modelName

  return llm
}
