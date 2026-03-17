interface RuntimeErrorPayload {
  runId: string
  previewRunId?: string
  message: string
  kind?: string
  src?: string
  line?: number
  col?: number
  requestUrl?: string
  method?: string
  status?: number
  codeHash?: string
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const json = await response.json()
  if (!json?.success) throw new Error(json?.error || '请求失败')
  return json.data as T
}

export const runDossierApi = {
  reportRuntimeError(payload: RuntimeErrorPayload) {
    return requestJson<{ recorded: boolean }>('/api/run-dossiers/runtime-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },
}
