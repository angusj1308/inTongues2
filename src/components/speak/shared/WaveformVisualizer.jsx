import React, { useRef, useEffect, useCallback } from 'react'

/**
 * Real-time audio waveform visualization using Canvas
 * Can visualize either a live audio stream (analyser node) or a static audio file
 */
export function WaveformVisualizer({
  analyserNode,
  audioUrl,
  isRecording = false,
  height = 60,
  barColor = '#3b82f6',
  backgroundColor = 'transparent',
  barWidth = 3,
  barGap = 2,
  className = ''
}) {
  const canvasRef = useRef(null)
  const animationRef = useRef(null)
  const audioRef = useRef(null)
  const audioContextRef = useRef(null)
  const staticAnalyserRef = useRef(null)

  // Draw waveform from analyser node (real-time)
  const drawLiveWaveform = useCallback(() => {
    if (!analyserNode || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const bufferLength = analyserNode.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    const draw = () => {
      if (!isRecording) {
        // Draw flat line when not recording
        ctx.fillStyle = backgroundColor
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = barColor
        ctx.globalAlpha = 0.3
        ctx.fillRect(0, canvas.height / 2 - 1, canvas.width, 2)
        ctx.globalAlpha = 1
        return
      }

      animationRef.current = requestAnimationFrame(draw)
      analyserNode.getByteTimeDomainData(dataArray)

      ctx.fillStyle = backgroundColor
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Calculate how many bars we can fit
      const totalBarWidth = barWidth + barGap
      const numBars = Math.floor(canvas.width / totalBarWidth)
      const samplesPerBar = Math.floor(bufferLength / numBars)

      ctx.fillStyle = barColor

      for (let i = 0; i < numBars; i++) {
        // Average the samples for this bar
        let sum = 0
        for (let j = 0; j < samplesPerBar; j++) {
          const index = i * samplesPerBar + j
          sum += Math.abs(dataArray[index] - 128)
        }
        const average = sum / samplesPerBar

        // Normalize and scale
        const normalizedHeight = (average / 128) * canvas.height
        const barHeight = Math.max(2, normalizedHeight)

        const x = i * totalBarWidth
        const y = (canvas.height - barHeight) / 2

        // Draw rounded bar
        ctx.beginPath()
        ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2)
        ctx.fill()
      }
    }

    draw()
  }, [analyserNode, isRecording, barColor, backgroundColor, barWidth, barGap])

  // Draw static waveform from audio file
  const drawStaticWaveform = useCallback(async () => {
    if (!audioUrl || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    try {
      // Fetch and decode audio
      const response = await fetch(audioUrl)
      const arrayBuffer = await response.arrayBuffer()

      const audioContext = new (window.AudioContext || window.webkitAudioContext)()
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

      // Get channel data
      const channelData = audioBuffer.getChannelData(0)

      // Clear canvas
      ctx.fillStyle = backgroundColor
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Calculate bars
      const totalBarWidth = barWidth + barGap
      const numBars = Math.floor(canvas.width / totalBarWidth)
      const samplesPerBar = Math.floor(channelData.length / numBars)

      ctx.fillStyle = barColor

      for (let i = 0; i < numBars; i++) {
        // Find the max amplitude in this segment
        let max = 0
        for (let j = 0; j < samplesPerBar; j++) {
          const index = i * samplesPerBar + j
          const absValue = Math.abs(channelData[index])
          if (absValue > max) max = absValue
        }

        // Scale to canvas height
        const barHeight = Math.max(2, max * canvas.height * 0.9)
        const x = i * totalBarWidth
        const y = (canvas.height - barHeight) / 2

        ctx.beginPath()
        ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2)
        ctx.fill()
      }

      audioContext.close()
    } catch (err) {
      console.error('Error drawing static waveform:', err)
      // Draw fallback line
      ctx.fillStyle = backgroundColor
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = barColor
      ctx.globalAlpha = 0.3
      ctx.fillRect(0, canvas.height / 2 - 1, canvas.width, 2)
      ctx.globalAlpha = 1
    }
  }, [audioUrl, barColor, backgroundColor, barWidth, barGap])

  // Handle live recording visualization
  useEffect(() => {
    if (analyserNode && isRecording) {
      drawLiveWaveform()
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [analyserNode, isRecording, drawLiveWaveform])

  // Handle static audio visualization
  useEffect(() => {
    if (audioUrl && !analyserNode) {
      drawStaticWaveform()
    }
  }, [audioUrl, analyserNode, drawStaticWaveform])

  // Draw initial state
  useEffect(() => {
    if (canvasRef.current && !isRecording && !audioUrl) {
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = backgroundColor
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = barColor
      ctx.globalAlpha = 0.3
      ctx.fillRect(0, canvas.height / 2 - 1, canvas.width, 2)
      ctx.globalAlpha = 1
    }
  }, [isRecording, audioUrl, barColor, backgroundColor])

  return (
    <canvas
      ref={canvasRef}
      className={`waveform-visualizer ${className}`}
      width={300}
      height={height}
      style={{
        width: '100%',
        height: `${height}px`,
        borderRadius: '8px'
      }}
    />
  )
}

export default WaveformVisualizer
