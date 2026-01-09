import { useCallback, useEffect, useRef, useState } from 'react'
import './AudioWorkstation.css'

/**
 * DAW-style audio workstation for recording, editing, and finalizing audio
 * Features:
 * - Waveform timeline display with moving playhead
 * - Draggable region handles to select a section (always visible)
 * - Region-based playback and punch-in recording
 * - Auto-stop when recording selected region
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
  onAudioUpdate, // New: callback to update audio after punch-in splice
}) => {
  // Playback state
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isLooping, setIsLooping] = useState(false)

  // Region selection state (in seconds) - always defined, defaults to full range
  const [regionStart, setRegionStart] = useState(0)
  const [regionEnd, setRegionEnd] = useState(0)
  const [isDragging, setIsDragging] = useState(null) // 'start', 'end', 'playhead', or null

  // Punch-in recording state
  const [isPunchIn, setIsPunchIn] = useState(false)
  const [punchInDuration, setPunchInDuration] = useState(0)
  const originalAudioRef = useRef(null) // Store original audio for splicing

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

  // Splice new recording into original audio at the punch-in region
  const spliceAudio = useCallback(async (originalBlob, newBlob, spliceStart, spliceEnd) => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)()

      // Decode both audio blobs
      const [originalBuffer, newBuffer] = await Promise.all([
        originalBlob.arrayBuffer().then(buf => audioContext.decodeAudioData(buf)),
        newBlob.arrayBuffer().then(buf => audioContext.decodeAudioData(buf))
      ])

      const sampleRate = originalBuffer.sampleRate
      const numChannels = originalBuffer.numberOfChannels

      // Calculate sample positions
      const spliceStartSample = Math.floor(spliceStart * sampleRate)
      const spliceEndSample = Math.floor(spliceEnd * sampleRate)

      // New total length: before + new recording + after
      const beforeLength = spliceStartSample
      const newLength = newBuffer.length
      const afterLength = Math.max(0, originalBuffer.length - spliceEndSample)
      const totalLength = beforeLength + newLength + afterLength

      // Create new buffer
      const outputBuffer = audioContext.createBuffer(numChannels, totalLength, sampleRate)

      // Copy data for each channel
      for (let channel = 0; channel < numChannels; channel++) {
        const outputData = outputBuffer.getChannelData(channel)
        const originalData = originalBuffer.getChannelData(channel)
        const newData = newBuffer.getChannelData(Math.min(channel, newBuffer.numberOfChannels - 1))

        // Copy before section
        for (let i = 0; i < beforeLength; i++) {
          outputData[i] = originalData[i]
        }

        // Copy new recording
        for (let i = 0; i < newLength; i++) {
          outputData[beforeLength + i] = newData[i]
        }

        // Copy after section
        for (let i = 0; i < afterLength; i++) {
          outputData[beforeLength + newLength + i] = originalData[spliceEndSample + i]
        }
      }

      // Convert AudioBuffer to WAV blob
      const wavBlob = audioBufferToWav(outputBuffer)

      await audioContext.close()
      return wavBlob
    } catch (err) {
      console.error('Error splicing audio:', err)
      return null
    }
  }, [])

  // Convert AudioBuffer to WAV Blob
  const audioBufferToWav = (buffer) => {
    const numChannels = buffer.numberOfChannels
    const sampleRate = buffer.sampleRate
    const format = 1 // PCM
    const bitDepth = 16

    const bytesPerSample = bitDepth / 8
    const blockAlign = numChannels * bytesPerSample
    const byteRate = sampleRate * blockAlign
    const dataSize = buffer.length * blockAlign
    const headerSize = 44
    const totalSize = headerSize + dataSize

    const arrayBuffer = new ArrayBuffer(totalSize)
    const view = new DataView(arrayBuffer)

    // WAV header
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i))
      }
    }

    writeString(0, 'RIFF')
    view.setUint32(4, totalSize - 8, true)
    writeString(8, 'WAVE')
    writeString(12, 'fmt ')
    view.setUint32(16, 16, true) // fmt chunk size
    view.setUint16(20, format, true)
    view.setUint16(22, numChannels, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, byteRate, true)
    view.setUint16(32, blockAlign, true)
    view.setUint16(34, bitDepth, true)
    writeString(36, 'data')
    view.setUint32(40, dataSize, true)

    // Interleave channels and write samples
    let offset = 44
    for (let i = 0; i < buffer.length; i++) {
      for (let channel = 0; channel < numChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]))
        const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF
        view.setInt16(offset, intSample, true)
        offset += 2
      }
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' })
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
      // Set region to full duration by default
      setRegionStart(0)
      setRegionEnd(audioBuffer.duration)

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

  // Auto-stop recording when punch-in duration is reached
  useEffect(() => {
    if (!isRecording || !isPunchIn || punchInDuration <= 0) return

    if (recordingTime >= punchInDuration) {
      // Automatically stop recording when we've recorded enough
      onStopRecording()
    }
  }, [isRecording, isPunchIn, punchInDuration, recordingTime, onStopRecording])

  // Handle punch-in splice when recording stops
  const punchInRegionRef = useRef({ start: 0, end: 0 })

  useEffect(() => {
    // When recording stops and we were in punch-in mode, splice the audio
    if (!isRecording && isPunchIn && audioBlob && originalAudioRef.current && onAudioUpdate) {
      const doSplice = async () => {
        const { start, end } = punchInRegionRef.current
        const splicedBlob = await spliceAudio(
          originalAudioRef.current,
          audioBlob,
          start,
          end
        )
        if (splicedBlob) {
          onAudioUpdate(splicedBlob)
        }
        // Reset punch-in state
        setIsPunchIn(false)
        setPunchInDuration(0)
        originalAudioRef.current = null
      }
      doSplice()
    }
  }, [isRecording, isPunchIn, audioBlob, onAudioUpdate, spliceAudio])

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

        // Stop at region end (or loop back if looping)
        if (audioRef.current.currentTime >= regionEnd) {
          if (isLooping) {
            audioRef.current.currentTime = regionStart
          } else {
            audioRef.current.pause()
            setIsPlaying(false)
            audioRef.current.currentTime = regionStart
            setCurrentTime(regionStart)
            return
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
      // Region-based playback handles this in the animation frame
      setIsPlaying(false)
      setCurrentTime(regionStart)
    }

    const handleLoadedMetadata = () => {
      setDuration(audio.duration)
      setRegionEnd(audio.duration)
    }

    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('loadedmetadata', handleLoadedMetadata)

    return () => {
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
    }
  }, [regionStart])

  // Get time from mouse position
  const getTimeFromMouseEvent = useCallback((e) => {
    if (!timelineRef.current || duration <= 0) return 0
    const rect = timelineRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
    return (x / rect.width) * duration
  }, [duration])

  // Mouse down on timeline - move playhead
  const handleTimelineMouseDown = useCallback((e) => {
    if (isRecording || !audioUrl) return

    const rect = timelineRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percent = x / rect.width
    const clickTime = percent * duration

    // Move playhead to click position
    setIsDragging('playhead')
    if (audioRef.current) {
      audioRef.current.currentTime = clickTime
      setCurrentTime(clickTime)
    }
  }, [isRecording, audioUrl, duration])

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

  // Play/pause toggle - plays selected region only
  const togglePlayback = useCallback(() => {
    if (!audioRef.current || !audioUrl) return

    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      // Start from region start if playhead is outside the region
      if (currentTime < regionStart || currentTime >= regionEnd) {
        audioRef.current.currentTime = regionStart
        setCurrentTime(regionStart)
      }
      audioRef.current.play()
      setIsPlaying(true)
    }
  }, [isPlaying, audioUrl, regionStart, regionEnd, currentTime])

  // Reset region to full duration
  const resetRegion = useCallback(() => {
    setRegionStart(0)
    setRegionEnd(duration)
  }, [duration])

  // Calculate if region is the full duration (no custom selection)
  // Must be defined before handleRecord which depends on it
  const isFullRegion = regionStart === 0 && regionEnd === duration

  // Handle record button - either full recording or punch-in
  const handleRecord = useCallback(() => {
    if (!audioBlob || isFullRegion) {
      // No existing audio or full region selected - do normal recording
      onStartRecording()
    } else {
      // Punch-in mode: record only the selected region
      // Store the original audio and region info for splicing later
      originalAudioRef.current = audioBlob
      punchInRegionRef.current = { start: regionStart, end: regionEnd }
      setIsPunchIn(true)
      setPunchInDuration(regionEnd - regionStart)
      onStartRecording()
    }
  }, [audioBlob, isFullRegion, regionStart, regionEnd, onStartRecording])

  // Handle finalize
  const handleFinalize = useCallback(() => {
    if (isPlaying) {
      audioRef.current?.pause()
      setIsPlaying(false)
    }
    onFinalize()
  }, [isPlaying, onFinalize])

  // Calculate positions
  const playheadPosition = duration > 0 ? (currentTime / duration) * 100 : 0
  const regionStartPercent = duration > 0 ? (regionStart / duration) * 100 : 0
  const regionEndPercent = duration > 0 ? (regionEnd / duration) * 100 : 100

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
        >
          {/* Waveform bars */}
          <div className="daw-waveform">
            {waveformData.map((amplitude, i) => {
              const barPercent = (i / waveformData.length) * 100
              const isInRegion = !isFullRegion && barPercent >= regionStartPercent && barPercent <= regionEndPercent
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

          {/* Region handles - always visible when audio exists */}
          {audioUrl && duration > 0 && (
            <>
              <div
                className={`daw-region-handle daw-region-handle-start ${isFullRegion ? 'at-edge' : ''}`}
                style={{ left: `${regionStartPercent}%` }}
                onMouseDown={(e) => {
                  e.stopPropagation()
                  setIsDragging('start')
                }}
              />
              <div
                className={`daw-region-handle daw-region-handle-end ${isFullRegion ? 'at-edge' : ''}`}
                style={{ left: `${regionEndPercent}%` }}
                onMouseDown={(e) => {
                  e.stopPropagation()
                  setIsDragging('end')
                }}
              />
              {/* Region overlay - only show when not full selection */}
              {!isFullRegion && (
                <div
                  className="daw-region"
                  style={{
                    left: `${regionStartPercent}%`,
                    width: `${regionEndPercent - regionStartPercent}%`,
                  }}
                >
                  <div className="daw-region-time">
                    {formatTime(regionEnd - regionStart)}
                  </div>
                </div>
              )}
            </>
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
            <div className={`daw-recording-indicator ${isPunchIn ? 'punch-in' : ''}`}>
              <span className="daw-recording-dot" />
              {isPunchIn ? 'PUNCH' : 'REC'}
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
            {isRecording && isPunchIn ? formatTime(punchInDuration) : isRecording ? '--:--' : formatTime(duration)}
          </span>
          {!isFullRegion && !isRecording && (
            <span className="daw-time-region">
              (selection: {formatTime(regionEnd - regionStart)})
            </span>
          )}
        </div>
      </div>

      {/* Transport Controls - Centralized */}
      <div className="daw-transport">
        <div className="daw-transport-controls">
          {/* Initial record button - just the red circle */}
          {!isRecording && !audioUrl && (
            <button
              className="daw-btn daw-btn-record daw-btn-large"
              onClick={onStartRecording}
              title="Start recording"
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="8" />
              </svg>
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
                    audioRef.current.currentTime = regionStart
                    setCurrentTime(regionStart)
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

              {/* Record button - just the red circle */}
              <button
                className="daw-btn daw-btn-record-again"
                onClick={handleRecord}
                title={isFullRegion ? "Re-record" : "Record selection"}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="12" r="8" />
                </svg>
              </button>

              {/* Reset selection - only show when region is not full */}
              {!isFullRegion && (
                <button
                  className="daw-btn daw-btn-transport"
                  onClick={resetRegion}
                  title="Reset selection"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              )}

              <div className="daw-transport-divider" />

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
        {isRecording && isPunchIn ? (
          <span>Recording selection... Will auto-stop at {formatTime(punchInDuration)}.</span>
        ) : isRecording ? (
          <span>Recording in progress... Click Stop when finished.</span>
        ) : audioUrl ? (
          <span>Drag handles to select a section. Record to punch-in. Finalize when ready.</span>
        ) : (
          <span>Click Record to start.</span>
        )}
      </div>
    </div>
  )
}

export default AudioWorkstation
