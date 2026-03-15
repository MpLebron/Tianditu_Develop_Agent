export function extractFirstCompleteHtmlDocument(code: string | null | undefined): string {
  const source = typeof code === 'string' ? code.trim() : ''
  if (!source) return ''

  const start = source.search(/<!doctype\s+html|<html\b/i)
  if (start < 0) return ''

  const htmlSlice = source.slice(start)
  const endMatches = htmlSlice.matchAll(/<\/html>/gi)
  for (const match of endMatches) {
    if (match.index == null) continue
    const candidate = htmlSlice.slice(0, match.index + match[0].length).trim()
    if (isLikelyCompleteHtmlDocument(candidate)) {
      return candidate
    }
  }

  return ''
}

function isLikelyCompleteHtmlDocument(code: string): boolean {
  const normalized = code.trim()
  if (!normalized) return false
  if (!/(<!doctype\s+html|<html\b)/i.test(normalized)) return false
  if (!/<\/html>\s*$/i.test(normalized)) return false
  if (/<body\b/i.test(normalized) && !/<\/body>/i.test(normalized)) return false
  if (!hasBalancedTagPairs(normalized, 'script')) return false
  if (!hasBalancedTagPairs(normalized, 'style')) return false
  if (!canParseEmbeddedJavaScript(normalized)) return false
  return true
}

function hasBalancedTagPairs(code: string, tagName: string): boolean {
  const openCount = (code.match(new RegExp(`<${tagName}\\b`, 'gi')) || []).length
  const closeCount = (code.match(new RegExp(`</${tagName}>`, 'gi')) || []).length
  return openCount === closeCount
}

function canParseEmbeddedJavaScript(code: string): boolean {
  if (!hasBalancedTagPairs(code, 'script')) return false

  const scriptMatches = [...code.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  return scriptMatches.every((match) => isParsableJavaScript(match[1] || ''))
}

function isParsableJavaScript(source: string): boolean {
  const script = String(source || '').trim()
  if (!script) return true

  try {
    // Parse only, do not execute. This is more reliable than regex-based
    // delimiter heuristics for regex literals, string replacements, and URLs.
    // eslint-disable-next-line no-new-func
    new Function(script)
    return true
  } catch {
    return false
  }
}
