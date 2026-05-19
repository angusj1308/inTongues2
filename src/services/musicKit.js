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

// Kick off setQueue + play inside a user gesture (e.g. a library tile click)
// so MusicKit can start fetching audio bytes during the route transition into
// the player. Without this, MusicKit only begins buffering when the player's
// own play button is pressed, costing ~5s of cold-fetch latency on every track.
// Safari ties autoplay permission to the gesture's call stack, so callers must
// invoke this synchronously from a click handler — do not `await` it.
export const prewarmMusicPlayback = (trackId) => {
  if (!trackId) return
  const promise = configurePromise || getMusicKit()
  promise
    .then(async (inst) => {
      const current = inst.nowPlayingItem?.id
      if (current !== trackId) {
        await inst.setQueue({ song: trackId })
      }
      if (inst.playbackState !== 2) {
        await inst.play()
      }
    })
    .catch((err) => {
      console.warn('MusicKit prewarm failed', err?.message || err)
    })
}

export const authorizeMusicKit = async () => {
  const instance = await getMusicKit()
  return instance.authorize()
}

export const unauthorizeMusicKit = async () => {
  const instance = await getMusicKit()
  return instance.unauthorize()
}
