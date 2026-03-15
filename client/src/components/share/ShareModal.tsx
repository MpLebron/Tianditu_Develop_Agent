import { useEffect, useMemo, useState } from 'react'
import { shareApi } from '../../services/shareApi'
import { useChatStore } from '../../stores/useChatStore'
import type { Message } from '../../types/chat'
import type { ShareCreateResult, ShareSuggestResult, ShareVisibility } from '../../types/share'
import { copyText } from '../../utils/copyText'
import { isLikelyBlankThumbnailBase64 } from '../../utils/isLikelyBlankThumbnail'
import { captureMapPreviewPngBase64 } from '../../utils/mapPreviewCapture'

interface ShareModalProps {
  open: boolean
  code: string | null
  onClose: () => void
}

const PUBLISH_CAPTURE_ATTEMPTS = 4
const PUBLISH_CAPTURE_RETRY_MS = 700

function defaultTitle() {
  return `地图快照 ${new Date().toLocaleString('zh-CN', { hour12: false })}`
}

function buildSuggestionPrompt(messages: Message[]): string {
  const recentUserMessages = messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content?.trim() || '')
    .filter(Boolean)
    .slice(-12)

  if (!recentUserMessages.length) return ''

  const genericRe = /(谢谢|好的|重试|继续|开始|生成标题|描述|标题和内容|请你帮我给当前地图生成一下标题和内容吧)/i
  const domainRe = /(地图|地块|旧村|改造|行政区|边界|公交|地铁|驾车|路线|POI|搜索|编码|GeoJSON|热力图|标注|图层|可视化|统计|ECharts)/i

  const scored = recentUserMessages.map((text) => {
    let score = Math.min(text.length, 120)
    if (domainRe.test(text)) score += 120
    if (genericRe.test(text)) score -= 80
    return { text, score }
  })

  scored.sort((a, b) => b.score - a.score)

  const picked = scored
    .filter((x) => x.score > 20)
    .slice(0, 3)
    .map((x) => x.text)

  if (!picked.length) {
    return recentUserMessages[recentUserMessages.length - 1] || ''
  }

  return Array.from(new Set(picked)).join('\n')
}

