import { useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { authApi } from '../../services/authApi'
import { useAuthStore } from '../../stores/useAuthStore'

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const redirectingRef = useRef(false)
  const { status, session, error, refresh, openLogin } = useAuthStore()

  useEffect(() => {
    redirectingRef.current = false
    void refresh(true).catch(() => {})
  }, [refresh, location.pathname, location.search, location.hash])

  useEffect(() => {
    if (status !== 'ready' || error || !session?.enabled || session.authenticated || redirectingRef.current) {
      return
    }

    redirectingRef.current = true
    const redirectPath = `${location.pathname}${location.search}${location.hash}`
    openLogin(redirectPath)
  }, [status, session, error, openLogin, location.pathname, location.search, location.hash])

  if (status !== 'ready') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
        <div className="max-w-md w-full rounded-3xl border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)] px-7 py-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <div className="h-5 w-5 rounded-full border-2 border-current border-t-transparent animate-spin" />
          </div>
          <h1 className="mt-5 text-lg font-semibold text-slate-900">正在检查登录状态</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            工作台和运行档案需要先确认统一用户中心登录态，请稍候。
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
        <div className="max-w-md w-full rounded-3xl border border-rose-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)] px-7 py-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M12 9v3.75m0 3.75h.008v.008H12v-.008z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M10.29 3.86L1.82 18a2.25 2.25 0 001.93 3.375h16.5A2.25 2.25 0 0022.18 18L13.71 3.86a2.25 2.25 0 00-3.42 0z" />
            </svg>
          </div>
          <h1 className="mt-5 text-lg font-semibold text-slate-900">登录状态检查失败</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">{error}</p>
          <div className="mt-5 flex items-center justify-center gap-3">
            <button
              onClick={() => void refresh(true).catch(() => {})}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
            >
              重试
            </button>
            <Link
              to="/"
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition-colors no-underline"
            >
              返回首页
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (!session?.enabled || session.authenticated) {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
      <div className="max-w-md w-full rounded-3xl border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)] px-7 py-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <div className="h-5 w-5 rounded-full border-2 border-current border-t-transparent animate-spin" />
        </div>
        <h1 className="mt-5 text-lg font-semibold text-slate-900">正在跳转统一登录</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          如果页面没有自动跳转，可以手动继续。
        </p>
        <button
          onClick={() => openLogin(authApi.currentLocationPath())}
          className="mt-5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          继续登录
        </button>
      </div>
    </div>
  )
}
