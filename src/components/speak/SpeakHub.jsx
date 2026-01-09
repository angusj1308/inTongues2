import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, orderBy, onSnapshot, where, doc, deleteDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../context/AuthContext'
import { resolveSupportedLanguageLabel } from '../../constants/languages'
import { IntensiveModeHub } from './intensive/IntensiveModeHub'
import { SpeakingPracticeHub } from './speakingPractice/SpeakingPracticeHub'
import { SpeakingPracticeSession } from './speakingPractice/SpeakingPracticeSession'
import { VoiceRecordHub } from './voiceRecord/VoiceRecordHub'

/**
 * Main hub for the Speaking tab - allows selection between different speaking practice modes
 */
export function SpeakHub({ activeLanguage, nativeLanguage }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [activeMode, setActiveMode] = useState(null) // null | 'pronunciation' | 'speakingPractice' | 'voiceRecord'
  const [pronunciationSessions, setPronunciationSessions] = useState([])
  const [speakingPracticeLessons, setSpeakingPracticeLessons] = useState([])
  const [readySpeakingLessons, setReadySpeakingLessons] = useState([])
  const [activeSpeakingSession, setActiveSpeakingSession] = useState(null)

  const normalizedLanguage = resolveSupportedLanguageLabel(activeLanguage, activeLanguage)

  // Subscribe to pronunciation sessions
  useEffect(() => {
    if (!user?.uid) {
      setPronunciationSessions([])
      return
    }

    const sessionsRef = collection(db, 'users', user.uid, 'pronunciationSessions')
    const sessionsQuery = query(sessionsRef, orderBy('createdAt', 'desc'))

    const unsubscribe = onSnapshot(
      sessionsQuery,
      (snapshot) => {
        setPronunciationSessions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
      },
      (err) => {
        console.error('Error loading pronunciation sessions:', err)
      }
    )

    return unsubscribe
  }, [user?.uid])

  // Subscribe to speaking practice lessons
  useEffect(() => {
    if (!user?.uid || !normalizedLanguage) {
      setSpeakingPracticeLessons([])
      setReadySpeakingLessons([])
      return
    }

    const lessonsRef = collection(db, 'users', user.uid, 'practiceLessons')
    const lessonsQuery = query(
      lessonsRef,
      where('targetLanguage', '==', normalizedLanguage)
    )

    const unsubscribe = onSnapshot(
      lessonsQuery,
      (snapshot) => {
        const allLessons = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))

        // Filter to importing lessons
        const importing = allLessons
          .filter(l => l.status === 'importing')
          .sort((a, b) => {
            const aTime = a.createdAt?.toMillis?.() || 0
            const bTime = b.createdAt?.toMillis?.() || 0
            return bTime - aTime
          })
        setSpeakingPracticeLessons(importing)

        // Filter to ready lessons (not importing, not failed)
        const ready = allLessons
          .filter(l => l.status !== 'importing' && l.status !== 'import_failed')
          .sort((a, b) => {
            const aTime = a.updatedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0
            const bTime = b.updatedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0
            return bTime - aTime
          })
        setReadySpeakingLessons(ready)
      },
      (err) => {
        console.error('Error loading speaking practice lessons:', err)
      }
    )

    return unsubscribe
  }, [user?.uid, normalizedLanguage])

  // Filter pronunciation sessions that are preparing or ready
  const activePronunciationSessions = pronunciationSessions.filter(s =>
    s.status === 'ready' || s.status === 'preparing' || s.status === 'processing'
  )

  // Filter speaking practice lessons by status
  const importingLessons = speakingPracticeLessons.filter(l => l.status === 'importing')
  const activeSpeakingLessons = speakingPracticeLessons.filter(l =>
    l.status === 'in_progress' || l.status === 'complete'
  )

  // Delete a practice lesson
  const handleDeleteLesson = async (lessonId, e) => {
    e.stopPropagation()
    if (!user?.uid || !lessonId) return
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'practiceLessons', lessonId))
    } catch (err) {
      console.error('Failed to delete lesson:', err)
    }
  }

  // Active speaking practice session - full page view
  if (activeSpeakingSession) {
    return (
      <SpeakingPracticeSession
        lesson={activeSpeakingSession}
        activeLanguage={activeLanguage}
        nativeLanguage={nativeLanguage}
        onBack={() => setActiveSpeakingSession(null)}
      />
    )
  }

  // Voice Record mode - full page view
  if (activeMode === 'voiceRecord') {
    return (
      <div className="speak-hub">
        <div className="speak-hub-nav">
          <button className="btn-back" onClick={() => setActiveMode(null)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back to modes
          </button>
          <h2>Voice Record</h2>
        </div>
        <VoiceRecordHub
          activeLanguage={activeLanguage}
          nativeLanguage={nativeLanguage}
          onBack={() => setActiveMode(null)}
        />
      </div>
    )
  }

  // Mode selection view (with overlays for pronunciation and speaking practice)
  return (
    <div className="speak-hub">

      <div className="speak-mode-grid">
        {/* Pronunciation Practice Card (was Intensive) */}
        <button
          className="speak-mode-card"
          onClick={() => setActiveMode('pronunciation')}
        >
          <div className="speak-mode-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
              <path d="M4 8l2 2-2 2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M20 8l-2 2 2 2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h3>Pronunciation Practice</h3>
          <p className="speak-mode-subtitle">Shadowing</p>
          <p className="speak-mode-description">
            Listen to {activeLanguage} audio and repeat. Get phoneme-level feedback on your accent and pronunciation.
          </p>
          <div className="speak-mode-focus">
            <span className="focus-tag">Pronunciation</span>
            <span className="focus-tag">Accent</span>
          </div>
        </button>

        {/* Speaking Practice Card (NEW - interpretation) */}
        <button
          className="speak-mode-card"
          onClick={() => setActiveMode('speakingPractice')}
        >
          <div className="speak-mode-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
              <path d="M2 5h4M2 9h4M2 13h4" strokeLinecap="round" />
            </svg>
          </div>
          <h3>Intensive Speaking</h3>
          <p className="speak-mode-subtitle">Interpretation</p>
          <p className="speak-mode-description">
            See {nativeLanguage} sentences and practice producing them in {activeLanguage}.
          </p>
          <div className="speak-mode-focus">
            <span className="focus-tag">Translation</span>
            <span className="focus-tag">Vocabulary</span>
          </div>
        </button>

        {/* Voice Record Mode Card - navigates to full page */}
        <button
          className="speak-mode-card"
          onClick={() => navigate('/voice-record')}
        >
          <div className="speak-mode-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="3" fill="currentColor" />
              <path d="M12 2v2" />
              <path d="M12 20v2" />
              <path d="M2 12h2" />
              <path d="M20 12h2" />
            </svg>
          </div>
          <h3>Free Speaking</h3>
          <p className="speak-mode-subtitle">Long-form Production</p>
          <p className="speak-mode-description">
            Speak freely about any topic. Get comprehensive feedback on grammar, vocabulary, and expression.
          </p>
          <div className="speak-mode-focus">
            <span className="focus-tag">Fluency</span>
            <span className="focus-tag">Expression</span>
          </div>
        </button>

      </div>

      {/* Intensive Speaking Sessions (interpretation practice) */}
      {activeSpeakingLessons.length > 0 && (
        <div className="speak-sessions-section">
          <h3>Intensive Speaking Sessions</h3>
          <div className="speak-media-grid">
            {activeSpeakingLessons.map(lesson => {
              const isComplete = lesson.status === 'complete'
              const progress = lesson.sentences?.length > 0
                ? Math.round((lesson.completedCount || 0) / lesson.sentences.length * 100)
                : 0

              return (
                <div
                  key={lesson.id}
                  className="speak-media-card"
                  onClick={() => navigate(`/practice/${lesson.id}`)}
                >
                  <div className="speak-media-card-icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="23" />
                      <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                  </div>
                  <div className="speak-media-card-body">
                    <div className="speak-media-card-title">{lesson.title}</div>
                    <div className="speak-media-card-meta">
                      <span className={`speak-media-card-status ${isComplete ? 'complete' : 'in-progress'}`}>
                        {isComplete ? 'Completed' : `${lesson.completedCount || 0}/${lesson.sentences?.length || 0} sentences`}
                      </span>
                    </div>
                  </div>
                  <div className="speak-media-card-actions">
                    <button
                      className="button speak-media-card-primary"
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(`/practice/${lesson.id}`)
                      }}
                    >
                      {isComplete ? 'Review →' : 'Continue →'}
                    </button>
                    <button
                      className="speak-media-card-delete"
                      onClick={(e) => handleDeleteLesson(lesson.id, e)}
                      title="Delete session"
                    >
                      Delete
                    </button>
                  </div>
                  {progress > 0 && (
                    <div className="speak-media-card-progress">
                      <div className="speak-media-card-progress-bar" style={{ width: `${progress}%` }} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Pronunciation Practice Sessions (audiobook shadowing) */}
      {activePronunciationSessions.length > 0 && (
        <div className="speak-sessions-section">
          <h3>Pronunciation Practice Sessions</h3>
          <div className="speak-media-grid">
            {activePronunciationSessions.map(session => {
              const isPreparing = session.status === 'preparing' || session.status === 'processing'
              const isReady = session.status === 'ready'

              return (
                <div
                  key={session.id}
                  className={`speak-media-card ${isPreparing ? 'is-preparing' : ''}`}
                  onClick={() => isReady && navigate(`/pronunciation/${session.contentType}/${session.contentId}`)}
                >
                  <div className="speak-media-card-icon">
                    {isPreparing ? (
                      <div className="spinner-medium" />
                    ) : (
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        <line x1="12" y1="19" x2="12" y2="23" />
                        <line x1="8" y1="23" x2="16" y2="23" />
                        <path d="M4 8l2 2-2 2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M20 8l-2 2 2 2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <div className="speak-media-card-body">
                    <div className="speak-media-card-title">{session.title}</div>
                    <div className="speak-media-card-meta">
                      <span className={`speak-media-card-status ${isPreparing ? 'preparing' : 'ready'}`}>
                        {isPreparing ? 'Preparing audio sync...' : 'Ready to practice'}
                      </span>
                    </div>
                  </div>
                  <div className="speak-media-card-actions">
                    <button
                      className={`button speak-media-card-primary ${isPreparing ? 'is-loading' : ''}`}
                      disabled={isPreparing}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (isReady) navigate(`/pronunciation/${session.contentType}/${session.contentId}`)
                      }}
                    >
                      {isPreparing ? 'Preparing...' : 'Practice →'}
                    </button>
                    {isReady && (
                      <button
                        className="speak-media-card-delete"
                        onClick={(e) => handleDeletePronunciationSession(session.id, e)}
                        title="Delete session"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Ready speaking practice lessons */}
      {readySpeakingLessons.length > 0 && (
        <div className="speak-sessions-section">
          <h3>Intensive Speaking Sessions</h3>
          <div className="speak-sessions-grid">
            {readySpeakingLessons.map(lesson => {
              const sentenceCount = lesson.sentences?.length || 0
              const progress = sentenceCount > 0
                ? Math.round((lesson.completedCount || 0) / sentenceCount * 100)
                : 0

              return (
                <div
                  key={lesson.id}
                  className="speak-session-card ready"
                  onClick={() => setActiveSpeakingSession(lesson)}
                >
                  <div className="speak-session-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  </div>
                  <div className="speak-session-info">
                    <span className="speak-session-title">{lesson.title}</span>
                    <span className="speak-session-status">
                      {sentenceCount} segments • {progress}% complete
                    </span>
                  </div>
                  <button
                    className="speak-session-delete"
                    onClick={(e) => handleDeleteLesson(lesson.id, e)}
                    title="Delete lesson"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Importing speaking practice lessons */}
      {importingLessons.length > 0 && (
        <div className="speak-sessions-section">
          <h3>Importing</h3>
          <div className="speak-media-grid">
            {importingLessons.map(lesson => (
              <div
                key={lesson.id}
                className="speak-media-card is-preparing"
              >
                <div className="speak-media-card-icon">
                  <div className="spinner-medium" />
                </div>
                <div className="speak-media-card-body">
                  <div className="speak-media-card-title">{lesson.title}</div>
                  <div className="speak-media-card-meta">
                    <span className="speak-media-card-status preparing">
                      Importing for Intensive Speaking...
                    </span>
                  </div>
                </div>
                <div className="speak-media-card-actions">
                  <button
                    className="speak-media-card-delete"
                    onClick={(e) => handleDeleteLesson(lesson.id, e)}
                    title="Cancel import"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick stats or recent activity could go here */}
      <div className="speak-hub-footer">
        <p className="muted small">
          Tip: Start with Pronunciation Practice to build accuracy, then Intensive Speaking to build translation speed.
        </p>
      </div>

      {/* Pronunciation Practice Overlay (was Intensive) */}
      {activeMode === 'pronunciation' && (
        <div className="intensive-overlay" onClick={() => setActiveMode(null)}>
          <div className="intensive-overlay-content" onClick={e => e.stopPropagation()}>
            <div className="intensive-overlay-header">
              <h3>Select Practice Material</h3>
              <button className="intensive-overlay-close" onClick={() => setActiveMode(null)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <IntensiveModeHub
              activeLanguage={activeLanguage}
              nativeLanguage={nativeLanguage}
              onBack={() => setActiveMode(null)}
            />
          </div>
        </div>
      )}

      {/* Speaking Practice Overlay */}
      {activeMode === 'speakingPractice' && (
        <div className="intensive-overlay" onClick={() => setActiveMode(null)}>
          <div className="intensive-overlay-content" onClick={e => e.stopPropagation()}>
            <div className="intensive-overlay-header">
              <h3>Select Practice Material</h3>
              <button className="intensive-overlay-close" onClick={() => setActiveMode(null)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <SpeakingPracticeHub
              activeLanguage={activeLanguage}
              nativeLanguage={nativeLanguage}
              onBack={() => setActiveMode(null)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default SpeakHub
