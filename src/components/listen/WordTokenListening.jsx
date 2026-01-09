import {
  HIGHLIGHT_COLOR,
  STATUS_OPACITY,
} from '../../constants/highlightColors'

function getHighlightStyle({ status, mode, enableHighlight }) {
  const shouldHighlight = enableHighlight || mode !== 'extensive'

  if (!shouldHighlight) return {}

  const opacity = STATUS_OPACITY[status]
  if (!opacity || opacity === 0) return {}

  return {
    '--hlt-base': HIGHLIGHT_COLOR,
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
  listeningMode,
  onWordClick,
  onSelectionTranslate,
  enableHighlight = false,
  isWordPairMatch = false,
}) => {
  const normalisedStatus = normaliseStatus(status)
  const style = getHighlightStyle({
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
