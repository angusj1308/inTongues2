import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

const Icon = ({ name, filled = false, className = '' }) => (
  <span
    className={`material-symbols-outlined ${filled ? 'filled' : ''} ${className}`.trim()}
    aria-hidden="true"
  >
    {name}
  </span>
)

const PlayPauseIcon = ({ isPlaying }) =>
  isPlaying ? (
    <svg className="playpause-icon" viewBox="0 0 36 36" aria-hidden="true" focusable="false">
      <rect x="9" y="8" width="6" height="20" rx="2" />
      <rect x="21" y="8" width="6" height="20" rx="2" />
    </svg>
  ) : (
    <svg className="playpause-icon" viewBox="0 0 36 36" aria-hidden="true" focusable="false">
      <path d="M11 7.5v21l16-10.5z" />
    </svg>
  )

const ScrubIcon = ({ direction = 'back', seconds }) => {
  const isBack = direction === 'back'
  const mirrorBack = isBack ? 'translate(36 0) scale(-1 1)' : undefined
  const arrowHeadPath = 'M 22 6 L 16 4 L 16 8 Z'

  return (
    <svg
      className="scrub-svg"
      viewBox="-2 -2 40 40"
      role="presentation"
      aria-hidden="true"
      focusable="false"
      fill="none"
    >
      <g transform={mirrorBack}>
        <circle className="scrub-arc" cx="18" cy="18" r="12" />
        <path className="scrub-arrowhead" d={arrowHeadPath} />
      </g>
      <text className="scrub-text" x="18" y="19" textAnchor="middle" dominantBaseline="middle">
        {seconds}
      </text>
    </svg>
  )
}

