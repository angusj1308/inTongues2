import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import { useAuth } from './context/AuthContext'
import Dashboard from './pages/Dashboard'
import GenerateContent from './pages/GenerateContent'
import Login from './pages/Login'
import MyLanguages from './pages/MyLanguages'
import ImportTextPage from './pages/ImportTextPage'
import SelectLanguagePage from './pages/SelectLanguagePage'
import Signup from './pages/Signup'
import Library from './pages/Library'
import Reader from './pages/Reader'
import Review from './pages/Review'
import ListeningLibrary from './pages/ListeningLibrary'
import AudioPlayer from './pages/AudioPlayer'
import ImportAudioVideo from './pages/ImportAudioVideo'
import IntonguesCinema from './pages/IntonguesCinema'

const LandingRedirect = () => {
  const { user, profile, loading, setLastUsedLanguage } = useAuth()
  const hasLanguages = Boolean(profile?.myLanguages?.length)

  useEffect(() => {
    const ensureLastUsedLanguage = async () => {
      if (hasLanguages && !profile?.lastUsedLanguage) {
        await setLastUsedLanguage(profile.myLanguages[profile.myLanguages.length - 1])
      }
    }

    ensureLastUsedLanguage()
  }, [hasLanguages, profile?.lastUsedLanguage, profile?.myLanguages, setLastUsedLanguage])

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
        path="/library"
        element={
          <ProtectedRoute>
            <Library />
          </ProtectedRoute>
        }
      />
      <Route
        path="/library/:language"
        element={
          <ProtectedRoute>
            <Library />
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
        path="/listening"
        element={
          <ProtectedRoute>
            <ListeningLibrary />
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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
