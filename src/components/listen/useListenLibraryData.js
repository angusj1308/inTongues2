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
import { subscribeFollowedChannels } from '../../services/youtubeChannels'
import { subscribeSavedPlaylists } from '../../services/youtubePlaylists'
import { getYouTubeThumbnailFromVideo } from '../../utils/youtube'

// Reads every Listen library source the existing front-end already uses, in
// one hook so callers don't have to repeat the Firestore wiring.
//
// All sources are scoped to the user's `activeLanguage`. Filtering runs
// in-memory rather than via Firestore `where` clauses so we don't need
// a new composite index for the audiobook query. Items missing a
// `language` field are treated as Spanish, since Spanish was the only
// environment with library content before per-language separation
// landed.
export default function useListenLibraryData(uid, activeLanguage = '') {
  const [audiobooks, setAudiobooks] = useState([])
  const [youtubeVideos, setYoutubeVideos] = useState([])
  const [episodeStates, setEpisodeStates] = useState([])
  const [followedShows, setFollowedShows] = useState([])
  const [savedTracks, setSavedTracks] = useState([])
  const [savedAlbums, setSavedAlbums] = useState([])
  const [followedArtists, setFollowedArtists] = useState([])
  const [followedYoutubeChannels, setFollowedYoutubeChannels] = useState([])
  const [savedPlaylists, setSavedPlaylists] = useState([])
  // spotifyItems carries the actual lastPlayedAt timestamp for music tracks
  // (the player writes there on every progress tick). savedTracks only
  // has savedAt — not enough to drive Continue Listening.
  const [spotifyItems, setSpotifyItems] = useState([])

  useEffect(() => {
    if (!uid || !activeLanguage) {
      setAudiobooks([])
      setYoutubeVideos([])
      setEpisodeStates([])
      setFollowedShows([])
      setSavedTracks([])
      setSavedAlbums([])
      setFollowedArtists([])
      setFollowedYoutubeChannels([])
      setSavedPlaylists([])
      setSpotifyItems([])
      return undefined
    }

    // Legacy items predate per-language tagging; assume Spanish (the
    // only language with library content before this change).
    const matchesLanguage = (item) => (item?.language || 'Spanish') === activeLanguage

    const storiesRef = collection(db, 'users', uid, 'stories')
    const storiesQuery = query(
      storiesRef,
      where('hasFullAudio', '==', true),
      orderBy('createdAt', 'desc'),
    )
    const unsubStories = onSnapshot(storiesQuery, (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      setAudiobooks(all.filter(matchesLanguage))
    })

    const videosRef = collection(db, 'users', uid, 'youtubeVideos')
    const videosQuery = query(videosRef, orderBy('createdAt', 'desc'))
    const unsubVideos = onSnapshot(videosQuery, (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      setYoutubeVideos(all.filter(matchesLanguage))
    })

    const spotifyRef = collection(db, 'users', uid, 'spotifyItems')
    const unsubSpotify = onSnapshot(
      spotifyRef,
      (snap) => {
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        setSpotifyItems(all.filter(matchesLanguage))
      },
      // Collection may not exist for some users; non-fatal.
      () => setSpotifyItems([]),
    )

    const unsubEpisodes = subscribeEpisodeStates(uid, (rows) => {
      setEpisodeStates(rows.filter(matchesLanguage))
    })
    const unsubShows = subscribeFollowedShows(uid, (rows) => {
      setFollowedShows(rows.filter(matchesLanguage))
    })
    const unsubTracks = subscribeSavedTracks(uid, (rows) => {
      setSavedTracks(rows.filter(matchesLanguage))
    })
    const unsubAlbums = subscribeSavedAlbums(uid, (rows) => {
      setSavedAlbums(rows.filter(matchesLanguage))
    })
    const unsubArtists = subscribeFollowedArtists(uid, (rows) => {
      setFollowedArtists(rows.filter(matchesLanguage))
    })
    const unsubYoutubeChannels = subscribeFollowedChannels(uid, (rows) => {
      setFollowedYoutubeChannels(rows.filter(matchesLanguage))
    })
    const unsubPlaylists = subscribeSavedPlaylists(uid, (rows) => {
      setSavedPlaylists(rows.filter(matchesLanguage))
    })

    return () => {
      unsubStories()
      unsubVideos()
      unsubSpotify()
      unsubEpisodes && unsubEpisodes()
      unsubShows && unsubShows()
      unsubTracks && unsubTracks()
      unsubAlbums && unsubAlbums()
      unsubArtists && unsubArtists()
      unsubYoutubeChannels && unsubYoutubeChannels()
      unsubPlaylists && unsubPlaylists()
    }
  }, [uid, activeLanguage])

  return {
    audiobooks,
    youtubeVideos,
    episodeStates,
    followedShows,
    savedTracks,
    savedAlbums,
    followedArtists,
    followedYoutubeChannels,
    savedPlaylists,
    spotifyItems,
  }
}

const tsOf = (...values) => {
  for (const v of values) {
    if (!v) continue
    if (typeof v?.toMillis === 'function') return v.toMillis()
    const n = Number(v)
    if (Number.isFinite(n) && n > 0) return n
  }
  return 0
}

// Normalise an item from any of the four mediums into the shape the hero card
// and shelves render. Returns null when the input has no last-played stamp.
export function toContinueCandidate(medium, item) {
  if (!item) return null
  switch (medium) {
    case 'audiobook': {
      // Only count real plays, not Read-tab opens. lastOpenedAt is stamped
      // by Dashboard.jsx::handleOpenBook when a book is opened in the reader
      // — using it here lets Read-tab activity hijack the Listen hero.
      const ts = tsOf(item.lastPlayedAt)
      if (!ts) return null
      const progress = Number(item.progress) || 0
      return {
        medium: 'audiobook',
        id: item.id,
        title: item.storyTitle || item.title || 'Untitled',
        creator: item.author || '',
        coverUrl: item.coverImageUrlSquare || item.coverImageUrl || item.coverUrl || '',
        progress,
        lastPlayedAt: ts,
        playHref: `/listen/${item.id}`,
      }
    }
    case 'podcast': {
      const ts = tsOf(item.lastPlayedAt)
      if (!ts) return null
      const progressMs = Number(item.progressMs) || 0
      const durationMs = Number(item.durationMs) || 0
      const progress = durationMs > 0
        ? Math.min(100, Math.round((progressMs / durationMs) * 100))
        : 0
      return {
        medium: 'podcast',
        id: item.episodeId || item.id,
        episodeId: item.episodeId || item.id,
        showId: item.showId || '',
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
      const ts = tsOf(item.lastPlayedAt)
      if (!ts) return null
      return {
        medium: 'music',
        id: item.id,
        title: item.title || 'Untitled track',
        creator: item.artistName || item.artist || '',
        coverUrl: item.coverImageUrl || item.coverUrl || '',
        progress: null,
        lastPlayedAt: ts,
        playHref: `/listen/${item.id}?source=music`,
      }
    }
    case 'video': {
      const ts = tsOf(item.lastPlayedAt, item.lastOpenedAt)
      if (!ts) return null
      const progress = Number(item.progress) || 0
      return {
        medium: 'video',
        id: item.id,
        title: item.title || 'Untitled video',
        creator: item.channelTitle || '',
        coverUrl: item.coverUrl || item.thumbnailUrl || getYouTubeThumbnailFromVideo(item),
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
  data.spotifyItems?.forEach((s) => {
    const c = toContinueCandidate('music', s)
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
