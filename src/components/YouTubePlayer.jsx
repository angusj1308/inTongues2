import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

let youtubeApiPromise = null

const loadYouTubeApi = () => {
  if (window.YT?.Player) return Promise.resolve(window.YT)

  if (!youtubeApiPromise) {
    youtubeApiPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector('script[src="https://www.youtube.com/iframe_api"]')
      if (existingScript) {
        existingScript.addEventListener('load', () => resolve(window.YT))
        existingScript.addEventListener('error', (error) => reject(error))
      } else {
        const tag = document.createElement('script')
        tag.src = 'https://www.youtube.com/iframe_api'
        tag.async = true
        tag.onerror = (error) => reject(error)
        document.body.appendChild(tag)
      }

      const previousHandler = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => {
        if (typeof previousHandler === 'function') previousHandler()
        resolve(window.YT)
      }
    })
  }

  return youtubeApiPromise
}

const YouTubePlayer = forwardRef(({ videoId, onStatus }, ref) => {
  const containerRef = useRef(null)
  const playerRef = useRef(null)
  const statusIntervalRef = useRef(null)

  const sendStatusUpdate = () => {
    if (!playerRef.current || !window.YT?.PlayerState) return

    const currentTime = playerRef.current.getCurrentTime?.() ?? 0
    const duration = playerRef.current.getDuration?.() ?? 0
    const state = playerRef.current.getPlayerState?.()
    const isPlaying = state === window.YT.PlayerState.PLAYING

    onStatus?.({ currentTime, duration, isPlaying })
  }

  useEffect(() => {
    let isMounted = true

    const createPlayer = async () => {
      try {
        const YT = await loadYouTubeApi()
        if (!isMounted || !containerRef.current) return

        playerRef.current = new YT.Player(containerRef.current, {
          videoId,
          playerVars: {
            controls: 0,
            rel: 0,
          },
          events: {
            onReady: sendStatusUpdate,
            onStateChange: sendStatusUpdate,
          },
        })

        statusIntervalRef.current = window.setInterval(sendStatusUpdate, 1000)
      } catch (error) {
        console.error('Failed to load YouTube player', error)
      }
    }

    createPlayer()

    return () => {
      isMounted = false
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current)
      }
      if (playerRef.current) {
        playerRef.current.destroy()
        playerRef.current = null
      }
    }
  }, [videoId])

  useImperativeHandle(
    ref,
    () => ({
      playVideo: () => {
        playerRef.current?.playVideo?.()
      },
      pauseVideo: () => {
        playerRef.current?.pauseVideo?.()
      },
      getCurrentTime: () => playerRef.current?.getCurrentTime?.() ?? 0,
      getDuration: () => playerRef.current?.getDuration?.() ?? 0,
      seekTo: (seconds) => playerRef.current?.seekTo?.(seconds, true),
    }),
    []
  )

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
})

YouTubePlayer.displayName = 'YouTubePlayer'

export default YouTubePlayer
