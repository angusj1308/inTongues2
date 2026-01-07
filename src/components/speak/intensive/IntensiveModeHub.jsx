import React, { useState, useEffect } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore'
import { db } from '../../../firebase'
import { ShadowingSession } from './ShadowingSession'
import ImportYouTubePanel from '../../listen/ImportYouTubePanel'
import ListeningMediaCard from '../../listen/ListeningMediaCard'
import { getYouTubeThumbnailUrl } from '../../../utils/youtube'

/**
 * Intensive Mode Hub - Select content for shadowing practice
 * Users can select from their existing library or import new content
 */
export function IntensiveModeHub({ activeLanguage, nativeLanguage, onBack }) {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('library') // 'library' | 'import'
  const [storiesLoading, setStoriesLoading] = useState(true)
  const [videosLoading, setVideosLoading] = useState(true)
  const [stories, setStories] = useState([])
  const [youtubeVideos, setYoutubeVideos] = useState([])
  const [selectedContent, setSelectedContent] = useState(null)
  const [activeSession, setActiveSession] = useState(null)

  // Subscribe to stories with audio (real-time updates)
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
        const nextStories = snapshot.docs.map(doc => ({
          id: doc.id,
          type: 'story',
          ...doc.data()
        }))
        setStories(nextStories)
        setStoriesLoading(false)
      },
      (err) => {
        console.error('Error loading stories:', err)
        setStoriesLoading(false)
      }
    )

    return unsubscribe
  }, [user?.uid, activeLanguage])

  // Subscribe to YouTube videos with transcripts (real-time updates)
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
        const nextVideos = snapshot.docs.map(doc => ({
          id: doc.id,
          type: 'youtube',
          ...doc.data()
        }))
        setYoutubeVideos(nextVideos)
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
  const hasContent = stories.length > 0 || youtubeVideos.length > 0

  // Handle content selection for practice
  const handleSelectContent = (content) => {
    setSelectedContent(content)
  }

  // Start shadowing session
  const handleStartSession = () => {
    if (selectedContent) {
      setActiveSession(selectedContent)
    }
  }

  // Handle successful YouTube import - switch to library tab
  const handleImportSuccess = () => {
    setActiveTab('library')
  }

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
    <div className="intensive-mode-hub">
      <div className="intensive-mode-intro">
        <p className="muted">
          Practice pronunciation by listening to audio segments and recording yourself repeating them.
          You'll receive detailed feedback on your pronunciation.
        </p>
      </div>

      {/* Tab navigation */}
      <div className="intensive-tabs">
        <button
          className={`intensive-tab ${activeTab === 'library' ? 'active' : ''}`}
          onClick={() => setActiveTab('library')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          Your Library
        </button>
        <button
          className={`intensive-tab ${activeTab === 'import' ? 'active' : ''}`}
          onClick={() => setActiveTab('import')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Import New
        </button>
      </div>

      {/* Library Tab */}
      {activeTab === 'library' && (
        <div className="intensive-library">
          {loading ? (
            <div className="loading-state">
              <p className="muted">Loading your audio content...</p>
            </div>
          ) : !hasContent ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                </svg>
              </div>
              <h4>No Audio Content Yet</h4>
              <p className="muted">
                Import a YouTube video or add stories with audio in {activeLanguage} to start practicing.
              </p>
              <div className="empty-state-actions">
                <button className="btn btn-primary" onClick={() => setActiveTab('import')}>
                  Import Content
                </button>
              </div>
            </div>
          ) : (
            <div className="content-selection">
              {/* Audiobooks section */}
              {stories.length > 0 && (
                <div className="content-section">
                  <h4>Audiobooks</h4>
                  <div className="listen-shelf">
                    {stories.map(story => {
                      const isSelected = selectedContent?.id === story.id
                      const isGeneratedStory = Boolean(
                        story.source === 'generated' ||
                        story.source === 'generator' ||
                        story.origin === 'generator' ||
                        story.generated === true ||
                        story.generatorMetadata ||
                        (!story.source && typeof story.genre === 'string' && story.genre)
                      )

                      return (
                        <div
                          key={story.id}
                          className={`intensive-content-item ${isSelected ? 'selected' : ''}`}
                          onClick={() => handleSelectContent(story)}
                        >
                          <ListeningMediaCard
                            type="audio"
                            title={story.title || 'Untitled story'}
                            channel={isGeneratedStory ? 'inTongues Generator' : story.author || story.language || 'Audio story'}
                            thumbnailUrl={story.coverImageUrl || story.imageUrl || story.coverImage}
                            tags={[story.level && `Level ${story.level}`]}
                            actionLabel={isSelected ? 'Selected' : 'Select'}
                            onPlay={() => handleSelectContent(story)}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* YouTube videos section */}
              {youtubeVideos.length > 0 && (
                <div className="content-section">
                  <h4>YouTube Videos</h4>
                  <div className="listen-shelf">
                    {youtubeVideos.map(video => {
                      const isSelected = selectedContent?.id === video.id
                      const isReady = video.status === 'ready'

                      return (
                        <div
                          key={video.id}
                          className={`intensive-content-item ${isSelected ? 'selected' : ''}`}
                          onClick={() => isReady && handleSelectContent(video)}
                        >
                          <ListeningMediaCard
                            type="youtube"
                            title={video.title || 'Untitled video'}
                            channel={video.channelTitle || video.channel || 'Unknown channel'}
                            thumbnailUrl={getYouTubeThumbnailUrl(video.youtubeUrl)}
                            status={video.status}
                            actionLabel={isSelected ? 'Selected' : isReady ? 'Select' : undefined}
                            onPlay={isReady ? () => handleSelectContent(video) : undefined}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Start button */}
              {selectedContent && (
                <div className="content-selection-actions">
                  <div className="selected-content-preview">
                    <span className="muted">Selected:</span>
                    <strong>{selectedContent.title}</strong>
                  </div>
                  <button
                    className="btn btn-primary btn-lg"
                    onClick={handleStartSession}
                  >
                    Start Shadowing Practice
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Import Tab */}
      {activeTab === 'import' && (
        <div className="intensive-import">
          <div className="import-section">
            <ImportYouTubePanel
              headingLevel="h4"
              layout="card"
              language={activeLanguage}
              onSuccess={handleImportSuccess}
            />
          </div>

          {/* Audio file upload - coming soon */}
          <div className="import-section">
            <div className="preview-card import-audio-card">
              <div className="section-header">
                <h4>Upload Audio File</h4>
                <span className="badge-coming-soon">Coming Soon</span>
              </div>
              <p className="muted small">
                Upload MP3, WAV, or other audio files directly for shadowing practice.
              </p>
              <button className="button" disabled>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Upload Audio
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default IntensiveModeHub
