import React, { useState, useEffect } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../../firebase'
import { resolveSupportedLanguageLabel } from '../../../constants/languages'
import { SpeakingPracticeSession } from './SpeakingPracticeSession'

/**
 * Speaking Practice Hub - Select or import native content for interpretation practice
 * User sees native language (English) text and speaks the target language (Spanish) translation
 */
export function SpeakingPracticeHub({ activeLanguage, nativeLanguage, onBack }) {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('library') // 'library' | 'import'
  const [lessons, setLessons] = useState([])
  const [lessonsLoading, setLessonsLoading] = useState(true)
  const [selectedLesson, setSelectedLesson] = useState(null)
  const [activeSession, setActiveSession] = useState(null)
  const [lessonsExpanded, setLessonsExpanded] = useState(true)

  // Import state
  const [importTitle, setImportTitle] = useState('')
  const [importText, setImportText] = useState('')
  const [importYoutubeUrl, setImportYoutubeUrl] = useState('')
  const [importSource, setImportSource] = useState('text') // 'text' | 'youtube'
  const [isImporting, setIsImporting] = useState(false)
  const [importError, setImportError] = useState(null)

  // Subscribe to speaking practice lessons (uses same collection as writing practice)
  // Normalize language to match how practice service stores it
  const normalizedLanguage = resolveSupportedLanguageLabel(activeLanguage, activeLanguage)

  useEffect(() => {
    if (!user?.uid || !normalizedLanguage) {
      setLessons([])
      setLessonsLoading(false)
      return
    }

    setLessonsLoading(true)
    const lessonsRef = collection(db, 'users', user.uid, 'practiceLessons')
    const lessonsQuery = query(
      lessonsRef,
      where('targetLanguage', '==', normalizedLanguage),
      orderBy('createdAt', 'desc')
    )

    const unsubscribe = onSnapshot(
      lessonsQuery,
      (snapshot) => {
        setLessons(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
        setLessonsLoading(false)
      },
      (err) => {
        console.error('Error loading practice lessons:', err)
        setLessonsLoading(false)
      }
    )

    return unsubscribe
  }, [user?.uid, normalizedLanguage])

  // Split text into smaller chunks for speaking (~5 words)
  const splitForSpeaking = (text) => {
    if (!text?.trim()) return []

    const CHUNK_TARGET = 5
    const sentences = text
      .split(/(?<=[.!?¡¿…])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 0)

    const chunks = []
    sentences.forEach(sentence => {
      const words = sentence.split(/\s+/).filter(w => w.length > 0)

      if (words.length <= CHUNK_TARGET + 2) {
        chunks.push({ text: sentence, index: chunks.length })
      } else {
        for (let i = 0; i < words.length; i += CHUNK_TARGET) {
          const chunkWords = words.slice(i, Math.min(i + CHUNK_TARGET, words.length))
          chunks.push({ text: chunkWords.join(' '), index: chunks.length })
        }
      }
    })

    return chunks
  }

  // Handle import - source can be passed directly for the new UI layout
  const handleImport = async (sourceOverride) => {
    if (!user?.uid) return

    const source = sourceOverride || importSource

    if (source === 'text' && !importText.trim()) {
      setImportError('Please enter some text to import')
      return
    }

    if (source === 'youtube' && !importYoutubeUrl.trim()) {
      setImportError('Please enter a YouTube URL')
      return
    }

    setIsImporting(true)
    setImportError(null)
    setImportSource(source)

    try {
      if (source === 'text') {
        // Split into chunks for speaking
        const chunks = splitForSpeaking(importText)

        const lessonData = {
          title: importTitle.trim() || `Speaking Practice - ${new Date().toLocaleDateString()}`,
          sourceLanguage: nativeLanguage,
          targetLanguage: activeLanguage,
          adaptationLevel: 'native',
          sourceType: 'text',
          sentences: chunks.map((chunk, index) => ({
            text: chunk.text,
            index,
            status: 'pending'
          })),
          currentIndex: 0,
          completedCount: 0,
          status: 'in_progress',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          attempts: [],
          speakingPractice: true, // Mark as created for speaking practice
        }

        await addDoc(collection(db, 'users', user.uid, 'practiceLessons'), lessonData)

        // Reset form and close overlay to return to dashboard
        setImportTitle('')
        setImportText('')
        if (onBack) onBack()
      } else if (source === 'youtube') {
        // Create lesson with importing status, trigger background transcription
        const lessonData = {
          title: importTitle.trim() || 'YouTube Speaking Practice',
          sourceLanguage: nativeLanguage,
          targetLanguage: activeLanguage,
          adaptationLevel: 'native',
          sourceType: 'youtube',
          youtubeUrl: importYoutubeUrl.trim(),
          sentences: [],
          currentIndex: 0,
          completedCount: 0,
          status: 'importing',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          attempts: [],
          speakingPractice: true,
        }

        const docRef = await addDoc(collection(db, 'users', user.uid, 'practiceLessons'), lessonData)

        // Trigger background transcription
        fetch('/api/transcribe/background', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lessonId: docRef.id,
            userId: user.uid,
            youtubeUrl: importYoutubeUrl.trim(),
            chunkForSpeaking: true, // Tell backend to use smaller chunks
          })
        }).catch(err => console.error('Background transcription trigger failed:', err))

        // Reset form and close overlay to return to dashboard
        setImportTitle('')
        setImportYoutubeUrl('')
        if (onBack) onBack()
      }
    } catch (err) {
      console.error('Import failed:', err)
      setImportError('Failed to import content. Please try again.')
    } finally {
      setIsImporting(false)
    }
  }

  // Start session with selected lesson
  const handleStartSession = () => {
    if (selectedLesson) {
      setActiveSession(selectedLesson)
    }
  }

  // Active session
  if (activeSession) {
    return (
      <SpeakingPracticeSession
        lesson={activeSession}
        activeLanguage={activeLanguage}
        nativeLanguage={nativeLanguage}
        onBack={() => setActiveSession(null)}
      />
    )
  }

  const readyLessons = lessons.filter(l => l.status !== 'importing' && l.status !== 'import_failed')
  const importingLessons = lessons.filter(l => l.status === 'importing')

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
          {lessonsLoading ? (
            <p className="muted small">Loading...</p>
          ) : lessons.length === 0 ? (
            <div className="intensive-hub-empty">
              <p className="muted">No practice content for {activeLanguage} yet.</p>
              <button className="btn btn-sm" onClick={() => setActiveTab('import')}>
                Import something
              </button>
            </div>
          ) : (
            <>
              {/* Ready lessons */}
              <div className="intensive-hub-section">
                <button
                  className="intensive-hub-section-header"
                  onClick={() => setLessonsExpanded(!lessonsExpanded)}
                >
                  <span className="intensive-hub-section-title">
                    Practice Lessons ({readyLessons.length})
                  </span>
                  <svg
                    className={`intensive-hub-chevron ${lessonsExpanded ? 'expanded' : ''}`}
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
                {lessonsExpanded && (
                  <ul className="intensive-hub-list">
                    {readyLessons.length === 0 ? (
                      <li className="intensive-hub-list-empty">No lessons ready</li>
                    ) : (
                      readyLessons.map(lesson => {
                        const isSelected = selectedLesson?.id === lesson.id
                        const sentenceCount = lesson.sentences?.length || 0
                        const progress = sentenceCount > 0
                          ? Math.round((lesson.completedCount || 0) / sentenceCount * 100)
                          : 0

                        return (
                          <li
                            key={lesson.id}
                            className={`intensive-hub-list-item ${isSelected ? 'selected' : ''}`}
                            onClick={() => setSelectedLesson(lesson)}
                          >
                            <span className="intensive-hub-item-title">{lesson.title || 'Untitled'}</span>
                            <span className="intensive-hub-item-meta">
                              {sentenceCount} segments • {progress}%
                            </span>
                          </li>
                        )
                      })
                    )}
                  </ul>
                )}
              </div>

              {/* Importing lessons */}
              {importingLessons.length > 0 && (
                <div className="intensive-hub-section">
                  <div className="intensive-hub-section-header" style={{ cursor: 'default' }}>
                    <span className="intensive-hub-section-title">
                      Importing ({importingLessons.length})
                    </span>
                  </div>
                  <ul className="intensive-hub-list">
                    {importingLessons.map(lesson => (
                      <li key={lesson.id} className="intensive-hub-list-item disabled">
                        <span className="intensive-hub-item-title">{lesson.title || 'Untitled'}</span>
                        <span className="intensive-hub-item-meta">Processing...</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Start button */}
              {selectedLesson && (
                <div className="intensive-hub-action">
                  <button className="btn btn-primary" onClick={handleStartSession}>
                    Start Speaking Practice
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
          {/* Paste Text section */}
          <div className="intensive-hub-import-section">
            <h4>Paste {nativeLanguage} Text</h4>
            <p className="muted small">Enter text you want to practice translating into {activeLanguage}.</p>

            <div className="form-grid">
              <label className="form-field">
                <span>Title (optional)</span>
                <input
                  type="text"
                  placeholder="My speaking practice..."
                  value={importTitle}
                  onChange={(e) => setImportTitle(e.target.value)}
                />
              </label>

              <label className="form-field">
                <span>{nativeLanguage} text</span>
                <textarea
                  placeholder={`Paste ${nativeLanguage} sentences here...`}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  rows={4}
                />
              </label>
            </div>

            {importError && importSource === 'text' && (
              <p className="error small">{importError}</p>
            )}

            <button
              className="btn btn-primary"
              onClick={() => handleImport('text')}
              disabled={isImporting || !importText.trim()}
            >
              {isImporting && importSource === 'text' ? 'Importing...' : 'Import text'}
            </button>
          </div>

          <div className="intensive-hub-import-divider" />

          {/* YouTube section */}
          <div className="intensive-hub-import-section">
            <h4>Import from YouTube</h4>
            <p className="muted small">Import a {nativeLanguage} video to practice interpreting.</p>

            <div className="form-grid">
              <label className="form-field">
                <span>Title</span>
                <input
                  type="text"
                  placeholder="My favorite talk..."
                  value={importTitle}
                  onChange={(e) => setImportTitle(e.target.value)}
                />
              </label>

              <label className="form-field">
                <span>YouTube URL</span>
                <input
                  type="url"
                  placeholder="https://youtube.com/watch?v=..."
                  value={importYoutubeUrl}
                  onChange={(e) => setImportYoutubeUrl(e.target.value)}
                />
              </label>
            </div>

            {importError && importSource === 'youtube' && (
              <p className="error small">{importError}</p>
            )}

            <button
              className="btn btn-primary"
              onClick={() => handleImport('youtube')}
              disabled={isImporting || !importYoutubeUrl.trim()}
            >
              {isImporting && importSource === 'youtube' ? 'Importing...' : 'Import video'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default SpeakingPracticeHub
