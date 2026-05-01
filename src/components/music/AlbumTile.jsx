import { useNavigate } from 'react-router-dom'
import CoverArt from '../podcast/CoverArt'

// 180px horizontal-scroll tile used in Saved Albums and "More by [Artist]".
const AlbumTile = ({ album, size = 180 }) => {
  const navigate = useNavigate()
  if (!album) return null
  const { id, title, artistName, year, coverUrl } = album
  const caption = [artistName, year].filter(Boolean).join(' · ')

  return (
    <button
      type="button"
      className="media-album-tile"
      onClick={() => navigate(`/music/album/${id}`)}
    >
      <CoverArt src={coverUrl} title={title} size={size} />
      <p className="media-album-tile-title">{title}</p>
      {caption && <p className="media-album-tile-caption">{caption}</p>}
    </button>
  )
}

export default AlbumTile
