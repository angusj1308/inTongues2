// MusicKit JS singleton. Loaded once per browser session, configured with the
// server-issued Apple Music Developer Token. Subsequent callers reuse the
// resolved instance via the cached promise.

let configurePromise = null

const waitForMusicKit = () =>
  new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('MusicKit unavailable: no window'))
      return
    }
    if (window.MusicKit) {
      resolve(window.MusicKit)
      return
    }
    const onLoaded = () => {
      if (window.MusicKit) resolve(window.MusicKit)
      else reject(new Error('MusicKit script loaded but window.MusicKit missing'))
    }
    document.addEventListener('musickitloaded', onLoaded, { once: true })
  })

export const getMusicKit = () => {
  if (configurePromise) return configurePromise
  configurePromise = (async () => {
    const MusicKit = await waitForMusicKit()
    const res = await fetch('/api/music/developer-token')
    if (!res.ok) throw new Error(`Developer token fetch failed (${res.status})`)
    const { token } = await res.json()
    if (!token) throw new Error('Developer token endpoint returned no token')
    const instance = await MusicKit.configure({
      developerToken: token,
      app: { name: 'inTongues', build: '1.0' },
    })
    return instance
  })().catch((err) => {
    // Reset so subsequent calls can retry.
    configurePromise = null
    throw err
  })
  return configurePromise
}

let activePrewarmId = null
let activePrewarmPromise = null

// Kick off buffering inside a user gesture (e.g. a library tile click) so
// MusicKit can start fetching audio bytes during the route transition into
// the player. MusicKit JS v3 has no preload-without-play API — setQueue()
// alone never fetches audio — so we have to call play() to trigger the
// buffer. To avoid the audible blip of auto-playing during the navigation,
// we mute the instance, play to start the HLS fetch, pause as soon as
// playback actually begins, then restore volume. The AudioPlayer awaits
// the returned promise and shows a "preparing" screen until it settles.
// Safari ties autoplay permission to the gesture's call stack, so callers
// must invoke this synchronously from a click handler — do not `await` it.
export const prewarmMusicPlayback = (trackId, options = {}) => {
  if (!trackId) return null
  if (activePrewarmId === trackId && activePrewarmPromise) return activePrewarmPromise
  const queue = Array.isArray(options.queue) && options.queue.length ? options.queue : [trackId]
  const startIndex = Math.max(0, queue.indexOf(trackId))
  const promise = configurePromise || getMusicKit()
  activePrewarmId = trackId
  activePrewarmPromise = promise
    .then(async (inst) => {
      if (inst.nowPlayingItem?.id !== trackId) {
        // Always queue the whole list so MusicKit can pre-buffer the next
        // track while the user listens to the current one — that's what
        // makes the Skip buttons feel instant. Single-track entry points
        // just pass [trackId] which behaves like the old setQueue({ song }).
        await inst.setQueue({ songs: queue, startWith: startIndex })
      }
      const savedVolume = typeof inst.volume === 'number' ? inst.volume : 1
      try { inst.volume = 0 } catch { /* MusicKit may reject volume changes */ }
      try {
        if (inst.playbackState !== 2) {
          await inst.play()
        }
        await inst.pause()
      } finally {
        try { inst.volume = savedVolume } catch { /* restore best-effort */ }
      }
      return inst
    })
    .catch((err) => {
      console.warn('MusicKit prewarm failed', err?.message || err)
      throw err
    })
  return activePrewarmPromise
}

// Lets the player query whether a prewarm is in flight for this track so
// it can show the "preparing" screen until buffering finishes.
export const getActivePrewarm = (trackId) => {
  if (trackId && activePrewarmId !== trackId) return null
  return activePrewarmPromise
}

export const authorizeMusicKit = async () => {
  const instance = await getMusicKit()
  return instance.authorize()
}

export const unauthorizeMusicKit = async () => {
  const instance = await getMusicKit()
  return instance.unauthorize()
}
