import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import { filterSupportedLanguages, resolveSupportedLanguageLabel } from './constants/languages'
import { useAuth } from './context/AuthContext'
import Dashboard from './pages/Dashboard'
import GenerateContent from './pages/GenerateContent'
import Login from './pages/Login'
import MyLanguages from './pages/MyLanguages'
import ImportTextPage from './pages/ImportTextPage'
import SelectLanguagePage from './pages/SelectLanguagePage'
import Signup from './pages/Signup'
import Reader from './pages/Reader'
import Review from './pages/Review'
import ListeningLibrary from './pages/ListeningLibrary'
import AudioPlayer from './pages/AudioPlayer'
import ImportAudioVideo from './pages/ImportAudioVideo'
import IntonguesCinema from './pages/IntonguesCinema'
import SpotifyCollectionPage from './pages/SpotifyCollectionPage'
import { PodcastsLibraryPage, PodcastsDiscoverPage } from './pages/Podcasts'
import PodcastShowPage from './pages/PodcastShow'
import PodcastEpisodePage from './pages/PodcastEpisode'
import PodcastSearchResultsPage from './pages/PodcastSearchResults'
import PodcastCategoryResultsPage from './pages/PodcastCategoryResults'
import { MusicLibraryPage, MusicDiscoverPage } from './pages/Music'
import MusicSearchResultsPage from './pages/MusicSearchResults'
import MusicGenreResultsPage from './pages/MusicGenreResults'
import MusicArtistPage from './pages/MusicArtist'
import MusicAlbumPage from './pages/MusicAlbum'
import JuanComprehension from './pages/JuanComprehension'
import WritingEditor from './pages/WritingEditor'
import PracticeLesson from './pages/PracticeLesson'
import FreeWritingLesson from './pages/FreeWritingLesson'
import NovelGenerator from './pages/NovelGenerator'
import TutorChat from './pages/TutorChat'
import TutorPage from './pages/TutorPage'
import PronunciationPractice from './pages/PronunciationPractice'
import FreeSpeakingSession from './pages/FreeSpeakingSession'
import Settings from './pages/Settings'

