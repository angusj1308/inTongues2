import React, { useState } from 'react'
import { SourceSelector } from './SourceSelector'
import { ReadingSession } from './ReadingSession'
import { SpontaneousSession } from './SpontaneousSession'

/**
 * Voice Record Mode Hub - Select source type for long-form speaking practice
 */
export function VoiceRecordHub({ activeLanguage, nativeLanguage, onBack }) {
  const [sourceType, setSourceType] = useState(null) // null | 'library' | 'writing' | 'spontaneous'
  const [selectedContent, setSelectedContent] = useState(null)
  const [activeSession, setActiveSession] = useState(null)

  // Source selection view
  if (!sourceType) {
    return (
      <div className="voice-record-hub">
        <div className="voice-record-intro">
          <p className="muted">
            Choose what you'd like to practice reading or talking about.
            You'll receive detailed feedback on correctness, accuracy, and fluency.
          </p>
        </div>

        <div className="source-type-grid">
          {/* Read from Library */}
          <button
            className="source-type-card"
            onClick={() => setSourceType('library')}
          >
            <div className="source-type-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                <line x1="8" y1="7" x2="16" y2="7" />
                <line x1="8" y1="11" x2="16" y2="11" />
                <line x1="8" y1="15" x2="12" y2="15" />
              </svg>
            </div>
            <h4>Read from Library</h4>
            <p className="source-type-description">
              Practice reading stories, articles, or transcripts from your library aloud.
            </p>
          </button>

          {/* Read Your Writing */}
          <button
            className="source-type-card"
            onClick={() => setSourceType('writing')}
          >
            <div className="source-type-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </div>
            <h4>Read Your Writing</h4>
            <p className="source-type-description">
              Practice reading your own compositions from the Write tab.
            </p>
          </button>

          {/* Speak Freely */}
          <button
            className="source-type-card source-type-card-full"
            onClick={() => setSourceType('spontaneous')}
          >
            <div className="source-type-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </div>
            <h4>Speak Freely</h4>
            <p className="source-type-description">
              Practice spontaneous speech on any topic. Great for building fluency and thinking in {activeLanguage}.
            </p>
          </button>
        </div>
      </div>
    )
  }

  // Spontaneous mode - go directly to session
  if (sourceType === 'spontaneous') {
    return (
      <SpontaneousSession
        activeLanguage={activeLanguage}
        nativeLanguage={nativeLanguage}
        onBack={() => setSourceType(null)}
      />
    )
  }

  // Content selection for library/writing
  if (!selectedContent) {
    return (
      <div className="voice-record-hub">
        <div className="voice-record-nav">
          <button className="btn-back" onClick={() => setSourceType(null)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back to source types
          </button>
        </div>
        <SourceSelector
          sourceType={sourceType}
          activeLanguage={activeLanguage}
          onSelect={(content) => setSelectedContent(content)}
        />
      </div>
    )
  }

  // Active reading session
  return (
    <ReadingSession
      content={selectedContent}
      sourceType={sourceType}
      activeLanguage={activeLanguage}
      nativeLanguage={nativeLanguage}
      onBack={() => setSelectedContent(null)}
    />
  )
}

export default VoiceRecordHub
