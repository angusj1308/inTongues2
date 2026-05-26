import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, orderBy, onSnapshot, where, doc, deleteDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../context/AuthContext'
import { resolveSupportedLanguageLabel } from '../../constants/languages'
import { SpeakingPracticeHub } from './speakingPractice/SpeakingPracticeHub'
import { SpeakingPracticeSession } from './speakingPractice/SpeakingPracticeSession'
import { VoiceRecordHub } from './voiceRecord/VoiceRecordHub'

export function SpeakHub({ activeLanguage, nativeLanguage }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [expandedDoor, setExpandedDoor] = useState(null)
  const [speakingPracticeLessons, setSpeakingPracticeLessons] = useState([])
  const [readySpeakingLessons, setReadySpeakingLessons] = useState([])
  const [activeSpeakingSession, setActiveSpeakingSession] = useState(null)
  const expandedCardRef = useRef(null)

  const normalizedLanguage = resolveSupportedLanguageLabel(activeLanguage, activeLanguage)

  useEffect(() => {
    if (!expandedDoor) return
    const handleClickOutside = (event) => {
      const card = expandedCardRef.current
      if (card && !card.contains(event.target)) {
        setExpandedDoor(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [expandedDoor])

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
        const allLessons = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))

        const importing = allLessons
          .filter(l => l.status === 'importing')
          .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
        setSpeakingPracticeLessons(importing)

        const ready = allLessons
          .filter(l => l.status !== 'importing' && l.status !== 'import_failed')
          .sort((a, b) => (b.updatedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0))
        setReadySpeakingLessons(ready)
      },
      (err) => {
        console.error('Error loading speaking practice lessons:', err)
      }
    )

    return unsubscribe
  }, [user?.uid, normalizedLanguage])

  const importingLessons = speakingPracticeLessons.filter(l => l.status === 'importing')

  const handleDeleteLesson = async (lessonId, e) => {
    e.stopPropagation()
    if (!user?.uid || !lessonId) return
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'practiceLessons', lessonId))
    } catch (err) {
      console.error('Failed to delete lesson:', err)
    }
  }

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

  if (expandedDoor === 'voiceRecord') {
    return (
      <div className="speak-hub">
        <div className="speak-hub-nav">
          <button className="btn-back" onClick={() => setExpandedDoor(null)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back
          </button>
        </div>
        <VoiceRecordHub
          activeLanguage={activeLanguage}
          nativeLanguage={nativeLanguage}
          onBack={() => setExpandedDoor(null)}
        />
      </div>
    )
  }

  return (
    <div className="speak-hub compose-landing">
      <div className="discover-doors discover-doors--landing">
        {expandedDoor === 'speakingPractice' ? (
          <div ref={expandedCardRef} className="discover-door discover-door--landing is-expanded">
            <SpeakingPracticeHub
              activeLanguage={activeLanguage}
              nativeLanguage={nativeLanguage}
              onBack={() => setExpandedDoor(null)}
            />
          </div>
        ) : (
          <button className="discover-door discover-door--landing" onClick={() => setExpandedDoor('speakingPractice')}>
            <h2 className="discover-door-label">Practice</h2>
            <span className="discover-door-rule" aria-hidden="true" />
            <p className="discover-door-description">
              See {nativeLanguage} sentences and practice producing them in {activeLanguage}.
            </p>
          </button>
        )}

        <button className="discover-door discover-door--landing" onClick={() => setExpandedDoor('voiceRecord')}>
          <h2 className="discover-door-label">Free Record</h2>
          <span className="discover-door-rule" aria-hidden="true" />
          <p className="discover-door-description">
            Speak freely about any topic. Get feedback on grammar, vocabulary and expression.
          </p>
        </button>
      </div>

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
                      {sentenceCount} segments · {progress}% complete
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
    </div>
  )
}

export default SpeakHub
