export function isJsonPreviewableFileName(fileName: string): boolean {
  const lowerName = fileName.trim().toLowerCase()
  return lowerName.endsWith('.json') || lowerName.endsWith('.geojson')
}

export function formatFileSize(size: number): string {
  if (!Number.isFinite(size) || size < 0) return '-'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(2)} MB`
}
