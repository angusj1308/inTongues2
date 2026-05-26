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
          <h2 className="discover-door-label">Record</h2>
          <span className="discover-door-rule" aria-hidden="true" />
          <p className="discover-door-description">
            Speak freely about any topic. Get feedback on grammar, vocabulary and expression.
          </p>
        </button>
      </div>

      {readySpeakingLessons.length > 0 && (
        <section className="notebook-section">
          <ul className="notebook-list">
            {readySpeakingLessons.map(lesson => {
              const sentenceCount = lesson.sentences?.length || 0
              const completed = lesson.completedCount || 0

              return (
                <li
                  key={lesson.id}
                  className="notebook-row"
                  onClick={() => setActiveSpeakingSession(lesson)}
                >
                  <span className="notebook-title">{lesson.title}</span>
                  <span className="notebook-kind">Practice</span>
                  <span className="notebook-spacer" />
                  <span className="notebook-meta">
                    {sentenceCount > 0 ? `${completed}/${sentenceCount} sentences` : ''}
                  </span>
                  <span className="notebook-edit" aria-label="Continue">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {importingLessons.length > 0 && (
        <section className="notebook-section">
          <ul className="notebook-list">
            {importingLessons.map(lesson => (
              <li key={lesson.id} className="notebook-row" style={{ opacity: 0.6 }}>
                <span className="notebook-title">{lesson.title}</span>
                <span className="notebook-spacer" />
                <span className="notebook-meta">Importing...</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

export default SpeakHub