const LandingRedirect = () => {
  const { user, profile, loading, setLastUsedLanguage } = useAuth()
  const supportedLanguages = filterSupportedLanguages(profile?.myLanguages || [])
  const hasLanguages = Boolean(supportedLanguages.length)

  useEffect(() => {
    const ensureLastUsedLanguage = async () => {
      if (hasLanguages && !profile?.lastUsedLanguage) {
        await setLastUsedLanguage(supportedLanguages[supportedLanguages.length - 1])
      }
    }

    ensureLastUsedLanguage()
  }, [hasLanguages, profile?.lastUsedLanguage, setLastUsedLanguage, supportedLanguages])

  if (loading) {
    return (
      <div className="page">
        <div className="card">
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <Navigate to="/read/library" replace />
}

const App = () => {
  const { profile } = useAuth()
  const activeLanguage = resolveSupportedLanguageLabel(profile?.lastUsedLanguage, '')

  useEffect(() => {
    if (activeLanguage) {
      document.documentElement.setAttribute('data-language', activeLanguage)
    } else {
      document.documentElement.removeAttribute('data-language')
    }
  }, [activeLanguage])

  return (
    <Routes>
      <Route path="/" element={<LandingRedirect />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route path="/read" element={<Navigate to="/read/library" replace />} />
      <Route path="/read/generate" element={<Navigate to="/read/discover/generate" replace />} />
      <Route path="/read/import" element={<Navigate to="/read/discover/import" replace />} />
      <Route path="/read/discover/gutenberg" element={<Navigate to="/read/discover/classics" replace />} />
      <Route path="/read/discover/adapt" element={<Navigate to="/read/discover/classics" replace />} />
      <Route
        path="/read/discover/:doorPage"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/read/library/shelf/:shelfId/edit"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/read/library/:libraryView"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/read/:subPage"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/select-language"
        element={
          <ProtectedRoute>
            <SelectLanguagePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/my-languages"
        element={
          <ProtectedRoute>
            <MyLanguages />
          </ProtectedRoute>
        }
      />
      <Route
        path="/generate"
        element={
          <ProtectedRoute>
            <GenerateContent />
          </ProtectedRoute>
        }
      />
      <Route
        path="/generate/:language"
        element={
          <ProtectedRoute>
            <GenerateContent />
          </ProtectedRoute>
        }
      />
      <Route
        path="/novel"
        element={
          <ProtectedRoute>
            <NovelGenerator />
          </ProtectedRoute>
        }
      />
      <Route
        path="/novel/:bookId"
        element={
          <ProtectedRoute>
            <NovelGenerator />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reader/:language/:id"
        element={
          <ProtectedRoute>
            <Reader />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reader/:id"
        element={
          <ProtectedRoute>
            <Reader />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reader/:language/:id/intensive"
        element={
          <ProtectedRoute>
            <Reader initialMode="intensive" />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reader/:id/intensive"
        element={
          <ProtectedRoute>
            <Reader initialMode="intensive" />
          </ProtectedRoute>
        }
      />
      <Route
        path="/listening"
        element={
          <ProtectedRoute>
            <ListeningLibrary />
          </ProtectedRoute>
        }
      />
      <Route
        path="/listening/spotify/:collectionId"
        element={
          <ProtectedRoute>
            <SpotifyCollectionPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/podcasts"
        element={
          <ProtectedRoute>
            <PodcastsLibraryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/podcasts/discover"
        element={
          <ProtectedRoute>
            <PodcastsDiscoverPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/podcasts/show/:id"
        element={
          <ProtectedRoute>
            <PodcastShowPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/podcasts/search"
        element={
          <ProtectedRoute>
            <PodcastSearchResultsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/podcasts/episode/:episodeId"
        element={
          <ProtectedRoute>
            <PodcastEpisodePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/podcasts/discover/:category"
        element={
          <ProtectedRoute>
            <PodcastCategoryResultsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/music"
        element={
          <ProtectedRoute>
            <MusicLibraryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/music/discover"
        element={
          <ProtectedRoute>
            <MusicDiscoverPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/music/search"
        element={
          <ProtectedRoute>
            <MusicSearchResultsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/music/discover/:genre"
        element={
          <ProtectedRoute>
            <MusicGenreResultsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/music/artist/:id"
        element={
          <ProtectedRoute>
            <MusicArtistPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/music/album/:id"
        element={
          <ProtectedRoute>
            <MusicAlbumPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/listen/:id"
        element={
          <ProtectedRoute>
            <AudioPlayer />
          </ProtectedRoute>
        }
      />
      <Route
        path="/importaudio/video"
        element={
          <ProtectedRoute>
            <ImportAudioVideo />
          </ProtectedRoute>
        }
      />
      <Route
        path="/cinema/:id"
        element={
          <ProtectedRoute>
            <IntonguesCinema />
          </ProtectedRoute>
        }
      />
      <Route
        path="/import/:language"
        element={
          <ProtectedRoute>
            <ImportTextPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/review"
        element={
          <ProtectedRoute>
            <Review />
          </ProtectedRoute>
        }
      />
      <Route
        path="/write/:id"
        element={
          <ProtectedRoute>
            <WritingEditor />
          </ProtectedRoute>
        }
      />
      <Route
        path="/practice/:lessonId"
        element={
          <ProtectedRoute>
            <PracticeLesson />
          </ProtectedRoute>
        }
      />
      <Route
        path="/pronunciation/:contentType/:contentId"
        element={
          <ProtectedRoute>
            <PronunciationPractice />
          </ProtectedRoute>
        }
      />
      <Route
        path="/freewrite/:lessonId"
        element={
          <ProtectedRoute>
            <FreeWritingLesson />
          </ProtectedRoute>
        }
      />
      <Route
        path="/voice-record"
        element={
          <ProtectedRoute>
            <FreeSpeakingSession />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tutor"
        element={
          <ProtectedRoute>
            <TutorPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tutor/:chatId"
        element={
          <ProtectedRoute>
            <TutorPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/juan-comprehension"
        element={
          <ProtectedRoute>
            <JuanComprehension />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
