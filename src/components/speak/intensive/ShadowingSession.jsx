import React, { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from '../../../firebase'
import { AudioRecorder, PlaybackComparison } from '../shared'
import { PronunciationScore } from './PronunciationScore'

/**
 * Active shadowing practice session
 * Plays segments, records user, provides pronunciation feedback
 */
export function ShadowingSession({ content, activeLanguage, nativeLanguage, onBack }) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [segments, setSegments] = useState([])
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0)
  const [userRecording, setUserRecording] = useState(null)
  const [assessmentResult, setAssessmentResult] = useState(null)
  const [isAssessing, setIsAssessing] = useState(false)
  const [error, setError] = useState(null)

  const originalAudioRef = useRef(null)

  // Load segments for the content
  useEffect(() => {
    const loadSegments = async () => {
      setLoading(true)
      try {
        if (content.type === 'story') {
          // Fetch pages for story
          const pagesRef = collection(db, 'users', user.uid, 'stories', content.id, 'pages')
          const pagesQuery = query(pagesRef, orderBy('index'))
          const pagesSnap = await getDocs(pagesQuery)

          // Convert pages to segments (sentences)
          const allSegments = []
          pagesSnap.docs.forEach((doc, pageIndex) => {
            const pageData = doc.data()
            // Split into sentences
            const sentences = (pageData.content || pageData.text || '')
              .split(/(?<=[.!?])\s+/)
              .filter(s => s.trim().length > 0)

            sentences.forEach((sentence, sentenceIndex) => {
              allSegments.push({
                id: `${doc.id}-${sentenceIndex}`,
                text: sentence.trim(),
                pageIndex,
                sentenceIndex
              })
            })
          })

          setSegments(allSegments)
        } else if (content.type === 'youtube') {
          // Fetch transcript segments
          const transcriptsRef = collection(db, 'users', user.uid, 'youtubeVideos', content.id, 'transcripts')
          const transcriptsSnap = await getDocs(transcriptsRef)

          if (!transcriptsSnap.empty) {
            const transcriptDoc = transcriptsSnap.docs[0]
            const transcriptData = transcriptDoc.data()
            const sentenceSegments = transcriptData.sentenceSegments || transcriptData.segments || []

            setSegments(sentenceSegments.map((seg, index) => ({
              id: `${content.id}-${index}`,
              text: seg.text,
              start: seg.start,
              end: seg.end,
              index
            })))
          }
        }
      } catch (err) {
        console.error('Error loading segments:', err)
        setError('Failed to load content segments')
      } finally {
        setLoading(false)
      }
    }

    if (content && user?.uid) {
      loadSegments()
    }
  }, [content, user?.uid])

  const currentSegment = segments[currentSegmentIndex]

  // Play the original segment audio
  const playOriginalSegment = () => {
    if (!originalAudioRef.current || !content.fullAudioUrl) return

    const audio = originalAudioRef.current
    audio.src = content.fullAudioUrl

    if (currentSegment?.start !== undefined) {
      audio.currentTime = currentSegment.start
      audio.play()

      // Stop at segment end
      const checkEnd = () => {
        if (audio.currentTime >= currentSegment.end) {
          audio.pause()
          audio.removeEventListener('timeupdate', checkEnd)
        }
      }
      audio.addEventListener('timeupdate', checkEnd)
    } else {
      // For stories without timestamps, just play (user will need to stop manually)
      audio.play()
    }
  }

  // Handle user recording completion
  const handleRecordingComplete = async (blob, url) => {
    setUserRecording({ blob, url })

    // Submit for assessment
    setIsAssessing(true)
    setError(null)

    try {
      // Convert blob to base64
      const reader = new FileReader()
      reader.readAsDataURL(blob)
      reader.onloadend = async () => {
        const base64Audio = reader.result.split(',')[1]

        // Send to pronunciation assessment endpoint
        const response = await fetch('/api/speech/assess-pronunciation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audioBase64: base64Audio,
            referenceText: currentSegment.text,
            language: activeLanguage
          })
        })

        if (!response.ok) {
          throw new Error('Assessment failed')
        }

        const result = await response.json()
        setAssessmentResult(result)
        setIsAssessing(false)
      }
    } catch (err) {
      console.error('Assessment error:', err)
      setError('Could not assess pronunciation. Please try again.')
      setIsAssessing(false)
    }
  }

  // Navigation
  const goToNextSegment = () => {
    if (currentSegmentIndex < segments.length - 1) {
      setCurrentSegmentIndex(prev => prev + 1)
      setUserRecording(null)
      setAssessmentResult(null)
    }
  }

  const goToPreviousSegment = () => {
    if (currentSegmentIndex > 0) {
      setCurrentSegmentIndex(prev => prev - 1)
      setUserRecording(null)
      setAssessmentResult(null)
    }
  }

  const retryRecording = () => {
    setUserRecording(null)
    setAssessmentResult(null)
  }

  if (loading) {
    return (
      <div className="shadowing-session loading">
        <p className="muted">Loading content segments...</p>
      </div>
    )
  }

  if (segments.length === 0) {
    return (
      <div className="shadowing-session empty">
        <p className="muted">No segments found in this content.</p>
        <button className="btn btn-secondary" onClick={onBack}>
          Go Back
        </button>
      </div>
    )
  }

  return (
    <div className="shadowing-session">
      <audio ref={originalAudioRef} />

      {/* Progress indicator */}
      <div className="session-progress">
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${((currentSegmentIndex + 1) / segments.length) * 100}%` }}
          />
        </div>
        <span className="progress-text">
          Segment {currentSegmentIndex + 1} of {segments.length}
        </span>
      </div>

      {/* Current segment text */}
      <div className="segment-display">
        <p className="segment-text">{currentSegment?.text}</p>
      </div>

      {/* Original audio player */}
      <div className="original-audio-section">
        <button className="btn btn-secondary btn-play-original" onClick={playOriginalSegment}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
          Listen to Original
        </button>
      </div>

      {/* Recording section */}
      {!userRecording ? (
        <div className="recording-section">
          <p className="recording-instruction muted">
            Listen to the original, then record yourself saying the same phrase:
          </p>
          <AudioRecorder
            onRecordingComplete={handleRecordingComplete}
            maxDuration={30}
            showPlayback={false}
            autoSubmit={true}
          />
        </div>
      ) : (
        <>
          {/* Playback comparison */}
          <div className="comparison-section">
            <PlaybackComparison
              originalUrl={content.fullAudioUrl}
              recordingUrl={userRecording.url}
              originalLabel="Original"
              recordingLabel="Your Recording"
            />
          </div>

          {/* Assessment results */}
          {isAssessing ? (
            <div className="assessment-loading">
              <div className="spinner"></div>
              <p className="muted">Analyzing your pronunciation...</p>
            </div>
          ) : assessmentResult ? (
            <PronunciationScore
              result={assessmentResult}
              referenceText={currentSegment?.text}
              language={activeLanguage}
            />
          ) : error ? (
            <div className="assessment-error">
              <p>{error}</p>
            </div>
          ) : null}

          {/* Retry button */}
          <button className="btn btn-secondary" onClick={retryRecording}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 4v6h6" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
            Try Again
          </button>
        </>
      )}

      {/* Navigation */}
      <div className="session-navigation">
        <button
          className="btn btn-secondary"
          onClick={goToPreviousSegment}
          disabled={currentSegmentIndex === 0}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Previous
        </button>

        <button
          className="btn btn-primary"
          onClick={goToNextSegment}
          disabled={currentSegmentIndex === segments.length - 1}
        >
          Next
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Exit session */}
      <div className="session-footer">
        <button className="btn-link" onClick={onBack}>
          End Session
        </button>
      </div>
    </div>
  )
}

export default ShadowingSession
