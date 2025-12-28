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

const formatTime = (seconds) => {
  if (!Number.isFinite(seconds)) return '0:00'
  const floored = Math.max(0, Math.floor(seconds))
  const mins = Math.floor(floored / 60)
  const secs = floored % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const scrubOptions = [5, 10, 15, 30]
const speedPresets = [0.75, 0.9, 1, 1.25, 1.5, 2]

const formatRate = (rate) => {
  if (!Number.isFinite(rate)) return '1.0'
  return Number.isInteger(rate) ? `${rate.toFixed(1)}` : `${rate}`
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

const ExtensiveCinemaMode = ({
  videoTitle,
  isPlaying,
  currentTime,
  duration,
  onPlayPause,
  onSeek,
  playbackRate,
  onPlaybackRateChange,
  subtitlesEnabled,
  onToggleSubtitles,
  scrubSeconds,
  onScrubChange,
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
}) => {
  const [scrubMenuOpen, setScrubMenuOpen] = useState(false)
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false)
  // Word status OFF by default in extensive mode - no forced learning
  const [showWordStatus, setShowWordStatus] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('cinemaExtensiveShowWordStatus') === 'true'
  })
  const [isTranscriptSynced, setIsTranscriptSynced] = useState(true)
  const [syncToken, setSyncToken] = useState(0)

  const rewindButtonRef = useRef(null)
  const scrubMenuRef = useRef(null)
  const speedButtonRef = useRef(null)
  const speedMenuRef = useRef(null)
  const longPressTimeoutRef = useRef(null)
  const longPressTriggeredRef = useRef(false)
  const reqIdRef = useRef(0)

  const missingLanguageMessage =
    'Select a language for this content to enable translation/pronunciation.'

  const clearLongPress = () => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current)
      longPressTimeoutRef.current = null
    }
  }

  const handleSeek = (nextTime) => {
    if (!onSeek) return
    onSeek(nextTime)
  }

  const handleStart = () => handleSeek(0)
  const handleBack = () => handleSeek(Math.max(0, (currentTime || 0) - scrubSeconds))
  const handleForward = () =>
    handleSeek(Math.min(duration || currentTime || 0, (currentTime || 0) + scrubSeconds))
  const handleSkipToEnd = () => handleSeek(duration || currentTime || 0)

  const handlePlaybackRateChange = (nextRate) => {
    if (!onPlaybackRateChange) return
    onPlaybackRateChange(nextRate)
    setSpeedMenuOpen(false)
  }

  const handleTranscriptUnsync = useCallback(() => {
    setIsTranscriptSynced(false)
  }, [])

  const handleTranscriptResync = useCallback(() => {
    setIsTranscriptSynced(true)
    setSyncToken((prev) => prev + 1)
  }, [])

  const handleRewindPressStart = () => {
    longPressTriggeredRef.current = false
    longPressTimeoutRef.current = setTimeout(() => {
      setScrubMenuOpen(true)
      longPressTriggeredRef.current = true
    }, 650)
  }

  const handleRewindPressEnd = () => {
    clearLongPress()
  }

  const handleRewindClick = () => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false
      return
    }
    handleBack()
  }

  const handleRewindContextMenu = (event) => {
    event.preventDefault()
    setScrubMenuOpen((prev) => !prev)
  }

  // Persist word status preference
  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem('cinemaExtensiveShowWordStatus', showWordStatus ? 'true' : 'false')
  }, [showWordStatus])

  // Reset sync on subtitle toggle
  useEffect(() => {
    setIsTranscriptSynced(true)
    setSyncToken((prev) => prev + 1)
  }, [subtitlesEnabled])

  // Click outside to close menus
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

  useEffect(() => () => clearLongPress(), [])

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

  const progressPercent = duration
    ? Math.min(100, Math.max(0, ((currentTime || 0) / duration) * 100))
    : 0

  // Create a highlightedText renderer that respects showWordStatus
  const renderSubtitleText = useCallback(
    (text) => {
      if (!showWordStatus) {
        // No highlighting - just return plain text
        return text
      }
      return renderHighlightedText(text)
    },
    [showWordStatus, renderHighlightedText]
  )

  return (
    <div className={`cinema-extensive-shell ${subtitlesEnabled ? 'cinema-extensive-shell--split' : ''}`}>
      <div className="cinema-extensive-inner">
        {/* Video pane */}
        <div className="cinema-extensive-pane cinema-extensive-pane-video">
          <div className="cinema-video-container">
            <div className="cinema-video-frame">
              {videoPlayer}
              {/* Subtitle overlay - only show if subtitles enabled and NOT using transcript panel */}
              {!subtitlesEnabled && (
                <div className="subtitle-overlay">
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

          {/* Transport Controls */}
          <div className="cinema-player-surface">
            {/* Progress bar */}
            <div className="progress-shell audible-progress-shell">
              <input
                className="audible-progress"
                type="range"
                min="0"
                max={duration || 0}
                step="0.1"
                value={currentTime || 0}
                onChange={(event) => handleSeek(Number(event.target.value))}
                aria-label="Playback position"
                style={{ '--progress': `${progressPercent}%` }}
              />
              <div className="progress-times ui-text">
                <span className="muted tiny">{formatTime(currentTime)}</span>
                <span className="muted tiny">{duration ? formatTime(duration) : '0:00'}</span>
              </div>
            </div>

            {/* Transport row */}
            <div className="player-transport-shell">
              <div className="transport-row" role="group" aria-label="Playback controls">
                <div className="transport-row-icons">
                  <button
                    type="button"
                    className="transport-icon"
                    onClick={handleStart}
                    aria-label="Start from beginning"
                    title="Start from beginning"
                  >
                    <Icon name="skip_previous" className="skip-icon" />
                  </button>

                  <div className="icon-btn-popover-wrap">
                    <button
                      ref={rewindButtonRef}
                      type="button"
                      className="transport-icon"
                      onClick={handleRewindClick}
                      onContextMenu={handleRewindContextMenu}
                      onPointerDown={handleRewindPressStart}
                      onPointerUp={handleRewindPressEnd}
                      onPointerLeave={handleRewindPressEnd}
                      aria-label={`Rewind ${scrubSeconds} seconds`}
                      title="Long-press or right-click to change interval"
                    >
                      <ScrubIcon direction="back" seconds={scrubSeconds} />
                    </button>
                    {scrubMenuOpen && (
                      <div ref={scrubMenuRef} className="scrub-popover" role="dialog" aria-label="Rewind interval">
                        <p className="scrub-popover-title">Rewind interval</p>
                        <div className="scrub-popover-options" role="group" aria-label="Choose rewind interval">
                          {scrubOptions.map((seconds) => (
                            <button
                              key={seconds}
                              type="button"
                              className={`scrub-popover-chip ${seconds === scrubSeconds ? 'active' : ''}`}
                              onClick={() => {
                                onScrubChange(seconds)
                                setScrubMenuOpen(false)
                              }}
                            >
                              {seconds}s
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    className={`transport-primary ${isPlaying ? 'is-playing' : ''}`}
                    onClick={onPlayPause}
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                    title={isPlaying ? 'Pause' : 'Play'}
                  >
                    <PlayPauseIcon isPlaying={isPlaying} />
                  </button>

                  <button
                    type="button"
                    className="transport-icon"
                    onClick={handleForward}
                    aria-label={`Forward ${scrubSeconds} seconds`}
                    title={`Forward ${scrubSeconds} seconds`}
                  >
                    <ScrubIcon direction="forward" seconds={scrubSeconds} />
                  </button>

                  <button
                    type="button"
                    className="transport-icon"
                    onClick={handleSkipToEnd}
                    aria-label="Skip to end"
                    title="Skip to end"
                  >
                    <Icon name="skip_next" className="skip-icon" />
                  </button>
                </div>
              </div>
            </div>

            {/* Secondary controls */}
            <div className="player-secondary-row secondary-controls" role="group" aria-label="Secondary controls">
              <span className="secondary-spacer" aria-hidden />

              {/* Word status toggle */}
              <button
                type="button"
                className={`secondary-btn ${showWordStatus ? 'active' : ''}`}
                onClick={() => setShowWordStatus((prev) => !prev)}
                aria-label={showWordStatus ? 'Hide word status' : 'Show word status'}
                title={showWordStatus ? 'Hide word highlighting' : 'Show word highlighting'}
              >
                <span className="secondary-glyph">
                  <Icon name="format_color_text" className="secondary-icon" filled={showWordStatus} />
                </span>
                <span className="secondary-label">Words</span>
              </button>

              {/* Speed control */}
              <div className="secondary-btn-popover-wrap">
                <button
                  ref={speedButtonRef}
                  type="button"
                  className={`secondary-btn ${playbackRate && playbackRate !== 1 ? 'active' : ''}`}
                  onClick={() => setSpeedMenuOpen((prev) => !prev)}
                  aria-label={`Playback speed ${playbackRate || 1}x`}
                  title="Change playback speed"
                >
                  <span className="secondary-glyph">
                    <span className="secondary-speed-icon">x{formatRate(playbackRate || 1)}</span>
                  </span>
                  <span className="secondary-label">Speed</span>
                </button>
                {speedMenuOpen && (
                  <div ref={speedMenuRef} className="scrub-popover speed-popover" role="dialog" aria-label="Playback speed">
                    <div className="speed-popover-options" role="group" aria-label="Choose playback speed">
                      {speedPresets.map((rate) => (
                        <button
                          key={rate}
                          type="button"
                          className={`speed-option ${rate === playbackRate ? 'active' : ''}`}
                          onClick={() => handlePlaybackRateChange(rate)}
                        >
                          <span className="speed-option-indicator" aria-hidden="true" />
                          <span className="speed-option-label">x{formatRate(rate)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Transcript toggle */}
              <button
                type="button"
                className={`secondary-btn ${subtitlesEnabled ? 'active' : ''}`}
                onClick={onToggleSubtitles}
                aria-label={subtitlesEnabled ? 'Hide transcript' : 'Show transcript'}
                title="Toggle transcript panel"
              >
                <span className="secondary-glyph">
                  <Icon name="subtitles" className="secondary-icon" filled={subtitlesEnabled} />
                </span>
                <span className="secondary-label">Transcript</span>
              </button>

              <span className="secondary-spacer" aria-hidden />
            </div>
          </div>
        </div>

        {/* Transcript pane */}
        <div className="cinema-extensive-pane cinema-extensive-pane-transcript" aria-hidden={!subtitlesEnabled}>
          {subtitlesEnabled && (
            <TranscriptPanel
              segments={transcriptSegments}
              activeIndex={activeTranscriptIndex}
              vocabEntries={vocabEntries}
              language={language}
              onWordClick={handleTranscriptWordClick}
              onSelectionTranslate={handleTranscriptSelection}
              showWordStatus={showWordStatus}
              onToggleWordStatus={() => setShowWordStatus((prev) => !prev)}
              isSynced={isTranscriptSynced}
              onUserScroll={handleTranscriptUnsync}
              onResync={handleTranscriptResync}
              syncToken={syncToken}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default ExtensiveCinemaMode
