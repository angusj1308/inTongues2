import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from '../../../firebase'
import { AudioRecorder } from '../shared'
import { PronunciationScore } from './PronunciationScore'

/**
 * Chunk text into smaller segments for pronunciation practice
 * - Min 3 words, max 10 words per chunk
 * - Always ends on punctuation (. , ; : ! ?) when possible
 * - Creates meaningful, complete phrases
 */
const CHUNK_MIN_WORDS = 3
const CHUNK_MAX_WORDS = 10

const chunkTextForPronunciation = (text, start, end) => {
  const words = text.split(/\s+/).filter(w => w.length > 0)

  // If already small enough, return as-is
  if (words.length <= CHUNK_MAX_WORDS) {
    return [{ text: text.trim(), start, end }]
  }

  const chunks = []
  const totalWords = words.length
  const hasTiming = start !== undefined && end !== undefined
  const duration = hasTiming ? end - start : null

  // Check if a word ends with punctuation
  const endsWithPunctuation = (word) => /[.,;:!?]$/.test(word)

  let i = 0
  while (i < totalWords) {
    let chunkEndIndex = i + CHUNK_MIN_WORDS - 1

    // Look for punctuation between min and max
    let foundPunctuation = false
    for (let j = i + CHUNK_MIN_WORDS - 1; j < Math.min(i + CHUNK_MAX_WORDS, totalWords); j++) {
      if (endsWithPunctuation(words[j])) {
        chunkEndIndex = j
        foundPunctuation = true
        break
      }
    }

    // If no punctuation found, use max words or remaining
    if (!foundPunctuation) {
      chunkEndIndex = Math.min(i + CHUNK_MAX_WORDS - 1, totalWords - 1)
    }

    // Extract chunk
    const chunkWords = words.slice(i, chunkEndIndex + 1)
    const chunkText = chunkWords.join(' ')

    // Estimate timestamps proportionally
    let chunkStart, chunkEnd
    if (hasTiming && duration > 0) {
      const startRatio = i / totalWords
      const endRatio = (chunkEndIndex + 1) / totalWords
      chunkStart = start + (duration * startRatio)
      chunkEnd = start + (duration * endRatio)
    }

    chunks.push({
      text: chunkText,
      start: chunkStart,
      end: chunkEnd
    })

    i = chunkEndIndex + 1
  }

  return chunks
}

