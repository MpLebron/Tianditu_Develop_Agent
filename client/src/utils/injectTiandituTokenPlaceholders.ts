import { DEFAULT_TIANDITU_TOKEN } from '../constants/tianditu'

export function injectTiandituTokenPlaceholders(code: string): string {
  const text = String(code || '')
  if (!text) return text

  return text
    .replace(/\$\{TIANDITU_TOKEN\}/g, DEFAULT_TIANDITU_TOKEN)
    .replace(/\b(?:your_tianditu_token_here|YOUR_TIANDITU_TOKEN|YOUR_TIANDITU_API_KEY|your_tianditu_api_key)\b/g, DEFAULT_TIANDITU_TOKEN)
}
