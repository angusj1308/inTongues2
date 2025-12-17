import {
  LANGUAGE_HIGHLIGHT_COLORS,
  STATUS_OPACITY,
} from '../../constants/highlightColors'

function getHighlightStyle({ language, status, mode, enableHighlight }) {
  const shouldHighlight = enableHighlight || mode !== 'extensive'

  if (!shouldHighlight) return {}

  const opacity = STATUS_OPACITY[status]
  if (!opacity || opacity === 0) return {}

  const base = LANGUAGE_HIGHLIGHT_COLORS[language] || LANGUAGE_HIGHLIGHT_COLORS.default

  return {
    '--hlt-base': base,
    '--hlt-opacity': opacity,
  }
}

const normaliseStatus = (status) => {
  if (!status || status === 'unknown') return 'new'
  if (status === 'recognised' || status === 'familiar' || status === 'known') {
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

  return (
    <span
      className={highlighted ? 'reader-word reader-word--highlighted' : 'reader-word'}
      style={style}
      onMouseUp={handleMouseUp}
      onClick={handleClick}
    >
      {text}
    </span>
  )
}

export default WordTokenListening
