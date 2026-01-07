import React from 'react'

/**
 * Displays pronunciation assessment results
 * Optimized for GPT-4o audio comparison with specific articulatory feedback
 */
export function PronunciationScore({ result, referenceText, language }) {
  if (!result) return null

  const {
    pronunciationScore = 0,
    errors = [],
    prosodyNotes = '',
    summary = '',
    articulatoryTips = [],
    majorIssues = [],
    // Legacy fields
    dimensionScores,
    words = []
  } = result

  // Overall score color
  const getScoreColor = (score) => {
    if (score >= 80) return 'score-excellent'
    if (score >= 60) return 'score-good'
    if (score >= 40) return 'score-fair'
    return 'score-needs-work'
  }

  // Check if we have the new GPT-4o format (errors array with fixes)
  const hasGptFormat = errors.length > 0 && errors[0]?.fix

  return (
    <div className="pronunciation-score">
      {/* Overall score */}
      <div className="score-overview">
        <div className={`score-main ${getScoreColor(pronunciationScore)}`}>
          <span className="score-value">{Math.round(pronunciationScore)}</span>
          <span className="score-label">Overall</span>
        </div>
      </div>

      {/* Summary - brutal one-liner */}
      {summary && (
        <div className="pronunciation-summary">
          <p>{summary}</p>
        </div>
      )}

      {/* GPT-4o Error-by-Error Feedback */}
      {hasGptFormat && errors.length > 0 && (
        <div className="pronunciation-errors">
          <h5>Pronunciation Errors</h5>
          {errors.map((error, index) => (
            <div key={index} className="error-item">
              <div className="error-header">
                <span className="error-word">"{error.word}"</span>
                {error.sound && <span className="error-sound">/{error.sound}/</span>}
              </div>
              <div className="error-issue">
                <strong>Problem:</strong> {error.issue}
              </div>
              <div className="error-fix">
                <strong>Fix:</strong> {error.fix}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Prosody Notes */}
      {prosodyNotes && (
        <div className="prosody-notes">
          <h5>Rhythm & Stress</h5>
          <p>{prosodyNotes}</p>
        </div>
      )}

      {/* Legacy: Articulatory Tips (from Azure format) */}
      {!hasGptFormat && articulatoryTips && articulatoryTips.length > 0 && (
        <div className="phoneme-feedback">
          <h5>How to Improve</h5>
          <div className="phoneme-tips">
            {articulatoryTips.map((tip, index) => (
              <div key={index} className="phoneme-tip-item">
                {tip.phoneme && <span className="tip-phoneme-symbol">/{tip.phoneme}/</span>}
                {tip.issue && <span className="tip-issue">{tip.issue}</span>}
                <span className="tip-instruction">{tip.tip}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legacy: Major Issues list */}
      {!hasGptFormat && majorIssues && majorIssues.length > 0 && (
        <div className="major-issues">
          <h5>Key Issues</h5>
          <ul className="issues-list">
            {majorIssues.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Score interpretation - brutal, no fluff */}
      <div className="score-interpretation">
        {pronunciationScore >= 90 ? (
          <p className="interp-excellent">Near-native. Minor refinements only.</p>
        ) : pronunciationScore >= 75 ? (
          <p className="interp-good">Clearly foreign but intelligible. Fix the errors above.</p>
        ) : pronunciationScore >= 50 ? (
          <p className="interp-fair">Significant accent. Focus on the specific fixes listed.</p>
        ) : (
          <p className="interp-poor">Major errors. Work through each fix systematically.</p>
        )}
      </div>
    </div>
  )
}

export default PronunciationScore