const formatTime = (seconds) => {
  if (!Number.isFinite(seconds)) return '0:00'
  const floored = Math.max(0, Math.floor(seconds))
  const mins = Math.floor(floored / 60)
  const secs = floored % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const speedPresets = [0.75, 0.9, 1, 1.25, 1.5, 2]

const formatRate = (rate) => {
  if (!Number.isFinite(rate)) return '1.0'
  return Number.isInteger(rate) ? `${rate.toFixed(1)}` : `${rate}`
}

const ExtensiveCinemaMode = ({
  currentTime = 0,
  duration = 0,
  isPlaying = false,
  scrubSeconds = 5,
  playbackRate = 1,
  onPlayPause,
  onSeek,
  onPlaybackRateChange,
  onScrubChange,
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

  const [overlayVisible, setOverlayVisible] = useState(true)
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false)
  const [scrubMenuOpen, setScrubMenuOpen] = useState(false)
  const overlayTimeoutRef = useRef(null)
  const speedMenuRef = useRef(null)
  const speedButtonRef = useRef(null)
  const scrubMenuRef = useRef(null)
  const rewindButtonRef = useRef(null)
  const longPressTimeoutRef = useRef(null)
  const longPressTriggeredRef = useRef(false)

  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0
  const clampedPosition = Math.min(Math.max(currentTime || 0, 0), safeDuration)
  const progressPercent = safeDuration > 0 ? (clampedPosition / safeDuration) * 100 : 0

  const clearOverlayTimeout = useCallback(() => {
    if (overlayTimeoutRef.current) {
      clearTimeout(overlayTimeoutRef.current)
      overlayTimeoutRef.current = null
    }
  }, [])

  const showOverlay = useCallback(() => {
    clearOverlayTimeout()
    setOverlayVisible(true)
    overlayTimeoutRef.current = setTimeout(() => setOverlayVisible(false), 3000)
  }, [clearOverlayTimeout])

  useEffect(() => () => clearOverlayTimeout(), [clearOverlayTimeout])

  // Initial overlay shown briefly on entry
  useEffect(() => {
    setOverlayVisible(true)
    const timer = setTimeout(() => setOverlayVisible(false), 3000)
    return () => clearTimeout(timer)
  }, [])

  // Spacebar toggles play/pause
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && e.target?.tagName !== 'INPUT' && e.target?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        showOverlay()
        onPlayPause?.()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onPlayPause, showOverlay])

  // Click-outside for popovers
  useEffect(() => {
    const handleClickOutside = (event) => {
      const scrubTarget =
        scrubMenuRef.current?.contains(event.target) || rewindButtonRef.current?.contains(event.target)
      const speedTarget =
        speedMenuRef.current?.contains(event.target) || speedButtonRef.current?.contains(event.target)
      if (!scrubTarget) setScrubMenuOpen(false)
      if (!speedTarget) setSpeedMenuOpen(false)
    }
    document.addEventListener('pointerdown', handleClickOutside)
    return () => document.removeEventListener('pointerdown', handleClickOutside)
  }, [])

  const clearLongPress = () => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current)
      longPressTimeoutRef.current = null
    }
  }
  useEffect(() => () => clearLongPress(), [])

  const handleRewindClick = () => {
    showOverlay()
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false
      return
    }
    onSeek?.(Math.max(0, (currentTime || 0) - scrubSeconds))
  }

  const handleRewindContextMenu = (event) => {
    event.preventDefault()
    setScrubMenuOpen((prev) => !prev)
  }

  const handleRewindPressStart = () => {
    clearLongPress()
    longPressTriggeredRef.current = false
    longPressTimeoutRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true
      setScrubMenuOpen(true)
    }, 500)
  }

  const handleRewindPressEnd = () => clearLongPress()

  const handleForward = () => {
    showOverlay()
    const target = safeDuration > 0
      ? Math.min(safeDuration, (currentTime || 0) + scrubSeconds)
      : (currentTime || 0) + scrubSeconds
    onSeek?.(target)
  }

  const handleSkipToStart = () => {
    showOverlay()
    onSeek?.(0)
  }

  const handleSkipToEnd = () => {
    showOverlay()
    if (safeDuration > 0) onSeek?.(safeDuration)
  }

  const handleProgressChange = (event) => {
    showOverlay()
    onSeek?.(Number(event.target.value))
  }

  const handleRateSelect = (rate) => {
    onPlaybackRateChange?.(rate)
    setSpeedMenuOpen(false)
  }

  const handlePlayPauseClick = () => {
    showOverlay()
    onPlayPause?.()
  }

  const handleOverlayInteraction = () => showOverlay()

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

          {/* Hover zone to reveal control bar */}
          <div
            className="cinema-overlay-hover-zone"
            onMouseMove={handleOverlayInteraction}
            onClick={handleOverlayInteraction}
          />

          {/* Overlay control bar — mirrors Active/Intensive chrome */}
          <div className={`cinema-overlay-controls ${overlayVisible ? 'is-visible' : ''}`}>
            <div className="cinema-overlay-gradient" />
            <div className="cinema-overlay-inner">
              <div className="cinema-overlay-progress">
                <span className="cinema-overlay-time">{formatTime(clampedPosition)}</span>
                <input
                  className="cinema-overlay-slider"
                  type="range"
                  min={0}
                  max={safeDuration || 0}
                  step="0.1"
                  value={clampedPosition}
                  onChange={handleProgressChange}
                  disabled={safeDuration === 0}
                  aria-label="Playback position"
                  style={{ '--progress': `${progressPercent}%` }}
                />
                <span className="cinema-overlay-time">{formatTime(safeDuration)}</span>
              </div>

              <div className="cinema-overlay-transport">
                <div className="cinema-overlay-left">
                  <div className="cinema-overlay-btn-wrap">
                    <button
                      ref={speedButtonRef}
                      type="button"
                      className={`cinema-overlay-btn ${playbackRate && playbackRate !== 1 ? 'active' : ''}`}
                      onClick={() => setSpeedMenuOpen((prev) => !prev)}
                      aria-label={`Speed ${playbackRate || 1}x`}
                      title="Playback speed"
                    >
                      <span className="cinema-overlay-speed">x{formatRate(playbackRate || 1)}</span>
                    </button>
                    {speedMenuOpen && (
                      <div ref={speedMenuRef} className="cinema-overlay-popover" role="dialog" aria-label="Playback speed">
                        {speedPresets.map((rate) => (
                          <button
                            key={rate}
                            type="button"
                            className={`cinema-overlay-popover-option ${rate === playbackRate ? 'active' : ''}`}
                            onClick={() => handleRateSelect(rate)}
                          >
                            x{formatRate(rate)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="cinema-overlay-center">
                  <button
                    type="button"
                    className="cinema-overlay-btn"
                    onClick={handleSkipToStart}
                    aria-label="Skip to start"
                    title="Skip to start"
                  >
                    <Icon name="skip_previous" />
                  </button>
                  <div className="cinema-overlay-btn-wrap">
                    <button
                      ref={rewindButtonRef}
                      type="button"
                      className="cinema-overlay-btn"
                      onClick={handleRewindClick}
                      onContextMenu={handleRewindContextMenu}
                      onPointerDown={handleRewindPressStart}
                      onPointerUp={handleRewindPressEnd}
                      onPointerLeave={handleRewindPressEnd}
                      aria-label={`Rewind ${scrubSeconds} seconds`}
                      title="Long-press to change interval"
                    >
                      <ScrubIcon direction="back" seconds={scrubSeconds} />
                    </button>
                    {scrubMenuOpen && (
                      <div ref={scrubMenuRef} className="cinema-overlay-popover" role="dialog" aria-label="Rewind interval">
                        {[5, 10, 15, 30].map((seconds) => (
                          <button
                            key={seconds}
                            type="button"
                            className={`cinema-overlay-popover-option ${seconds === scrubSeconds ? 'active' : ''}`}
                            onClick={() => {
                              onScrubChange?.(seconds)
                              setScrubMenuOpen(false)
                            }}
                          >
                            {seconds}s
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className={`cinema-overlay-btn cinema-overlay-play ${isPlaying ? 'is-playing' : ''}`}
                    onClick={handlePlayPauseClick}
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                    title={isPlaying ? 'Pause' : 'Play'}
                  >
                    <PlayPauseIcon isPlaying={isPlaying} />
                  </button>
                  <button
                    type="button"
                    className="cinema-overlay-btn"
                    onClick={handleForward}
                    aria-label={`Forward ${scrubSeconds} seconds`}
                    title={`Forward ${scrubSeconds} seconds`}
                  >
                    <ScrubIcon direction="forward" seconds={scrubSeconds} />
                  </button>
                  <button
                    type="button"
                    className="cinema-overlay-btn"
                    onClick={handleSkipToEnd}
                    aria-label="Skip to end"
                    title="Skip to end"
                  >
                    <Icon name="skip_next" />
                  </button>
                </div>

                <div className="cinema-overlay-right" />
              </div>
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
