import OpenAI from 'openai'
import { config } from '../config.js'

export function createResponsesClient() {
  if (!config.llm.apiKey) {
    throw new Error('缺少模型调用密钥，请配置环境变量 DASHSCOPE_API_KEY')
  }

  return new OpenAI({
    apiKey: config.llm.apiKey,
    baseURL: config.llm.responsesBaseUrl,
    maxRetries: config.llm.maxRetries,
    timeout: config.llm.requestTimeoutMs,
  })
}
