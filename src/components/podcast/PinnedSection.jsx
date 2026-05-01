import { useMemo } from 'react'
import EpisodeRow from './EpisodeRow'
import PinButton from './PinButton'
import { unpinByRef } from '../../services/podcast'

// Static (non-draggable) pinned section. Drag-to-reorder lands in Task 4.
const PinnedSection = ({ uid, pins, followedShows, playlists }) => {
  const showsById = useMemo(() => {
    const map = new Map()
    followedShows.forEach((s) => map.set(s.id, s))
    return map
  }, [followedShows])

  const playlistsById = useMemo(() => {
    const map = new Map()
    playlists.forEach((p) => map.set(p.id, p))
    return map
  }, [playlists])

  if (!pins.length) return null

  return (
    <section className="podcast-section podcast-pinned">
      <div className="podcast-section-row">
        <h2 className="podcast-section-header">Pinned</h2>
        <span className="podcast-section-hint">Drag to reorder</span>
      </div>

      <div className="podcast-pinned-rows">
        {pins.map((pin) => {
          const isShow = pin.kind === 'show'
          const source = isShow ? showsById.get(pin.refId) : playlistsById.get(pin.refId)
          const episodes = isShow
            ? (source?.recentEpisodes || []).slice(0, 10)
            : (source?.episodes || [])
          const tagLabel = isShow ? 'Show' : 'Playlist'

          return (
            <div key={pin.id} className="podcast-pinned-row">
              <div className="podcast-pinned-row-handle" aria-hidden="true">⋮⋮</div>
              <div className="podcast-pinned-row-body">
                <div className="podcast-pinned-row-header">
                  <span className="podcast-pinned-row-tag">{tagLabel}</span>
                  <span className="podcast-pinned-row-title">{pin.title}</span>
                </div>
                <div className="podcast-pinned-strip">
                  {episodes.length === 0 ? (
                    <p className="podcast-empty-line">No episodes yet.</p>
                  ) : (
                    episodes.map((ep) => (
                      <EpisodeRow
                        key={ep.id}
                        episode={{ ...ep, coverUrl: ep.coverUrl || pin.coverUrl }}
                        variant="pinned-tile"
                      />
                    ))
                  )}
                </div>
              </div>
              <div className="podcast-pinned-row-pin">
                <PinButton isPinned onClick={() => unpinByRef(uid, pin.refId)} />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default PinnedSection
