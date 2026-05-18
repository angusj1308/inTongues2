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

export const authorizeMusicKit = async () => {
  const instance = await getMusicKit()
  return instance.authorize()
}

export const unauthorizeMusicKit = async () => {
  const instance = await getMusicKit()
  return instance.unauthorize()
}
