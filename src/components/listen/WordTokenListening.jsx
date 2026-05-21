import { forwardRef } from 'react'
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

const WordTokenListening = forwardRef(({
  text,
  status,
  listeningMode,
  onWordClick,
  onSelectionTranslate,
  enableHighlight = false,
  isWordPairMatch = false,
  requireDoubleClick = false,
}, ref) => {
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
    }
    // onWordClick is invoked by handleClick (which fires after mouseup for
    // simple clicks). Firing here too would double-invoke and immediately
    // toggle the popup shut.
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

  // Only install handlers when callbacks are actually provided. Callers that
  // delegate click/selection handling to an ancestor (see TranscriptFlow)
  // pass null for both, which lets us skip attaching 2000+ React listeners
  // to individual words. requireDoubleClick = true (music) shifts the
  // translation popup off single click onto double click — single click
  // then bubbles up to the line's seek handler instead.
  const nodeProps = {
    ref,
    className: classNames.join(' '),
    style,
    'data-word-status': normalisedStatus,
    'data-word-text': text,
  }
  if (onWordClick) {
    if (requireDoubleClick) {
      nodeProps.onDoubleClick = handleClick
    } else {
      nodeProps.onClick = handleClick
    }
  }
  if (onWordClick || onSelectionTranslate) nodeProps.onMouseUp = handleMouseUp

  return <span {...nodeProps}>{text}</span>
})

WordTokenListening.displayName = 'WordTokenListening'

export default WordTokenListening
