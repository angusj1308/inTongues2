import { useMemo } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useNavigate } from 'react-router-dom'
import EpisodeRow from '../podcast/EpisodeRow'
import PinButton from '../podcast/PinButton'
import CoverArt from '../podcast/CoverArt'
import { reorderPins, unpinByRef } from '../../services/music'

// Pinned artists show their albums as a horizontal scrolling album strip;
// pinned playlists show their tracks as horizontal pinned-tile rows.
const SortableMusicPinnedRow = ({ pin, content, tagLabel, onUnpin }) => {
  const navigate = useNavigate()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: pin.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  }

  const isArtist = pin.kind === 'artist'

  return (
    <div ref={setNodeRef} style={style} className="media-pinned-row">
      <button
        type="button"
        className="media-pinned-row-handle"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </button>
      <div className="media-pinned-row-body">
        <div className="media-pinned-row-header">
          <span className="media-pinned-row-tag">{tagLabel}</span>
          <span className="media-pinned-row-title">{pin.title}</span>
        </div>
        <div className="media-pinned-strip">
          {content.length === 0 ? (
            <p className="media-empty-line">
              {isArtist ? 'No albums yet.' : 'No tracks yet.'}
            </p>
          ) : isArtist ? (
            content.map((album) => (
              <button
                key={album.id}
                type="button"
                className="media-pinned-tile"
                onClick={() => navigate(`/music/album/${album.id}`)}
              >
                <CoverArt src={album.coverUrl || pin.coverUrl} title={album.title} size={140} />
                <p className="media-pinned-tile-title">{album.title}</p>
              </button>
            ))
          ) : (
            content.map((track) => (
              <EpisodeRow
                key={track.id}
                episode={{
                  id: track.id,
                  title: track.title,
                  coverUrl: track.coverUrl || pin.coverUrl,
                }}
                variant="pinned-tile"
              />
            ))
          )}
        </div>
      </div>
      <div className="media-pinned-row-pin">
        <PinButton isPinned onClick={onUnpin} />
      </div>
    </div>
  )
}

const MusicPinnedSection = ({ uid, pins, followedArtists, playlists }) => {
  const artistsById = useMemo(() => {
    const map = new Map()
    followedArtists.forEach((a) => map.set(a.id, a))
    return map
  }, [followedArtists])

  const playlistsById = useMemo(() => {
    const map = new Map()
    playlists.forEach((p) => map.set(p.id, p))
    return map
  }, [playlists])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = async (event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = pins.findIndex((p) => p.id === active.id)
    const newIndex = pins.findIndex((p) => p.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const reordered = arrayMove(pins, oldIndex, newIndex)
    await reorderPins(
      uid,
      reordered.map((p) => p.id),
    )
  }

  if (!pins.length) return null

  return (
    <section className="media-section media-pinned">
      <div className="media-section-row">
        <h2 className="media-section-header">Pinned</h2>
        <span className="media-section-hint">Drag to reorder</span>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={pins.map((p) => p.id)} strategy={verticalListSortingStrategy}>
          <div className="media-pinned-rows">
            {pins.map((pin) => {
              const isArtist = pin.kind === 'artist'
              const source = isArtist ? artistsById.get(pin.refId) : playlistsById.get(pin.refId)
              const content = isArtist
                ? (source?.albums || []).slice(0, 10)
                : source?.tracks || []
              const tagLabel = isArtist ? 'Artist' : 'Playlist'

              return (
                <SortableMusicPinnedRow
                  key={pin.id}
                  pin={pin}
                  content={content}
                  tagLabel={tagLabel}
                  onUnpin={() => unpinByRef(uid, pin.refId)}
                />
              )
            })}
          </div>
        </SortableContext>
      </DndContext>
    </section>
  )
}

export default MusicPinnedSection
