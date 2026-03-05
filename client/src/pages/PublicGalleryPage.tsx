import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { shareApi } from '../services/shareApi'
import type { ShareItem } from '../types/share'

function formatTime(ts?: number) {
  if (!ts) return '-'
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

function GalleryThumbnail({ item }: { item: ShareItem }) {
  const [failed, setFailed] = useState(false)

  return (
    <div className="aspect-[1.91/1] bg-slate-100 overflow-hidden relative">
      {!failed ? (
        <img
          src={item.thumbnailUrl}
          alt={item.title}
          loading="lazy"
          onError={() => setFailed(true)}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600 to-cyan-500" />
      )}

      <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/35 to-transparent" />
    </div>
  )
}

export function PublicGalleryPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<ShareItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 12

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const load = async (nextPage: number) => {
    setLoading(true)
    setError(null)
    try {
      const data = await shareApi.listPublic({ page: nextPage, pageSize })
      setItems(data.items || [])
      setTotal(data.total || 0)
      setPage(data.page || nextPage)
    } catch (err: any) {
      setError(err?.message || '加载公开样例失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load(1)
  }, [])

  const goPrev = () => {
    if (page <= 1) return
    void load(page - 1)
  }

  const goNext = () => {
    if (page >= totalPages) return
    void load(page + 1)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/25">
      <header className="h-14 border-b border-slate-200 bg-white/95 backdrop-blur-sm px-4 sm:px-6">
        <div className="max-w-6xl mx-auto h-full flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 no-underline">
            <img src="/tianditu-logo.png" alt="天地图" className="h-8 object-contain" />
            <img src="/tianditu-subtitle.png" alt="地理底图应用开发智能体" className="h-6 object-contain hidden sm:block" />
          </Link>

          <div className="flex items-center gap-2 text-sm">
            <Link to="/" className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50/60 no-underline transition">
              首页
            </Link>
            <Link to="/workspace" className="px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 no-underline transition">
              新建地图
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-end justify-between gap-4 mb-5">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">公开样例集</h1>
            <p className="text-sm text-slate-500 mt-1">浏览公开分享的地图快照，点击可直接查看完整交互页面。</p>
          </div>
          <div className="text-sm text-slate-500">共 {total} 个样例</div>
        </div>

        {loading && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            正在加载公开样例...
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
            {error}
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
            <div className="text-slate-500 text-sm">暂无公开样例</div>
            <Link to="/workspace" className="inline-flex mt-3 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm no-underline hover:bg-blue-700 transition">
              去创建第一个分享
            </Link>
          </div>
        )}

        {!loading && !error && items.length > 0 && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {items.map((item) => (
                <Link
                  key={item.slug}
                  to={`/share/${item.slug}`}
                  className="group rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm hover:shadow-lg hover:shadow-slate-900/10 hover:border-blue-200 transition-all no-underline"
                >
                  <GalleryThumbnail item={item} />

                  <div className="p-4">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="min-w-0 text-base font-semibold text-slate-800 line-clamp-1">{item.title}</div>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 shrink-0">公开</span>
                    </div>
                    <div className="text-sm text-slate-500 min-h-[40px] line-clamp-2">
                      {item.description || '未填写描述'}
                    </div>
                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                      <span>{formatTime(item.updatedAt)}</span>
                      <span>{item.viewCount} 次浏览</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                onClick={goPrev}
                disabled={page <= 1}
                className={`px-3 py-1.5 rounded-lg text-sm transition ${
                  page <= 1
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                上一页
              </button>
              <div className="text-sm text-slate-600">
                第 {page} / {totalPages} 页
              </div>
              <button
                onClick={goNext}
                disabled={page >= totalPages}
                className={`px-3 py-1.5 rounded-lg text-sm transition ${
                  page >= totalPages
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                下一页
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
