import { useCallback, useEffect, useRef, useState } from 'react'
import TranscriptPanel from '../listen/TranscriptPanel'
import FloatingTranscriptPanel from './FloatingTranscriptPanel'
import KaraokeSubtitles from './KaraokeSubtitles'
import { normaliseExpression } from '../../services/vocab'
import { resolveSupportedLanguageLabel } from '../../constants/languages'
import { normalizeLanguageCode } from '../../utils/language'

const getPopupPosition = (rect, positionAbove = false) => {
  const padding = 10
  const popupHeight = 80 // Estimated popup height for positioning above
  const viewportWidth = window.innerWidth || 0
  const viewportHeight = window.innerHeight || 0

  const x = Math.min(Math.max(rect.x + rect.width / 2, padding), viewportWidth - padding)

  let y
  if (positionAbove) {
    // Position above the word with enough room for the popup
    y = Math.max(rect.top - popupHeight - 12, padding)
  } else {
    // Position below the word
    y = Math.min(rect.y + rect.height + 12, viewportHeight - padding)
  }

  return { x, y }
}

const PlayPauseIcon = ({ isPlaying }) =>
  isPlaying ? (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  )

const formatTime = (seconds) => {
  if (!Number.isFinite(seconds)) return '0:00'
  const floored = Math.max(0, Math.floor(seconds))
  const mins = Math.floor(floored / 60)
  const secs = floored % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const ExtensiveCinemaMode = ({
  currentTime = 0,
  duration = 0,
  isPlaying = false,
  onPlayPause,
  onSeek,
  transcriptSegments = [],
  activeTranscriptIndex = 0,
  vocabEntries = {},
  language,
  nativeLanguage,
  voiceGender = 'male',
  popup,
  setPopup,
  renderHighlightedText,
  onSubtitleWordClick,
  children: videoPlayer,
  // Props for text display mode
  subtitlesEnabled = true,
  showWordStatus = true,
  onToggleWordStatus,
  transcriptPanelOpen = false,
  onCloseTranscript,
  darkMode = true,
  translations = {},
  pronunciations = {},
  contentExpressions = [],
}) => {
  const [isTranscriptSynced, setIsTranscriptSynced] = useState(true)
  const [syncToken, setSyncToken] = useState(0)
  const reqIdRef = useRef(0)

  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0
  const clampedPosition = Math.min(Math.max(currentTime || 0, 0), safeDuration)

  const [controlsVisible, setControlsVisible] = useState(false)
  const hideTimeoutRef = useRef(null)

  const showControls = useCallback((duration = 0) => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
    setControlsVisible(true)
    if (duration > 0) {
      hideTimeoutRef.current = setTimeout(() => {
        setControlsVisible(false)
        hideTimeoutRef.current = null
      }, duration)
    }
  }, [])

  const hideControlsSoon = useCallback((delay = 300) => {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)
    hideTimeoutRef.current = setTimeout(() => {
      setControlsVisible(false)
      hideTimeoutRef.current = null
    }, delay)
  }, [])

  useEffect(
    () => () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)
    },
    []
  )

  // Keyboard: Space toggles play/pause, Left/Right scrub ±5s; all flash controls for 5s
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      if (e.code === 'Space') {
        e.preventDefault()
        onPlayPause?.()
        showControls(5000)
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault()
        onSeek?.(Math.max(0, (currentTime || 0) - 5))
        showControls(5000)
      } else if (e.code === 'ArrowRight') {
        e.preventDefault()
        const target =
          safeDuration > 0
            ? Math.min(safeDuration, (currentTime || 0) + 5)
            : (currentTime || 0) + 5
        onSeek?.(target)
        showControls(5000)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onPlayPause, onSeek, currentTime, safeDuration, showControls])

  const handleProgressChange = (event) => {
    showControls(5000)
    onSeek?.(Number(event.target.value))
  }

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

      // Clean the word for comparison
      const cleanWord = text.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase()

      // Toggle behavior: if clicking the same word, dismiss the popup
      if (popup?.word === cleanWord) {
        setPopup(null)
        return
      }

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

      const { x, y } = getPopupPosition(targetRect, true)
      const requestId = ++reqIdRef.current

      const anchorRect = {
        left: targetRect.left ?? targetRect.x ?? 0,
        right: targetRect.right ?? (targetRect.x ?? 0) + (targetRect.width ?? 0),
        top: targetRect.top ?? targetRect.y ?? 0,
        bottom: targetRect.bottom ?? (targetRect.y ?? 0) + (targetRect.height ?? 0),
        width: targetRect.width ?? 0,
        height: targetRect.height ?? 0,
      }

      // Check pre-stored expression meaning
      const detectedExpr = (contentExpressions || []).find(
        (expr) => normaliseExpression(expr.text || '') === cleanWord
      )

      // Check pre-fetched translations and pronunciations first (single word lookup)
      const prefetchedTranslation = translations[cleanWord] || translations[text]
      const prefetchedPronunciation = pronunciations[cleanWord] || pronunciations[text]

      if (detectedExpr?.meaning || prefetchedTranslation || prefetchedPronunciation) {
        // Handle translation (can be string or object)
        let translation = 'No translation found'
        let audioBase64 = null
        let audioUrl = null

        if (detectedExpr?.meaning) {
          translation = detectedExpr.meaning
        } else if (prefetchedTranslation) {
          if (typeof prefetchedTranslation === 'string') {
            translation = prefetchedTranslation
          } else {
            translation = prefetchedTranslation.translation || 'No translation found'
            audioBase64 = prefetchedTranslation.audioBase64 || null
            audioUrl = prefetchedTranslation.audioUrl || null
          }
        }

        // Handle pronunciation (can be string URL or object)
        if (prefetchedPronunciation && !audioUrl) {
          if (typeof prefetchedPronunciation === 'string') {
            audioUrl = prefetchedPronunciation
          } else if (prefetchedPronunciation.audioUrl) {
            audioUrl = prefetchedPronunciation.audioUrl
          }
        }

        // Use pre-fetched data - no API call needed
        setPopup({
          x,
          y,
          anchorRect,
          anchorX: anchorRect.left + anchorRect.width / 2,
          word: cleanWord,
          displayText: text,
          translation,
          targetText: translation,
          audioBase64,
          audioUrl,
          requestId,
        })
        return
      }

      // No pre-fetched translation - show loading and make on-demand API call
      setPopup({
        x,
        y,
        anchorRect,
        anchorX: anchorRect.left + anchorRect.width / 2,
        word: cleanWord,
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
          translation = detectedExpr?.meaning || data.translation || translation
          displayText = data.targetText || displayText
          targetText = detectedExpr?.meaning || data.targetText || translation || 'No translation found'
          audioBase64 = data.audioBase64 || null
          audioUrl = data.audioUrl || null
        } else if (detectedExpr?.meaning) {
          translation = detectedExpr.meaning
          targetText = detectedExpr.meaning
        }
      } catch (err) {
        console.error('Translation lookup failed', err)
        if (detectedExpr?.meaning) {
          translation = detectedExpr.meaning
          targetText = detectedExpr.meaning
        } else {
          translation = 'Translation unavailable. Please try again.'
          targetText = translation
        }
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
    [contentExpressions, language, nativeLanguage, voiceGender, popup, setPopup, translations, pronunciations]
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
        const { x, y } = getPopupPosition(rect, true)
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

      const { x, y } = getPopupPosition(rect, true)
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
    <div className="cinema-extensive-fullscreen">
      {/* Main video area - always fullscreen */}
      <div className="cinema-extensive-video-zone">
        <div className="cinema-extensive-video-wrapper">
          {videoPlayer}

          {/* Subtitle overlay - always rendered, visibility controlled by subtitlesEnabled */}
          {subtitlesEnabled && (
            <div className="cinema-subtitle-overlay">
              <KaraokeSubtitles
                segments={transcriptSegments}
                currentTime={currentTime}
                language={language}
                vocabEntries={vocabEntries}
                showWordStatus={showWordStatus}
                onWordClick={handleTranscriptWordClick}
                onWordSelect={onSubtitleWordClick}
                contentExpressions={contentExpressions}
              />
            </div>
          )}

          {/* Hover dock — bottom strip below subtitles that reveals minimal controls */}
          <div
            className="cinema-extensive-controls-dock"
            onMouseEnter={() => showControls(0)}
            onMouseMove={() => showControls(0)}
            onMouseLeave={() => hideControlsSoon(300)}
          >
            <div className={`cinema-extensive-mini-controls ${controlsVisible ? 'is-visible' : ''}`}>
              <button
                type="button"
                className="cinema-extensive-mini-play"
                onClick={() => {
                  showControls(5000)
                  onPlayPause?.()
                }}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                title={isPlaying ? 'Pause' : 'Play'}
              >
                <PlayPauseIcon isPlaying={isPlaying} />
              </button>
              <input
                className="cinema-extensive-mini-progress"
                type="range"
                min={0}
                max={safeDuration || 0}
                step="0.1"
                value={clampedPosition}
                onChange={handleProgressChange}
                disabled={safeDuration === 0}
                aria-label="Playback position"
              />
              <span className="cinema-extensive-mini-time">
                {formatTime(clampedPosition)} / {formatTime(safeDuration)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Floating transcript panel - can be dragged anywhere, even to second monitor */}
      <FloatingTranscriptPanel
        isOpen={transcriptPanelOpen}
        onClose={onCloseTranscript}
        darkMode={darkMode}
      >
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
          contentExpressions={contentExpressions}
        />
      </FloatingTranscriptPanel>
    </div>
  )
}

export default ExtensiveCinemaMode
