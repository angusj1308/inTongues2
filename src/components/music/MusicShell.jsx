import MediaShell from '../media/MediaShell'

const MusicShell = ({ children }) => (
  <MediaShell wordmark="MUSIC" basePath="/music" sectionsAriaLabel="Music sections">
    {children}
  </MediaShell>
)

export default MusicShell
