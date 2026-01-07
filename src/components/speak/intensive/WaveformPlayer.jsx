import React, { useEffect, useRef, useState } from 'react'

/**
 * Audio player with waveform visualization
 * Shows amplitude waveform and playback progress
 */
export function WaveformPlayer({
  src,
  label,
  color = '#3b82f6',
  onPlay,
  onPause,
  externalPlaying = null,
  onTimeUpdate
}) {
  const canvasRef = useRef(null)
  const audioRef = useRef(null)
  const animationRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [waveformData, setWaveformData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  // Generate waveform data from audio
  useEffect(() => {
    if (!src) return

    const generateWaveform = async () => {
      setIsLoading(true)
      try {
        const response = await fetch(src)
        const arrayBuffer = await response.arrayBuffer()
        const audioContext = new (window.AudioContext || window.webkitAudioContext)()
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

        // Get audio data from first channel
        const rawData = audioBuffer.getChannelData(0)
        const samples = 100 // Number of bars in waveform
        const blockSize = Math.floor(rawData.length / samples)
        const filteredData = []

        for (let i = 0; i < samples; i++) {
          let blockStart = blockSize * i
          let sum = 0
          for (let j = 0; j < blockSize; j++) {
            sum += Math.abs(rawData[blockStart + j])
          }
          filteredData.push(sum / blockSize)
        }

        // Normalize
        const maxVal = Math.max(...filteredData)
        const normalizedData = filteredData.map(n => n / maxVal)

        setWaveformData(normalizedData)
        setDuration(audioBuffer.duration)
        audioContext.close()
      } catch (err) {
        console.error('Error generating waveform:', err)
      }
      setIsLoading(false)
    }

    generateWaveform()
  }, [src])

  // Draw waveform
  useEffect(() => {
    if (!canvasRef.current || !waveformData) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1

    // Set canvas size
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const width = rect.width
    const height = rect.height
    const barWidth = width / waveformData.length
    const barGap = 2
    const progress = duration > 0 ? currentTime / duration : 0

    // Clear
    ctx.clearRect(0, 0, width, height)

    // Draw bars
    waveformData.forEach((value, index) => {
      const x = index * barWidth
      const barHeight = Math.max(4, value * (height - 8))
      const y = (height - barHeight) / 2

      // Color based on playback progress
      const barProgress = index / waveformData.length
      if (barProgress <= progress) {
        ctx.fillStyle = color
      } else {
        ctx.fillStyle = color + '40' // 25% opacity
      }

      ctx.beginPath()
      ctx.roundRect(x + 1, y, barWidth - barGap, barHeight, 2)
      ctx.fill()
    })
  }, [waveformData, currentTime, duration, color])

  // Handle audio time updates
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
      onTimeUpdate?.(audio.currentTime)
    }

    const handleEnded = () => {
      setIsPlaying(false)
      setCurrentTime(0)
      onPause?.()
    }

    const handleLoadedMetadata = () => {
      setDuration(audio.duration)
    }

    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('loadedmetadata', handleLoadedMetadata)

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
    }
  }, [onTimeUpdate, onPause])

  // Handle external playing state (for native audio controlled externally)
  useEffect(() => {
    if (externalPlaying !== null) {
      setIsPlaying(externalPlaying)
    }
  }, [externalPlaying])

  const togglePlayPause = () => {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
      onPause?.()
    } else {
      audio.play()
      setIsPlaying(true)
      onPlay?.()
    }
  }

  const handleCanvasClick = (e) => {
    if (!canvasRef.current || !audioRef.current || !duration) return

    const rect = canvasRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const progress = x / rect.width
    const newTime = progress * duration

    audioRef.current.currentTime = newTime
    setCurrentTime(newTime)
  }

  const formatTime = (time) => {
    const mins = Math.floor(time / 60)
    const secs = Math.floor(time % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="waveform-player">
      <audio ref={audioRef} src={src} preload="metadata" />

      <div className="waveform-header">
        <span className="waveform-label" style={{ color }}>{label}</span>
        <span className="waveform-time">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>

      <div className="waveform-container">
        <button
          className="waveform-play-btn"
          onClick={togglePlayPause}
          style={{ backgroundColor: color }}
        >
          {isPlaying ? (
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

        <div className="waveform-canvas-wrapper" onClick={handleCanvasClick}>
          {isLoading ? (
            <div className="waveform-loading">
              <div className="waveform-loading-bars">
                {[...Array(20)].map((_, i) => (
                  <div
                    key={i}
                    className="waveform-loading-bar"
                    style={{
                      height: `${20 + Math.random() * 60}%`,
                      backgroundColor: color + '40'
                    }}
                  />
                ))}
              </div>
            </div>
          ) : (
            <canvas ref={canvasRef} className="waveform-canvas" />
          )}
        </div>
      </div>
    </div>
  )
}

export default WaveformPlayer
