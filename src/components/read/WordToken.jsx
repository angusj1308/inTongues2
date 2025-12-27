import {
  LANGUAGE_HIGHLIGHT_COLORS,
  STATUS_OPACITY,
} from '../../constants/highlightColors'

function getHighlightStyle({ language, status, mode }) {
  if (mode === 'extensive') return {}

  const opacity = STATUS_OPACITY[status]
  if (!opacity || opacity === 0) return {}

  // New words are always orange, others use language color
  const base = status === 'new'
    ? '#F97316'
    : (LANGUAGE_HIGHLIGHT_COLORS[language] || LANGUAGE_HIGHLIGHT_COLORS.default)

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

const WordToken = ({ text, status, language, readerMode, onWordClick }) => {
  const normalisedStatus = normaliseStatus(status)
  const style = getHighlightStyle({
    language,
    status: normalisedStatus,
    mode: readerMode,
  })

  const highlighted = Boolean(style['--hlt-opacity'])

  const handleWordInteraction = (event) => {
    const selection = window.getSelection()?.toString().trim()

    if (selection) return

    if (onWordClick) {
      onWordClick(text, event)
    }
  }

  return (
    <span
      className={highlighted ? 'reader-word reader-word--highlighted' : 'reader-word'}
      style={style}
      onClick={handleWordInteraction}
    >
      {text}
    </span>
  )
}

export default WordToken
