export function extractTextContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object') {
          const obj = item as Record<string, unknown>
          if (typeof obj.text === 'string') return obj.text
          if (typeof obj.content === 'string') return obj.content
        }
        return ''
      })
      .join('')
  }
  if (content && typeof content === 'object') {
    const obj = content as Record<string, unknown>
    if (typeof obj.text === 'string') return obj.text
    if (typeof obj.content === 'string') return obj.content
  }
  return ''
}

export function parseJsonObject(raw: string, fallback: Record<string, unknown>): Record<string, unknown> {
  const cleaned = raw.trim()
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) {
    const parsed = safeJsonParse(fenced[1].trim())
    if (parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
  }

  const direct = safeJsonParse(cleaned)
  if (direct != null && typeof direct === 'object' && !Array.isArray(direct)) return direct as Record<string, unknown>

  const objectMatch = cleaned.match(/\{[\s\S]*\}/)
  if (objectMatch) {
    const parsed = safeJsonParse(objectMatch[0])
    if (parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
  }

  return { ...fallback, raw, __parseFailed: true }
}

function safeJsonParse(text: string): unknown | null {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
