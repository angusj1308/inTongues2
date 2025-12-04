import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { auth } from './firebase'
import { initSpotifyPlayer } from './services/spotifyPlayer'
import './style.css'

const fetchSpotifyAccessToken = async () => {
  const currentUser = auth.currentUser
  if (!currentUser) throw new Error('User not authenticated')

  const response = await fetch(
    `http://localhost:4000/api/spotify/access-token?uid=${encodeURIComponent(currentUser.uid)}`,
  )

  if (!response.ok) {
    throw new Error(await response.text())
  }

  const data = await response.json()
  return data?.accessToken
}

const initGlobalSpotifyPlayer = () => {
  if (!auth.currentUser) return
  initSpotifyPlayer(fetchSpotifyAccessToken).catch((err) => {
    console.error('Failed to initialise Spotify Web Playback SDK', err)
  })
}

if (typeof window !== 'undefined') {
  window.onSpotifyWebPlaybackSDKReady = initGlobalSpotifyPlayer

  if (window.Spotify) {
    initGlobalSpotifyPlayer()
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
