import { Router } from 'express'
import { config } from '../config.js'
import { buildLoginUrl, buildLogoutUrl, resolveAuthUser } from '../middleware/auth.js'

const router = Router()

router.get('/me', (req, res) => {
  const user = resolveAuthUser(req)
  res.json({
    success: true,
    data: {
      enabled: config.auth.enabled,
      authenticated: !!user,
      user,
      paths: {
        login: buildLoginUrl(req),
        logout: buildLogoutUrl('/'),
      },
    },
  })
})

export default router
