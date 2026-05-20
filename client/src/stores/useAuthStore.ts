import { create } from 'zustand'
import { authApi } from '../services/authApi'
import type { AuthSession } from '../types/auth'

type AuthStatus = 'idle' | 'loading' | 'ready'

interface AuthStore {
  status: AuthStatus
  session: AuthSession | null
  error: string | null
  refresh: (force?: boolean) => Promise<AuthSession>
  openLogin: (redirectPath?: string) => void
  openLogout: (redirectPath?: string) => void
}

let refreshPromise: Promise<AuthSession> | null = null

export const useAuthStore = create<AuthStore>((set, get) => ({
  status: 'idle',
  session: null,
  error: null,

  async refresh(force = false) {
    const { status, session } = get()
    if (!force && status === 'ready' && session) return session
    if (refreshPromise && !force) return refreshPromise

    set({ status: 'loading', error: null })
    refreshPromise = authApi.getSession()
      .then((nextSession) => {
        set({ status: 'ready', session: nextSession, error: null })
        return nextSession
      })
      .catch((err: any) => {
        const message = String(err?.message || '获取登录状态失败')
        set({ status: 'ready', session: null, error: message })
        throw err
      })

    try {
      return await refreshPromise
    } finally {
      refreshPromise = null
    }
  },

  openLogin(redirectPath) {
    window.location.assign(authApi.buildLoginUrl(redirectPath))
  },

  openLogout(redirectPath = '/') {
    window.location.assign(authApi.buildLogoutUrl(redirectPath))
  },
}))
