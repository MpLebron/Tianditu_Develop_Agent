export type CopyTextResult = 'copied' | 'manual' | 'failed'

interface CopyTextOptions {
  manualPromptTitle?: string
}

export async function copyText(text: string, options?: CopyTextOptions): Promise<CopyTextResult> {
  const value = String(text || '')
  if (!value) return 'failed'

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return 'copied'
    }
  } catch {
    // fallback below
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    textarea.style.pointerEvents = 'none'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    textarea.setSelectionRange(0, textarea.value.length)
    const copied = document.execCommand('copy')
    document.body.removeChild(textarea)
    if (copied) return 'copied'
  } catch {
    // fallback below
  }

  try {
    if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
      window.prompt(options?.manualPromptTitle || '复制失败，请手动复制以下内容：', value)
      return 'manual'
    }
  } catch {
    // ignore prompt failure and fall through
  }

  return 'failed'
}
