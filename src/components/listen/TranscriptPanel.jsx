import { useState, useEffect, useMemo, useRef } from 'react'
import TranscriptRoller from './TranscriptRoller'
import TranscriptFlow from '../cinema/TranscriptFlow'

const TranscriptPanel = ({
  segments = [],
  activeIndex = 0,
  vocabEntries = {},
  language,
  onWordClick,
  onSelectionTranslate,
  showWordStatus = false,
  showWordStatusToggle = true,
  showSyncToggle = true,
  wordStatusDisabled = false,
  onToggleWordStatus,
  isSynced = true,
  onUserScroll,
  onResync,
  syncToken = 0,
  darkMode = false,
  contentExpressions = [],
  flowMode = false,
  currentTime = 0,
  getCurrentTime,
  lyricsTranslations = [],
}) => {
  // Bump vocabVersion (→ full remount) only when the SET of vocab keys
  // changes — i.e. a word/phrase was added or removed. Status-only changes
  // propagate through normal prop updates and no longer need the blunt
  // remount, which was rebuilding the entire transcript on every click.
  const [vocabVersion, setVocabVersion] = useState(0)
  const prevEntriesRef = useRef(vocabEntries)

  // Untimed lyrics fallback (Musixmatch plain track.lyrics.get when no
  // richsync/subtitle was available): every segment has start === 0 and
  // end === 0, so sync is meaningless. Disable auto-scroll and the Sync
  // button so the user can scroll freely without the panel fighting them.
  const lyricsTimed = useMemo(() => {
    if (!segments.length) return true
    return segments.some((s) => (s?.start ?? 0) > 0 || (s?.end ?? 0) > 0)
  }, [segments])
  const effectiveIsSynced = lyricsTimed ? isSynced : false

  useEffect(() => {
    const prev = prevEntriesRef.current
    if (prev === vocabEntries) return
    prevEntriesRef.current = vocabEntries

    const prevKeys = Object.keys(prev)
    const nextKeys = Object.keys(vocabEntries)
    if (prevKeys.length !== nextKeys.length) {
      setVocabVersion(v => v + 1)
      return
    }
    for (let i = 0; i < nextKeys.length; i++) {
      if (!(nextKeys[i] in prev)) {
        setVocabVersion(v => v + 1)
        return
      }
    }
  }, [vocabEntries])

  return (
    <div className={`transcript-panel ${darkMode ? 'transcript-panel--dark' : ''}`}>
      <div className="transcript-panel-body" onMouseUp={onSelectionTranslate}>
        {flowMode ? (
          <TranscriptFlow
            key={vocabVersion}
            segments={segments}
            vocabEntries={vocabEntries}
            language={language}
            onWordClick={onWordClick}
            onSelectionTranslate={onSelectionTranslate}
            showWordStatus={showWordStatus}
            currentTime={currentTime}
            getCurrentTime={getCurrentTime}
            isSynced={effectiveIsSynced}
            onUserScroll={onUserScroll}
            syncToken={syncToken}
            contentExpressions={contentExpressions}
          />
        ) : (
          <TranscriptRoller
            key={vocabVersion}
            segments={segments}
            activeIndex={activeIndex}
            vocabEntries={vocabEntries}
            language={language}
            onWordClick={onWordClick}
            onSelectionTranslate={onSelectionTranslate}
            showWordStatus={showWordStatus}
            isSynced={effectiveIsSynced}
            onUserScroll={onUserScroll}
            syncToken={syncToken}
            contentExpressions={contentExpressions}
            forceAllActive={!lyricsTimed}
            lyricsTranslations={lyricsTranslations}
          />
        )}
      </div>
    <div className="transcript-panel-footer">
      {showSyncToggle ? (
        <button
          type="button"
          className="transcript-sync-btn"
          onClick={lyricsTimed ? onResync : undefined}
          disabled={!lyricsTimed || effectiveIsSynced || !onResync}
          title={lyricsTimed ? undefined : 'Lyrics not time-synced'}
        >
          {effectiveIsSynced ? 'Synced' : 'Sync'}
        </button>
      ) : (
        <span className="transcript-panel-footer-spacer" aria-hidden="true" />
      )}
      {showWordStatusToggle || wordStatusDisabled ? (
        <button
          type="button"
          className={`word-status-toggle ${wordStatusDisabled ? 'word-status-toggle--disabled' : ''} ${showWordStatus && !onToggleWordStatus ? 'word-status-toggle--locked-on' : ''}`}
          onClick={wordStatusDisabled || !onToggleWordStatus ? undefined : onToggleWordStatus}
          aria-pressed={showWordStatus}
          disabled={wordStatusDisabled}
          title={wordStatusDisabled ? 'Word status available in Pass 3' : undefined}
        >
          {wordStatusDisabled
            ? 'Show word status'
            : showWordStatus
              ? 'Hide word status'
              : 'Show word status'}
        </button>
      ) : (
        <span className="transcript-panel-footer-spacer" aria-hidden="true" />
      )}
    </div>
  </div>
  )
}

export default TranscriptPanel
