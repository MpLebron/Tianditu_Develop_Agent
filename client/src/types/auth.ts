export interface AuthUser {
  sub: string
  loginName: string
  displayName?: string
  email?: string
  gbcode?: string
  companyName?: string
  userType?: number
}

export interface AuthSession {
  enabled: boolean
  authenticated: boolean
  user: AuthUser | null
  paths: {
    login: string
    logout: string
  }
}
