import MusicShell from '../components/music/MusicShell'
import MusicLibrary from '../components/music/MusicLibrary'
import MusicDiscover from '../components/music/MusicDiscover'

export const MusicLibraryPage = () => (
  <MusicShell>
    <MusicLibrary />
  </MusicShell>
)

export const MusicDiscoverPage = () => (
  <MusicShell>
    <MusicDiscover />
  </MusicShell>
)
