import { useCallback, useEffect, useRef, useState } from 'react'
import './AudioWorkstation.css'

/**
 * DAW-style audio workstation for recording, editing, and finalizing audio
 * Features:
 * - Waveform timeline display with moving playhead
 * - Draggable region handles to select a section
 * - Playback with seek/scrub
 * - Recording with countdown
 * - Finalize to complete
 */
const AudioWorkstation = ({
  audioBlob,
  audioUrl,
  isRecording,
  isPaused,
  recordingTime,
  analyserNode,
  onStartRecording,
  onStopRecording,
  onPauseRecording,
  onResumeRecording,
  onFinalize,
  onReset,
}) => {
  // Playback state
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isLooping, setIsLooping] = useState(false)

  // Region selection state (in seconds)
  const [regionStart, setRegionStart] = useState(null)
  const [regionEnd, setRegionEnd] = useState(null)
  const [isDragging, setIsDragging] = useState(null) // 'start', 'end', 'playhead', or null

  // Waveform state
  const [waveformData, setWaveformData] = useState([])
  const [isGeneratingWaveform, setIsGeneratingWaveform] = useState(false)

  // Refs
  const audioRef = useRef(null)
  const timelineRef = useRef(null)
  const animationRef = useRef(null)
  const liveWaveformRef = useRef([])
  const playheadAnimationRef = useRef(null)

  // Format time as MM:SS
  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '00:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Generate waveform data from audio blob
  const generateWaveform = useCallback(async (blob) => {
    if (!blob) return

    setIsGeneratingWaveform(true)
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)()
      const arrayBuffer = await blob.arrayBuffer()
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

      const channelData = audioBuffer.getChannelData(0)
      const samples = 200
      const blockSize = Math.floor(channelData.length / samples)
      const waveform = []

      for (let i = 0; i < samples; i++) {
        let sum = 0
        for (let j = 0; j < blockSize; j++) {
          sum += Math.abs(channelData[i * blockSize + j])
        }
        waveform.push(sum / blockSize)
      }

      const max = Math.max(...waveform)
      const normalized = waveform.map(v => v / max)

      setWaveformData(normalized)
      setDuration(audioBuffer.duration)

      await audioContext.close()
    } catch (err) {
      console.error('Error generating waveform:', err)
    } finally {
      setIsGeneratingWaveform(false)
    }
  }, [])

  // Generate waveform when audio blob changes
  useEffect(() => {
    if (audioBlob && !isRecording) {
      generateWaveform(audioBlob)
    }
  }, [audioBlob, isRecording, generateWaveform])

  // Live waveform during recording
  useEffect(() => {
    if (!isRecording || !analyserNode) return

    const updateLiveWaveform = () => {
      const bufferLength = analyserNode.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)
      analyserNode.getByteTimeDomainData(dataArray)

      let sum = 0
      for (let i = 0; i < bufferLength; i++) {
        sum += Math.abs(dataArray[i] - 128)
      }
      const amplitude = sum / bufferLength / 128

      liveWaveformRef.current.push(amplitude)

      if (liveWaveformRef.current.length > 200) {
        liveWaveformRef.current = liveWaveformRef.current.slice(-200)
      }

      setWaveformData([...liveWaveformRef.current])

      if (isRecording) {
        animationRef.current = requestAnimationFrame(updateLiveWaveform)
      }
    }

    updateLiveWaveform()

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isRecording, analyserNode])

  // Reset live waveform when starting new recording
  useEffect(() => {
    if (isRecording && recordingTime === 0) {
      liveWaveformRef.current = []
    }
  }, [isRecording, recordingTime])

  // Smooth playhead animation during playback
  useEffect(() => {
    if (!isPlaying || !audioRef.current) {
      if (playheadAnimationRef.current) {
        cancelAnimationFrame(playheadAnimationRef.current)
      }
      return
    }

    const updatePlayhead = () => {
      if (audioRef.current) {
        setCurrentTime(audioRef.current.currentTime)

        // Handle region looping
        if (isLooping && regionStart !== null && regionEnd !== null) {
          if (audioRef.current.currentTime >= regionEnd) {
            audioRef.current.currentTime = regionStart
          }
        }
      }
      if (isPlaying) {
        playheadAnimationRef.current = requestAnimationFrame(updatePlayhead)
      }
    }

    playheadAnimationRef.current = requestAnimationFrame(updatePlayhead)

    return () => {
      if (playheadAnimationRef.current) {
        cancelAnimationFrame(playheadAnimationRef.current)
      }
    }
  }, [isPlaying, isLooping, regionStart, regionEnd])

  // Audio event handlers
  useEffect(() => {
    if (!audioRef.current) return

    const audio = audioRef.current

    const handleEnded = () => {
      if (isLooping && regionStart !== null && regionEnd !== null) {
        audio.currentTime = regionStart
        audio.play()
      } else if (isLooping) {
        audio.currentTime = 0
        audio.play()
      } else {
        setIsPlaying(false)
        setCurrentTime(0)
      }
    }

    const handleLoadedMetadata = () => {
      setDuration(audio.duration)
    }

    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('loadedmetadata', handleLoadedMetadata)

    return () => {
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
    }
  }, [isLooping, regionStart, regionEnd])

  // Get time from mouse position
  const getTimeFromMouseEvent = useCallback((e) => {
    if (!timelineRef.current || duration <= 0) return 0
    const rect = timelineRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
    return (x / rect.width) * duration
  }, [duration])

  // Mouse down on timeline
  const handleTimelineMouseDown = useCallback((e) => {
    if (isRecording || !audioUrl) return

    const rect = timelineRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percent = x / rect.width
    const clickTime = percent * duration

    // Check if clicking near region handles
    if (regionStart !== null && regionEnd !== null) {
      const startPercent = (regionStart / duration) * 100
      const endPercent = (regionEnd / duration) * 100
      const clickPercent = percent * 100
      const handleThreshold = 2 // percent

      if (Math.abs(clickPercent - startPercent) < handleThreshold) {
        setIsDragging('start')
        return
      }
      if (Math.abs(clickPercent - endPercent) < handleThreshold) {
        setIsDragging('end')
        return
      }
    }

    // Otherwise, move playhead
    setIsDragging('playhead')
    if (audioRef.current) {
      audioRef.current.currentTime = clickTime
      setCurrentTime(clickTime)
    }
  }, [isRecording, audioUrl, duration, regionStart, regionEnd])

  // Mouse move for dragging
  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e) => {
      const time = getTimeFromMouseEvent(e)

      if (isDragging === 'playhead') {
        if (audioRef.current) {
          audioRef.current.currentTime = time
          setCurrentTime(time)
        }
      } else if (isDragging === 'start') {
        if (regionEnd !== null && time < regionEnd) {
          setRegionStart(time)
        }
      } else if (isDragging === 'end') {
        if (regionStart !== null && time > regionStart) {
          setRegionEnd(time)
        }
      }
    }

    const handleMouseUp = () => {
      setIsDragging(null)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, getTimeFromMouseEvent, regionStart, regionEnd])

  // Double click to create region
  const handleTimelineDoubleClick = useCallback((e) => {
    if (isRecording || !audioUrl || duration <= 0) return

    const clickTime = getTimeFromMouseEvent(e)

    // Create a region around the click point (20% of duration)
    const regionSize = duration * 0.2
    const start = Math.max(0, clickTime - regionSize / 2)
    const end = Math.min(duration, clickTime + regionSize / 2)

    setRegionStart(start)
    setRegionEnd(end)
  }, [isRecording, audioUrl, duration, getTimeFromMouseEvent])

  // Play/pause toggle
  const togglePlayback = useCallback(() => {
    if (!audioRef.current || !audioUrl) return

    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      // If region is selected and playhead is outside, start from region start
      if (regionStart !== null && regionEnd !== null) {
        if (currentTime < regionStart || currentTime >= regionEnd) {
          audioRef.current.currentTime = regionStart
        }
      }
      audioRef.current.play()
      setIsPlaying(true)
    }
  }, [isPlaying, audioUrl, regionStart, regionEnd, currentTime])

  // Clear region selection
  const clearRegion = useCallback(() => {
    setRegionStart(null)
    setRegionEnd(null)
  }, [])

  // Handle finalize
  const handleFinalize = useCallback(() => {
    if (isPlaying) {
      audioRef.current?.pause()
      setIsPlaying(false)
    }
    onFinalize()
  }, [isPlaying, onFinalize])

  // Stop and reset
  const handleReset = useCallback(() => {
    if (isPlaying) {
      audioRef.current?.pause()
      setIsPlaying(false)
    }
    setWaveformData([])
    setCurrentTime(0)
    setDuration(0)
    clearRegion()
    liveWaveformRef.current = []
    onReset()
  }, [isPlaying, clearRegion, onReset])

  // Calculate positions
  const playheadPosition = duration > 0 ? (currentTime / duration) * 100 : 0
  const regionStartPercent = regionStart !== null && duration > 0 ? (regionStart / duration) * 100 : null
  const regionEndPercent = regionEnd !== null && duration > 0 ? (regionEnd / duration) * 100 : null

  return (
    <div className="audio-workstation">
      {/* Hidden audio element */}
      {audioUrl && (
        <audio ref={audioRef} src={audioUrl} preload="metadata" />
      )}

      {/* Waveform Timeline */}
      <div className="daw-timeline-container">
        <div
          className={`daw-timeline ${isDragging ? 'dragging' : ''}`}
          ref={timelineRef}
          onMouseDown={handleTimelineMouseDown}
          onDoubleClick={handleTimelineDoubleClick}
        >
          {/* Waveform bars */}
          <div className="daw-waveform">
            {waveformData.map((amplitude, i) => {
              const barPercent = (i / waveformData.length) * 100
              const isInRegion = regionStartPercent !== null && regionEndPercent !== null &&
                barPercent >= regionStartPercent && barPercent <= regionEndPercent
              const isBeforePlayhead = barPercent <= playheadPosition

              return (
                <div
                  key={i}
                  className={`daw-waveform-bar ${isInRegion ? 'in-region' : ''} ${isBeforePlayhead && !isRecording ? 'played' : ''}`}
                  style={{
                    height: `${Math.max(4, amplitude * 100)}%`,
                  }}
                />
              )
            })}
            {waveformData.length === 0 && !isRecording && (
              <div className="daw-waveform-empty">
                {isGeneratingWaveform ? 'Loading waveform...' : 'Press record to start'}
              </div>
            )}
          </div>

          {/* Region selection overlay with draggable handles */}
          {regionStartPercent !== null && regionEndPercent !== null && (
            <div
              className="daw-region"
              style={{
                left: `${regionStartPercent}%`,
                width: `${regionEndPercent - regionStartPercent}%`,
              }}
            >
              <div
                className="daw-region-handle daw-region-handle-start"
                onMouseDown={(e) => {
                  e.stopPropagation()
                  setIsDragging('start')
                }}
              />
              <div
                className="daw-region-handle daw-region-handle-end"
                onMouseDown={(e) => {
                  e.stopPropagation()
                  setIsDragging('end')
                }}
              />
              <div className="daw-region-time">
                {formatTime(regionEnd - regionStart)}
              </div>
            </div>
          )}

          {/* Playhead */}
          {!isRecording && duration > 0 && (
            <div
              className={`daw-playhead ${isPlaying ? 'playing' : ''}`}
              style={{ left: `${playheadPosition}%` }}
            >
              <div className="daw-playhead-head" />
              <div className="daw-playhead-line" />
            </div>
          )}

          {/* Recording indicator */}
          {isRecording && (
            <div className="daw-recording-indicator">
              <span className="daw-recording-dot" />
              REC
            </div>
          )}
        </div>

        {/* Time display */}
        <div className="daw-time-display">
          <span className="daw-time-current">
            {isRecording ? formatTime(recordingTime) : formatTime(currentTime)}
          </span>
          <span className="daw-time-separator">/</span>
          <span className="daw-time-duration">
            {isRecording ? '--:--' : formatTime(duration)}
          </span>
          {regionStart !== null && regionEnd !== null && (
            <span className="daw-time-region">
              (selection: {formatTime(regionEnd - regionStart)})
            </span>
          )}
        </div>
      </div>

      {/* Transport Controls - Centralized */}
      <div className="daw-transport">
        <div className="daw-transport-controls">
          {/* Initial record button */}
          {!isRecording && !audioUrl && (
            <button
              className="daw-btn daw-btn-record daw-btn-large"
              onClick={onStartRecording}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="8" />
              </svg>
              <span>Record</span>
            </button>
          )}

          {/* Recording controls */}
          {isRecording && (
            <>
              <button
                className="daw-btn daw-btn-transport"
                onClick={isPaused ? onResumeRecording : onPauseRecording}
              >
                {isPaused ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                )}
                <span>{isPaused ? 'Resume' : 'Pause'}</span>
              </button>

              <button
                className="daw-btn daw-btn-stop"
                onClick={onStopRecording}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
                <span>Stop</span>
              </button>
            </>
          )}

          {/* Playback controls - when audio exists */}
          {audioUrl && !isRecording && (
            <>
              <button
                className="daw-btn daw-btn-transport"
                onClick={() => {
                  if (audioRef.current) {
                    audioRef.current.currentTime = regionStart ?? 0
                    setCurrentTime(regionStart ?? 0)
                  }
                }}
                title="Go to start"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 6h2v12H6V6zm3.5 6 8.5 6V6l-8.5 6z" />
                </svg>
              </button>

              <button
                className={`daw-btn daw-btn-play ${isPlaying ? 'playing' : ''}`}
                onClick={togglePlayback}
                title={isPlaying ? 'Pause' : 'Play'}
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
                className={`daw-btn daw-btn-transport ${isLooping ? 'active' : ''}`}
                onClick={() => setIsLooping(!isLooping)}
                title={isLooping ? 'Disable loop' : 'Enable loop'}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 2l4 4-4 4" />
                  <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
                  <path d="M7 22l-4-4 4-4" />
                  <path d="M21 13v1a4 4 0 0 1-4 4H3" />
                </svg>
              </button>

              <div className="daw-transport-divider" />

              <button
                className="daw-btn daw-btn-record-again"
                onClick={onStartRecording}
                title="Record again"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="12" r="6" />
                </svg>
                <span>Re-record</span>
              </button>

              {regionStart !== null && (
                <button
                  className="daw-btn daw-btn-transport"
                  onClick={clearRegion}
                  title="Clear selection"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              )}

              <div className="daw-transport-divider" />

              <button
                className="daw-btn daw-btn-reset"
                onClick={handleReset}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                <span>Discard</span>
              </button>

              <button
                className="daw-btn daw-btn-finalize"
                onClick={handleFinalize}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                <span>Finalize</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Help text */}
      <div className="daw-help">
        {isRecording ? (
          <span>Recording in progress... Click Stop when finished.</span>
        ) : audioUrl ? (
          <span>Double-click timeline to select a region. Drag handles to adjust. Click Finalize when ready.</span>
        ) : (
          <span>Click Record to start. You can re-record until you're happy.</span>
        )}
      </div>
    </div>
  )
}

export default AudioWorkstation
