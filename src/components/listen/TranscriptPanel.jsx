import TranscriptRoller from './TranscriptRoller'

// Compute a simple version string from vocab entries to force re-renders when status changes
const computeVocabVersion = (entries) => {
  if (!entries || typeof entries !== 'object') return ''
  return Object.keys(entries)
    .sort()
    .map(k => `${k}:${entries[k]?.status || ''}`)
    .join(',')
}

const TranscriptPanel = ({
  segments = [],
  activeIndex = 0,
  vocabEntries = {},
  language,
  onWordClick,
  onSelectionTranslate,
  showWordStatus = false,
  showWordStatusToggle = true,
  wordStatusDisabled = false,
  onToggleWordStatus,
  isSynced = true,
  onUserScroll,
  onResync,
  syncToken = 0,
  darkMode = false,
}) => {
  const vocabVersion = computeVocabVersion(vocabEntries)

  return (
    <div className={`transcript-panel ${darkMode ? 'transcript-panel--dark' : ''}`}>
      <div className="transcript-panel-body" onMouseUp={onSelectionTranslate}>
        <TranscriptRoller
          segments={segments}
          activeIndex={activeIndex}
          vocabEntries={vocabEntries}
          vocabVersion={vocabVersion}
          language={language}
          onWordClick={onWordClick}
          onSelectionTranslate={onSelectionTranslate}
          showWordStatus={showWordStatus}
          isSynced={isSynced}
          onUserScroll={onUserScroll}
          syncToken={syncToken}
        />
      </div>
    <div className="transcript-panel-footer">
      <button
        type="button"
        className="transcript-sync-btn"
        onClick={onResync}
        disabled={isSynced || !onResync}
      >
        {isSynced ? 'Synced' : 'Sync'}
      </button>
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
