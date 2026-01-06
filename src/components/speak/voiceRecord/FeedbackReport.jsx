import React, { useRef, useState } from 'react'

/**
 * Comprehensive feedback report for voice recording
 * Shows correctness, accuracy, and fluency analysis
 */
export function FeedbackReport({
  result,
  referenceText,
  recordingUrl,
  language,
  isSpontaneous = false
}) {
  const audioRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)

  if (!result) return null

  const {
    transcription = '',
    scores = {},
    corrections = [],
    fluencyAnalysis = {},
    encouragement = '',
    suggestions = []
  } = result

  const {
    overall = 0,
    correctness = 0,
    accuracy = 0,
    fluency = 0
  } = scores

  // Score color helper
  const getScoreColor = (score) => {
    if (score >= 80) return 'score-excellent'
    if (score >= 60) return 'score-good'
    if (score >= 40) return 'score-fair'
    return 'score-needs-work'
  }

  // Toggle playback
  const togglePlayback = () => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }

  return (
    <div className="feedback-report">
      {/* Playback */}
      {recordingUrl && (
        <div className="feedback-playback">
          <audio
            ref={audioRef}
            src={recordingUrl}
            onEnded={() => setIsPlaying(false)}
          />
          <button className="btn-playback" onClick={togglePlayback}>
            {isPlaying ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
            {isPlaying ? 'Pause' : 'Play'} Your Recording
          </button>
        </div>
      )}

      {/* Transcription */}
      {transcription && (
        <div className="feedback-transcription">
          <h5>What we heard:</h5>
          <p className="transcription-text">{transcription}</p>
        </div>
      )}

      {/* Overall scores */}
      <div className="feedback-scores">
        <h5>Your Scores</h5>

        <div className="scores-grid">
          <div className={`score-card score-main ${getScoreColor(overall)}`}>
            <span className="score-value">{Math.round(overall)}</span>
            <span className="score-label">Overall</span>
          </div>

          <div className="score-details">
            {/* Correctness */}
            <div className="score-row">
              <div className="score-row-header">
                <span className="score-row-label">Correctness</span>
                <span className="score-row-value">{Math.round(correctness)}/100</span>
              </div>
              <div className="score-bar">
                <div
                  className={`score-bar-fill ${getScoreColor(correctness)}`}
                  style={{ width: `${correctness}%` }}
                />
              </div>
              <p className="score-row-description muted small">
                Grammar, vocabulary, and word choice
              </p>
            </div>

            {/* Accuracy */}
            <div className="score-row">
              <div className="score-row-header">
                <span className="score-row-label">Accuracy</span>
                <span className="score-row-value">{Math.round(accuracy)}/100</span>
              </div>
              <div className="score-bar">
                <div
                  className={`score-bar-fill ${getScoreColor(accuracy)}`}
                  style={{ width: `${accuracy}%` }}
                />
              </div>
              <p className="score-row-description muted small">
                Pronunciation and intonation
              </p>
            </div>

            {/* Fluency */}
            <div className="score-row">
              <div className="score-row-header">
                <span className="score-row-label">Fluency</span>
                <span className="score-row-value">{Math.round(fluency)}/100</span>
              </div>
              <div className="score-bar">
                <div
                  className={`score-bar-fill ${getScoreColor(fluency)}`}
                  style={{ width: `${fluency}%` }}
                />
              </div>
              <p className="score-row-description muted small">
                Pace, pauses, and naturalness
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Fluency analysis details */}
      {fluencyAnalysis && Object.keys(fluencyAnalysis).length > 0 && (
        <div className="feedback-fluency">
          <h5>Fluency Details</h5>
          <div className="fluency-stats">
            {fluencyAnalysis.wordsPerMinute && (
              <div className="fluency-stat">
                <span className="fluency-stat-value">{Math.round(fluencyAnalysis.wordsPerMinute)}</span>
                <span className="fluency-stat-label">Words/min</span>
              </div>
            )}
            {fluencyAnalysis.pauseCount !== undefined && (
              <div className="fluency-stat">
                <span className="fluency-stat-value">{fluencyAnalysis.pauseCount}</span>
                <span className="fluency-stat-label">Pauses</span>
              </div>
            )}
            {fluencyAnalysis.fillerWords !== undefined && (
              <div className="fluency-stat">
                <span className="fluency-stat-value">{fluencyAnalysis.fillerWords}</span>
                <span className="fluency-stat-label">Filler words</span>
              </div>
            )}
          </div>
          {fluencyAnalysis.notes && fluencyAnalysis.notes.length > 0 && (
            <ul className="fluency-notes">
              {fluencyAnalysis.notes.map((note, index) => (
                <li key={index}>{note}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Corrections */}
      {corrections.length > 0 && (
        <div className="feedback-corrections">
          <h5>Corrections & Suggestions</h5>
          <div className="corrections-list">
            {corrections.map((correction, index) => (
              <div key={index} className={`correction-item correction-${correction.type}`}>
                <div className="correction-header">
                  <span className={`correction-type-badge badge-${correction.type}`}>
                    {correction.type}
                  </span>
                </div>
                <div className="correction-content">
                  {correction.original && (
                    <div className="correction-original">
                      <span className="label">You said:</span>
                      <span className="text strikethrough">{correction.original}</span>
                    </div>
                  )}
                  {correction.corrected && (
                    <div className="correction-corrected">
                      <span className="label">Better:</span>
                      <span className="text">{correction.corrected}</span>
                    </div>
                  )}
                  {correction.explanation && (
                    <p className="correction-explanation muted small">
                      {correction.explanation}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suggestions for improvement */}
      {suggestions.length > 0 && (
        <div className="feedback-suggestions">
          <h5>Focus Areas</h5>
          <ul className="suggestions-list">
            {suggestions.map((suggestion, index) => (
              <li key={index}>{suggestion}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Encouragement */}
      {encouragement && (
        <div className="feedback-encouragement">
          <p>{encouragement}</p>
        </div>
      )}
    </div>
  )
}

export default FeedbackReport
