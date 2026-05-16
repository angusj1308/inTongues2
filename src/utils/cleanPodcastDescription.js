// Strip promotional preamble from RSS-shipped podcast episode descriptions
// before the truncated list-preview rendering. The full description is left
// alone everywhere else — only the show-page episode list calls this.
//
// Rules (paragraph-level, leading-only):
//   1. URL-dominated paragraph: < ~30 chars of non-URL text alongside a URL
//   2. ALL-CAPS LABEL: URL — e.g. "NUESTRO INSTAGRAM: https://…"
//   3. Localised promotional keyword at the start of the paragraph
//   4. Emoji-led call to action (emoji + promotional keyword / imperative)
//   5. Hashtag-only line
//   6. Promo code near a URL ("código", "descuento", "promo", "<n>%")
//
// Detection stops on the first paragraph that fails every rule — that's the
// real episode content, and everything from there onward is returned verbatim.
// If every paragraph looked promotional, we hand back the original string
// rather than render an empty preview.

const PROMO_KEYWORDS = {
  es: [
    'VISITÁ', 'VISITA', 'SÍGUENOS', 'SIGUENOS', 'SUSCRÍBETE', 'SUSCRIBETE',
    'ÚNETE', 'UNETE', 'LINK A', 'ENLACE A', 'CÓDIGO', 'CODIGO', 'DESCUENTO',
    'NUESTRO INSTAGRAM', 'NUESTRO TWITTER', 'NUESTRO FACEBOOK',
    'NUESTRA WEB', 'NUESTRO CANAL', 'NUESTRO YOUTUBE', 'APÓYANOS', 'APOYANOS',
  ],
  en: [
    'VISIT', 'FOLLOW US', 'FOLLOW ON', 'SUBSCRIBE', 'JOIN', 'USE CODE',
    'CHECK OUT', 'SUPPORT US', 'SUPPORT THE SHOW', 'OUR INSTAGRAM',
    'OUR TWITTER', 'OUR FACEBOOK', 'OUR WEBSITE', 'OUR CHANNEL', 'DISCOUNT',
    'SPONSORED BY', 'BROUGHT TO YOU BY',
  ],
  pt: [
    'VISITE', 'SIGA', 'INSCREVA-SE', 'CÓDIGO', 'CODIGO', 'DESCONTO',
    'NOSSO INSTAGRAM', 'NOSSO TWITTER', 'NOSSA WEB', 'NOSSO CANAL',
  ],
  fr: [
    'VISITEZ', 'SUIVEZ', 'ABONNEZ-VOUS', 'REJOIGNEZ', 'CODE',
    'NOTRE INSTAGRAM', 'NOTRE TWITTER', 'NOTRE SITE', 'NOTRE CHAÎNE',
    'NOTRE CHAINE',
  ],
  it: [
    'VISITA', 'SEGUI', 'ISCRIVITI', 'CODICE', 'SCONTO',
    'IL NOSTRO INSTAGRAM', 'IL NOSTRO TWITTER', 'IL NOSTRO CANALE',
    'IL NOSTRO SITO',
  ],
}

const URL_RE = /https?:\/\/\S+|www\.\S+/i
const URL_RE_GLOBAL = /https?:\/\/\S+|www\.\S+/gi
const HASHTAG_ONLY_RE = /^\s*(?:#\S+\s*)+$/
const ALL_CAPS_LABEL_URL_RE = /^[A-ZÁÉÍÓÚÑÜ \d]{3,}\s*:\s*https?:\/\//
const EMOJI_LEAD_RE = /^[\p{Extended_Pictographic}\p{Emoji_Presentation}]\s*/u
const PROMO_CODE_RE = /c[óo]digo|c[óo]digo|descuento|desconto|promo|\d+\s*%/i

const stripHtml = (s) =>
  String(s)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')

const normaliseLangKey = (code) => {
  if (!code) return 'es'
  const k = String(code).toLowerCase().slice(0, 2)
  return PROMO_KEYWORDS[k] ? k : 'es'
}

const isPromotional = (paragraph, keywords) => {
  const trimmed = paragraph.trim()
  if (!trimmed) return true

  // URL-dominated paragraph
  if (URL_RE.test(trimmed)) {
    const withoutUrls = trimmed.replace(URL_RE_GLOBAL, '').trim()
    if (withoutUrls.length < 30) return true
  }

  // ALL CAPS LABEL: URL
  if (ALL_CAPS_LABEL_URL_RE.test(trimmed)) return true

  // Hashtag-only line
  if (HASHTAG_ONLY_RE.test(trimmed)) return true

  // Localised promotional keyword prefix
  const upper = trimmed.toUpperCase()
  for (const kw of keywords) {
    if (upper.startsWith(kw)) return true
  }

  // Emoji-led CTA — emoji + keyword OR emoji + Spanish ¡imperative
  if (EMOJI_LEAD_RE.test(trimmed)) {
    const afterEmoji = trimmed.replace(EMOJI_LEAD_RE, '').toUpperCase()
    for (const kw of keywords) {
      if (afterEmoji.startsWith(kw)) return true
    }
    if (/^[¡!]/.test(afterEmoji)) return true
  }

  // Promo code pattern near a URL
  if (URL_RE.test(trimmed) && PROMO_CODE_RE.test(trimmed)) return true

  return false
}

export const cleanPodcastDescription = (raw, langCode = 'es') => {
  if (!raw) return ''
  const stripped = stripHtml(raw).trim()
  if (!stripped) return ''

  const keywords = PROMO_KEYWORDS[normaliseLangKey(langCode)]

  // Split into paragraphs (double newline preferred; single newline as
  // fallback for feeds that don't use blank-line separators)
  let paragraphs = stripped.split(/\n\s*\n+/)
  if (paragraphs.length === 1) {
    paragraphs = stripped.split(/\n+/)
  }

  let firstReal = 0
  while (
    firstReal < paragraphs.length
    && isPromotional(paragraphs[firstReal], keywords)
  ) {
    firstReal += 1
  }

  // Safety: everything looked promo — fall back to the raw cleaned text so
  // the user sees *something* rather than an empty preview.
  if (firstReal >= paragraphs.length) return stripped

  return paragraphs.slice(firstReal).join('\n\n').trim()
}

export default cleanPodcastDescription
