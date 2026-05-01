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
import EpisodeRow from './EpisodeRow'
import PinButton from './PinButton'
import { reorderPins, unpinByRef } from '../../services/podcast'

const SortablePinnedRow = ({ pin, episodes, tagLabel, onUnpin }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: pin.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  }

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
          {episodes.length === 0 ? (
            <p className="media-empty-line">No episodes yet.</p>
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
      <div className="media-pinned-row-pin">
        <PinButton isPinned onClick={onUnpin} />
      </div>
    </div>
  )
}

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
              const isShow = pin.kind === 'show'
              const source = isShow ? showsById.get(pin.refId) : playlistsById.get(pin.refId)
              const episodes = isShow
                ? (source?.recentEpisodes || []).slice(0, 10)
                : source?.episodes || []
              const tagLabel = isShow ? 'Show' : 'Playlist'

              return (
                <SortablePinnedRow
                  key={pin.id}
                  pin={pin}
                  episodes={episodes}
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

export default PinnedSection
