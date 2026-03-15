import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { shareApi } from '../services/shareApi'
import type { ShareItem, ShareVisibility } from '../types/share'

type ShareDetail = ShareItem & { shareUrl: string }

function formatTime(ts?: number) {
  if (!ts) return '-'
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function ShareViewerPage() {
  const { slug = '' } = useParams()
  const [searchParams] = useSearchParams()
  const manageToken = searchParams.get('manageToken')?.trim() || ''

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [item, setItem] = useState<ShareDetail | null>(null)
  const [copyHint, setCopyHint] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<ShareVisibility>('unlisted')
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)

  const canManage = Boolean(manageToken && item?.canManage)

  const load = async (track = true) => {
    if (!slug) {
      setLoading(false)
      setError('分享链接不完整，缺少 slug')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const detail = await shareApi.getDetail(slug, {
        manageToken: manageToken || undefined,
        track,
      })
      setItem(detail)
    } catch (err: any) {
      setError(err?.message || '加载分享失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load(true)
  }, [slug, manageToken])

  useEffect(() => {
    if (!item) return
    setTitle(item.title || '')
    setDescription(item.description || '')
    setVisibility(item.visibility)
  }, [item?.slug, item?.updatedAt])

  const metaItems = useMemo(() => {
    if (!item) return []
    return [
      { label: '可见性', value: item.visibility === 'public' ? '公开样例' : '未公开链接' },
      { label: '浏览次数', value: `${item.viewCount}` },
      { label: '创建时间', value: formatTime(item.createdAt) },
      { label: '更新时间', value: formatTime(item.updatedAt) },
      { label: '代码大小', value: `${Math.round(item.codeSizeBytes / 1024)} KB` },
    ]
  }, [item])

  const withCopyHint = async (text: string, okMsg: string, failMsg: string) => {
    const ok = await copyText(text)
    setCopyHint(ok ? okMsg : failMsg)
    setTimeout(() => setCopyHint(null), 2200)
  }

  const handleSave = async () => {
    if (!item || !manageToken) return
    setSaving(true)
    setError(null)
    try {
      const updated = await shareApi.update(item.slug, {
        manageToken,
        title,
        description,
        visibility,
      })
      setItem(updated)
    } catch (err: any) {
      setError(err?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async () => {
    if (!item || !manageToken) return
    const ok = window.confirm('确认下架这个分享吗？下架后公开列表不可见。')
    if (!ok) return

    setRemoving(true)
    setError(null)
    try {
      const removed = await shareApi.remove(item.slug, { manageToken })
      setItem(removed)
    } catch (err: any) {
      setError(err?.message || '下架失败')
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="h-14 border-b border-slate-200 bg-white/95 backdrop-blur-sm px-4 sm:px-6">
        <div className="max-w-[1600px] mx-auto h-full flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 no-underline">
            <img src="/tianditu-logo.png" alt="天地图" className="h-8 object-contain" />
            <img src="/tianditu-agent-logo.svg" alt="天地图开发智能体" className="h-7 sm:h-8 w-auto object-contain hidden sm:block" />
          </Link>

          <div className="flex items-center gap-2 text-sm">
            <Link to="/gallery" className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50/60 no-underline transition">
              公开样例
            </Link>
            <Link to="/workspace" className="px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 no-underline transition">
              新建地图
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4">
        {loading && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            正在加载分享内容...
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
            {error}
          </div>
        )}

        {!loading && !error && item && (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-4">
            <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="border-b border-slate-100 px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="text-lg font-semibold text-slate-800 truncate">{item.title}</h1>
                  {item.description && <p className="text-sm text-slate-500 mt-0.5 line-clamp-1">{item.description}</p>}
                </div>
                <button
                  onClick={() => withCopyHint(item.shareUrl, '已复制分享链接', '复制失败，请手动复制')}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50 transition shrink-0"
                >
                  复制链接
                </button>
              </div>

              {item.status === 'active' ? (
                <div className="h-[calc(100vh-180px)] min-h-[520px]">
                  <iframe
                    key={item.htmlUrl}
                    src={item.htmlUrl}
                    className="w-full h-full border-0"
                    sandbox="allow-scripts allow-same-origin"
                    title="分享地图预览"
                  />
                </div>
              ) : (
                <div className="h-[calc(100vh-180px)] min-h-[520px] flex items-center justify-center text-slate-500">
                  该分享已下架
                </div>
              )}
            </section>

            <aside className="rounded-xl border border-slate-200 bg-white p-4 space-y-4 h-fit">
              <div>
                <h2 className="text-sm font-semibold text-slate-800 mb-2">分享信息</h2>
                <div className="space-y-2">
                  {metaItems.map((meta) => (
                    <div key={meta.label} className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">{meta.label}</span>
                      <span className="text-slate-700">{meta.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {copyHint && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs px-3 py-2">
                  {copyHint}
                </div>
              )}

              {manageToken && !item.canManage && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-700 text-xs px-3 py-2">
                  当前管理口令无效，仅可查看，不能编辑或下架。
                </div>
              )}

              {canManage && (
                <div className="space-y-3 border-t border-slate-100 pt-3">
                  <h3 className="text-sm font-semibold text-slate-800">管理分享</h3>

                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-600">标题</label>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      maxLength={80}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-600">描述</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm h-20 resize-none"
                      maxLength={240}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-600">可见性</label>
                    <select
                      value={visibility}
                      onChange={(e) => setVisibility(e.target.value as ShareVisibility)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      <option value="unlisted">未公开链接</option>
                      <option value="public">公开样例</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      disabled={saving}
                      onClick={handleSave}
                      className={`px-3 py-2 rounded-lg text-sm text-white transition ${
                        saving ? 'bg-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                      }`}
                    >
                      {saving ? '保存中...' : '保存修改'}
                    </button>
                    <button
                      disabled={removing}
                      onClick={handleRemove}
                      className={`px-3 py-2 rounded-lg text-sm transition ${
                        removing ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-red-50 text-red-600 hover:bg-red-100'
                      }`}
                    >
                      {removing ? '下架中...' : '下架分享'}
                    </button>
                  </div>
                </div>
              )}
            </aside>
          </div>
        )}
      </main>
    </div>
  )
}
