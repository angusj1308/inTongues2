// Strip promotional preamble and trailing junk from RSS-shipped podcast
// episode descriptions before they're shown in the list preview. The full
// description is left untouched everywhere else; only the show-page list
// calls this.
//
// Algorithm (both directions):
//   1. Leading pass: skip every paragraph that's promotional OR isn't
//      substantive (>50 chars of non-URL prose). Stop at the first paragraph
//      that fails every promotional rule AND has substance.
//   2. Trailing pass: from the back, skip every paragraph that matches a
//      trailing-junk rule. Stop at the first paragraph that doesn't.
//   3. Return what's between the two stop points.
//   4. Safety: if everything got stripped, return the raw cleaned text so
//      the preview is never empty.

// ---------------------------------------------------------------------------
// Language keyword lists. Spanish is primary; the others are scaffolded so
// the structure extends cleanly when other locales need cleaning.
// ---------------------------------------------------------------------------
const PROMO_KEYWORDS = {
  es: [
    'VISITÁ', 'VISITA', 'SÍGUENOS', 'SIGUENOS', 'SUSCRÍBETE', 'SUSCRIBETE',
    'ÚNETE', 'UNETE', 'LINK A', 'ENLACE A', 'CÓDIGO', 'CODIGO', 'DESCUENTO',
    'NUESTRO INSTAGRAM', 'NUESTRO TWITTER', 'NUESTRO FACEBOOK',
    'NUESTRA WEB', 'NUESTRO CANAL', 'NUESTRO YOUTUBE', 'APÓYANOS', 'APOYANOS',
    'CANAL DE',
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

const PRODUCT_KEYWORDS = {
  es: ['LIBRO', 'CURSO', 'PRODUCTO'],
  en: ['BOOK', 'COURSE', 'PRODUCT'],
  pt: ['LIVRO', 'CURSO', 'PRODUTO'],
  fr: ['LIVRE', 'COURS', 'PRODUIT'],
  it: ['LIBRO', 'CORSO', 'PRODOTTO'],
}

const COMMUNITY_KEYWORDS = {
  es: ['COMUNIDAD', 'MIEMBROS', 'PATREON', 'CLUB', 'SUSCRIPTORES'],
  en: ['COMMUNITY', 'MEMBERS', 'PATREON', 'CLUB', 'SUBSCRIBERS', 'SUPPORTERS'],
  pt: ['COMUNIDADE', 'MEMBROS', 'PATREON', 'CLUBE', 'ASSINANTES'],
  fr: ['COMMUNAUTÉ', 'MEMBRES', 'PATREON', 'CLUB', 'ABONNÉS'],
  it: ['COMUNITÀ', 'MEMBRI', 'PATREON', 'CLUB', 'ABBONATI'],
}

const OUTRO_KEYWORDS = {
  es: [
    'GRACIAS POR ESCUCHAR', 'NO OLVIDEN', 'NO OLVIDES', 'SUSCRÍBETE',
    'SUSCRIBETE', 'CALIFÍCANOS', 'CALIFICANOS', 'COMPARTE', 'COMPÁRTELO',
    'DÉJANOS UNA RESEÑA', 'DEJANOS UNA RESEÑA',
  ],
  en: [
    'THANKS FOR LISTENING', "DON'T FORGET TO", 'DONT FORGET TO',
    'SUBSCRIBE', 'RATE AND REVIEW', 'LEAVE A REVIEW', 'SHARE THIS',
    'SEE YOU NEXT', 'UNTIL NEXT TIME',
  ],
  pt: [
    'OBRIGADO POR OUVIR', 'NÃO ESQUEÇAM', 'NAO ESQUECAM',
    'INSCREVA-SE', 'AVALIE',
  ],
  fr: [
    'MERCI D\'AVOIR ÉCOUTÉ', "MERCI D'AVOIR ECOUTE", 'N\'OUBLIEZ PAS',
    'ABONNEZ-VOUS', 'NOTEZ',
  ],
  it: [
    'GRAZIE PER L\'ASCOLTO', 'NON DIMENTICATE', 'ISCRIVITI', 'VALUTA',
  ],
}

// ---------------------------------------------------------------------------
// Language-agnostic regex helpers
// ---------------------------------------------------------------------------
const URL_RE = /https?:\/\/\S+|www\.\S+/i
const URL_RE_GLOBAL = /https?:\/\/\S+|www\.\S+/gi
const HASHTAG_RE = /^#\S+$/
const HASHTAG_ONLY_LINE_RE = /^\s*(?:#\S+\s*)+$/
const SEPARATOR_ONLY_RE = /^\s*[\-–—_=*•~]{3,}[\s\-–—_=*•~]*$/
const ALL_CAPS_LABEL_URL_RE = /^[A-ZÁÉÍÓÚÑÜ \d]{3,}\s*:\s*https?:\/\//
const EMOJI_LEAD_RE = /^[\p{Extended_Pictographic}\p{Emoji_Presentation}]\s*/u
const EMOJI_STRIP_RE = /[\p{Extended_Pictographic}\p{Emoji_Presentation}\s]/gu
const DONATION_TIER_RE = /(?:[€$£¥]\s*\d+|\d+\s*[€$£¥])\s*:\s*https?:\/\//gi
const AFFILIATE_DOMAIN_RE = /(?:amzn\.to|amzn\.eu|amzn\.com|bit\.ly|linktr\.ee)/i
const AD_NETWORK_RE = /(?:megaphone\.fm\/adchoices|art19\.com|acast\.com\/privacy|podtrac\.com|chartable\.com|spreaker\.com\/privacy|prx\.org\/privacy)/i
const AD_LANGUAGE_RE = /(?:ad\s*choices|adchoices|privacy\s*policy|política\s*de\s*privacidad|politica\s*de\s*privacidad|cookies)/i
const PROMO_CODE_RE = /c[óo]digo|descuento|desconto|promo|\d+\s*%/i
const SOCIAL_PLATFORM_RE = /\b(?:instagram|twitter|x\.com|youtube|tiktok|facebook|canal\s+de)\b/gi
const HANDLE_RE = /@\w+/g

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
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

// "Substantive" = more than 50 chars of non-URL text. Chapter-timestamp lists
// (00:00 Topic / 01:18 Next…) pass this naturally because the topic words add
// up to plenty of prose between timestamps.
const hasSubstance = (paragraph) => {
  const text = paragraph.replace(URL_RE_GLOBAL, '').trim()
  return text.length > 50
}

// What fraction of the paragraph's non-whitespace chars are eaten by URLs,
// @handles, and platform names? Used to spot "pure social-handle" blocks.
const socialHandleRatio = (paragraph) => {
  const compact = paragraph.replace(/\s+/g, ' ').trim()
  if (!compact) return 0
  const totalLen = compact.replace(/\s+/g, '').length
  let working = compact
  let removedLen = 0
  const consume = (re) => {
    const matches = working.match(re) || []
    for (const m of matches) removedLen += m.replace(/\s+/g, '').length
    working = working.replace(re, ' ')
  }
  consume(URL_RE_GLOBAL)
  consume(HANDLE_RE)
  consume(SOCIAL_PLATFORM_RE)
  return totalLen > 0 ? removedLen / totalLen : 0
}

// ---------------------------------------------------------------------------
// Rule predicates
// ---------------------------------------------------------------------------
const isUrlDominated = (p) => {
  if (!URL_RE.test(p)) return false
  return p.replace(URL_RE_GLOBAL, '').trim().length < 30
}

const isAllCapsLabelUrl = (p) => ALL_CAPS_LABEL_URL_RE.test(p)

const isHashtagOnly = (p) => HASHTAG_ONLY_LINE_RE.test(p)

const isSeparatorRun = (p) => SEPARATOR_ONLY_RE.test(p.trim())

const isPromoCodePlusUrl = (p) => URL_RE.test(p) && PROMO_CODE_RE.test(p)

const isDonationTierBlock = (p) => {
  const matches = p.match(DONATION_TIER_RE) || []
  return matches.length >= 2
}

const isAffiliateLink = (p) => AFFILIATE_DOMAIN_RE.test(p)

const startsWithKeyword = (p, keywords) => {
  const upper = p.trim().toUpperCase()
  return keywords.some((kw) => upper.startsWith(kw))
}

const isProductPromo = (p, keywords) =>
  startsWithKeyword(p, keywords) && URL_RE.test(p)

const isEmojiLedCta = (p, keywords) => {
  if (!EMOJI_LEAD_RE.test(p)) return false
  const afterEmoji = p.replace(EMOJI_LEAD_RE, '').toUpperCase()
  if (keywords.some((kw) => afterEmoji.startsWith(kw))) return true
  if (/^[¡!]/.test(afterEmoji)) return true
  return false
}

const isEmojiBracketedCommunityPromo = (p, communityKeywords) => {
  if (!EMOJI_LEAD_RE.test(p)) return false
  // Strip leading & trailing emoji + whitespace; what remains should be
  // an ALL-CAPS phrase mentioning a community keyword.
  const inner = p
    .replace(/^[\p{Extended_Pictographic}\p{Emoji_Presentation}\s]+/u, '')
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\s]+$/u, '')
    .trim()
  if (!inner) return false
  if (!/^[A-ZÁÉÍÓÚÑÜ0-9 \-:!¡?¿]{3,}$/.test(inner)) return false
  const upper = inner.toUpperCase()
  return communityKeywords.some((kw) => upper.includes(kw))
}

const isPureSocialBlock = (p) => socialHandleRatio(p) > 0.7

const isAdNetworkDisclosure = (p) =>
  AD_NETWORK_RE.test(p) && AD_LANGUAGE_RE.test(p)

const isOutroBoilerplate = (p, outroKeywords) => {
  if (!startsWithKeyword(p, outroKeywords)) return false
  return URL_RE.test(p) || /#\S+/.test(p)
}

// ---------------------------------------------------------------------------
// Composed predicates
// ---------------------------------------------------------------------------
const isPromotionalLeading = (paragraph, lang) => {
  const promo = PROMO_KEYWORDS[lang]
  const product = PRODUCT_KEYWORDS[lang]
  const community = COMMUNITY_KEYWORDS[lang]
  const p = paragraph.trim()
  if (!p) return true

  if (isSeparatorRun(p)) return true
  if (isUrlDominated(p)) return true
  if (isAllCapsLabelUrl(p)) return true
  if (isHashtagOnly(p)) return true
  if (startsWithKeyword(p, promo)) return true
  if (isEmojiLedCta(p, promo)) return true
  if (isPromoCodePlusUrl(p)) return true
  if (isDonationTierBlock(p)) return true
  if (isProductPromo(p, product)) return true
  if (isAffiliateLink(p)) return true
  if (isEmojiBracketedCommunityPromo(p, community)) return true
  if (isPureSocialBlock(p)) return true

  return false
}

const isTrailingJunk = (paragraph, lang) => {
  const outro = OUTRO_KEYWORDS[lang]
  const p = paragraph.trim()
  if (!p) return true

  if (isSeparatorRun(p)) return true
  if (isHashtagOnly(p)) return true
  if (isAdNetworkDisclosure(p)) return true
  if (isOutroBoilerplate(p, outro)) return true

  return false
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------
export const cleanPodcastDescription = (raw, langCode = 'es') => {
  if (!raw) return ''
  const stripped = stripHtml(raw).trim()
  if (!stripped) return ''

  const lang = normaliseLangKey(langCode)

  // Paragraph split. Prefer blank-line breaks; fall back to single newlines.
  let paragraphs = stripped.split(/\n\s*\n+/)
  if (paragraphs.length === 1) {
    paragraphs = stripped.split(/\n+/)
  }

  // Leading pass: skip while (promotional OR not substantive).
  let start = 0
  while (start < paragraphs.length) {
    const p = paragraphs[start]
    if (isPromotionalLeading(p, lang) || !hasSubstance(p)) {
      start += 1
    } else {
      break
    }
  }

  // Trailing pass: skip while trailing junk from the back.
  let end = paragraphs.length
  while (end > start) {
    const p = paragraphs[end - 1]
    if (isTrailingJunk(p, lang)) {
      end -= 1
    } else {
      break
    }
  }

  // Safety: everything looked promo / trailing junk → fall back to raw.
  if (start >= end) return stripped

  return paragraphs.slice(start, end).join('\n\n').trim()
}

export default cleanPodcastDescription
