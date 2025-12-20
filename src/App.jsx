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
import JuanComprehension from './pages/JuanComprehension'

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

  return <Navigate to="/dashboard" replace />
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
        path="/juan-comprehension"
        element={
          <ProtectedRoute>
            <JuanComprehension />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
