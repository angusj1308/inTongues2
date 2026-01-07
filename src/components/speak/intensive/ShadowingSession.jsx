import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from '../../../firebase'
import YouTubePlayer from '../../YouTubePlayer'

/**
 * Chunk configuration for pronunciation practice
 * - Min 3 words, max 10 words per chunk
 * - Always ends on punctuation when possible
 */
const CHUNK_MIN_WORDS = 3
const CHUNK_MAX_WORDS = 10

/**
 * Chunk words with accurate timestamps for pronunciation practice
 * Uses actual word timestamps for precise audio segments
 */
const chunkWordsForPronunciation = (words) => {
  if (!words || words.length === 0) return []

  // If small enough, return as single chunk
  if (words.length <= CHUNK_MAX_WORDS) {
    return [{
      text: words.map(w => w.text).join(' '),
      start: words[0].start,
      end: words[words.length - 1].end
    }]
  }

  const chunks = []
  const endsWithPunctuation = (word) => /[.,;:!?]$/.test(word.text || '')

  let i = 0
  while (i < words.length) {
    let chunkEndIndex = Math.min(i + CHUNK_MIN_WORDS - 1, words.length - 1)

    // Look for punctuation between min and max
    let foundPunctuation = false
    for (let j = i + CHUNK_MIN_WORDS - 1; j < Math.min(i + CHUNK_MAX_WORDS, words.length); j++) {
      if (endsWithPunctuation(words[j])) {
        chunkEndIndex = j
        foundPunctuation = true
        break
      }
    }

    // If no punctuation found, use max words or remaining
    if (!foundPunctuation) {
      chunkEndIndex = Math.min(i + CHUNK_MAX_WORDS - 1, words.length - 1)
    }

    // Extract chunk with accurate timestamps
    const chunkWords = words.slice(i, chunkEndIndex + 1)
    chunks.push({
      text: chunkWords.map(w => w.text).join(' '),
      start: chunkWords[0].start,
      end: chunkWords[chunkWords.length - 1].end
    })

    i = chunkEndIndex + 1
  }

  return chunks
}

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
  const [error, setError] = useState(null)

  // Recording state
  const [isRecording, setIsRecording] = useState(false)
  const [isPlayingUser, setIsPlayingUser] = useState(false)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const userAudioRef = useRef(null)

  // Audio player state
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [isLooping, setIsLooping] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [ytStatus, setYtStatus] = useState({ currentTime: 0, duration: 0, isPlaying: false })

  // Refs
  const audioRef = useRef(null)
  const ytPlayerRef = useRef(null)
  const progressIntervalRef = useRef(null)
  const segmentEndRef = useRef(null)
  const [audioDuration, setAudioDuration] = useState(null)

  // Determine content type
  const isYouTube = content?.type === 'youtube'
  const videoId = content?.videoId

  // Load segments for the content
  // Chunks sentences into smaller pieces (~5 words) for pronunciation practice
  useEffect(() => {
    const loadSegments = async () => {
      setLoading(true)
      try {
        if (content.type === 'story') {
          // First, check if we have Whisper transcript with word-level timestamps
          const transcriptsRef = collection(db, 'users', user.uid, 'stories', content.id, 'transcripts')
          const transcriptsSnap = await getDocs(transcriptsRef)

          let hasWhisperTranscript = false

          if (!transcriptsSnap.empty) {
            const transcriptDoc = transcriptsSnap.docs[0]
            const transcriptData = transcriptDoc.data()
            const sentenceSegments = transcriptData.sentenceSegments || []

            // Check if we have word-level timestamps
            if (sentenceSegments.length > 0 && sentenceSegments.some(seg => seg.words && seg.words.length > 0)) {
              hasWhisperTranscript = true

              const allSegments = []
              let chunkIndex = 0

              sentenceSegments.forEach((seg) => {
                if (seg.words && seg.words.length > 0) {
                  // Use word-level timestamps for precise chunking
                  const chunks = chunkWordsForPronunciation(seg.words)
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
                } else {
                  // Sentence without word timestamps - use as-is
                  allSegments.push({
                    id: `${content.id}-chunk-${chunkIndex}`,
                    text: seg.text,
                    start: seg.start,
                    end: seg.end,
                    chunkIndex
                  })
                  chunkIndex++
                }
              })

              setSegments(allSegments)
            }
          }

          // Fallback: No Whisper transcript, use proportional estimation
          if (!hasWhisperTranscript) {

            const pagesRef = collection(db, 'users', user.uid, 'stories', content.id, 'pages')
            const pagesQuery = query(pagesRef, orderBy('index'))
            const pagesSnap = await getDocs(pagesQuery)

            const allChunks = []
            let chunkIndex = 0
            let totalWordCount = 0

            // First pass: collect all chunks and count total words
            pagesSnap.docs.forEach((doc, pageIndex) => {
              const pageData = doc.data()
              const sentences = (pageData.content || pageData.text || '')
                .split(/(?<=[.!?])\s+/)
                .filter(s => s.trim().length > 0)

              sentences.forEach((sentence) => {
                const chunks = chunkTextForPronunciation(sentence.trim())

                chunks.forEach((chunk) => {
                  const wordCount = chunk.text.split(/\s+/).filter(w => w.length > 0).length
                  allChunks.push({
                    id: `${doc.id}-chunk-${chunkIndex}`,
                    text: chunk.text,
                    pageIndex,
                    chunkIndex,
                    wordCount
                  })
                  totalWordCount += wordCount
                  chunkIndex++
                })
              })
            })

            // Second pass: assign proportional timestamps (0-1 ratio)
            let cumulativeWords = 0
            const allSegments = allChunks.map(chunk => {
              const startRatio = cumulativeWords / totalWordCount
              cumulativeWords += chunk.wordCount
              const endRatio = cumulativeWords / totalWordCount

              return {
                ...chunk,
                startRatio,
                endRatio
              }
            })

            setSegments(allSegments)
          }
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
              // If segment has word-level timestamps, use them for accurate chunking
              if (seg.words && seg.words.length > 0) {
                const chunks = chunkWordsForPronunciation(seg.words)
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
              } else {
                // No word timestamps - use sentence as-is (already has accurate start/end)
                allSegments.push({
                  id: `${content.id}-chunk-${chunkIndex}`,
                  text: seg.text,
                  start: seg.start,
                  end: seg.end,
                  chunkIndex
                })
                chunkIndex++
              }
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

  // Load audio duration for stories (needed for proportional timestamps)
  // Run after loading completes to ensure audio element is mounted
  useEffect(() => {
    if (loading || isYouTube || !content?.fullAudioUrl) return

    // Small delay to ensure audio element is mounted
    const timer = setTimeout(() => {
      const audio = audioRef.current
      if (!audio) return

      const handleLoadedMetadata = () => {
        setAudioDuration(audio.duration)
      }

      // Set source
      if (audio.src !== content.fullAudioUrl) {
        audio.src = content.fullAudioUrl
      }

      // If already loaded, get duration immediately
      if (audio.duration && !isNaN(audio.duration)) {
        setAudioDuration(audio.duration)
      } else {
        audio.addEventListener('loadedmetadata', handleLoadedMetadata)
      }

      return () => audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
    }, 100)

    return () => clearTimeout(timer)
  }, [content?.fullAudioUrl, isYouTube, loading])

  // Stop playback (works for both YouTube and native audio)
  const stopPlayback = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
      progressIntervalRef.current = null
    }

    if (isYouTube) {
      ytPlayerRef.current?.pauseVideo?.()
    } else {
      const audio = audioRef.current
      if (audio) {
        audio.pause()
        if (segmentEndRef.current) {
          audio.removeEventListener('timeupdate', segmentEndRef.current)
          segmentEndRef.current = null
        }
      }
    }
    setIsPlaying(false)
  }, [isYouTube])

  // Play the current segment
  const playSegment = useCallback(() => {
    const segment = currentSegment
    if (!segment) return

    // Clear previous intervals
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
    }

    if (isYouTube) {
      // YouTube playback using iframe API
      const player = ytPlayerRef.current
      if (!player?.seekTo) return

      const segmentDuration = segment.end - segment.start

      // Seek to segment start and play
      player.seekTo(segment.start, true)
      player.playVideo()
      setIsPlaying(true)

      // Monitor playback and stop at segment end
      progressIntervalRef.current = setInterval(() => {
        const currentTime = player.getCurrentTime?.() || 0

        if (currentTime >= segment.start && currentTime <= segment.end) {
          const prog = segmentDuration > 0 ? ((currentTime - segment.start) / segmentDuration) * 100 : 0
          setProgress(Math.min(100, Math.max(0, prog)))
        }

        // Check if segment ended
        if (currentTime >= segment.end) {
          if (isLooping) {
            player.seekTo(segment.start, true)
            setProgress(0)
          } else {
            player.pauseVideo()
            setIsPlaying(false)
            setProgress(100)
            clearInterval(progressIntervalRef.current)
          }
        }
      }, 50)
    } else {
      // Native audio playback (for stories)
      const audio = audioRef.current
      if (!audio || !content.fullAudioUrl) return

      // For stories with ratio-based timestamps, wait for audioDuration
      if (segment.startRatio !== undefined && !audioDuration) {
        return
      }

      if (audio.src !== content.fullAudioUrl) {
        audio.src = content.fullAudioUrl
      }

      audio.playbackRate = playbackRate

      // Calculate segment timestamps
      // Use exact timestamps if available, otherwise calculate from ratios
      let segStart, segEnd
      if (segment.start !== undefined && segment.end !== undefined) {
        segStart = segment.start
        segEnd = segment.end
      } else if (segment.startRatio !== undefined && segment.endRatio !== undefined && audioDuration) {
        // Use proportional timestamps for stories (fallback)
        segStart = segment.startRatio * audioDuration
        segEnd = segment.endRatio * audioDuration
      }

      if (segStart !== undefined && segEnd !== undefined) {
        const segmentDuration = segEnd - segStart

        audio.currentTime = segStart
        audio.play()
          .then(() => setIsPlaying(true))
          .catch(err => console.error('Playback failed', err))

        if (segmentEndRef.current) {
          audio.removeEventListener('timeupdate', segmentEndRef.current)
        }

        progressIntervalRef.current = setInterval(() => {
          if (audio.paused) return
          const current = audio.currentTime
          if (current >= segStart && current <= segEnd) {
            const prog = segmentDuration > 0 ? ((current - segStart) / segmentDuration) * 100 : 0
            setProgress(Math.min(100, Math.max(0, prog)))
          }
        }, 50)

        const handleTimeUpdate = () => {
          if (audio.currentTime >= segEnd) {
            if (isLooping) {
              audio.currentTime = segStart
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
        audio.play()
          .then(() => setIsPlaying(true))
          .catch(err => console.error('Playback failed', err))
      }
    }
  }, [content.fullAudioUrl, currentSegment, isLooping, playbackRate, isYouTube, audioDuration])

  // Toggle play/pause
  const togglePlayPause = useCallback(() => {
    if (isPlaying) {
      stopPlayback()
    } else {
      playSegment()
    }
  }, [isPlaying, playSegment, stopPlayback])

  // Scrub audio
  const scrubAudio = useCallback((seconds) => {
    if (!currentSegment) return

    if (isYouTube) {
      const player = ytPlayerRef.current
      if (!player?.getCurrentTime) return

      const currentTime = player.getCurrentTime()
      const newTime = Math.max(
        currentSegment.start,
        Math.min(currentSegment.end, currentTime + seconds)
      )
      player.seekTo(newTime, true)

      const duration = currentSegment.end - currentSegment.start
      const prog = duration > 0 ? ((newTime - currentSegment.start) / duration) * 100 : 0
      setProgress(Math.min(100, Math.max(0, prog)))
    } else {
      const audio = audioRef.current
      if (!audio) return

      // Calculate segment boundaries
      let segStart, segEnd
      if (currentSegment.start !== undefined && currentSegment.end !== undefined) {
        segStart = currentSegment.start
        segEnd = currentSegment.end
      } else if (currentSegment.startRatio !== undefined && currentSegment.endRatio !== undefined && audioDuration) {
        segStart = currentSegment.startRatio * audioDuration
        segEnd = currentSegment.endRatio * audioDuration
      }

      if (segStart !== undefined && segEnd !== undefined) {
        const newTime = Math.max(segStart, Math.min(segEnd, audio.currentTime + seconds))
        audio.currentTime = newTime

        const duration = segEnd - segStart
        const prog = duration > 0 ? ((newTime - segStart) / duration) * 100 : 0
        setProgress(Math.min(100, Math.max(0, prog)))
      } else {
        audio.currentTime = Math.max(0, audio.currentTime + seconds)
      }
    }
  }, [currentSegment, isYouTube, audioDuration])

  // Toggle loop
  const toggleLoop = useCallback(() => {
    setIsLooping(prev => !prev)
  }, [])

  // Toggle playback rate
  const togglePlaybackRate = useCallback(() => {
    const newRate = playbackRate === 1 ? 0.75 : 1
    setPlaybackRate(newRate)

    if (isYouTube) {
      ytPlayerRef.current?.setPlaybackRate?.(newRate)
    } else {
      const audio = audioRef.current
      if (audio) {
        audio.playbackRate = newRate
      }
    }
  }, [playbackRate, isYouTube])

  // Simple recording functions
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        const url = URL.createObjectURL(blob)
        setUserRecording({ blob, url })
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch (err) {
      console.error('Recording error:', err)
      setError('Could not access microphone')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  // Toggle user recording playback
  const toggleUserPlayback = () => {
    if (!userAudioRef.current) return

    if (isPlayingUser) {
      userAudioRef.current.pause()
      setIsPlayingUser(false)
    } else {
      userAudioRef.current.play()
      setIsPlayingUser(true)
    }
  }

  // Handle user audio ended
  useEffect(() => {
    const audio = userAudioRef.current
    if (audio) {
      const handleEnded = () => setIsPlayingUser(false)
      audio.addEventListener('ended', handleEnded)
      return () => audio.removeEventListener('ended', handleEnded)
    }
  }, [userRecording])

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
    setIsPlayingUser(false)
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
      {/* Hidden audio/video elements */}
      {isYouTube && videoId ? (
        <div style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden' }}>
          <YouTubePlayer
            ref={ytPlayerRef}
            videoId={videoId}
            controls={false}
            onStatus={setYtStatus}
          />
        </div>
      ) : (
        <audio ref={audioRef} />
      )}

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

        {/* Main content - simplified layout */}
        <div className="pronunciation-practice-content">
          {/* Text with integrated play button */}
          <div className="pronunciation-text-zone">
            <p className="pronunciation-text">
              {currentSegment?.text || 'No text available'}
            </p>
          </div>

          {/* Simple progress bar */}
          <div className="pronunciation-progress-bar">
            <div
              className="pronunciation-progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Centered play button */}
          <div className="pronunciation-play-zone">
            <button
              type="button"
              className="pronunciation-play-btn"
              onClick={togglePlayPause}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
          </div>

          {/* Recording section */}
          <div className="pronunciation-record-zone">
            {!userRecording ? (
              <>
                <p className="pronunciation-prompt">
                  {isRecording ? 'Recording... tap to stop' : 'Record yourself saying this phrase'}
                </p>
                <button
                  type="button"
                  className={`pronunciation-record-btn ${isRecording ? 'recording' : ''}`}
                  onClick={toggleRecording}
                  aria-label={isRecording ? 'Stop recording' : 'Start recording'}
                >
                  {isRecording ? (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                  ) : (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="12" r="6" />
                    </svg>
                  )}
                </button>
              </>
            ) : (
              <>
                <p className="pronunciation-prompt">
                  Compare your pronunciation to the native speaker
                </p>
                {/* Hidden audio element for user recording */}
                <audio ref={userAudioRef} src={userRecording.url} />
                {/* Play button for user recording - same style as native */}
                <button
                  type="button"
                  className="pronunciation-play-btn yours"
                  onClick={toggleUserPlayback}
                  aria-label={isPlayingUser ? 'Pause your recording' : 'Play your recording'}
                >
                  {isPlayingUser ? (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="4" width="4" height="16" rx="1" />
                      <rect x="14" y="4" width="4" height="16" rx="1" />
                    </svg>
                  ) : (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </button>
                {/* Record again */}
                <button className="pronunciation-retry-btn" onClick={retryRecording}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 4v6h6" />
                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                  </svg>
                  Record Again
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

export default ShadowingSession
