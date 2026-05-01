import MediaShell from '../media/MediaShell'

const PodcastShell = ({ children }) => (
  <MediaShell wordmark="PODCASTS" basePath="/podcasts" sectionsAriaLabel="Podcast sections">
    {children}
  </MediaShell>
)

export default PodcastShell
