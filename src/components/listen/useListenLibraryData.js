import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { db } from '../../firebase'
import {
  subscribeFollowedShows,
  subscribeEpisodeStates,
} from '../../services/podcast'
import {
  subscribeFollowedArtists,
  subscribeSavedAlbums,
  subscribeSavedTracks,
} from '../../services/music'

// Reads every Listen library source the existing front-end already uses, in
// one hook so callers don't have to repeat the Firestore wiring.
export default function useListenLibraryData(uid) {
  const [audiobooks, setAudiobooks] = useState([])
  const [youtubeVideos, setYoutubeVideos] = useState([])
  const [episodeStates, setEpisodeStates] = useState([])
  const [followedShows, setFollowedShows] = useState([])
  const [savedTracks, setSavedTracks] = useState([])
  const [savedAlbums, setSavedAlbums] = useState([])
  const [followedArtists, setFollowedArtists] = useState([])

  useEffect(() => {
    if (!uid) {
      setAudiobooks([])
      setYoutubeVideos([])
      setEpisodeStates([])
      setFollowedShows([])
      setSavedTracks([])
      setSavedAlbums([])
      setFollowedArtists([])
      return undefined
    }

    const storiesRef = collection(db, 'users', uid, 'stories')
    const storiesQuery = query(
      storiesRef,
      where('hasFullAudio', '==', true),
      orderBy('createdAt', 'desc'),
    )
    const unsubStories = onSnapshot(storiesQuery, (snap) => {
      setAudiobooks(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })

    const videosRef = collection(db, 'users', uid, 'youtubeVideos')
    const videosQuery = query(videosRef, orderBy('createdAt', 'desc'))
    const unsubVideos = onSnapshot(videosQuery, (snap) => {
      setYoutubeVideos(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })

    const unsubEpisodes = subscribeEpisodeStates(uid, setEpisodeStates)
    const unsubShows = subscribeFollowedShows(uid, setFollowedShows)
    const unsubTracks = subscribeSavedTracks(uid, setSavedTracks)
    const unsubAlbums = subscribeSavedAlbums(uid, setSavedAlbums)
    const unsubArtists = subscribeFollowedArtists(uid, setFollowedArtists)

    return () => {
      unsubStories()
      unsubVideos()
      unsubEpisodes && unsubEpisodes()
      unsubShows && unsubShows()
      unsubTracks && unsubTracks()
      unsubAlbums && unsubAlbums()
      unsubArtists && unsubArtists()
    }
  }, [uid])

  return {
    audiobooks,
    youtubeVideos,
    episodeStates,
    followedShows,
    savedTracks,
    savedAlbums,
    followedArtists,
  }
}

// Normalise an item from any of the four mediums into the shape the hero card
// and shelves render. Returns null when the input has no last-played stamp.
export function toContinueCandidate(medium, item) {
  if (!item) return null
  switch (medium) {
    case 'audiobook': {
      const ts = item.lastOpenedAt?.toMillis?.() ?? Number(item.lastOpenedAt) ?? 0
      if (!ts) return null
      const total = Number(item.totalChapters || item.totalPhases || 0)
      const done = Number(item.chaptersGenerated || item.lastPhaseCompleted || 0)
      const progress = Number(item.progress) || (total > 0 ? Math.round((done / total) * 100) : 0)
      return {
        medium: 'audiobook',
        id: item.id,
        title: item.storyTitle || item.title || 'Untitled',
        creator: item.author || '',
        coverUrl: item.coverImageUrl || item.coverUrl || '',
        progress,
        lastPlayedAt: ts,
        playHref: `/listen/${item.id}`,
      }
    }
    case 'podcast': {
      const ts = item.lastPlayedAt?.toMillis?.() ?? Number(item.lastPlayedAt) ?? 0
      if (!ts) return null
      const progressMs = Number(item.progressMs) || 0
      const durationMs = Number(item.durationMs) || 0
      const progress = durationMs > 0
        ? Math.min(100, Math.round((progressMs / durationMs) * 100))
        : 0
      return {
        medium: 'podcast',
        id: item.episodeId || item.id,
        title: item.title || 'Untitled episode',
        creator: item.showName || '',
        coverUrl: item.coverUrl || '',
        progress,
        progressMs,
        durationMs,
        lastPlayedAt: ts,
        playHref: `/listen/${item.episodeId || item.id}?source=podcast`,
      }
    }
    case 'music': {
      const ts = item.lastPlayedAt?.toMillis?.() ?? item.savedAt?.toMillis?.() ?? 0
      if (!ts) return null
      return {
        medium: 'music',
        id: item.trackId || item.id,
        title: item.title || 'Untitled track',
        creator: item.artistName || '',
        coverUrl: item.coverUrl || '',
        progress: null,
        lastPlayedAt: ts,
        playHref: `/listen/${item.trackId || item.id}?source=music`,
      }
    }
    case 'video': {
      const ts = item.lastOpenedAt?.toMillis?.() ?? item.createdAt?.toMillis?.() ?? 0
      if (!ts) return null
      const progress = Number(item.progress) || 0
      return {
        medium: 'video',
        id: item.id,
        title: item.title || 'Untitled video',
        creator: item.channelTitle || '',
        coverUrl: item.coverUrl || item.thumbnailUrl || '',
        progress,
        lastPlayedAt: ts,
        playHref: `/cinema/${item.id}`,
      }
    }
    default:
      return null
  }
}

export function pickContinueListening(data) {
  const candidates = []
  data.audiobooks?.forEach((b) => {
    const c = toContinueCandidate('audiobook', b)
    if (c) candidates.push(c)
  })
  data.episodeStates?.forEach((e) => {
    const c = toContinueCandidate('podcast', e)
    if (c) candidates.push(c)
  })
  data.savedTracks?.forEach((t) => {
    const c = toContinueCandidate('music', t)
    if (c) candidates.push(c)
  })
  data.youtubeVideos?.forEach((v) => {
    const c = toContinueCandidate('video', v)
    if (c) candidates.push(c)
  })
  if (!candidates.length) return null
  candidates.sort((a, b) => b.lastPlayedAt - a.lastPlayedAt)
  return candidates[0]
}
