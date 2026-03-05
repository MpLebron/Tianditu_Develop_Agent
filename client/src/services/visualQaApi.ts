import type { VisualInspectResult } from '../types/visualQa'

interface ApiSuccess<T> {
  success: true
  data: T
}

interface ApiFailure {
  success: false
  error: string
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init)
  const json = (await response.json()) as ApiSuccess<T> | ApiFailure
  if (!response.ok || !json.success) {
    const message = 'error' in json ? json.error : `HTTP ${response.status}`
    throw new Error(message || '请求失败')
  }
  return json.data
}

export const visualQaApi = {
  inspect(payload: { code: string; hint?: string; runId?: string }) {
    return requestJson<VisualInspectResult>('/api/chat/visual-inspect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },
}

