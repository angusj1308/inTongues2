import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IntensiveModeHub } from './intensive/IntensiveModeHub'
import { SpeakingPracticeHub } from './speakingPractice/SpeakingPracticeHub'
import { VoiceRecordHub } from './voiceRecord/VoiceRecordHub'

/**
 * Main hub for the Speaking tab - allows selection between different speaking practice modes
 */
export function SpeakHub({ activeLanguage, nativeLanguage }) {
  const navigate = useNavigate()
  const [activeMode, setActiveMode] = useState(null) // null | 'pronunciation' | 'speakingPractice' | 'voiceRecord' | 'conversation'

  // Conversation mode - placeholder linking to tutor
  if (activeMode === 'conversation') {
    return (
      <div className="speak-hub">
        <div className="speak-hub-nav">
          <button className="btn-back" onClick={() => setActiveMode(null)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back to modes
          </button>
        </div>

        <div className="speak-conversation-placeholder">
          <div className="placeholder-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
          </div>
          <h3>Voice Conversations Coming Soon</h3>
          <p className="muted">
            Real-time voice conversations with your AI tutor are under development.
            In the meantime, you can practice text-based conversations in the Tutor tab.
          </p>
          <button
            className="btn btn-primary"
            onClick={() => navigate('/dashboard', { state: { initialTab: 'tutor' } })}
          >
            Go to Tutor Chat
          </button>
        </div>
      </div>
    )
  }

  // Voice Record mode - full page view
  if (activeMode === 'voiceRecord') {
    return (
      <div className="speak-hub">
        <div className="speak-hub-nav">
          <button className="btn-back" onClick={() => setActiveMode(null)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back to modes
          </button>
          <h2>Voice Record</h2>
        </div>
        <VoiceRecordHub
          activeLanguage={activeLanguage}
          nativeLanguage={nativeLanguage}
          onBack={() => setActiveMode(null)}
        />
      </div>
    )
  }

  // Mode selection view (with overlays for pronunciation and speaking practice)
  return (
    <div className="speak-hub">
      <div className="speak-hub-header">
        <h2>Speaking Practice</h2>
        <p className="muted">Choose how you want to practice speaking {activeLanguage}</p>
      </div>

      <div className="speak-mode-grid">
        {/* Pronunciation Practice Card (was Intensive) */}
        <button
          className="speak-mode-card"
          onClick={() => setActiveMode('pronunciation')}
        >
          <div className="speak-mode-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
              <path d="M4 8l2 2-2 2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M20 8l-2 2 2 2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h3>Pronunciation Practice</h3>
          <p className="speak-mode-subtitle">Shadowing</p>
          <p className="speak-mode-description">
            Listen to {activeLanguage} audio and repeat. Get phoneme-level feedback on your accent and pronunciation.
          </p>
          <div className="speak-mode-focus">
            <span className="focus-tag">Pronunciation</span>
            <span className="focus-tag">Accent</span>
          </div>
        </button>

        {/* Speaking Practice Card (NEW - interpretation) */}
        <button
          className="speak-mode-card"
          onClick={() => setActiveMode('speakingPractice')}
        >
          <div className="speak-mode-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
              <path d="M2 5h4M2 9h4M2 13h4" strokeLinecap="round" />
            </svg>
          </div>
          <h3>Speaking Practice</h3>
          <p className="speak-mode-subtitle">Interpretation</p>
          <p className="speak-mode-description">
            See {nativeLanguage} text and speak the {activeLanguage} translation. Get feedback on accuracy and vocabulary.
          </p>
          <div className="speak-mode-focus">
            <span className="focus-tag">Translation</span>
            <span className="focus-tag">Vocabulary</span>
          </div>
        </button>

        {/* Voice Record Mode Card */}
        <button
          className="speak-mode-card"
          onClick={() => setActiveMode('voiceRecord')}
        >
          <div className="speak-mode-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="3" fill="currentColor" />
              <path d="M12 2v2" />
              <path d="M12 20v2" />
              <path d="M2 12h2" />
              <path d="M20 12h2" />
            </svg>
          </div>
          <h3>Voice Record</h3>
          <p className="speak-mode-subtitle">Long-form Production</p>
          <p className="speak-mode-description">
            Read aloud from library content, your own writing, or speak freely. Get comprehensive feedback.
          </p>
          <div className="speak-mode-focus">
            <span className="focus-tag">Fluency</span>
            <span className="focus-tag">Expression</span>
          </div>
        </button>

        {/* Conversation Mode Card */}
        <button
          className="speak-mode-card speak-mode-card-coming-soon"
          onClick={() => setActiveMode('conversation')}
        >
          <div className="speak-mode-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              <circle cx="9" cy="10" r="1" fill="currentColor" />
              <circle cx="12" cy="10" r="1" fill="currentColor" />
              <circle cx="15" cy="10" r="1" fill="currentColor" />
            </svg>
          </div>
          <h3>Conversation</h3>
          <p className="speak-mode-subtitle">Voice Chat with Tutor</p>
          <p className="speak-mode-description">
            Have real conversations with your AI tutor using voice. Practice spontaneous speaking.
          </p>
          <div className="speak-mode-focus">
            <span className="focus-tag">Conversation</span>
            <span className="focus-tag">Real-time</span>
          </div>
          <span className="coming-soon-badge">Coming Soon</span>
        </button>
      </div>

      {/* Quick stats or recent activity could go here */}
      <div className="speak-hub-footer">
        <p className="muted small">
          Tip: Start with Pronunciation Practice to build accuracy, then Speaking Practice to build translation speed.
        </p>
      </div>

      {/* Pronunciation Practice Overlay (was Intensive) */}
      {activeMode === 'pronunciation' && (
        <div className="intensive-overlay" onClick={() => setActiveMode(null)}>
          <div className="intensive-overlay-content" onClick={e => e.stopPropagation()}>
            <div className="intensive-overlay-header">
              <h3>Select Practice Material</h3>
              <button className="intensive-overlay-close" onClick={() => setActiveMode(null)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <IntensiveModeHub
              activeLanguage={activeLanguage}
              nativeLanguage={nativeLanguage}
              onBack={() => setActiveMode(null)}
            />
          </div>
        </div>
      )}

      {/* Speaking Practice Overlay */}
      {activeMode === 'speakingPractice' && (
        <div className="intensive-overlay" onClick={() => setActiveMode(null)}>
          <div className="intensive-overlay-content" onClick={e => e.stopPropagation()}>
            <div className="intensive-overlay-header">
              <h3>Select Practice Material</h3>
              <button className="intensive-overlay-close" onClick={() => setActiveMode(null)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <SpeakingPracticeHub
              activeLanguage={activeLanguage}
              nativeLanguage={nativeLanguage}
              onBack={() => setActiveMode(null)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default SpeakHub
