import { useEffect, useState } from 'react'
import { getMusicKit } from '../services/musicKit'

// React wrapper around the MusicKit JS singleton. Tracks authorization state
// and exposes connect/disconnect handlers.
const useMusicKit = () => {
  const [instance, setInstance] = useState(null)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    let cleanup = null
    getMusicKit()
      .then((inst) => {
        if (cancelled) return
        setInstance(inst)
        setIsAuthorized(Boolean(inst.isAuthorized))
        const onChange = () => {
          if (!cancelled) setIsAuthorized(Boolean(inst.isAuthorized))
        }
        inst.addEventListener('authorizationStatusDidChange', onChange)
        cleanup = () => inst.removeEventListener('authorizationStatusDidChange', onChange)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'MusicKit unavailable')
      })
    return () => {
      cancelled = true
      if (cleanup) cleanup()
    }
  }, [])

  const connect = async () => {
    if (!instance) return
    setError('')
    try {
      await instance.authorize()
      setIsAuthorized(true)
    } catch (err) {
      setError(err?.message || 'Authorization failed')
    }
  }

  const disconnect = async () => {
    if (!instance) return
    setError('')
    try {
      await instance.unauthorize()
      setIsAuthorized(false)
    } catch (err) {
      setError(err?.message || 'Sign out failed')
    }
  }

  return {
    ready: Boolean(instance),
    isAuthorized,
    error,
    connect,
    disconnect,
    instance,
  }
}

export default useMusicKit
