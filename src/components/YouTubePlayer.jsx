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

const YouTubePlayer = forwardRef(({ videoId, controls = true, onStatus, onPlayerReady, onPlayerStateChange }, ref) => {
  const containerRef = useRef(null)
  const playerRef = useRef(null)
  const statusIntervalRef = useRef(null)
  const savedPositionRef = useRef(null)
  // Prime-and-pause trick: autoplay muted so the first real frame renders
  // (instead of YouTube's thumbnail), then pause immediately in onReady.
  // unmute + play on the user's first real interaction. Tracks state so we
  // only unmute once per player instance.
  const primedRef = useRef(false)
  const hasUnmutedRef = useRef(false)

  const ensureUnmuted = () => {
    if (hasUnmutedRef.current) return
    playerRef.current?.unMute?.()
    hasUnmutedRef.current = true
  }

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
    primedRef.current = false
    hasUnmutedRef.current = false

    const createPlayer = async () => {
      try {
        const YT = await loadYouTubeApi()
        if (!isMounted || !containerRef.current) return

        playerRef.current = new YT.Player(containerRef.current, {
          videoId,
          playerVars: {
            controls: controls ? 1 : 0,
            rel: 0,
            cc_load_policy: 0,
            modestbranding: 1,
            playsinline: 1,
            autoplay: 1,
            mute: 1,
          },
          events: {
            onReady: (event) => {
              // Restore position if player was recreated (e.g., controls changed)
              if (savedPositionRef.current !== null) {
                playerRef.current?.seekTo?.(savedPositionRef.current, true)
                savedPositionRef.current = null
              }
              sendStatusUpdate()
              onPlayerReady?.(playerRef.current, event)
            },
            onStateChange: (event) => {
              // First PLAYING event = autoplay kicked in. Pause immediately so
              // the user lands on the first video frame (not the thumbnail).
              // Subsequent PLAYING events are real user intent → unmute.
              if (event?.data === window.YT?.PlayerState?.PLAYING) {
                if (!primedRef.current) {
                  primedRef.current = true
                  playerRef.current?.pauseVideo?.()
                } else {
                  ensureUnmuted()
                }
              }
              sendStatusUpdate()
              onPlayerStateChange?.(event, playerRef.current)
            },
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
        // Save position before destroying so we can restore after recreate
        savedPositionRef.current = playerRef.current.getCurrentTime?.() ?? null
        playerRef.current.destroy()
        playerRef.current = null
      }
    }
  }, [videoId, controls])

  useImperativeHandle(
    ref,
    () => ({
      playVideo: () => {
        ensureUnmuted()
        playerRef.current?.playVideo?.()
      },
      pauseVideo: () => {
        playerRef.current?.pauseVideo?.()
      },
      getCurrentTime: () => playerRef.current?.getCurrentTime?.() ?? 0,
      getDuration: () => playerRef.current?.getDuration?.() ?? 0,
      seekTo: (seconds) => playerRef.current?.seekTo?.(seconds, true),
      mute: () => playerRef.current?.mute?.(),
      unMute: () => {
        hasUnmutedRef.current = true
        playerRef.current?.unMute?.()
      },
      setPlaybackRate: (rate) => playerRef.current?.setPlaybackRate?.(rate),
      getPlaybackRate: () => playerRef.current?.getPlaybackRate?.() ?? 1,
      getPlayer: () => playerRef.current,
      getIframe: () => playerRef.current?.getIframe?.(),
    }),
    []
  )

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
})

YouTubePlayer.displayName = 'YouTubePlayer'

export default YouTubePlayer
