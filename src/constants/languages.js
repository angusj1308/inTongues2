export const SUPPORTED_LANGUAGES_MVP = ['en', 'fr', 'es', 'it']

const LANGUAGE_LABELS_BY_CODE = {
  en: 'English',
  fr: 'French',
  es: 'Spanish',
  it: 'Italian',
}

const LANGUAGE_CODE_BY_LABEL = {
  english: 'en',
  french: 'fr',
  spanish: 'es',
  italian: 'it',
}

export const DEFAULT_LANGUAGE_CODE = 'en'
export const DEFAULT_LANGUAGE = LANGUAGE_LABELS_BY_CODE[DEFAULT_LANGUAGE_CODE]

export const LANGUAGES = SUPPORTED_LANGUAGES_MVP.map((code) => LANGUAGE_LABELS_BY_CODE[code])
export const POPULAR_LANGUAGES = LANGUAGES

export const toLanguageCode = (language) => {
  const raw = String(language || '').trim()
  if (!raw) return ''
  const lower = raw.toLowerCase()
  if (SUPPORTED_LANGUAGES_MVP.includes(lower)) return lower
  return LANGUAGE_CODE_BY_LABEL[lower] || ''
}

export const toLanguageLabel = (language) => {
  const code = toLanguageCode(language)
  return code ? LANGUAGE_LABELS_BY_CODE[code] : ''
}

export const isSupportedLanguage = (language) => Boolean(toLanguageCode(language))

export const filterSupportedLanguages = (languages = []) => {
  const seen = new Set()
  const result = []

  for (const language of languages) {
    const label = toLanguageLabel(language)
    if (!label || seen.has(label)) continue
    seen.add(label)
    result.push(label)
  }

  return result
}

export const resolveSupportedLanguageLabel = (language, fallback = DEFAULT_LANGUAGE) => {
  const label = toLanguageLabel(language)
  if (label) return label

  if (fallback === '') return ''
  const fallbackLabel = toLanguageLabel(fallback)
  return fallbackLabel || DEFAULT_LANGUAGE
}

export const resolveSupportedLanguageCode = (language, fallback = DEFAULT_LANGUAGE_CODE) => {
  const code = toLanguageCode(language)
  if (code) return code

  const fallbackCode = toLanguageCode(fallback)
  return fallbackCode || DEFAULT_LANGUAGE_CODE
}
