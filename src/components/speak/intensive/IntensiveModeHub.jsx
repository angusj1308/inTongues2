import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../context/AuthContext'
import { collection, query, where, orderBy, onSnapshot, doc, setDoc, getDocs, getDoc } from 'firebase/firestore'
import { db } from '../../../firebase'
import ImportYouTubePanel from '../../listen/ImportYouTubePanel'

/**
 * Intensive Mode Hub - Compact content selector for shadowing practice
 */
export function IntensiveModeHub({ activeLanguage, nativeLanguage, onBack }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('library') // 'library' | 'import'
  const [storiesLoading, setStoriesLoading] = useState(true)
  const [videosLoading, setVideosLoading] = useState(true)
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [stories, setStories] = useState([])
  const [youtubeVideos, setYoutubeVideos] = useState([])
  const [pronunciationSessions, setPronunciationSessions] = useState([])
  const [audiobooksExpanded, setAudiobooksExpanded] = useState(true)
  const [videosExpanded, setVideosExpanded] = useState(true)
  const [sessionsExpanded, setSessionsExpanded] = useState(true)
  const [selectedContent, setSelectedContent] = useState(null)
  const [preparingSession, setPreparingSession] = useState(false)

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

  // Subscribe to YouTube videos (no language filter - many videos don't have language set)
  useEffect(() => {
    if (!user?.uid) {
      setYoutubeVideos([])
      setVideosLoading(false)
      return
    }

    setVideosLoading(true)
    const videosRef = collection(db, 'users', user.uid, 'youtubeVideos')
    const videosQuery = query(
      videosRef,
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
  }, [user?.uid])

  // Subscribe to pronunciation sessions
  useEffect(() => {
    if (!user?.uid) {
      setPronunciationSessions([])
      setSessionsLoading(false)
      return
    }

    setSessionsLoading(true)
    const sessionsRef = collection(db, 'users', user.uid, 'pronunciationSessions')
    const sessionsQuery = query(sessionsRef, orderBy('createdAt', 'desc'))

    const unsubscribe = onSnapshot(
      sessionsQuery,
      (snapshot) => {
        setPronunciationSessions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
        setSessionsLoading(false)
      },
      (err) => {
        console.error('Error loading pronunciation sessions:', err)
        setSessionsLoading(false)
      }
    )

    return unsubscribe
  }, [user?.uid])

  const loading = storiesLoading || videosLoading || sessionsLoading
  // Filter to only show videos that have finished processing
  const readyVideos = youtubeVideos.filter(v => v.status === 'ready')
  // Filter sessions that are ready or still preparing
  const activeSessions = pronunciationSessions.filter(s => s.status === 'ready' || s.status === 'preparing' || s.status === 'processing')

  // Check if story has word-level timestamps
  const checkStoryHasTimestamps = async (storyId) => {
    const transcriptsRef = collection(db, 'users', user.uid, 'stories', storyId, 'transcripts')
    const transcriptsSnap = await getDocs(transcriptsRef)

    for (const doc of transcriptsSnap.docs) {
      const data = doc.data()
      if (data.sentenceSegments && data.sentenceSegments.length > 0) {
        // Check if segments have word-level timestamps
        const hasWords = data.sentenceSegments.some(seg => seg.words && seg.words.length > 0)
        if (hasWords) return true
      }
    }
    return false
  }

  // Create pronunciation session and trigger Whisper if needed
  const startPractice = async () => {
    if (!selectedContent || !user?.uid) return

    // YouTube videos already have word timestamps, go directly
    if (selectedContent.type === 'youtube') {
      navigate(`/pronunciation/${selectedContent.type}/${selectedContent.id}`)
      return
    }

    // For stories, check if word timestamps exist
    if (selectedContent.type === 'story') {
      setPreparingSession(true)

      try {
        const hasTimestamps = await checkStoryHasTimestamps(selectedContent.id)

        if (hasTimestamps) {
          // Already has timestamps, go directly
          navigate(`/pronunciation/${selectedContent.type}/${selectedContent.id}`)
          return
        }

        // Need to create session and trigger Whisper
        const sessionId = `${selectedContent.type}-${selectedContent.id}`
        const sessionRef = doc(db, 'users', user.uid, 'pronunciationSessions', sessionId)

        // Check if session already exists
        const existingSession = await getDoc(sessionRef)
        if (existingSession.exists()) {
          const sessionData = existingSession.data()
          if (sessionData.status === 'ready') {
            navigate(`/pronunciation/${selectedContent.type}/${selectedContent.id}`)
            return
          }
          // Session is preparing, show message
          setPreparingSession(false)
          return
        }

        // Create new session
        await setDoc(sessionRef, {
          contentType: selectedContent.type,
          contentId: selectedContent.id,
          title: selectedContent.title || 'Untitled',
          language: activeLanguage,
          status: 'preparing',
          createdAt: new Date(),
          updatedAt: new Date()
        })

        // Trigger Whisper transcription in background
        fetch('/api/story/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: user.uid,
            storyId: selectedContent.id,
            sessionId
          })
        }).catch(err => console.error('Failed to trigger transcription:', err))

        // Session will update via onSnapshot when ready
        setPreparingSession(false)

      } catch (err) {
        console.error('Error starting practice:', err)
        setPreparingSession(false)
      }
    }
  }

  // Resume a ready session
  const resumeSession = (session) => {
    navigate(`/pronunciation/${session.contentType}/${session.contentId}`)
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
          ) : stories.length === 0 && youtubeVideos.length === 0 ? (
            <div className="intensive-hub-empty">
              <p className="muted">No audio content yet.</p>
              <button className="btn btn-sm" onClick={() => setActiveTab('import')}>
                Import something
              </button>
            </div>
          ) : (
            <>
              {/* Active Sessions section */}
              {activeSessions.length > 0 && (
                <div className="intensive-hub-section">
                  <button
                    className="intensive-hub-section-header"
                    onClick={() => setSessionsExpanded(!sessionsExpanded)}
                  >
                    <span className="intensive-hub-section-title">
                      Your Sessions ({activeSessions.length})
                    </span>
                    <svg
                      className={`intensive-hub-chevron ${sessionsExpanded ? 'expanded' : ''}`}
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
                  {sessionsExpanded && (
                    <ul className="intensive-hub-list">
                      {activeSessions.map(session => {
                        const isReady = session.status === 'ready'
                        const isPreparing = session.status === 'preparing' || session.status === 'processing'

                        return (
                          <li
                            key={session.id}
                            className={`intensive-hub-list-item ${!isReady ? 'disabled' : ''}`}
                            onClick={() => isReady && resumeSession(session)}
                          >
                            <span className="intensive-hub-item-title">{session.title}</span>
                            <span className={`intensive-hub-item-meta ${isPreparing ? 'preparing' : ''}`}>
                              {isPreparing && (
                                <>
                                  <span className="spinner-small" /> Preparing...
                                </>
                              )}
                              {isReady && 'Ready'}
                              {session.status === 'error' && 'Error'}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              )}

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
                    YouTube Videos ({youtubeVideos.length})
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
                    {youtubeVideos.length === 0 ? (
                      <li className="intensive-hub-list-empty">No videos imported</li>
                    ) : (
                      youtubeVideos.map(video => {
                        const isReady = video.status === 'ready'
                        const isImporting = video.status === 'importing'
                        const isFailed = video.status === 'failed'

                        return (
                          <li
                            key={video.id}
                            className={`intensive-hub-list-item ${selectedContent?.id === video.id ? 'selected' : ''} ${!isReady ? 'disabled' : ''}`}
                            onClick={() => isReady && setSelectedContent(video)}
                          >
                            <span className="intensive-hub-item-title">{video.title || 'Untitled'}</span>
                            <span className="intensive-hub-item-meta">
                              {isImporting && 'Processing...'}
                              {isFailed && 'Failed'}
                              {isReady && video.channelTitle}
                            </span>
                          </li>
                        )
                      })
                    )}
                  </ul>
                )}
              </div>

              {/* Start button */}
              {selectedContent && (
                <div className="intensive-hub-action">
                  <button
                    className="btn btn-primary"
                    onClick={startPractice}
                    disabled={preparingSession}
                  >
                    {preparingSession ? (
                      <>
                        <span className="spinner-small" /> Checking...
                      </>
                    ) : (
                      'Start Practice'
                    )}
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
