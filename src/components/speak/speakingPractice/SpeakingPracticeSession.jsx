import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../../firebase'
import { upsertVocabEntry } from '../../../services/vocab'

/**
 * Speaking Practice Session - Interpretation practice
 * User sees native language text and speaks the target language translation
 * Uses simple record button like Pronunciation Practice
 * Prefetches exemplars in batches of 5 for faster response
 */
export function SpeakingPracticeSession({ lesson, activeLanguage, nativeLanguage, onBack }) {
  const { user } = useAuth()
  const [currentIndex, setCurrentIndex] = useState(lesson.currentIndex || 0)
  const [userRecording, setUserRecording] = useState(null)
  const [isAssessing, setIsAssessing] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [exemplar, setExemplar] = useState(null)
  const [showExemplar, setShowExemplar] = useState(false)
  const [error, setError] = useState(null)
  const [vocabToSave, setVocabToSave] = useState([])
  const [savedVocab, setSavedVocab] = useState({})

  // Recording state (simple like pronunciation practice)
  const [isRecording, setIsRecording] = useState(false)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])

  // Exemplar prefetch state
  const [exemplarCache, setExemplarCache] = useState({}) // index -> exemplar
  const [fetchingExemplars, setFetchingExemplars] = useState(false)
  const lastFetchedBatchRef = useRef(-1)

  const sentences = lesson.sentences || []
  const currentSentence = sentences[currentIndex]

  // Reset state when navigating to a new sentence
  useEffect(() => {
    setUserRecording(null)
    setFeedback(null)
    // Use cached exemplar if available
    setExemplar(exemplarCache[currentIndex] || null)
    setShowExemplar(false)
    setError(null)
    setVocabToSave([])
    setSavedVocab({})
  }, [currentIndex, exemplarCache])

  // Prefetch exemplars in batches of 5
  // Fetch when: on mount, or when 2 left in current batch
  const prefetchExemplars = useCallback(async (startIndex) => {
    if (fetchingExemplars || startIndex < 0 || startIndex >= sentences.length) return

    const batchNumber = Math.floor(startIndex / 5)
    if (batchNumber <= lastFetchedBatchRef.current) return

    const batchStart = batchNumber * 5
    const batchEnd = Math.min(batchStart + 5, sentences.length)

    // Get sentences that need exemplars
    const sentencesToFetch = []
    const indices = []
    for (let i = batchStart; i < batchEnd; i++) {
      if (!exemplarCache[i] && sentences[i]?.text) {
        sentencesToFetch.push(sentences[i].text)
        indices.push(i)
      }
    }

    if (sentencesToFetch.length === 0) {
      lastFetchedBatchRef.current = batchNumber
      return
    }

    setFetchingExemplars(true)
    try {
      const response = await fetch('/api/speech/exemplars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sentences: sentencesToFetch,
          targetLanguage: activeLanguage,
          sourceLanguage: nativeLanguage
        })
      })

      if (response.ok) {
        const { exemplars } = await response.json()
        setExemplarCache(prev => {
          const updated = { ...prev }
          indices.forEach((idx, i) => {
            if (exemplars[i]) updated[idx] = exemplars[i]
          })
          return updated
        })
        lastFetchedBatchRef.current = batchNumber
      }
    } catch (err) {
      console.error('Exemplar prefetch failed:', err)
    } finally {
      setFetchingExemplars(false)
    }
  }, [sentences, activeLanguage, nativeLanguage, exemplarCache, fetchingExemplars])

  // Initial prefetch and trigger when 2 left in batch
  useEffect(() => {
    // Initial fetch (batch 0)
    if (lastFetchedBatchRef.current < 0 && sentences.length > 0) {
      prefetchExemplars(0)
    }

    // When 2 left in current batch, fetch next batch
    const currentBatch = Math.floor(currentIndex / 5)
    const positionInBatch = currentIndex % 5
    if (positionInBatch >= 3) { // At position 3 or 4 in batch (0-indexed)
      prefetchExemplars((currentBatch + 1) * 5)
    }
  }, [currentIndex, sentences.length, prefetchExemplars])

  // Update lesson progress in Firestore
  const updateProgress = useCallback(async (index, completed = false) => {
    if (!user?.uid || !lesson.id) return

    try {
      const lessonRef = doc(db, 'users', user.uid, 'practiceLessons', lesson.id)
      const updates = {
        currentIndex: index,
        updatedAt: serverTimestamp()
      }

      if (completed) {
        // Mark sentence as completed
        const updatedSentences = [...sentences]
        if (updatedSentences[index]) {
          updatedSentences[index] = { ...updatedSentences[index], status: 'completed' }
        }
        updates.sentences = updatedSentences
        updates.completedCount = updatedSentences.filter(s => s.status === 'completed').length

        // Check if lesson is complete
        if (updates.completedCount >= sentences.length) {
          updates.status = 'complete'
        }
      }

      await updateDoc(lessonRef, updates)
    } catch (err) {
      console.error('Failed to update progress:', err)
    }
  }, [user?.uid, lesson.id, sentences])

  // Simple recording functions (like Pronunciation Practice)
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        const url = URL.createObjectURL(blob)
        setUserRecording({ blob, url })
        stream.getTracks().forEach(track => track.stop())

        // Auto-submit for assessment
        await handleAssessment(blob)
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch (err) {
      console.error('Recording error:', err)
      setError('Could not access microphone')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  // Handle assessment after recording stops
  const handleAssessment = async (blob) => {
    setIsAssessing(true)
    setError(null)

    try {
      // Convert blob to base64
      const reader = new FileReader()
      reader.readAsDataURL(blob)
      reader.onloadend = async () => {
        const base64Audio = reader.result.split(',')[1]

        // Use cached exemplar if available for faster response
        const cachedExemplar = exemplarCache[currentIndex]

        const response = await fetch('/api/speech/speaking-practice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audioBase64: base64Audio,
            nativeSentence: currentSentence.text,
            targetLanguage: activeLanguage,
            sourceLanguage: nativeLanguage,
            exemplar: cachedExemplar // Pass preloaded exemplar
          })
        })

        if (!response.ok) {
          throw new Error('Assessment failed')
        }

        const result = await response.json()
        setFeedback(result.feedback)
        setExemplar(result.exemplar)
        setVocabToSave(result.vocab || [])
        setIsAssessing(false)
      }
    } catch (err) {
      console.error('Assessment error:', err)
      setError('Could not assess your translation. Please try again.')
      setIsAssessing(false)
    }
  }

  // Handle "I'm not sure" button - reveal exemplar without recording
  const handleNotSure = async () => {
    setIsAssessing(true)
    setError(null)

    try {
      const response = await fetch('/api/speech/speaking-practice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nativeSentence: currentSentence.text,
          targetLanguage: activeLanguage,
          sourceLanguage: nativeLanguage,
          skipRecording: true
        })
      })

      if (!response.ok) {
        throw new Error('Failed to get exemplar')
      }

      const result = await response.json()
      setExemplar(result.exemplar)
      setVocabToSave(result.vocab || [])
      setShowExemplar(true)
      setIsAssessing(false)
    } catch (err) {
      console.error('Error getting exemplar:', err)
      setError('Could not get the translation. Please try again.')
      setIsAssessing(false)
    }
  }

  // Save a vocabulary word
  const handleSaveVocab = async (word) => {
    if (!user?.uid || savedVocab[word.text]) return

    try {
      await upsertVocabEntry(
        user.uid,
        activeLanguage,
        word.text,
        word.translation,
        'unknown'
      )
      setSavedVocab(prev => ({ ...prev, [word.text]: true }))
    } catch (err) {
      console.error('Failed to save vocab:', err)
    }
  }

  // Navigation
  const goToNext = useCallback(() => {
    if (currentIndex < sentences.length - 1) {
      const nextIndex = currentIndex + 1
      updateProgress(nextIndex, true)
      setCurrentIndex(nextIndex)
    }
  }, [currentIndex, sentences.length, updateProgress])

  const goToPrevious = useCallback(() => {
    if (currentIndex > 0) {
      const prevIndex = currentIndex - 1
      updateProgress(prevIndex)
      setCurrentIndex(prevIndex)
    }
  }, [currentIndex, updateProgress])

  // Retry recording
  const retryRecording = () => {
    setUserRecording(null)
    setFeedback(null)
    setError(null)
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return

      if (e.key === 'ArrowRight' && (feedback || showExemplar)) {
        e.preventDefault()
        goToNext()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goToPrevious()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goToNext, goToPrevious, feedback, showExemplar])

  if (sentences.length === 0) {
    return (
      <div className="intensive-overlay">
        <div className="intensive-card intensive-card--speaking">
          <div className="intensive-card-empty">
            <p className="muted">No sentences found in this lesson.</p>
            <button className="btn btn-secondary" onClick={onBack}>
              Go Back
            </button>
          </div>
        </div>
      </div>
    )
  }

  const isComplete = currentIndex >= sentences.length - 1 && (feedback || showExemplar)

  return (
    <div className="intensive-overlay">
      <div className="intensive-card intensive-card--speaking">
        {/* Header */}
        <div className="intensive-card-header">
          <div className="intensive-card-nav">
            <button
              type="button"
              className="intensive-card-nav-btn"
              onClick={goToPrevious}
              disabled={currentIndex === 0}
              aria-label="Previous sentence"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <span className="intensive-card-nav-counter">
              {currentIndex + 1} / {sentences.length}
            </span>
            <button
              type="button"
              className="intensive-card-nav-btn"
              onClick={goToNext}
              disabled={currentIndex >= sentences.length - 1}
              aria-label="Next sentence"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 6 15 12 9 18" />
              </svg>
            </button>
          </div>

          <button
            type="button"
            className="intensive-card-close"
            onClick={onBack}
            aria-label="End session"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Main content */}
        <div className="intensive-card-content intensive-card-content--speaking">
          {/* Source text (native language) */}
          <div className="speaking-practice-source">
            <span className="speaking-practice-label">{nativeLanguage}</span>
            <p className="speaking-practice-text">
              {currentSentence?.text || 'No text available'}
            </p>
          </div>

          {/* Recording zone (before feedback) */}
          {!feedback && !showExemplar && (
            <div className="speaking-practice-recording">
              {!userRecording && !isAssessing ? (
                <>
                  <p className="speaking-practice-instruction">
                    {isRecording ? 'Recording... tap to stop' : `Speak the ${activeLanguage} translation:`}
                  </p>
                  <button
                    type="button"
                    className={`pronunciation-record-btn ${isRecording ? 'recording' : ''}`}
                    onClick={toggleRecording}
                    aria-label={isRecording ? 'Stop recording' : 'Start recording'}
                  >
                    {isRecording ? (
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="6" width="12" height="12" rx="2" />
                      </svg>
                    ) : (
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="12" r="6" />
                      </svg>
                    )}
                  </button>
                  {!isRecording && (
                    <button
                      className="speaking-practice-skip-btn"
                      onClick={handleNotSure}
                      disabled={isAssessing}
                    >
                      I'm not sure
                    </button>
                  )}
                </>
              ) : isAssessing ? (
                <div className="speaking-practice-loading">
                  <div className="spinner" />
                  <p className="muted">Analyzing your translation...</p>
                </div>
              ) : null}
            </div>
          )}

          {/* Loading state for "I'm not sure" */}
          {isAssessing && !userRecording && (
            <div className="speaking-practice-loading">
              <div className="spinner" />
              <p className="muted">Getting translation...</p>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="speaking-practice-error">
              <p>{error}</p>
              <button className="btn btn-secondary" onClick={retryRecording}>
                Try Again
              </button>
            </div>
          )}

          {/* Feedback zone (after recording or "I'm not sure") */}
          {(feedback || showExemplar) && (
            <div className="speaking-practice-feedback">
              {/* User's recording playback (if they recorded) */}
              {userRecording && (
                <div className="speaking-practice-playback">
                  <span className="speaking-practice-label">Your recording</span>
                  <audio src={userRecording.url} controls />
                </div>
              )}

              {/* Feedback on accuracy (if they recorded) */}
              {feedback && (
                <div className="speaking-practice-assessment">
                  <div className={`speaking-practice-score ${feedback.accuracy >= 80 ? 'pass' : feedback.accuracy >= 50 ? 'acceptable' : 'fail'}`}>
                    <span className="score-label">Accuracy</span>
                    <span className="score-value">{feedback.accuracy}%</span>
                  </div>
                  {feedback.explanation && (
                    <p className="speaking-practice-explanation">{feedback.explanation}</p>
                  )}
                </div>
              )}

              {/* Exemplar sentence */}
              {exemplar && (
                <div className="speaking-practice-exemplar">
                  <span className="speaking-practice-label">Example ({activeLanguage})</span>
                  <p className="speaking-practice-exemplar-text">{exemplar}</p>
                  {/* TTS playback for exemplar could be added here */}
                </div>
              )}

              {/* Vocabulary to save */}
              {vocabToSave.length > 0 && (
                <div className="speaking-practice-vocab">
                  <span className="speaking-practice-label">Vocabulary</span>
                  <div className="speaking-practice-vocab-list">
                    {vocabToSave.map((word, idx) => (
                      <div key={idx} className="speaking-practice-vocab-item">
                        <div className="vocab-item-content">
                          <span className="vocab-item-word">{word.text}</span>
                          <span className="vocab-item-translation">{word.translation}</span>
                        </div>
                        <button
                          className={`vocab-item-save ${savedVocab[word.text] ? 'saved' : ''}`}
                          onClick={() => handleSaveVocab(word)}
                          disabled={savedVocab[word.text]}
                        >
                          {savedVocab[word.text] ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                            </svg>
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M12 5v14M5 12h14" />
                            </svg>
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="speaking-practice-actions">
                {userRecording && (
                  <button className="btn btn-secondary" onClick={retryRecording}>
                    Try Again
                  </button>
                )}
                {!isComplete ? (
                  <button className="btn btn-primary" onClick={goToNext}>
                    Continue
                  </button>
                ) : (
                  <button className="btn btn-primary" onClick={onBack}>
                    Finish
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default SpeakingPracticeSession
