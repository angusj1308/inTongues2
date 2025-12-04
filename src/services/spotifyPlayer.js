let player = null
let deviceId = ''
let readyPromise = null
let tokenProvider = null
const stateListeners = new Set()

const handleStateChange = (state) => {
  stateListeners.forEach((listener) => {
    try {
      listener(state)
    } catch (err) {
      console.error('Spotify state listener error', err)
    }
  })
}

export const initSpotifyPlayer = (getOAuthTokenFn) => {
  if (typeof getOAuthTokenFn !== 'function') {
    throw new Error('getOAuthTokenFn must be a function')
  }

  tokenProvider = getOAuthTokenFn

  if (readyPromise) return readyPromise

  readyPromise = new Promise((resolve, reject) => {
    if (!window.Spotify || !window.Spotify.Player) {
      reject(new Error('Spotify Web Playback SDK not available'))
      return
    }

    player = new window.Spotify.Player({
      name: 'inTongues Player',
      getOAuthToken: async (cb) => {
        try {
          const token = await tokenProvider()
          if (token) cb(token)
        } catch (err) {
          console.error('Spotify token error', err)
        }
      },
      volume: 0.5,
    })

    player.addListener('ready', ({ device_id: id }) => {
      deviceId = id
      resolve(player)
    })

    player.addListener('not_ready', ({ device_id: id }) => {
      if (deviceId === id) {
        deviceId = ''
      }
    })

    player.addListener('player_state_changed', (state) => {
      handleStateChange(state)
    })

    player.addListener('initialization_error', ({ message }) => {
      console.error('Spotify initialization error', message)
      reject(new Error(message))
    })

    player.addListener('authentication_error', ({ message }) => {
      console.error('Spotify authentication error', message)
      reject(new Error(message))
    })

    player.addListener('account_error', ({ message }) => {
      console.error('Spotify account error', message)
      reject(new Error(message))
    })

    player.addListener('playback_error', ({ message }) => {
      console.error('Spotify playback error', message)
    })

    player.connect().catch(reject)
  })

  return readyPromise.catch((err) => {
    readyPromise = null
    throw err
  })
}

export const connect = async () => {
  if (!player) throw new Error('Spotify player not initialised')
  return player.connect()
}

export const disconnect = async () => {
  if (player) {
    await player.disconnect()
  }
  player = null
  deviceId = ''
  readyPromise = null
}

export const getPlayer = () => player

export const getDeviceId = () => deviceId

export const togglePlay = async () => {
  if (!player) return
  await player.togglePlay()
}

export const pause = async () => {
  if (!player) return
  await player.pause()
}

export const resume = async () => {
  if (!player) return
  await player.resume()
}

export const seek = async (positionMs) => {
  if (!player) return
  await player.seek(positionMs)
}

export const subscribeToStateChanges = (listener) => {
  if (typeof listener !== 'function') return () => {}
  stateListeners.add(listener)
  return () => stateListeners.delete(listener)
}

export const isReady = () => Boolean(player && deviceId)

