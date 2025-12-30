import {
  LANGUAGE_HIGHLIGHT_COLORS,
  STATUS_OPACITY,
} from '../../constants/highlightColors'

// Helper to get language color with case-insensitive lookup
const getLanguageColor = (language) => {
  if (!language) return LANGUAGE_HIGHLIGHT_COLORS.default
  // Try exact match first, then capitalized version
  const exactMatch = LANGUAGE_HIGHLIGHT_COLORS[language]
  if (exactMatch) return exactMatch
  const capitalized = language.charAt(0).toUpperCase() + language.slice(1).toLowerCase()
  return LANGUAGE_HIGHLIGHT_COLORS[capitalized] || LANGUAGE_HIGHLIGHT_COLORS.default
}

function getHighlightStyle({ language, status, mode, enableHighlight }) {
  const shouldHighlight = enableHighlight || mode !== 'extensive'

  if (!shouldHighlight) return {}

  const opacity = STATUS_OPACITY[status]
  if (!opacity || opacity === 0) return {}

  // New words are always orange, others use language color
  const base = status === 'new'
    ? '#F97316'
    : getLanguageColor(language)

  return {
    '--hlt-base': base,
    '--hlt-opacity': opacity,
  }
}

const normaliseStatus = (status) => {
  if (!status) return 'new'
  if (status === 'unknown' || status === 'recognised' || status === 'familiar' || status === 'known') {
    return status
  }
  return 'new'
}

const WordTokenListening = ({
  text,
  status,
  language,
  listeningMode,
  onWordClick,
  onSelectionTranslate,
  enableHighlight = false,
  isWordPairMatch = false,
}) => {
  const normalisedStatus = normaliseStatus(status)
  const style = getHighlightStyle({
    language,
    status: normalisedStatus,
    mode: listeningMode,
    enableHighlight,
  })

  const highlighted = Boolean(style['--hlt-opacity'])

  const handleMouseUp = (event) => {
    const selection = window.getSelection()?.toString()?.trim()

    if (selection) {
      event.stopPropagation()
      if (onSelectionTranslate) {
        onSelectionTranslate(event)
      }
      return
    }

    if (onWordClick) {
      onWordClick(text, event)
    }
  }

  const handleClick = (event) => {
    const selection = window.getSelection()?.toString()?.trim()

    if (selection) return

    if (onWordClick) {
      onWordClick(text, event)
    }
  }

  const classNames = ['reader-word']
  if (highlighted) classNames.push('reader-word--highlighted')
  if (isWordPairMatch) classNames.push('reader-word--word-pair-match')

  return (
    <span
      className={classNames.join(' ')}
      style={style}
      onMouseUp={handleMouseUp}
      onClick={handleClick}
    >
      {text}
    </span>
  )
}

export default WordTokenListening
