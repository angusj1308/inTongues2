import MediaShell from '../media/MediaShell'
import MusicKitConnect from './MusicKitConnect'

const MusicShell = ({ children }) => (
  <MediaShell wordmark="MUSIC" basePath="/music" sectionsAriaLabel="Music sections">
    <MusicKitConnect />
    {children}
  </MediaShell>
)

export default MusicShell
