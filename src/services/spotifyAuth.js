import { disconnect as disconnectSpotifyPlayer, pause as pauseSpotify } from './spotifyPlayer'

const SPOTIFY_TOKEN_KEYS = [
  'spotify_access_token',
  'spotify_refresh_token',
  'spotify_token',
  'spotify_auth_state',
]

const clearSpotifyStorage = () => {
  if (typeof window === 'undefined' || !window.localStorage) return
  SPOTIFY_TOKEN_KEYS.forEach((key) => {
    try {
      window.localStorage.removeItem(key)
    } catch (err) {
      console.error('Failed to remove Spotify storage key', key, err)
    }
  })
}

const logoutSpotifyWebSession = () =>
  new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve()
      return
    }

    const iframe = document.createElement('iframe')
    iframe.style.display = 'none'
    iframe.src = 'https://accounts.spotify.com/logout'
    document.body.appendChild(iframe)

    setTimeout(() => {
      try {
        document.body.removeChild(iframe)
      } catch (err) {
        console.error('Failed to remove Spotify logout iframe', err)
      }
      resolve()
    }, 1500)
  })

export const signOutFromSpotify = async (onComplete) => {
  clearSpotifyStorage()

  try {
    await pauseSpotify()
  } catch (err) {
    console.error('Unable to pause Spotify player during sign out', err)
  }

  try {
    await disconnectSpotifyPlayer()
  } catch (err) {
    console.error('Unable to disconnect Spotify player during sign out', err)
  }

  await logoutSpotifyWebSession()

  if (typeof onComplete === 'function') {
    await onComplete()
  }
}

export default signOutFromSpotify
