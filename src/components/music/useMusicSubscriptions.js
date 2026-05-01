import { useEffect, useMemo, useState } from 'react'
import useAuth from '../../context/AuthContext'
import {
  followArtist,
  unfollowArtist,
  saveAlbum,
  unsaveAlbum,
  saveTrack,
  unsaveTrack,
  unpinByRef,
  subscribeFollowedArtists,
  subscribeSavedAlbums,
  subscribeSavedTracks,
  subscribePins,
  subscribeTrackStates,
  subscribePlaylists,
} from '../../services/music'

// Optimistic-state hook for the music surface. Mirrors usePodcastSubscriptions
// but talks to the music collections.
const useMusicSubscriptions = () => {
  const { user } = useAuth()
  const [followedArtists, setFollowedArtists] = useState([])
  const [savedAlbums, setSavedAlbums] = useState([])
  const [savedTracks, setSavedTracks] = useState([])
  const [pins, setPins] = useState([])
  const [trackStates, setTrackStates] = useState([])
  const [playlists, setPlaylists] = useState([])

  // pendingFollow: Map<artistId, { state: 'follow' | 'unfollow' }>
  const [pendingFollow, setPendingFollow] = useState(() => new Map())
  // pendingAlbum: Map<albumId, { state: 'save' | 'unsave' }>
  const [pendingAlbum, setPendingAlbum] = useState(() => new Map())
  // pendingTrack: Map<trackId, { state: 'save' | 'unsave' }>
  const [pendingTrack, setPendingTrack] = useState(() => new Map())

  useEffect(() => {
    if (!user?.uid) return undefined
    const u1 = subscribeFollowedArtists(user.uid, (rows) => {
      setFollowedArtists(rows)
      setPendingFollow((prev) => reconcile(prev, rows))
    })
    const u2 = subscribeSavedAlbums(user.uid, (rows) => {
      setSavedAlbums(rows)
      setPendingAlbum((prev) => reconcile(prev, rows, 'save'))
    })
    const u3 = subscribeSavedTracks(user.uid, (rows) => {
      setSavedTracks(rows)
      setPendingTrack((prev) => reconcile(prev, rows, 'save'))
    })
    const u4 = subscribePins(user.uid, setPins)
    const u5 = subscribeTrackStates(user.uid, setTrackStates)
    const u6 = subscribePlaylists(user.uid, setPlaylists)
    return () => {
      u1()
      u2()
      u3()
      u4()
      u5()
      u6()
    }
  }, [user?.uid])

  const followedIds = useMemo(() => {
    const set = new Set(followedArtists.map((a) => a.id))
    for (const [id, entry] of pendingFollow) {
      if (entry.state === 'follow') set.add(id)
      if (entry.state === 'unfollow') set.delete(id)
    }
    return set
  }, [followedArtists, pendingFollow])

  const savedAlbumIds = useMemo(() => {
    const set = new Set(savedAlbums.map((a) => a.id))
    for (const [id, entry] of pendingAlbum) {
      if (entry.state === 'save') set.add(id)
      if (entry.state === 'unsave') set.delete(id)
    }
    return set
  }, [savedAlbums, pendingAlbum])

  const savedTrackIds = useMemo(() => {
    const set = new Set(savedTracks.map((t) => t.id))
    for (const [id, entry] of pendingTrack) {
      if (entry.state === 'save') set.add(id)
      if (entry.state === 'unsave') set.delete(id)
    }
    return set
  }, [savedTracks, pendingTrack])

  const pinnedRefs = useMemo(() => new Set(pins.map((p) => p.refId)), [pins])

  const isFollowedArtist = (artistId) => followedIds.has(artistId)
  const isSavedAlbum = (albumId) => savedAlbumIds.has(albumId)
  const isSavedTrack = (trackId) => savedTrackIds.has(trackId)
  const isPinned = (refId) => pinnedRefs.has(refId)

  const follow = async (artist) => {
    if (!user?.uid || !artist?.id) return
    setPendingFollow((prev) => withEntry(prev, artist.id, 'follow'))
    try {
      await followArtist(user.uid, artist)
    } catch (err) {
      console.error('followArtist failed', err)
      setPendingFollow((prev) => withoutEntry(prev, artist.id))
    }
  }

  const unfollow = async (artistId) => {
    if (!user?.uid || !artistId) return
    const wasPinned = pinnedRefs.has(artistId)
    setPendingFollow((prev) => withEntry(prev, artistId, 'unfollow'))
    try {
      await unfollowArtist(user.uid, artistId)
      if (wasPinned) await unpinByRef(user.uid, artistId)
    } catch (err) {
      console.error('unfollowArtist failed', err)
      setPendingFollow((prev) => withoutEntry(prev, artistId))
    }
  }

  const toggleAlbum = async (album, save) => {
    if (!user?.uid || !album?.id) return
    if (save) {
      setPendingAlbum((prev) => withEntry(prev, album.id, 'save'))
      try {
        await saveAlbum(user.uid, album)
      } catch (err) {
        console.error('saveAlbum failed', err)
        setPendingAlbum((prev) => withoutEntry(prev, album.id))
      }
    } else {
      setPendingAlbum((prev) => withEntry(prev, album.id, 'unsave'))
      try {
        await unsaveAlbum(user.uid, album.id)
      } catch (err) {
        console.error('unsaveAlbum failed', err)
        setPendingAlbum((prev) => withoutEntry(prev, album.id))
      }
    }
  }

  const toggleTrack = async (track, save) => {
    if (!user?.uid || !track?.id) return
    if (save) {
      setPendingTrack((prev) => withEntry(prev, track.id, 'save'))
      try {
        await saveTrack(user.uid, track)
      } catch (err) {
        console.error('saveTrack failed', err)
        setPendingTrack((prev) => withoutEntry(prev, track.id))
      }
    } else {
      setPendingTrack((prev) => withEntry(prev, track.id, 'unsave'))
      try {
        await unsaveTrack(user.uid, track.id)
      } catch (err) {
        console.error('unsaveTrack failed', err)
        setPendingTrack((prev) => withoutEntry(prev, track.id))
      }
    }
  }

  return {
    user,
    followedArtists,
    savedAlbums,
    savedTracks,
    pins,
    trackStates,
    playlists,
    followedIds,
    savedAlbumIds,
    savedTrackIds,
    pinnedRefs,
    isFollowedArtist,
    isSavedAlbum,
    isSavedTrack,
    isPinned,
    follow,
    unfollow,
    toggleAlbum,
    toggleTrack,
  }
}

const withEntry = (prev, id, state) => {
  const next = new Map(prev)
  next.set(id, { state })
  return next
}

const withoutEntry = (prev, id) => {
  const next = new Map(prev)
  next.delete(id)
  return next
}

const reconcile = (pending, rows) => {
  if (!pending.size) return pending
  const next = new Map(pending)
  const ids = new Set(rows.map((r) => r.id))
  for (const [id, entry] of next) {
    if ((entry.state === 'follow' || entry.state === 'save') && ids.has(id)) next.delete(id)
    if ((entry.state === 'unfollow' || entry.state === 'unsave') && !ids.has(id)) next.delete(id)
  }
  return next
}

export default useMusicSubscriptions
