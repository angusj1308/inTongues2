import PodcastShell from '../components/podcast/PodcastShell'
import PodcastLibrary from '../components/podcast/PodcastLibrary'
import PodcastDiscover from '../components/podcast/PodcastDiscover'

export const PodcastsLibraryPage = () => (
  <PodcastShell>
    <PodcastLibrary />
  </PodcastShell>
)

export const PodcastsDiscoverPage = () => (
  <PodcastShell>
    <PodcastDiscover />
  </PodcastShell>
)
