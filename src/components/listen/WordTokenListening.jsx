import { STATUS_OPACITY } from '../../constants/highlightColors'

// Soft pastel colors for transcript by status
// Matches the subtitle color scheme for consistency
const SOFT_STATUS_COLORS = {
  new: '#FFB088',        // soft peach - never seen this word
  unknown: '#F5A3A3',    // soft red/pink - seen but don't know
  recognised: '#C4A3F5', // soft purple - starting to recognize
  familiar: '#93B5F5',   // soft blue - almost there
  known: '#ffffff',      // white - mastered (but opacity 0 so invisible)
}

function getHighlightStyle({ status, mode, enableHighlight }) {
  const shouldHighlight = enableHighlight || mode !== 'extensive'

  if (!shouldHighlight) return {}

  const opacity = STATUS_OPACITY[status]
  if (!opacity || opacity === 0) return {}

  // Use status-based soft colors
  const base = SOFT_STATUS_COLORS[status] || SOFT_STATUS_COLORS.new

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
