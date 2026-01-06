import React, { useRef, useState, useEffect } from 'react'
import { WaveformVisualizer } from './WaveformVisualizer'

/**
 * Side-by-side audio playback comparison for original vs user recording
 */
export function PlaybackComparison({
  originalUrl,
  originalLabel = 'Original',
  recordingUrl,
  recordingLabel = 'Your Recording',
  onPlayOriginal,
  onPlayRecording,
  className = ''
}) {
  const originalRef = useRef(null)
  const recordingRef = useRef(null)

  const [originalPlaying, setOriginalPlaying] = useState(false)
  const [recordingPlaying, setRecordingPlaying] = useState(false)
  const [originalProgress, setOriginalProgress] = useState(0)
  const [recordingProgress, setRecordingProgress] = useState(0)
  const [originalDuration, setOriginalDuration] = useState(0)
  const [recordingDuration, setRecordingDuration] = useState(0)

  // Setup event listeners for original audio
  useEffect(() => {
    const audio = originalRef.current
    if (!audio) return

    const handlePlay = () => setOriginalPlaying(true)
    const handlePause = () => setOriginalPlaying(false)
    const handleEnded = () => {
      setOriginalPlaying(false)
      setOriginalProgress(0)
    }
    const handleTimeUpdate = () => {
      if (audio.duration) {
        setOriginalProgress((audio.currentTime / audio.duration) * 100)
      }
    }
    const handleLoadedMetadata = () => {
      setOriginalDuration(audio.duration)
    }

    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('loadedmetadata', handleLoadedMetadata)

    return () => {
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
    }
  }, [originalUrl])

  // Setup event listeners for recording audio
  useEffect(() => {
    const audio = recordingRef.current
    if (!audio) return

    const handlePlay = () => setRecordingPlaying(true)
    const handlePause = () => setRecordingPlaying(false)
    const handleEnded = () => {
      setRecordingPlaying(false)
      setRecordingProgress(0)
    }
    const handleTimeUpdate = () => {
      if (audio.duration) {
        setRecordingProgress((audio.currentTime / audio.duration) * 100)
      }
    }
    const handleLoadedMetadata = () => {
      setRecordingDuration(audio.duration)
    }

    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('loadedmetadata', handleLoadedMetadata)

    return () => {
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
    }
  }, [recordingUrl])

  const toggleOriginal = () => {
    if (!originalRef.current) return

    // Stop recording if playing
    if (recordingRef.current && !recordingRef.current.paused) {
      recordingRef.current.pause()
      recordingRef.current.currentTime = 0
    }

    if (originalPlaying) {
      originalRef.current.pause()
    } else {
      originalRef.current.currentTime = 0
      originalRef.current.play()
      if (onPlayOriginal) onPlayOriginal()
    }
  }

  const toggleRecording = () => {
    if (!recordingRef.current) return

    // Stop original if playing
    if (originalRef.current && !originalRef.current.paused) {
      originalRef.current.pause()
      originalRef.current.currentTime = 0
    }

    if (recordingPlaying) {
      recordingRef.current.pause()
    } else {
      recordingRef.current.currentTime = 0
      recordingRef.current.play()
      if (onPlayRecording) onPlayRecording()
    }
  }

  const playBothSequentially = async () => {
    // Stop any currently playing
    if (originalRef.current) {
      originalRef.current.pause()
      originalRef.current.currentTime = 0
    }
    if (recordingRef.current) {
      recordingRef.current.pause()
      recordingRef.current.currentTime = 0
    }

    // Play original first
    if (originalRef.current) {
      await originalRef.current.play()
      // Wait for it to finish
      await new Promise(resolve => {
        originalRef.current.onended = resolve
      })
    }

    // Small pause between
    await new Promise(resolve => setTimeout(resolve, 500))

    // Play recording
    if (recordingRef.current) {
      await recordingRef.current.play()
    }
  }

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className={`playback-comparison ${className}`}>
      {/* Original audio */}
      <div className={`playback-track ${originalPlaying ? 'playing' : ''}`}>
        <audio ref={originalRef} src={originalUrl} preload="metadata" />

        <div className="playback-track-header">
          <span className="playback-track-label">{originalLabel}</span>
          <span className="playback-track-duration">{formatTime(originalDuration)}</span>
        </div>

        <div className="playback-track-content">
          <button
            className="btn-playback-track"
            onClick={toggleOriginal}
            disabled={!originalUrl}
          >
            {originalPlaying ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          <div className="playback-track-waveform">
            <WaveformVisualizer
              audioUrl={originalUrl}
              height={40}
              barColor="#10b981"
              barWidth={2}
              barGap={1}
            />
            <div
              className="playback-progress-overlay"
              style={{ width: `${originalProgress}%` }}
            />
          </div>
        </div>
      </div>

      {/* User recording */}
      <div className={`playback-track ${recordingPlaying ? 'playing' : ''}`}>
        <audio ref={recordingRef} src={recordingUrl} preload="metadata" />

        <div className="playback-track-header">
          <span className="playback-track-label">{recordingLabel}</span>
          <span className="playback-track-duration">{formatTime(recordingDuration)}</span>
        </div>

        <div className="playback-track-content">
          <button
            className="btn-playback-track"
            onClick={toggleRecording}
            disabled={!recordingUrl}
          >
            {recordingPlaying ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          <div className="playback-track-waveform">
            <WaveformVisualizer
              audioUrl={recordingUrl}
              height={40}
              barColor="#3b82f6"
              barWidth={2}
              barGap={1}
            />
            <div
              className="playback-progress-overlay"
              style={{ width: `${recordingProgress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Compare button */}
      {originalUrl && recordingUrl && (
        <button
          className="btn btn-secondary btn-compare"
          onClick={playBothSequentially}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 12h16M4 12l4-4M4 12l4 4M20 12l-4-4M20 12l-4 4" />
          </svg>
          Compare (Play Both)
        </button>
      )}
    </div>
  )
}

export default PlaybackComparison
