import React, { useState } from 'react'
import { AudioRecorder } from '../shared'
import { FeedbackReport } from './FeedbackReport'

// Topic suggestions for spontaneous practice
const TOPIC_SUGGESTIONS = [
  'Describe your daily routine',
  'Talk about your favorite hobby',
  'Describe a recent trip or vacation',
  'Talk about your family',
  'Describe your hometown',
  'What did you do last weekend?',
  'Talk about your favorite food',
  'Describe your dream job',
  'What are your plans for the future?',
  'Describe a memorable experience',
  'Talk about a book or movie you enjoyed',
  'Describe your ideal day'
]

/**
 * Spontaneous speaking session - no prompt, free speaking with feedback
 */
export function SpontaneousSession({ activeLanguage, nativeLanguage, onBack }) {
  const [topic, setTopic] = useState(null)
  const [userRecording, setUserRecording] = useState(null)
  const [feedbackResult, setFeedbackResult] = useState(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState(null)

  // Get random topic
  const getRandomTopic = () => {
    const randomIndex = Math.floor(Math.random() * TOPIC_SUGGESTIONS.length)
    setTopic(TOPIC_SUGGESTIONS[randomIndex])
  }

  // Handle recording completion
  const handleRecordingComplete = async (blob, url) => {
    setUserRecording({ blob, url })
    setIsAnalyzing(true)
    setError(null)

    try {
      // Convert blob to base64
      const reader = new FileReader()
      reader.readAsDataURL(blob)
      reader.onloadend = async () => {
        const base64Audio = reader.result.split(',')[1]

        // Send to speech analysis endpoint
        const response = await fetch('/api/speech/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audioBase64: base64Audio,
            language: activeLanguage,
            nativeLanguage,
            type: 'spontaneous',
            topic
          })
        })

        if (!response.ok) {
          throw new Error('Analysis failed')
        }

        const result = await response.json()
        setFeedbackResult(result)
        setIsAnalyzing(false)
      }
    } catch (err) {
      console.error('Analysis error:', err)
      setError('Could not analyze your recording. Please try again.')
      setIsAnalyzing(false)
    }
  }

  const resetRecording = () => {
    setUserRecording(null)
    setFeedbackResult(null)
    setError(null)
  }

  const startOver = () => {
    setTopic(null)
    resetRecording()
  }

  // Show feedback report if we have results
  if (feedbackResult) {
    return (
      <div className="spontaneous-session">
        <div className="session-header">
          <button className="btn-back" onClick={onBack}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <h3>Free Speaking Practice</h3>
        </div>

        {topic && (
          <div className="topic-display">
            <span className="muted">Topic:</span>
            <span className="topic-text">{topic}</span>
          </div>
        )}

        <FeedbackReport
          result={feedbackResult}
          recordingUrl={userRecording?.url}
          language={activeLanguage}
          isSpontaneous={true}
        />

        <div className="session-actions">
          <button className="btn btn-secondary" onClick={startOver}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 4v6h6" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
            Start Over
          </button>
          <button className="btn btn-primary" onClick={onBack}>
            Done
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="spontaneous-session">
      <div className="session-header">
        <button className="btn-back" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <h3>Free Speaking Practice</h3>
      </div>

      <div className="spontaneous-intro">
        <p className="muted">
          Speak freely in {activeLanguage} about any topic.
          You'll receive feedback on your fluency, accuracy, and overall speaking.
        </p>
      </div>

      {/* Topic suggestion section */}
      <div className="topic-section">
        <div className="topic-header">
          <h4>Need a topic idea?</h4>
          <button className="btn btn-secondary btn-sm" onClick={getRandomTopic}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            Random Topic
          </button>
        </div>

        {topic ? (
          <div className="topic-display active">
            <span className="topic-text">{topic}</span>
            <button className="btn-link" onClick={() => setTopic(null)}>
              Clear
            </button>
          </div>
        ) : (
          <div className="topic-suggestions">
            {TOPIC_SUGGESTIONS.slice(0, 4).map((suggestion, index) => (
              <button
                key={index}
                className="topic-suggestion"
                onClick={() => setTopic(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Recording section */}
      {!userRecording ? (
        <div className="recording-section">
          <p className="recording-instruction muted">
            {topic
              ? `Try to speak for at least 30 seconds about: "${topic}"`
              : 'When ready, press record and start speaking about anything:'
            }
          </p>
          <AudioRecorder
            onRecordingComplete={handleRecordingComplete}
            maxDuration={300}
            showPlayback={false}
            autoSubmit={true}
          />
          <p className="recording-tip muted small">
            Tip: Try to speak for at least 30 seconds to get meaningful feedback.
          </p>
        </div>
      ) : isAnalyzing ? (
        <div className="analysis-loading">
          <div className="spinner"></div>
          <p className="muted">Analyzing your recording...</p>
          <p className="muted small">Transcribing and evaluating your speech</p>
        </div>
      ) : error ? (
        <div className="analysis-error">
          <p>{error}</p>
          <button className="btn btn-secondary" onClick={resetRecording}>
            Try Again
          </button>
        </div>
      ) : null}
    </div>
  )
}

export default SpontaneousSession