export function ShareModal({ open, code, onClose }: ShareModalProps) {
  const messages = useChatStore((s) => s.messages)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<ShareVisibility>('unlisted')
  const [submitting, setSubmitting] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [suggestion, setSuggestion] = useState<ShareSuggestResult | null>(null)
  const [suggestError, setSuggestError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ShareCreateResult | null>(null)
  const [copyHint, setCopyHint] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setTitle(defaultTitle())
    setDescription('')
    setVisibility('unlisted')
    setSubmitting(false)
    setSuggesting(false)
    setSuggestion(null)
    setSuggestError(null)
    setError(null)
    setResult(null)
    setCopyHint(null)
  }, [open])

  const disabled = useMemo(() => !code || !code.trim() || submitting, [code, submitting])
  const suggestDisabled = useMemo(
    () => !code || !code.trim() || submitting || suggesting,
    [code, submitting, suggesting],
  )
  const suggestionPrompt = useMemo(() => buildSuggestionPrompt(messages), [messages])

  if (!open) return null

  const captureThumbnailOnPublish = async (): Promise<string | undefined> => {
    for (let attempt = 0; attempt < PUBLISH_CAPTURE_ATTEMPTS; attempt += 1) {
      try {
        const captured = await captureMapPreviewPngBase64()
        const blank = await isLikelyBlankThumbnailBase64(captured.base64)
        if (!blank) return captured.base64
      } catch (err: any) {
        console.warn('[ShareModal] 发布时地图截图失败，将继续重试:', err?.message || err)
      }

      if (attempt < PUBLISH_CAPTURE_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, PUBLISH_CAPTURE_RETRY_MS))
      }
    }

    console.warn('[ShareModal] 发布时未拿到可用地图截图，将退回 SVG 缩略图')
    return undefined
  }

  const handlePublish = async () => {
    if (!code || !code.trim()) {
      setError('当前没有可分享的地图代码，请先生成地图')
      return
    }
    setSubmitting(true)
    setError(null)
    setCopyHint(null)
    try {
      const thumbnailBase64 = await captureThumbnailOnPublish()
      const created = await shareApi.create({
        code,
        title,
        description,
        visibility,
        thumbnailBase64,
      })
      setResult(created)
    } catch (err: any) {
      setError(err?.message || '发布失败')
    } finally {
      setSubmitting(false)
    }
  }

  const withCopyHint = async (text: string, okMsg: string, failMsg: string) => {
    const result = await copyText(text, {
      manualPromptTitle: '浏览器限制了自动复制，请手动复制以下内容：',
    })
    const hint = result === 'copied'
      ? okMsg
      : result === 'manual'
        ? '已弹出手动复制窗口，请直接复制'
        : failMsg
    setCopyHint(hint)
    setTimeout(() => setCopyHint(null), 2200)
  }

  const handleSuggest = async () => {
    if (!code || !code.trim()) {
      setSuggestError('当前没有可分享的地图代码，请先生成地图')
      return
    }
    setSuggesting(true)
    setSuggestError(null)
    try {
      const nextSuggestion = await shareApi.suggest({
        code,
        hint: suggestionPrompt || undefined,
        prompt: suggestionPrompt || undefined,
      })
      setSuggestion(nextSuggestion)
    } catch (err: any) {
      setSuggestError(err?.message || '灵感生成失败，请重试')
    } finally {
      setSuggesting(false)
    }
  }

  const applySuggestion = () => {
    if (!suggestion) return
    setTitle(suggestion.title)
    setDescription(suggestion.description)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/35 backdrop-blur-[2px]" onClick={onClose} />

      <div className="relative w-[min(680px,92vw)] max-h-[88vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/15">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">分享地图快照</h3>
            <p className="text-xs text-slate-500 mt-0.5">发布后生成永久链接，可选择是否公开到样例集</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-md"
            aria-label="关闭分享弹窗"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-slate-700">标题</label>
            <div className="relative">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 pr-[92px] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-300"
                placeholder="输入分享标题"
                maxLength={80}
              />
              <button
                type="button"
                disabled={suggestDisabled}
                onClick={handleSuggest}
                className={`absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-lg text-xs transition ${
                  suggestDisabled
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    : 'bg-violet-50 text-violet-700 hover:bg-violet-100'
                }`}
              >
                {suggesting ? '生成中...' : '✨ 灵感'}
              </button>
            </div>
            <div className="text-[11px] text-slate-400">
              使用 AI 生成标题和描述建议，不会自动覆盖，需手动应用
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-slate-700">描述（可选）</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm h-20 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-300"
              placeholder="补充地图用途或数据说明"
              maxLength={240}
            />
          </div>

          {(suggesting || suggestion || suggestError) && !result && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/55 p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-indigo-900">AI 灵感建议</div>
                {suggestion?.source && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/80 border border-indigo-100 text-indigo-700">
                    {suggestion.source === 'ai' ? 'AI 生成' : '规则兜底'}
                  </span>
                )}
              </div>

              {suggesting && (
                <div className="text-xs text-indigo-700">正在生成建议，请稍候...</div>
              )}

              {!suggesting && suggestion && (
                <div className="space-y-2">
                  <div className="rounded-lg border border-indigo-100 bg-white p-2.5">
                    <div className="text-[11px] text-slate-500 mb-1">建议标题</div>
                    <div className="text-sm text-slate-800">{suggestion.title}</div>
                  </div>
                  <div className="rounded-lg border border-indigo-100 bg-white p-2.5">
                    <div className="text-[11px] text-slate-500 mb-1">建议描述</div>
                    <div className="text-sm text-slate-700 leading-6">{suggestion.description}</div>
                  </div>
                </div>
              )}

              {!suggesting && suggestError && (
                <div className="rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs px-2.5 py-2">
                  {suggestError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-0.5">
                {suggestion && (
                  <button
                    type="button"
                    onClick={applySuggestion}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs hover:bg-indigo-700 transition"
                  >
                    应用建议
                  </button>
                )}
                <button
                  type="button"
                  disabled={suggestDisabled}
                  onClick={handleSuggest}
                  className={`px-3 py-1.5 rounded-lg text-xs transition ${
                    suggestDisabled
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : 'border border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                  }`}
                >
                  换一个
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSuggestion(null)
                    setSuggestError(null)
                  }}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs hover:bg-slate-50 transition"
                >
                  关闭
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="text-[13px] font-medium text-slate-700">可见性</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                onClick={() => setVisibility('unlisted')}
                className={`text-left rounded-xl border px-3 py-2.5 transition ${
                  visibility === 'unlisted'
                    ? 'border-blue-300 bg-blue-50/70'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="text-sm font-medium text-slate-800">未公开链接</div>
                <div className="text-xs text-slate-500 mt-0.5">默认，仅持有链接可访问</div>
              </button>
              <button
                onClick={() => setVisibility('public')}
                className={`text-left rounded-xl border px-3 py-2.5 transition ${
                  visibility === 'public'
                    ? 'border-emerald-300 bg-emerald-50/70'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="text-sm font-medium text-slate-800">公开样例</div>
                <div className="text-xs text-slate-500 mt-0.5">会出现在公开样例集页面</div>
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs px-3 py-2">
              {error}
            </div>
          )}

          {!result ? (
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition"
              >
                取消
              </button>
              <button
                disabled={disabled}
                onClick={handlePublish}
                className={`px-4 py-2 rounded-xl text-sm text-white transition ${
                  disabled ? 'bg-slate-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {submitting ? '发布中...' : '发布分享'}
              </button>
            </div>
          ) : (
            <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5">
              <div className="text-sm font-medium text-emerald-700">发布成功，已生成永久链接</div>

              <div className="space-y-1.5">
                <div className="text-xs text-slate-500">分享链接</div>
                <div className="flex gap-2">
                  <input value={result.shareUrl} readOnly className="flex-1 rounded-lg border border-slate-200 px-2.5 py-2 text-xs bg-white" />
                  <button
                    onClick={() => withCopyHint(result.shareUrl, '已复制分享链接', '复制失败，请手动复制')}
                    className="px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    复制
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-xs text-slate-500">管理链接（含管理口令）</div>
                <div className="flex gap-2">
                  <input value={result.manageUrl} readOnly className="flex-1 rounded-lg border border-slate-200 px-2.5 py-2 text-xs bg-white" />
                  <button
                    onClick={() => withCopyHint(result.manageUrl, '已复制管理链接', '复制失败，请手动复制')}
                    className="px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    复制
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-xs text-slate-500">管理口令（请妥善保存，丢失无法找回）</div>
                <div className="flex gap-2">
                  <input value={result.manageToken} readOnly className="flex-1 rounded-lg border border-slate-200 px-2.5 py-2 text-xs bg-white" />
                  <button
                    onClick={() => withCopyHint(result.manageToken, '已复制管理口令', '复制失败，请手动复制')}
                    className="px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    复制
                  </button>
                </div>
              </div>

              {copyHint && <div className="text-xs text-emerald-700">{copyHint}</div>}

              <div className="flex justify-end pt-1">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm hover:bg-slate-800 transition"
                >
                  完成
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
