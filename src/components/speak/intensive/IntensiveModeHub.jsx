import React, { useState, useEffect } from 'react'
import { useAuth } from '../../../contexts/AuthContext'
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore'
import { db } from '../../../firebase'
import { ShadowingSession } from './ShadowingSession'

/**
 * Intensive Mode Hub - Select content for shadowing practice
 */
export function IntensiveModeHub({ activeLanguage, nativeLanguage, onBack }) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [audioContent, setAudioContent] = useState([])
  const [selectedContent, setSelectedContent] = useState(null)
  const [activeSession, setActiveSession] = useState(null)

  // Fetch content with audio from library
  useEffect(() => {
    if (!user?.uid || !activeLanguage) return

    const fetchAudioContent = async () => {
      setLoading(true)
      try {
        // Fetch stories with audio
        const storiesRef = collection(db, 'users', user.uid, 'stories')
        const storiesQuery = query(
          storiesRef,
          where('language', '==', activeLanguage),
          where('hasFullAudio', '==', true),
          orderBy('createdAt', 'desc'),
          limit(20)
        )
        const storiesSnap = await getDocs(storiesQuery)
        const stories = storiesSnap.docs.map(doc => ({
          id: doc.id,
          type: 'story',
          ...doc.data()
        }))

        // Fetch YouTube videos with transcripts
        const videosRef = collection(db, 'users', user.uid, 'youtubeVideos')
        const videosQuery = query(
          videosRef,
          where('language', '==', activeLanguage),
          where('status', '==', 'ready'),
          orderBy('createdAt', 'desc'),
          limit(20)
        )
        const videosSnap = await getDocs(videosQuery)
        const videos = videosSnap.docs.map(doc => ({
          id: doc.id,
          type: 'youtube',
          ...doc.data()
        }))

        setAudioContent([...stories, ...videos])
      } catch (err) {
        console.error('Error fetching audio content:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchAudioContent()
  }, [user?.uid, activeLanguage])

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
          Select audio content to practice. You'll listen to segments and record yourself mimicking each one,
          then receive detailed pronunciation feedback.
        </p>
      </div>

      {loading ? (
        <div className="loading-state">
          <p className="muted">Loading your audio content...</p>
        </div>
      ) : audioContent.length === 0 ? (
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
            Add stories with audio or import YouTube videos in {activeLanguage} to start practicing.
          </p>
          <div className="empty-state-actions">
            <button className="btn btn-secondary" onClick={() => window.location.href = '/dashboard?tab=listen'}>
              Go to Library
            </button>
          </div>
        </div>
      ) : (
        <div className="content-selection">
          <h4>Your Audio Content</h4>

          {/* Stories with audio */}
          {audioContent.filter(c => c.type === 'story').length > 0 && (
            <div className="content-section">
              <h5>Audiobooks</h5>
              <div className="content-grid">
                {audioContent
                  .filter(c => c.type === 'story')
                  .map(content => (
                    <button
                      key={content.id}
                      className={`content-card ${selectedContent?.id === content.id ? 'selected' : ''}`}
                      onClick={() => setSelectedContent(content)}
                    >
                      <div className="content-card-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                        </svg>
                      </div>
                      <div className="content-card-info">
                        <span className="content-title">{content.title}</span>
                        <span className="content-meta">{content.level || 'Story'}</span>
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* YouTube videos */}
          {audioContent.filter(c => c.type === 'youtube').length > 0 && (
            <div className="content-section">
              <h5>YouTube Videos</h5>
              <div className="content-grid">
                {audioContent
                  .filter(c => c.type === 'youtube')
                  .map(content => (
                    <button
                      key={content.id}
                      className={`content-card ${selectedContent?.id === content.id ? 'selected' : ''}`}
                      onClick={() => setSelectedContent(content)}
                    >
                      {content.thumbnailUrl ? (
                        <img
                          src={content.thumbnailUrl}
                          alt=""
                          className="content-card-thumbnail"
                        />
                      ) : (
                        <div className="content-card-icon">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M23 7l-7 5 7 5V7z" />
                            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                          </svg>
                        </div>
                      )}
                      <div className="content-card-info">
                        <span className="content-title">{content.title}</span>
                        <span className="content-meta">{content.channelTitle || 'Video'}</span>
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* Start button */}
          {selectedContent && (
            <div className="content-selection-actions">
              <button
                className="btn btn-primary btn-lg"
                onClick={() => setActiveSession(selectedContent)}
              >
                Start Shadowing Practice
              </button>
            </div>
          )}
        </div>
      )}

      {/* Upload option */}
      <div className="upload-section">
        <div className="upload-divider">
          <span>or</span>
        </div>
        <button className="btn btn-secondary upload-btn" disabled>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Upload Audio File
          <span className="badge-coming-soon">Soon</span>
        </button>
      </div>
    </div>
  )
}

export default IntensiveModeHub
