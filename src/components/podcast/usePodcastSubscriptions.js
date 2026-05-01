import { useEffect, useMemo, useState } from 'react'
import useAuth from '../../context/AuthContext'
import {
  followShow,
  unfollowShow,
  unpinByRef,
  subscribeFollowedShows,
  subscribePins,
  subscribeEpisodeStates,
  subscribePlaylists,
} from '../../services/podcast'

// Single hook every podcast surface uses. Provides live data + optimistic
// follow/unfollow that reconciles with Firestore.
const usePodcastSubscriptions = () => {
  const { user } = useAuth()
  const [followedShows, setFollowedShows] = useState([])
  const [pins, setPins] = useState([])
  const [episodeStates, setEpisodeStates] = useState([])
  const [playlists, setPlaylists] = useState([])
  const [pendingFollow, setPendingFollow] = useState(() => new Map())
  // pendingFollow: Map<showId, { state: 'follow' | 'unfollow', show? }>

  useEffect(() => {
    if (!user?.uid) return undefined
    const u1 = subscribeFollowedShows(user.uid, (rows) => {
      setFollowedShows(rows)
      setPendingFollow((prev) => {
        if (!prev.size) return prev
        const next = new Map(prev)
        const ids = new Set(rows.map((r) => r.id))
        for (const [id, entry] of next) {
          if (entry.state === 'follow' && ids.has(id)) next.delete(id)
          if (entry.state === 'unfollow' && !ids.has(id)) next.delete(id)
        }
        return next
      })
    })
    const u2 = subscribePins(user.uid, setPins)
    const u3 = subscribeEpisodeStates(user.uid, setEpisodeStates)
    const u4 = subscribePlaylists(user.uid, setPlaylists)
    return () => {
      u1()
      u2()
      u3()
      u4()
    }
  }, [user?.uid])

  const followedIds = useMemo(() => {
    const set = new Set(followedShows.map((s) => s.id))
    for (const [id, entry] of pendingFollow) {
      if (entry.state === 'follow') set.add(id)
      if (entry.state === 'unfollow') set.delete(id)
    }
    return set
  }, [followedShows, pendingFollow])

  const pinnedRefs = useMemo(() => new Set(pins.map((p) => p.refId)), [pins])

  const isFollowed = (showId) => followedIds.has(showId)
  const isPinned = (refId) => pinnedRefs.has(refId)

  const follow = async (show) => {
    if (!user?.uid || !show?.id) return
    setPendingFollow((prev) => {
      const next = new Map(prev)
      next.set(show.id, { state: 'follow', show })
      return next
    })
    try {
      await followShow(user.uid, show)
    } catch (err) {
      console.error('follow failed', err)
      setPendingFollow((prev) => {
        const next = new Map(prev)
        next.delete(show.id)
        return next
      })
    }
  }

  const unfollow = async (showId) => {
    if (!user?.uid || !showId) return
    const wasPinned = pinnedRefs.has(showId)
    setPendingFollow((prev) => {
      const next = new Map(prev)
      next.set(showId, { state: 'unfollow' })
      return next
    })
    try {
      await unfollowShow(user.uid, showId)
      if (wasPinned) await unpinByRef(user.uid, showId)
    } catch (err) {
      console.error('unfollow failed', err)
      setPendingFollow((prev) => {
        const next = new Map(prev)
        next.delete(showId)
        return next
      })
    }
  }

  return {
    user,
    followedShows,
    pins,
    episodeStates,
    playlists,
    followedIds,
    pinnedRefs,
    isFollowed,
    isPinned,
    follow,
    unfollow,
  }
}

export default usePodcastSubscriptions
