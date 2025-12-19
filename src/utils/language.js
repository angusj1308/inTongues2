export function normalizeLanguageCode(language) {
  const raw = String(language || '').trim()
  if (!raw) return ''

  const lower = raw.toLowerCase()
  if (lower === 'auto') return ''
  return lower
}
