import dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(import.meta.dirname, '../../.env') })

export const config = {
  port: parseInt(process.env.PORT || '3000'),
  nodeEnv: process.env.NODE_ENV || 'development',

  tiandituToken: process.env.TIANDITU_TOKEN || '',

  llm: {
    apiKey: process.env.LLM_API_KEY || '',
    baseUrl: process.env.LLM_BASE_URL || 'https://aihubmix.com/v1',
    provider: process.env.LLM_PROVIDER || 'claude',
    model: process.env.LLM_MODEL || 'claude-sonnet-4-5',
    maxOutputTokens: parseInt(process.env.LLM_MAX_OUTPUT_TOKENS || '8192'),
    requestTimeoutMs: parseInt(process.env.LLM_TIMEOUT_MS || '240000'),
    maxRetries: parseInt(process.env.LLM_MAX_RETRIES || '2'),
    recoveryRounds: parseInt(process.env.LLM_RECOVERY_ROUNDS || '1'),
  },

  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800'),
    dir: process.env.UPLOAD_DIR || './uploads',
  },

  logLevel: process.env.LOG_LEVEL || 'info',

  // Skills 文档目录（相对于项目根目录）
  skillsDir: resolve(import.meta.dirname, '../../skills'),
}
