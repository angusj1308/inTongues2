import React, { useState, useEffect } from 'react'
import { useAuth } from '../../../contexts/AuthContext'
import { collection, getDocs, doc, getDoc, query, orderBy } from 'firebase/firestore'
import { db } from '../../../firebase'
import { AudioRecorder } from '../shared'
import { FeedbackReport } from './FeedbackReport'

/**
 * Reading session - record yourself reading content aloud and get feedback
 */
export function ReadingSession({ content, sourceType, activeLanguage, nativeLanguage, onBack }) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [userRecording, setUserRecording] = useState(null)
  const [feedbackResult, setFeedbackResult] = useState(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState(null)

  // Load content text
  useEffect(() => {
    const loadContent = async () => {
      setLoading(true)
      try {
        if (content.type === 'story') {
          // Fetch story pages
          const pagesRef = collection(db, 'users', user.uid, 'stories', content.id, 'pages')
          const pagesQuery = query(pagesRef, orderBy('index'))
          const pagesSnap = await getDocs(pagesQuery)

          const fullText = pagesSnap.docs
            .map(doc => doc.data().content || doc.data().text || '')
            .join('\n\n')

          setText(fullText)
        } else if (content.type === 'youtube') {
          // Fetch transcript
          const transcriptsRef = collection(db, 'users', user.uid, 'youtubeVideos', content.id, 'transcripts')
          const transcriptsSnap = await getDocs(transcriptsRef)

          if (!transcriptsSnap.empty) {
            const transcriptData = transcriptsSnap.docs[0].data()
            const segments = transcriptData.sentenceSegments || transcriptData.segments || []
            setText(segments.map(s => s.text).join(' '))
          }
        } else if (content.type === 'writing') {
          // Get writing content directly
          const writingDoc = await getDoc(doc(db, 'users', user.uid, 'writing', content.id))
          if (writingDoc.exists()) {
            setText(writingDoc.data().content || writingDoc.data().text || '')
          }
        }
      } catch (err) {
        console.error('Error loading content:', err)
        setError('Failed to load content')
      } finally {
        setLoading(false)
      }
    }

    if (content && user?.uid) {
      loadContent()
    }
  }, [content, user?.uid])

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
            referenceText: text,
            language: activeLanguage,
            nativeLanguage,
            type: 'reading'
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

  if (loading) {
    return (
      <div className="reading-session loading">
        <p className="muted">Loading content...</p>
      </div>
    )
  }

  // Show feedback report if we have results
  if (feedbackResult) {
    return (
      <div className="reading-session">
        <div className="session-header">
          <button className="btn-back" onClick={onBack}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <h3>{content.title}</h3>
        </div>

        <FeedbackReport
          result={feedbackResult}
          referenceText={text}
          recordingUrl={userRecording?.url}
          language={activeLanguage}
        />

        <div className="session-actions">
          <button className="btn btn-secondary" onClick={resetRecording}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 4v6h6" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
            Try Again
          </button>
          <button className="btn btn-primary" onClick={onBack}>
            Done
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="reading-session">
      <div className="session-header">
        <button className="btn-back" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <h3>{content.title}</h3>
      </div>

      {/* Reading prompt */}
      <div className="reading-prompt">
        <div className="reading-prompt-header">
          <span className="muted">Read aloud:</span>
        </div>
        <div className="reading-prompt-text">
          <p>{text}</p>
        </div>
      </div>

      {/* Recording section */}
      {!userRecording ? (
        <div className="recording-section">
          <p className="recording-instruction muted">
            When ready, press record and read the text above aloud:
          </p>
          <AudioRecorder
            onRecordingComplete={handleRecordingComplete}
            maxDuration={300}
            showPlayback={false}
            autoSubmit={true}
          />
        </div>
      ) : isAnalyzing ? (
        <div className="analysis-loading">
          <div className="spinner"></div>
          <p className="muted">Analyzing your recording...</p>
          <p className="muted small">This may take a moment</p>
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

export default ReadingSession
