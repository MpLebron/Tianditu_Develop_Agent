import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import JsonView from '@uiw/react-json-view'
import { lightTheme } from '@uiw/react-json-view/light'
import { formatFileSize } from '../../utils/jsonPreview'

interface JsonPreviewModalProps {
  open: boolean
  title: string
  size?: number
  jsonText: string | null
  loading?: boolean
  error?: string | null
  onClose: () => void
}

const previewTheme = {
  ...lightTheme,
  '--w-rjv-background-color': 'transparent',
  '--w-rjv-color': '#0f172a',
  '--w-rjv-line-color': 'rgba(148, 163, 184, 0.24)',
  '--w-rjv-arrow-color': '#64748b',
  '--w-rjv-font-family': "'SF Mono', 'JetBrains Mono', Menlo, monospace",
  '--w-rjv-key-string': '#0f172a',
  '--w-rjv-key-number': '#0f172a',
  '--w-rjv-type-string-color': '#0369a1',
  '--w-rjv-type-int-color': '#a16207',
  '--w-rjv-type-float-color': '#a16207',
  '--w-rjv-type-boolean-color': '#7c3aed',
  '--w-rjv-type-null-color': '#64748b',
  '--w-rjv-curlybraces-color': '#94a3b8',
  '--w-rjv-brackets-color': '#94a3b8',
  '--w-rjv-colon-color': '#cbd5e1',
} as CSSProperties

function buildParseResult(jsonText: string | null) {
  if (!jsonText?.trim()) {
    return { value: null as unknown, error: '当前没有可预览的 JSON 内容。' }
  }

  try {
    return { value: JSON.parse(jsonText) as unknown, error: null }
  } catch (err: any) {
    return {
      value: null as unknown,
      error: err?.message || 'JSON 解析失败',
    }
  }
}

function extractJsonSourceUrl(jsonText: string | null): string | null {
  if (!jsonText?.trim()) return null

  try {
    const parsed = JSON.parse(jsonText) as { fileUrl?: unknown }
    if (typeof parsed?.fileUrl === 'string' && parsed.fileUrl.trim()) {
      return parsed.fileUrl.trim()
    }
  } catch {
    // ignore
  }

  const directUrlMatch = jsonText.match(/文件获取链接URL:\s*(https?:\/\/\S+)/)
  if (directUrlMatch?.[1]) {
    return directUrlMatch[1].trim()
  }

  const fileUrlMatch = jsonText.match(/"fileUrl"\s*:\s*"([^"]+)"/)
  if (fileUrlMatch?.[1]) {
    return fileUrlMatch[1].trim()
  }

  return null
}

export function JsonPreviewModal({
  open,
  title,
  size,
  jsonText,
  loading = false,
  error = null,
  onClose,
}: JsonPreviewModalProps) {
  const [resolvedJsonText, setResolvedJsonText] = useState<string | null>(null)
  const [resolvedJsonLoading, setResolvedJsonLoading] = useState(false)
  const [resolvedJsonError, setResolvedJsonError] = useState<string | null>(null)

  const sourceUrl = useMemo(() => extractJsonSourceUrl(jsonText), [jsonText])
  const fallbackParseResult = useMemo(() => buildParseResult(jsonText), [jsonText])
  const fetchedParseResult = useMemo(() => buildParseResult(resolvedJsonText), [resolvedJsonText])
  const shouldFetchFromSource = !!sourceUrl && !!fallbackParseResult.error
  const displayJsonText = resolvedJsonText || jsonText
  const parseResult = resolvedJsonText ? fetchedParseResult : fallbackParseResult
  const effectiveLoading = loading || resolvedJsonLoading
  const effectiveError = error || resolvedJsonError || parseResult.error

  useEffect(() => {
    if (!open) return
    if (!shouldFetchFromSource || !sourceUrl) return

    const controller = new AbortController()
    setResolvedJsonLoading(true)
    setResolvedJsonError(null)
    setResolvedJsonText(null)

    void fetch(sourceUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`文件读取失败：HTTP ${response.status}`)
        }
        return response.text()
      })
      .then((text) => {
        setResolvedJsonText(text)
      })
      .catch((err: any) => {
        if (controller.signal.aborted) return
        setResolvedJsonError(err?.message || '读取原始 JSON 文件失败')
      })
      .finally(() => {
        if (controller.signal.aborted) return
        setResolvedJsonLoading(false)
      })

    return () => controller.abort()
  }, [open, shouldFetchFromSource, sourceUrl])

  useEffect(() => {
    if (!open) {
      setResolvedJsonText(null)
      setResolvedJsonLoading(false)
      setResolvedJsonError(null)
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]" onClick={onClose} />

      <div className="relative flex h-[min(82vh,760px)] w-[min(980px,96vw)] flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl shadow-slate-900/20 animate-slide-up">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-blue-50/70 px-5 py-4">
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-slate-900">JSON 在线预览</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
              <span className="max-w-[min(62vw,640px)] truncate font-medium text-slate-700">{title}</span>
              {typeof size === 'number' && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                  {formatFileSize(size)}
                </span>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-500 transition hover:border-slate-300 hover:text-slate-700 soft-pop"
            aria-label="关闭 JSON 预览"
          >
            关闭
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-[linear-gradient(180deg,rgba(248,250,252,0.92)_0%,rgba(255,255,255,1)_100%)] px-5 py-4">
          {effectiveLoading ? (
            <div className="flex h-full min-h-[260px] items-center justify-center">
              <div className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50/80 px-4 py-3 text-sm text-blue-700">
                <div className="h-4 w-4 rounded-full border-2 border-blue-200 border-t-blue-500 animate-spin" />
                正在读取 JSON 文件内容...
              </div>
            </div>
          ) : effectiveError ? (
            <div className="space-y-3">
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {effectiveError}
              </div>
              {displayJsonText && (
                <pre className="overflow-auto rounded-2xl border border-slate-200 bg-slate-950 px-4 py-4 font-mono text-[12px] leading-6 text-slate-100">
                  {displayJsonText}
                </pre>
              )}
            </div>
          ) : (
            <div className="rounded-[22px] border border-slate-200 bg-white px-4 py-4 shadow-sm shadow-slate-200/40">
              <JsonView
                value={parseResult.value as object}
                style={previewTheme}
                collapsed={2}
                enableClipboard
                displayDataTypes={false}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
