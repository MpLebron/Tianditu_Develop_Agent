import { config } from '../config.js'

export interface WebSearchResultItem {
  title: string
  url: string
  snippet: string
}

export interface WebSearchResult {
  provider: string
  query: string
  results: WebSearchResultItem[]
}

export class WebSearchService {
  async search(params: { query: string; maxResults?: number }): Promise<WebSearchResult> {
    const provider = (config.agentTools.search.provider || 'duckduckgo').toLowerCase()
    if (provider === 'serper' && config.agentTools.search.serperApiKey) {
      return this.searchWithSerper(params)
    }
    return this.searchWithDuckDuckGo(params)
  }

  private async searchWithSerper(params: { query: string; maxResults?: number }): Promise<WebSearchResult> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), config.agentTools.search.timeoutMs)
    try {
      const response = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': config.agentTools.search.serperApiKey,
        },
        body: JSON.stringify({
          q: params.query,
          num: clampResultCount(params.maxResults),
        }),
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new Error(`搜索请求失败: HTTP ${response.status}`)
      }
      const json = await response.json() as { organic?: Array<Record<string, unknown>> }
      const results = Array.isArray(json.organic)
        ? json.organic
          .map((item) => ({
            title: typeof item.title === 'string' ? item.title.trim() : '',
            url: typeof item.link === 'string' ? item.link.trim() : '',
            snippet: typeof item.snippet === 'string' ? collapseWhitespace(item.snippet) : '',
          }))
          .filter((item) => item.title && item.url)
          .slice(0, clampResultCount(params.maxResults))
        : []

      return {
        provider: 'serper',
        query: params.query,
        results,
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  private async searchWithDuckDuckGo(params: { query: string; maxResults?: number }): Promise<WebSearchResult> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), config.agentTools.search.timeoutMs)
    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(params.query)}`
      const response = await fetch(url, {
        headers: {
          'user-agent': 'tianditu-smart-map/1.0',
          accept: 'text/html,application/xhtml+xml',
        },
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new Error(`搜索请求失败: HTTP ${response.status}`)
      }
      const html = await response.text()
      return {
        provider: 'duckduckgo',
        query: params.query,
        results: extractSearchResultsFromDuckDuckGoHtml(html).slice(0, clampResultCount(params.maxResults)),
      }
    } finally {
      clearTimeout(timeout)
    }
  }
}

export function extractSearchResultsFromDuckDuckGoHtml(html: string): WebSearchResultItem[] {
  const results: WebSearchResultItem[] = []
  const titleRegex = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi

  for (const match of html.matchAll(titleRegex)) {
    const href = normalizeDuckDuckGoHref(match[1] || '')
    const title = collapseWhitespace(stripTags(decodeHtmlEntities(match[2] || '')))
    if (!href || !title) continue

    const block = html.slice(match.index || 0, (match.index || 0) + 1800)
    const snippetMatch = block.match(/<(?:a|div)[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div)>/i)
    const snippet = collapseWhitespace(stripTags(decodeHtmlEntities(snippetMatch?.[1] || '')))

    results.push({
      title,
      url: href,
      snippet,
    })
  }

  return dedupeByUrl(results)
}

function clampResultCount(value: unknown): number {
  const max = config.agentTools.search.maxResults
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return max
  return Math.max(1, Math.min(max, Math.floor(n)))
}

function normalizeDuckDuckGoHref(href: string): string {
  if (!href) return ''
  const candidate = href.startsWith('//') ? `https:${href}` : href
  try {
    const url = new URL(candidate, 'https://duckduckgo.com')
    const redirected = url.searchParams.get('uddg')
    return redirected ? decodeURIComponent(redirected) : url.toString()
  } catch {
    return ''
  }
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x2F;/gi, '/')
    .replace(/&#x27;/gi, '\'')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
}

function stripTags(text: string): string {
  return text.replace(/<[^>]+>/g, ' ')
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function dedupeByUrl(items: WebSearchResultItem[]): WebSearchResultItem[] {
  const seen = new Set<string>()
  const output: WebSearchResultItem[] = []
  for (const item of items) {
    if (!item.url || seen.has(item.url)) continue
    seen.add(item.url)
    output.push(item)
  }
  return output
}
