export function parseCookieHeader(header: string | undefined): Record<string, string> {
  const source = String(header || '')
  if (!source) return {}

  return source
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, part) => {
      const idx = part.indexOf('=')
      if (idx <= 0) return acc
      const key = part.slice(0, idx).trim()
      const value = part.slice(idx + 1).trim()
      if (!key) return acc
      try {
        acc[key] = decodeURIComponent(value)
      } catch {
        acc[key] = value
      }
      return acc
    }, {})
}
