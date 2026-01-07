import React, { useState, useEffect } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore'
import { db } from '../../../firebase'
import { ShadowingSession } from './ShadowingSession'
import ImportYouTubePanel from '../../listen/ImportYouTubePanel'

/**
 * Intensive Mode Hub - Compact content selector for shadowing practice
 */
export function IntensiveModeHub({ activeLanguage, nativeLanguage, onBack }) {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('library') // 'library' | 'import'
  const [storiesLoading, setStoriesLoading] = useState(true)
  const [videosLoading, setVideosLoading] = useState(true)
  const [stories, setStories] = useState([])
  const [youtubeVideos, setYoutubeVideos] = useState([])
  const [audiobooksExpanded, setAudiobooksExpanded] = useState(true)
  const [videosExpanded, setVideosExpanded] = useState(true)
  const [selectedContent, setSelectedContent] = useState(null)
  const [activeSession, setActiveSession] = useState(null)

  // Subscribe to stories with audio
  useEffect(() => {
    if (!user?.uid || !activeLanguage) {
      setStories([])
      setStoriesLoading(false)
      return
    }

    setStoriesLoading(true)
    const storiesRef = collection(db, 'users', user.uid, 'stories')
    const storiesQuery = query(
      storiesRef,
      where('language', '==', activeLanguage),
      where('hasFullAudio', '==', true),
      orderBy('createdAt', 'desc')
    )

    const unsubscribe = onSnapshot(
      storiesQuery,
      (snapshot) => {
        setStories(snapshot.docs.map(doc => ({ id: doc.id, type: 'story', ...doc.data() })))
        setStoriesLoading(false)
      },
      (err) => {
        console.error('Error loading stories:', err)
        setStoriesLoading(false)
      }
    )

    return unsubscribe
  }, [user?.uid, activeLanguage])

  // Subscribe to YouTube videos
  useEffect(() => {
    if (!user?.uid || !activeLanguage) {
      setYoutubeVideos([])
      setVideosLoading(false)
      return
    }

    setVideosLoading(true)
    const videosRef = collection(db, 'users', user.uid, 'youtubeVideos')
    const videosQuery = query(
      videosRef,
      where('language', '==', activeLanguage),
      orderBy('createdAt', 'desc')
    )

    const unsubscribe = onSnapshot(
      videosQuery,
      (snapshot) => {
        setYoutubeVideos(snapshot.docs.map(doc => ({ id: doc.id, type: 'youtube', ...doc.data() })))
        setVideosLoading(false)
      },
      (err) => {
        console.error('Error loading YouTube videos:', err)
        setVideosLoading(false)
      }
    )

    return unsubscribe
  }, [user?.uid, activeLanguage])

  const loading = storiesLoading || videosLoading
  const readyVideos = youtubeVideos.filter(v => v.status === 'ready')

  // Active shadowing session
  if (activeSession) {
    return (
      <ShadowingSession
        content={activeSession}
        activeLanguage={activeLanguage}
        nativeLanguage={nativeLanguage}
        onBack={() => setActiveSession(null)}
      />
    )
  }

  return (
    <div className="intensive-hub-container">
      {/* Tab bar */}
      <div className="intensive-hub-tabs">
        <button
          className={`intensive-hub-tab ${activeTab === 'library' ? 'active' : ''}`}
          onClick={() => setActiveTab('library')}
        >
          From Library
        </button>
        <button
          className={`intensive-hub-tab ${activeTab === 'import' ? 'active' : ''}`}
          onClick={() => setActiveTab('import')}
        >
          Import New
        </button>
      </div>

      {/* Library tab */}
      {activeTab === 'library' && (
        <div className="intensive-hub-library">
          {loading ? (
            <p className="muted small">Loading...</p>
          ) : stories.length === 0 && readyVideos.length === 0 ? (
            <div className="intensive-hub-empty">
              <p className="muted">No audio content in {activeLanguage} yet.</p>
              <button className="btn btn-sm" onClick={() => setActiveTab('import')}>
                Import something
              </button>
            </div>
          ) : (
            <>
              {/* Audiobooks section */}
              <div className="intensive-hub-section">
                <button
                  className="intensive-hub-section-header"
                  onClick={() => setAudiobooksExpanded(!audiobooksExpanded)}
                >
                  <span className="intensive-hub-section-title">
                    Audiobooks ({stories.length})
                  </span>
                  <svg
                    className={`intensive-hub-chevron ${audiobooksExpanded ? 'expanded' : ''}`}
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {audiobooksExpanded && (
                  <ul className="intensive-hub-list">
                    {stories.length === 0 ? (
                      <li className="intensive-hub-list-empty">No audiobooks</li>
                    ) : (
                      stories.map(story => (
                        <li
                          key={story.id}
                          className={`intensive-hub-list-item ${selectedContent?.id === story.id ? 'selected' : ''}`}
                          onClick={() => setSelectedContent(story)}
                        >
                          <span className="intensive-hub-item-title">{story.title || 'Untitled'}</span>
                          {story.level && <span className="intensive-hub-item-meta">Lvl {story.level}</span>}
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>

              {/* YouTube section */}
              <div className="intensive-hub-section">
                <button
                  className="intensive-hub-section-header"
                  onClick={() => setVideosExpanded(!videosExpanded)}
                >
                  <span className="intensive-hub-section-title">
                    YouTube Videos ({readyVideos.length})
                  </span>
                  <svg
                    className={`intensive-hub-chevron ${videosExpanded ? 'expanded' : ''}`}
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {videosExpanded && (
                  <ul className="intensive-hub-list">
                    {readyVideos.length === 0 ? (
                      <li className="intensive-hub-list-empty">No videos ready</li>
                    ) : (
                      readyVideos.map(video => (
                        <li
                          key={video.id}
                          className={`intensive-hub-list-item ${selectedContent?.id === video.id ? 'selected' : ''}`}
                          onClick={() => setSelectedContent(video)}
                        >
                          <span className="intensive-hub-item-title">{video.title || 'Untitled'}</span>
                          {video.channelTitle && (
                            <span className="intensive-hub-item-meta">{video.channelTitle}</span>
                          )}
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>

              {/* Start button */}
              {selectedContent && (
                <div className="intensive-hub-action">
                  <button
                    className="btn btn-primary"
                    onClick={() => setActiveSession(selectedContent)}
                  >
                    Start Practice
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Import tab */}
      {activeTab === 'import' && (
        <div className="intensive-hub-import">
          <ImportYouTubePanel
            headingLevel="h4"
            layout="section"
            language={activeLanguage}
            onSuccess={() => setActiveTab('library')}
          />

          <div className="intensive-hub-import-divider" />

          <div className="intensive-hub-import-audio">
            <h4>Upload Audio File</h4>
            <p className="muted small">MP3, WAV, or other audio formats</p>
            <button className="btn btn-secondary" disabled>
              Upload Audio
              <span className="badge-soon">Soon</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default IntensiveModeHub
