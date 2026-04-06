import {
  LIGHT_HIGHLIGHTS,
  DARK_HIGHLIGHTS,
} from '../../constants/highlightColors'

function getHighlightStyle({ status, mode, tone }) {
  if (mode === 'extensive') return {}

  const colors = tone === 'dark' ? DARK_HIGHLIGHTS : LIGHT_HIGHLIGHTS
  const color = colors[status]
  if (!color) return {}

  return { '--hlt-color': color }
}

const normaliseStatus = (status) => {
  if (!status) return 'new'
  if (status === 'unknown' || status === 'recognised' || status === 'familiar' || status === 'known') {
    return status
  }
  return 'new'
}

const WordToken = ({ text, status, readerMode, tone, onWordClick }) => {
  const normalisedStatus = normaliseStatus(status)
  const style = getHighlightStyle({
    status: normalisedStatus,
    mode: readerMode,
    tone,
  })

  const highlighted = Boolean(style['--hlt-color'])

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
