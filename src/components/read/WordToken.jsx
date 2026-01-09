import {
  HIGHLIGHT_COLOR,
  STATUS_OPACITY,
} from '../../constants/highlightColors'

function getHighlightStyle({ status, mode }) {
  if (mode === 'extensive') return {}

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

const WordToken = ({ text, status, readerMode, onWordClick }) => {
  const normalisedStatus = normaliseStatus(status)
  const style = getHighlightStyle({
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
