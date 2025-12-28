import { useCallback, useEffect, useRef, useState } from 'react'
import TranscriptPanel from '../listen/TranscriptPanel'
import CinemaSubtitles from '../CinemaSubtitles'
import { normaliseExpression } from '../../services/vocab'
import { resolveSupportedLanguageLabel } from '../../constants/languages'
import { normalizeLanguageCode } from '../../utils/language'

const getPopupPosition = (rect) => {
  const padding = 10
  const viewportWidth = window.innerWidth || 0
  const viewportHeight = window.innerHeight || 0

  const x = Math.min(Math.max(rect.x + rect.width / 2, padding), viewportWidth - padding)
  const y = Math.min(rect.y + rect.height + 12, viewportHeight - padding)

  return { x, y }
}

const Icon = ({ name, filled = false, className = '' }) => (
  <span
    className={`material-symbols-outlined ${filled ? 'filled' : ''} ${className}`.trim()}
    aria-hidden="true"
  >
    {name}
  </span>
)

const ExtensiveCinemaMode = ({
  currentTime,
  transcriptSegments = [],
  activeTranscriptIndex = 0,
  vocabEntries = {},
  language,
  nativeLanguage,
  voiceGender = 'male',
  setPopup,
  renderHighlightedText,
  onSubtitleWordClick,
  children: videoPlayer,
  // Props for text display mode
  subtitlesEnabled = true,
  showWordStatus = true,
  transcriptPanelOpen = false,
}) => {
  const [isTranscriptSynced, setIsTranscriptSynced] = useState(true)
  const [syncToken, setSyncToken] = useState(0)
  const reqIdRef = useRef(0)

  const missingLanguageMessage =
    'Select a language for this content to enable translation/pronunciation.'

  const handleTranscriptUnsync = useCallback(() => {
    setIsTranscriptSynced(false)
  }, [])

  const handleTranscriptResync = useCallback(() => {
    setIsTranscriptSynced(true)
    setSyncToken((prev) => prev + 1)
  }, [])

  const handleTranscriptWordClick = useCallback(
    async (text, event) => {
      if (!setPopup) return

      const selection = window.getSelection()?.toString()?.trim() || ''
      const parts = selection ? selection.split(/\s+/).filter(Boolean) : []
      if (parts.length > 1) return

      const selectionObj = window.getSelection()
      let rangeRect = null

      if (selectionObj?.rangeCount) {
        try {
          const candidate = selectionObj.getRangeAt(0).getBoundingClientRect()
          if (candidate?.width > 0 && candidate?.height > 0) {
            rangeRect = candidate
          }
        } catch (err) {
          /* ignore range errors */
        }
      }

      const elementRect = event?.currentTarget?.getBoundingClientRect?.()
      let targetRect = rangeRect && rangeRect.width && rangeRect.height ? rangeRect : elementRect || null

      if (!targetRect || (!targetRect.width && !targetRect.height)) {
        const viewportWidth = window.innerWidth || 0
        const viewportHeight = window.innerHeight || 0
        targetRect = {
          x: viewportWidth / 2,
          y: viewportHeight / 3,
          width: 1,
          height: 1,
          top: viewportHeight / 3,
          left: viewportWidth / 2,
          right: viewportWidth / 2,
          bottom: viewportHeight / 3,
        }
      }

      const { x, y } = getPopupPosition(targetRect)
      const requestId = ++reqIdRef.current

      const anchorRect = {
        left: targetRect.left ?? targetRect.x ?? 0,
        right: targetRect.right ?? (targetRect.x ?? 0) + (targetRect.width ?? 0),
        top: targetRect.top ?? targetRect.y ?? 0,
        bottom: targetRect.bottom ?? (targetRect.y ?? 0) + (targetRect.height ?? 0),
        width: targetRect.width ?? 0,
        height: targetRect.height ?? 0,
      }

      setPopup({
        x,
        y,
        anchorRect,
        anchorX: anchorRect.left + anchorRect.width / 2,
        word: text,
        displayText: text,
        translation: 'Loading…',
        targetText: text,
        audioBase64: null,
        audioUrl: null,
        requestId,
      })

      let translation = 'No translation found'
      let audioBase64 = null
      let audioUrl = null
      let displayText = text
      let targetText = text

      const ttsLanguage = normalizeLanguageCode(language)

      if (!ttsLanguage) {
        setPopup((prev) =>
          prev?.requestId === requestId
            ? {
                ...prev,
                translation: missingLanguageMessage,
                targetText: missingLanguageMessage,
                audioBase64: null,
                audioUrl: null,
              }
            : prev
        )
        return
      }

      try {
        const response = await fetch('http://localhost:4000/api/translatePhrase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phrase: text,
            sourceLang: language || 'es',
            targetLang: resolveSupportedLanguageLabel(nativeLanguage),
            voiceGender,
          }),
        })

        if (response.ok) {
          const data = await response.json()
          translation = data.translation || translation
          displayText = data.targetText || displayText
          targetText = data.targetText || translation || 'No translation found'
          audioBase64 = data.audioBase64 || null
          audioUrl = data.audioUrl || null
        }
      } catch (err) {
        console.error('Translation lookup failed', err)
        translation = 'Translation unavailable. Please try again.'
        targetText = translation
      }

      setPopup((prev) =>
        prev?.requestId === requestId
          ? {
              ...prev,
              translation,
              displayText,
              targetText,
              audioBase64,
              audioUrl,
            }
          : prev
      )
    },
    [language, nativeLanguage, voiceGender, setPopup]
  )

  const handleTranscriptSelection = useCallback(
    async (event) => {
      event.stopPropagation()

      const selection = window.getSelection()?.toString()?.trim() || ''
      if (!selection) return

      const parts = selection.split(/\s+/).filter(Boolean)
      if (parts.length <= 1) return

      const phrase = selection
      const selectionObj = window.getSelection()
      if (!selectionObj || selectionObj.rangeCount === 0) return

      const range = selectionObj.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      const anchorRect = {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      }

      let translation = 'No translation found'
      let audioBase64 = null
      let audioUrl = null
      let targetText = null

      const ttsLanguage = normalizeLanguageCode(language)

      if (!ttsLanguage) {
        const { x, y } = getPopupPosition(rect)
        setPopup({
          x,
          y,
          anchorRect,
          anchorX: rect.left + rect.width / 2,
          word: phrase,
          displayText: selection,
          translation: missingLanguageMessage,
          targetText: missingLanguageMessage,
          audioBase64: null,
          audioUrl: null,
        })
        return
      }

      try {
        const response = await fetch('http://localhost:4000/api/translatePhrase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phrase,
            sourceLang: language || 'es',
            targetLang: resolveSupportedLanguageLabel(nativeLanguage),
            voiceGender,
          }),
        })

        if (response.ok) {
          const data = await response.json()
          translation = data.translation || translation
          targetText = data.targetText || translation
          audioBase64 = data.audioBase64 || null
          audioUrl = data.audioUrl || null
        }
      } catch (err) {
        console.error('Error translating phrase:', err)
      }

      const { x, y } = getPopupPosition(rect)
      setPopup({
        x,
        y,
        anchorRect,
        anchorX: rect.left + rect.width / 2,
        word: phrase,
        displayText: selection,
        translation,
        targetText,
        audioBase64,
        audioUrl,
      })
    },
    [language, nativeLanguage, voiceGender, setPopup]
  )

  // Render subtitle text with or without word status highlighting
  const renderSubtitleText = useCallback(
    (text) => {
      if (!showWordStatus) {
        return text
      }
      return renderHighlightedText(text)
    },
    [showWordStatus, renderHighlightedText]
  )

  return (
    <div className={`cinema-extensive-fullscreen ${transcriptPanelOpen ? 'cinema-extensive-fullscreen--split' : ''}`}>
      {/* Main video area */}
      <div className="cinema-extensive-video-zone">
        <div className="cinema-extensive-video-wrapper">
          {videoPlayer}

          {/* Subtitle overlay - always rendered, visibility controlled by subtitlesEnabled */}
          {subtitlesEnabled && (
            <div className="cinema-subtitle-overlay">
              <CinemaSubtitles
                transcript={{ segments: transcriptSegments }}
                currentTime={currentTime}
                renderHighlightedText={renderSubtitleText}
                onWordSelect={onSubtitleWordClick}
              />
            </div>
          )}
        </div>
      </div>

      {/* Transcript side panel - only when open */}
      {transcriptPanelOpen && (
        <div className="cinema-extensive-transcript-panel">
          <TranscriptPanel
            segments={transcriptSegments}
            activeIndex={activeTranscriptIndex}
            vocabEntries={vocabEntries}
            language={language}
            onWordClick={handleTranscriptWordClick}
            onSelectionTranslate={handleTranscriptSelection}
            showWordStatus={showWordStatus}
            onToggleWordStatus={onToggleWordStatus}
            isSynced={isTranscriptSynced}
            onUserScroll={handleTranscriptUnsync}
            onResync={handleTranscriptResync}
            syncToken={syncToken}
          />
        </div>
      )}
    </div>
  )
}

export default ExtensiveCinemaMode
