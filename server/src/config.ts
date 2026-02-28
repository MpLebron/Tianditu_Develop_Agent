import dotenv from 'dotenv'
import { existsSync } from 'fs'
import { resolve } from 'path'

dotenv.config({ path: resolve(import.meta.dirname, '../../.env') })

function resolveSkillsDir(): string {
  const candidates = [
    process.env.SKILLS_DIR,
    // 本地开发（monorepo）：server/dist -> ../../skills
    resolve(import.meta.dirname, '../../skills'),
    // 容器运行（/app）：dist -> ../skills => /app/skills
    resolve(import.meta.dirname, '../skills'),
    '/app/skills',
    '/skills',
  ].filter((p): p is string => Boolean(p && p.trim()))

  for (const p of candidates) {
    if (existsSync(p)) return p
  }

  return candidates[0] || resolve(import.meta.dirname, '../../skills')
}

export const config = {
  port: parseInt(process.env.PORT || '3000'),
  nodeEnv: process.env.NODE_ENV || 'development',

  tiandituToken: process.env.TIANDITU_TOKEN || '',

  llm: {
    apiKey: process.env.LLM_API_KEY || '',
    baseUrl: process.env.LLM_BASE_URL || 'https://aihubmix.com/v1',
    provider: process.env.LLM_PROVIDER || 'qwen',
    model: process.env.LLM_MODEL || 'qwen3.5-plus',
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

  // Skills 文档目录（支持本地与容器多种目录结构）
  skillsDir: resolveSkillsDir(),
}