/**
 * Active shadowing practice session
 * Redesigned to match Intensive Listening mode aesthetic
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

  // Audio player state
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [isLooping, setIsLooping] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)

  const audioRef = useRef(null)
  const progressIntervalRef = useRef(null)
  const segmentEndRef = useRef(null)

  // Load segments for the content
  // Chunks sentences into smaller pieces (~5 words) for pronunciation practice
  useEffect(() => {
    const loadSegments = async () => {
      setLoading(true)
      try {
        if (content.type === 'story') {
          const pagesRef = collection(db, 'users', user.uid, 'stories', content.id, 'pages')
          const pagesQuery = query(pagesRef, orderBy('index'))
          const pagesSnap = await getDocs(pagesQuery)

          const allSegments = []
          let chunkIndex = 0

          pagesSnap.docs.forEach((doc, pageIndex) => {
            const pageData = doc.data()
            const sentences = (pageData.content || pageData.text || '')
              .split(/(?<=[.!?])\s+/)
              .filter(s => s.trim().length > 0)

            sentences.forEach((sentence) => {
              // Chunk each sentence into smaller pieces for pronunciation
              const chunks = chunkTextForPronunciation(sentence.trim())

              chunks.forEach((chunk) => {
                allSegments.push({
                  id: `${doc.id}-chunk-${chunkIndex}`,
                  text: chunk.text,
                  pageIndex,
                  chunkIndex
                })
                chunkIndex++
              })
            })
          })

          setSegments(allSegments)
        } else if (content.type === 'youtube') {
          const transcriptsRef = collection(db, 'users', user.uid, 'youtubeVideos', content.id, 'transcripts')
          const transcriptsSnap = await getDocs(transcriptsRef)

          if (!transcriptsSnap.empty) {
            const transcriptDoc = transcriptsSnap.docs[0]
            const transcriptData = transcriptDoc.data()
            const sentenceSegments = transcriptData.sentenceSegments || transcriptData.segments || []

            const allSegments = []
            let chunkIndex = 0

            sentenceSegments.forEach((seg) => {
              // Chunk each sentence segment into smaller pieces with estimated timestamps
              const chunks = chunkTextForPronunciation(seg.text, seg.start, seg.end)

              chunks.forEach((chunk) => {
                allSegments.push({
                  id: `${content.id}-chunk-${chunkIndex}`,
                  text: chunk.text,
                  start: chunk.start,
                  end: chunk.end,
                  chunkIndex
                })
                chunkIndex++
              })
            })

            setSegments(allSegments)
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

  // Stop playback
  const stopPlayback = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return

    audio.pause()
    setIsPlaying(false)

    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
      progressIntervalRef.current = null
    }

    if (segmentEndRef.current) {
      audio.removeEventListener('timeupdate', segmentEndRef.current)
      segmentEndRef.current = null
    }
  }, [])

  // Play the current segment
  const playSegment = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !content.fullAudioUrl) return

    // Set audio source if needed
    if (audio.src !== content.fullAudioUrl) {
      audio.src = content.fullAudioUrl
    }

    const segment = currentSegment
    if (!segment) return

    // Apply playback rate
    audio.playbackRate = playbackRate

    // For YouTube with timestamps
    if (segment.start !== undefined && segment.end !== undefined) {
      const duration = segment.end - segment.start

      audio.currentTime = segment.start
      audio.play()
        .then(() => setIsPlaying(true))
        .catch(err => console.error('Playback failed', err))

      // Clear previous listeners
      if (segmentEndRef.current) {
        audio.removeEventListener('timeupdate', segmentEndRef.current)
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
      }

      // Update progress
      progressIntervalRef.current = setInterval(() => {
        if (audio.paused) return
        const current = audio.currentTime
        if (current >= segment.start && current <= segment.end) {
          const prog = duration > 0 ? ((current - segment.start) / duration) * 100 : 0
          setProgress(Math.min(100, Math.max(0, prog)))
        }
      }, 50)

      // Handle segment end
      const handleTimeUpdate = () => {
        if (audio.currentTime >= segment.end) {
          if (isLooping) {
            audio.currentTime = segment.start
            setProgress(0)
          } else {
            audio.pause()
            setIsPlaying(false)
            setProgress(100)
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current)
            }
            audio.removeEventListener('timeupdate', handleTimeUpdate)
          }
        }
      }

      segmentEndRef.current = handleTimeUpdate
      audio.addEventListener('timeupdate', handleTimeUpdate)
    } else {
      // For stories without timestamps, just play short segment
      audio.play()
        .then(() => setIsPlaying(true))
        .catch(err => console.error('Playback failed', err))
    }
  }, [content.fullAudioUrl, currentSegment, isLooping, playbackRate])

  // Toggle play/pause
  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current
    if (!audio) {
      playSegment()
      return
    }

    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
    } else {
      playSegment()
    }
  }, [isPlaying, playSegment])

  // Scrub audio
  const scrubAudio = useCallback((seconds) => {
    const audio = audioRef.current
    if (!audio || !currentSegment) return

    if (currentSegment.start !== undefined && currentSegment.end !== undefined) {
      const newTime = Math.max(
        currentSegment.start,
        Math.min(currentSegment.end, audio.currentTime + seconds)
      )
      audio.currentTime = newTime

      const duration = currentSegment.end - currentSegment.start
      const prog = duration > 0 ? ((newTime - currentSegment.start) / duration) * 100 : 0
      setProgress(Math.min(100, Math.max(0, prog)))
    } else {
      audio.currentTime = Math.max(0, audio.currentTime + seconds)
    }
  }, [currentSegment])

  // Toggle loop
  const toggleLoop = useCallback(() => {
    setIsLooping(prev => !prev)
  }, [])

  // Toggle playback rate
  const togglePlaybackRate = useCallback(() => {
    const audio = audioRef.current
    const newRate = playbackRate === 1 ? 0.75 : 1
    setPlaybackRate(newRate)
    if (audio) {
      audio.playbackRate = newRate
    }
  }, [playbackRate])

  // Handle user recording completion
  const handleRecordingComplete = async (blob, url) => {
    setUserRecording({ blob, url })
    setIsAssessing(true)
    setError(null)

    try {
      const reader = new FileReader()
      reader.readAsDataURL(blob)
      reader.onloadend = async () => {
        const base64Audio = reader.result.split(',')[1]

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
  const goToSegment = useCallback((direction) => {
    if (direction === 'next' && currentSegmentIndex < segments.length - 1) {
      setCurrentSegmentIndex(prev => prev + 1)
    } else if (direction === 'previous' && currentSegmentIndex > 0) {
      setCurrentSegmentIndex(prev => prev - 1)
    }
  }, [currentSegmentIndex, segments.length])

  // Reset state when segment changes
  useEffect(() => {
    stopPlayback()
    setProgress(0)
    setUserRecording(null)
    setAssessmentResult(null)
    setError(null)
  }, [currentSegmentIndex, stopPlayback])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return

      if (e.code === 'Space') {
        e.preventDefault()
        togglePlayPause()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        scrubAudio(-2)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        scrubAudio(2)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [togglePlayPause, scrubAudio])

  const retryRecording = () => {
    setUserRecording(null)
    setAssessmentResult(null)
    setError(null)
  }

  if (loading) {
    return (
      <div className="intensive-card">
        <div className="intensive-card-loading">
          <p className="muted">Loading content...</p>
        </div>
      </div>
    )
  }

  if (segments.length === 0) {
    return (
      <div className="intensive-card">
        <div className="intensive-card-empty">
          <p className="muted">No segments found in this content.</p>
          <button className="btn btn-secondary" onClick={onBack}>
            Go Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <audio ref={audioRef} />
      <div className="intensive-card">
        {/* Header */}
        <div className="intensive-card-header">
          <div className="intensive-card-nav">
            <button
              type="button"
              className="intensive-card-nav-btn"
              onClick={() => goToSegment('previous')}
              disabled={currentSegmentIndex === 0}
              aria-label="Previous sentence"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <span className="intensive-card-nav-counter">
              {currentSegmentIndex + 1} / {segments.length}
            </span>
            <button
              type="button"
              className="intensive-card-nav-btn"
              onClick={() => goToSegment('next')}
              disabled={currentSegmentIndex >= segments.length - 1}
              aria-label="Next sentence"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 6 15 12 9 18" />
              </svg>
            </button>
          </div>

          <button
            type="button"
            className="intensive-card-close"
            onClick={onBack}
            aria-label="End session"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Main content */}
        <div className="intensive-card-content intensive-card-content--speaking">
          {/* Transcript zone */}
          <div className="intensive-transcript-zone">
            <div className="intensive-transcript intensive-transcript--speaking">
              {currentSegment?.text || 'No text available'}
            </div>
          </div>

          {/* Player */}
          <div className="intensive-player">
            <div className="intensive-player-progress">
              <div
                className="intensive-player-progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="intensive-player-controls">
              <button
                type="button"
                className={`intensive-player-btn ${playbackRate === 0.75 ? 'is-active' : ''}`}
                onClick={togglePlaybackRate}
                aria-label={playbackRate === 0.75 ? 'Normal speed' : 'Slow speed'}
                title={playbackRate === 0.75 ? '0.75x' : '1x'}
              >
                <svg width="22" height="22" viewBox="0 0 100 100" fill="currentColor">
                  <ellipse cx="50" cy="50" rx="35" ry="25" />
                  <circle cx="90" cy="50" r="12" />
                  <ellipse cx="75" cy="72" rx="8" ry="12" />
                  <ellipse cx="75" cy="28" rx="8" ry="12" />
                  <ellipse cx="25" cy="72" rx="8" ry="12" />
                  <ellipse cx="25" cy="28" rx="8" ry="12" />
                  <ellipse cx="12" cy="50" rx="6" ry="4" />
                </svg>
              </button>
              <button
                type="button"
                className="intensive-player-btn"
                onClick={() => scrubAudio(-2)}
                aria-label="Back 2 seconds"
              >
                <svg className="scrub-svg" width="24" height="24" viewBox="-2 -2 40 40" fill="none">
                  <g transform="translate(36 0) scale(-1 1)">
                    <circle className="scrub-arc" cx="18" cy="18" r="12" />
                    <path className="scrub-arrowhead" d="M 22 6 L 16 4 L 16 8 Z" />
                  </g>
                  <text className="scrub-text" x="18" y="19" textAnchor="middle" dominantBaseline="middle">2</text>
                </svg>
              </button>
              <button
                type="button"
                className="intensive-player-btn intensive-player-btn-play"
                onClick={togglePlayPause}
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>
              <button
                type="button"
                className="intensive-player-btn"
                onClick={() => scrubAudio(2)}
                aria-label="Forward 2 seconds"
              >
                <svg className="scrub-svg" width="24" height="24" viewBox="-2 -2 40 40" fill="none">
                  <circle className="scrub-arc" cx="18" cy="18" r="12" />
                  <path className="scrub-arrowhead" d="M 22 6 L 16 4 L 16 8 Z" />
                  <text className="scrub-text" x="18" y="19" textAnchor="middle" dominantBaseline="middle">2</text>
                </svg>
              </button>
              <button
                type="button"
                className={`intensive-player-btn ${isLooping ? 'is-active' : ''}`}
                onClick={toggleLoop}
                aria-label={isLooping ? 'Disable loop' : 'Enable loop'}
                aria-pressed={isLooping}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 2l4 4-4 4" />
                  <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
                  <path d="M7 22l-4-4 4-4" />
                  <path d="M21 13v1a4 4 0 0 1-4 4H3" />
                </svg>
              </button>
            </div>
          </div>

          {/* Recording zone */}
          <div className="intensive-recording-zone">
            {!userRecording ? (
              <div className="intensive-recording-prompt">
                <p className="intensive-recording-instruction">
                  Listen, then record yourself:
                </p>
                <AudioRecorder
                  onRecordingComplete={handleRecordingComplete}
                  maxDuration={30}
                  showPlayback={false}
                  autoSubmit={true}
                />
              </div>
            ) : (
              <div className="intensive-recording-result">
                {/* Playback comparison */}
                <div className="intensive-playback-comparison">
                  <div className="intensive-playback-item">
                    <span className="intensive-playback-label">Original</span>
                    <audio src={content.fullAudioUrl} controls />
                  </div>
                  <div className="intensive-playback-item">
                    <span className="intensive-playback-label">Your Recording</span>
                    <audio src={userRecording.url} controls />
                  </div>
                </div>

                {/* Assessment */}
                {isAssessing ? (
                  <div className="intensive-assessment-loading">
                    <div className="spinner" />
                    <p className="muted">Analyzing pronunciation...</p>
                  </div>
                ) : assessmentResult ? (
                  <PronunciationScore
                    result={assessmentResult}
                    referenceText={currentSegment?.text}
                    language={activeLanguage}
                  />
                ) : error ? (
                  <div className="intensive-assessment-error">
                    <p>{error}</p>
                  </div>
                ) : null}

                {/* Retry button */}
                <button className="intensive-retry-btn" onClick={retryRecording}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 4v6h6" />
                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                  </svg>
                  Try Again
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

export default ShadowingSession
