import MediaNewPlaylistModal from '../media/NewPlaylistModal'
import { createPlaylist } from '../../services/podcast'

const NewPlaylistModal = (props) => (
  <MediaNewPlaylistModal {...props} onCreate={createPlaylist} />
)

export default NewPlaylistModal
