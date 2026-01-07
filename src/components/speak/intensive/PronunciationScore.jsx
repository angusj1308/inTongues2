import React from 'react'

/**
 * Displays pronunciation assessment results with phoneme-level feedback
 */
export function PronunciationScore({ result, referenceText, language }) {
  if (!result) return null

  const {
    pronunciationScore = 0,
    accuracyScore = 0,
    fluencyScore = 0,
    completenessScore = 0,
    words = [],
    accentAnalysis = null
  } = result

  // Overall score color
  const getScoreColor = (score) => {
    if (score >= 80) return 'score-excellent'
    if (score >= 60) return 'score-good'
    if (score >= 40) return 'score-fair'
    return 'score-needs-work'
  }

  // Word status icon
  const getWordStatus = (word) => {
    if (!word.errorType || word.errorType === 'None') {
      if (word.accuracyScore >= 80) return 'correct'
      if (word.accuracyScore >= 60) return 'close'
      return 'needs-work'
    }
    return 'error'
  }

  return (
    <div className="pronunciation-score">
      {/* Overall scores */}
      <div className="score-overview">
        <div className={`score-main ${getScoreColor(pronunciationScore)}`}>
          <span className="score-value">{Math.round(pronunciationScore)}</span>
          <span className="score-label">Overall</span>
        </div>

        <div className="score-breakdown">
          <div className="score-item">
            <span className="score-item-label">Accuracy</span>
            <div className="score-bar">
              <div
                className="score-bar-fill"
                style={{ width: `${accuracyScore}%` }}
              />
            </div>
            <span className="score-item-value">{Math.round(accuracyScore)}</span>
          </div>

          <div className="score-item">
            <span className="score-item-label">Fluency</span>
            <div className="score-bar">
              <div
                className="score-bar-fill"
                style={{ width: `${fluencyScore}%` }}
              />
            </div>
            <span className="score-item-value">{Math.round(fluencyScore)}</span>
          </div>

          <div className="score-item">
            <span className="score-item-label">Completeness</span>
            <div className="score-bar">
              <div
                className="score-bar-fill"
                style={{ width: `${completenessScore}%` }}
              />
            </div>
            <span className="score-item-value">{Math.round(completenessScore)}</span>
          </div>
        </div>
      </div>

      {/* Accent Analysis - shows what the AI heard and main issues */}
      {accentAnalysis && (
        <div className="accent-analysis">
          <h5>Accent Feedback</h5>
          <p className="accent-analysis-text">{accentAnalysis}</p>
        </div>
      )}

      {/* Word-by-word analysis */}
      {words.length > 0 && (
        <div className="word-analysis">
          <h5>Word Analysis</h5>
          <div className="word-list">
            {words.map((word, index) => (
              <div
                key={index}
                className={`word-item ${getWordStatus(word)}`}
                title={word.issue || (word.spoken && word.spoken !== word.word ? `Heard: "${word.spoken}"` : `Score: ${Math.round(word.accuracyScore || 0)}`)}
              >
                <span className="word-text">{word.word}</span>
                <span className="word-score">{Math.round(word.accuracyScore || 0)}</span>
                {word.errorType && word.errorType !== 'None' && (
                  <span className="word-error-type">{word.errorType}</span>
                )}
                {word.issue && (
                  <span className="word-issue">{word.issue}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Phoneme-level feedback */}
      {words.some(w => w.phonemes && w.phonemes.length > 0) && (
        <div className="phoneme-feedback">
          <h5>Pronunciation Tips</h5>
          <div className="phoneme-tips">
            {words
              .filter(w => w.phonemes && w.phonemes.some(p => p.accuracyScore < 70))
              .slice(0, 3)
              .map((word, wordIndex) => (
                <div key={wordIndex} className="phoneme-tip-item">
                  <span className="tip-word">{word.word}</span>
                  <div className="tip-phonemes">
                    {word.phonemes
                      .filter(p => p.accuracyScore < 70)
                      .map((phoneme, pIndex) => (
                        <span key={pIndex} className="tip-phoneme">
                          <span className="phoneme-symbol">/{phoneme.phoneme}/</span>
                          <span className="phoneme-tip">
                            {getArticulatoryTip(phoneme.phoneme, language)}
                          </span>
                        </span>
                      ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Encouragement */}
      <div className="score-encouragement">
        {pronunciationScore >= 80 ? (
          <p>Excellent work! Your pronunciation is very clear.</p>
        ) : pronunciationScore >= 60 ? (
          <p>Good effort! Focus on the highlighted words to improve further.</p>
        ) : pronunciationScore >= 40 ? (
          <p>Keep practicing! Pay attention to the phonemes marked for improvement.</p>
        ) : (
          <p>Listen to the original again and try to match the sounds more closely.</p>
        )}
      </div>
    </div>
  )
}

/**
 * Get articulatory tip for a phoneme
 */
function getArticulatoryTip(phoneme, language) {
  const tips = {
    // Spanish
    'ɾ': 'Quick tongue tap against the ridge behind your teeth',
    'r': 'Let your tongue vibrate against the roof of your mouth',
    'x': 'Push air through the back of your throat',
    'ʝ': 'Like "y" in "yes" but with more friction',
    'β': 'Soft "b" - lips close but don\'t touch completely',
    'ð': 'Soft "d" - tongue between teeth, like "th" in "this"',
    'ɣ': 'Soft "g" - back of tongue raised but not touching',

    // French
    'ʁ': 'Constrict the back of your throat - uvular R',
    'y': 'Say "ee" while rounding your lips like "oo"',
    'ø': 'Say "ay" but round your lips',
    'œ': 'Like "uh" but with rounded lips',
    'ɑ̃': 'Nasal "ah" - let air through your nose',
    'ɛ̃': 'Nasal "eh" - air through nose',
    'ɔ̃': 'Nasal "oh" - air through nose',

    // Italian
    'ʎ': 'Press tongue flat against hard palate for "gl" sound',
    'ɲ': 'Flatten tongue against palate for "gn" sound',
    'ts': 'Quick "t" followed by "s"',
    'dz': 'Quick "d" followed by "z"',
    'tʃ': 'Like "ch" in "church"',
    'dʒ': 'Like "j" in "judge"',

    // General
    'ə': 'Relax your mouth - neutral vowel sound',
    'ɪ': 'Short "i" - tongue relaxed',
    'ʊ': 'Short "oo" - lips loosely rounded',
    'æ': 'Open "a" - mouth wide, tongue low',
    'ŋ': 'Back of tongue against soft palate - "ng" sound'
  }

  return tips[phoneme] || 'Focus on matching the original sound'
}

export default PronunciationScore
