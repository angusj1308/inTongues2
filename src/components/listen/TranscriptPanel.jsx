import TranscriptRoller from './TranscriptRoller'

const TranscriptPanel = ({
  segments = [],
  activeIndex = 0,
  vocabEntries = {},
  language,
  onWordClick,
  onSelectionTranslate,
  showWordStatus = false,
  showWordStatusToggle = true,
  onToggleWordStatus,
  isSynced = true,
  onUserScroll,
  onResync,
  syncToken = 0,
}) => (
  <div className="transcript-panel">
    <div className="transcript-panel-body" onMouseUp={onSelectionTranslate}>
      <TranscriptRoller
        segments={segments}
        activeIndex={activeIndex}
        vocabEntries={vocabEntries}
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
      {showWordStatusToggle ? (
        <button
          type="button"
          className="word-status-toggle"
          onClick={onToggleWordStatus}
          aria-pressed={showWordStatus}
        >
          {showWordStatus ? 'Hide word status' : 'Show word status'}
        </button>
      ) : (
        <span className="transcript-panel-footer-spacer" aria-hidden="true" />
      )}
    </div>
  </div>
)

export default TranscriptPanel
