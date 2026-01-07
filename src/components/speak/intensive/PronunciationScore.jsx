import React from 'react'

/**
 * Displays pronunciation assessment results with phonetic dimension breakdown
 * Based on applied linguistics research for L2 pronunciation assessment
 */
export function PronunciationScore({ result, referenceText, language }) {
  if (!result) return null

  const {
    pronunciationScore = 0,
    dimensionScores = null,
    accentAnalysis = null,
    majorIssues = [],
    words = [],
    articulatoryTips = [],
    // Legacy fields for backwards compatibility
    accuracyScore,
    fluencyScore,
    completenessScore
  } = result

  // Calculate dimension percentages for display
  const getDimensionPercent = (dim, maxScore) => {
    if (!dim || typeof dim !== 'object') return 0
    const total = Object.entries(dim)
      .filter(([key]) => key !== 'notes')
      .reduce((sum, [, val]) => sum + (typeof val === 'number' ? val : 0), 0)
    return Math.round((total / maxScore) * 100)
  }

  // Overall score color
  const getScoreColor = (score) => {
    if (score >= 80) return 'score-excellent'
    if (score >= 60) return 'score-good'
    if (score >= 40) return 'score-fair'
    return 'score-needs-work'
  }

  // Word status based on score
  const getWordStatus = (word) => {
    const score = word.score || word.accuracyScore || 0
    if (score >= 80) return 'correct'
    if (score >= 60) return 'close'
    if (score >= 40) return 'needs-work'
    return 'error'
  }

  // Check if we have the new dimension-based scoring
  const hasNewFormat = dimensionScores && (
    dimensionScores.segmental ||
    dimensionScores.prosody ||
    dimensionScores.connectedSpeech ||
    dimensionScores.fluency
  )

  return (
    <div className="pronunciation-score">
      {/* Overall score */}
      <div className="score-overview">
        <div className={`score-main ${getScoreColor(pronunciationScore)}`}>
          <span className="score-value">{Math.round(pronunciationScore)}</span>
          <span className="score-label">Overall</span>
        </div>

        {/* Phonetic Dimension Breakdown (new format) */}
        {hasNewFormat ? (
          <div className="score-breakdown dimension-breakdown">
            {/* Segmental (40 points max) */}
            {dimensionScores.segmental && (
              <div className="score-item">
                <span className="score-item-label">Segmental</span>
                <div className="score-bar">
                  <div
                    className="score-bar-fill"
                    style={{ width: `${getDimensionPercent(dimensionScores.segmental, 40)}%` }}
                  />
                </div>
                <span className="score-item-value">
                  {(dimensionScores.segmental.vowels || 0) + (dimensionScores.segmental.consonants || 0)}/40
                </span>
              </div>
            )}

            {/* Prosody (35 points max) */}
            {dimensionScores.prosody && (
              <div className="score-item">
                <span className="score-item-label">Prosody</span>
                <div className="score-bar">
                  <div
                    className="score-bar-fill"
                    style={{ width: `${getDimensionPercent(dimensionScores.prosody, 35)}%` }}
                  />
                </div>
                <span className="score-item-value">
                  {(dimensionScores.prosody.stress || 0) + (dimensionScores.prosody.rhythm || 0) + (dimensionScores.prosody.intonation || 0)}/35
                </span>
              </div>
            )}

            {/* Connected Speech (15 points max) */}
            {dimensionScores.connectedSpeech && (
              <div className="score-item">
                <span className="score-item-label">Connected Speech</span>
                <div className="score-bar">
                  <div
                    className="score-bar-fill"
                    style={{ width: `${getDimensionPercent(dimensionScores.connectedSpeech, 15)}%` }}
                  />
                </div>
                <span className="score-item-value">
                  {(dimensionScores.connectedSpeech.liaison || 0) + (dimensionScores.connectedSpeech.elision || 0)}/15
                </span>
              </div>
            )}

            {/* Fluency (10 points max) */}
            {dimensionScores.fluency && (
              <div className="score-item">
                <span className="score-item-label">Fluency</span>
                <div className="score-bar">
                  <div
                    className="score-bar-fill"
                    style={{ width: `${getDimensionPercent(dimensionScores.fluency, 10)}%` }}
                  />
                </div>
                <span className="score-item-value">
                  {(dimensionScores.fluency.smoothness || 0) + (dimensionScores.fluency.pace || 0)}/10
                </span>
              </div>
            )}
          </div>
        ) : (
          /* Legacy format fallback */
          <div className="score-breakdown">
            <div className="score-item">
              <span className="score-item-label">Accuracy</span>
              <div className="score-bar">
                <div
                  className="score-bar-fill"
                  style={{ width: `${accuracyScore || 0}%` }}
                />
              </div>
              <span className="score-item-value">{Math.round(accuracyScore || 0)}</span>
            </div>

            <div className="score-item">
              <span className="score-item-label">Fluency</span>
              <div className="score-bar">
                <div
                  className="score-bar-fill"
                  style={{ width: `${fluencyScore || 0}%` }}
                />
              </div>
              <span className="score-item-value">{Math.round(fluencyScore || 0)}</span>
            </div>

            <div className="score-item">
              <span className="score-item-label">Completeness</span>
              <div className="score-bar">
                <div
                  className="score-bar-fill"
                  style={{ width: `${completenessScore || 0}%` }}
                />
              </div>
              <span className="score-item-value">{Math.round(completenessScore || 0)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Dimension details (if available) */}
      {hasNewFormat && (
        <div className="dimension-details">
          {dimensionScores.segmental?.notes && (
            <div className="dimension-note segmental">
              <strong>Sounds:</strong> {dimensionScores.segmental.notes}
            </div>
          )}
          {dimensionScores.prosody?.notes && (
            <div className="dimension-note prosody">
              <strong>Rhythm/Stress:</strong> {dimensionScores.prosody.notes}
            </div>
          )}
          {dimensionScores.connectedSpeech?.notes && (
            <div className="dimension-note connected">
              <strong>Linking:</strong> {dimensionScores.connectedSpeech.notes}
            </div>
          )}
        </div>
      )}

      {/* Accent Analysis */}
      {accentAnalysis && (
        <div className="accent-analysis">
          <h5>Accent Analysis</h5>
          <p className="accent-analysis-text">{accentAnalysis}</p>
        </div>
      )}

      {/* Major Issues */}
      {majorIssues && majorIssues.length > 0 && (
        <div className="major-issues">
          <h5>Key Issues to Address</h5>
          <ul className="issues-list">
            {majorIssues.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Word-by-word analysis */}
      {words.length > 0 && (
        <div className="word-analysis">
          <h5>Word Analysis</h5>
          <div className="word-list">
            {words.map((word, index) => {
              const wordText = word.word || word.text || ''
              const score = word.score || word.accuracyScore || 0
              const issues = word.issues || (word.issue ? [word.issue] : [])
              const ipaTarget = word.ipa_target
              const ipaHeard = word.ipa_heard

              return (
                <div
                  key={index}
                  className={`word-item ${getWordStatus(word)}`}
                  title={ipaHeard ? `Heard: ${ipaHeard}` : `Score: ${Math.round(score)}`}
                >
                  <span className="word-text">{wordText}</span>
                  {ipaTarget && ipaHeard && ipaTarget !== ipaHeard && (
                    <span className="word-ipa">
                      <span className="ipa-expected">/{ipaTarget}/</span>
                      <span className="ipa-arrow">→</span>
                      <span className="ipa-heard">/{ipaHeard}/</span>
                    </span>
                  )}
                  <span className="word-score">{Math.round(score)}</span>
                  {issues.length > 0 && (
                    <span className="word-issue">{issues[0]}</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Articulatory Tips */}
      {articulatoryTips && articulatoryTips.length > 0 && (
        <div className="phoneme-feedback">
          <h5>How to Improve</h5>
          <div className="phoneme-tips">
            {articulatoryTips.slice(0, 4).map((tip, index) => (
              <div key={index} className="phoneme-tip-item">
                <span className="tip-phoneme-symbol">/{tip.phoneme}/</span>
                {tip.issue && <span className="tip-issue">{tip.issue}</span>}
                <span className="tip-instruction">{tip.tip}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Score interpretation */}
      <div className="score-encouragement">
        {pronunciationScore >= 90 ? (
          <p>Near-native pronunciation! Excellent control of {language} phonemes and prosody.</p>
        ) : pronunciationScore >= 80 ? (
          <p>Excellent! Minor accent detectable but highly intelligible to native speakers.</p>
        ) : pronunciationScore >= 70 ? (
          <p>Good work! Clear foreign accent but fully comprehensible. Focus on the issues noted above.</p>
        ) : pronunciationScore >= 60 ? (
          <p>Developing well. Work on reducing L1 transfer in the highlighted areas.</p>
        ) : pronunciationScore >= 50 ? (
          <p>Keep practicing! Focus on matching the target sounds more closely.</p>
        ) : (
          <p>Listen carefully to the native audio and try to match each sound. Small improvements add up!</p>
        )}
      </div>
    </div>
  )
}

export default PronunciationScore
