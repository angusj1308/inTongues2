import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
} from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { VOCAB_STATUSES, loadUserVocab, normaliseExpression, upsertVocabEntry } from '../services/vocab'

const Reader = () => {
  const navigate = useNavigate()
  const { id, language } = useParams()
  const { user, profile } = useAuth()

  const [pages, setPages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [pageTranslations, setPageTranslations] = useState({})
  const [popup, setPopup] = useState(null)
  const [vocabEntries, setVocabEntries] = useState({})
  const [hasSeenAutoKnownInfo, setHasSeenAutoKnownInfo] = useState(
    () => localStorage.getItem('seenAutoKnownInfo') === 'true'
  )
  const [audioStatus, setAudioStatus] = useState('')
  const [fullAudioUrl, setFullAudioUrl] = useState('')
  const [hasFullAudio, setHasFullAudio] = useState(false)
  // popup: { x, y, word, translation } | null

  async function handleWordClick(e) {
    e.stopPropagation()

    const selection = window.getSelection()?.toString().trim()

    if (!selection) return

    const parts = selection.split(/\s+/).filter(Boolean)

    // Multiple words → treat as phrase
    if (parts.length > 1) {
      const phrase = selection

      // Position popup under selection
      const selectionObj = window.getSelection()
      if (!selectionObj || selectionObj.rangeCount === 0) return

      const range = selectionObj.getRangeAt(0)
      const rect = range.getBoundingClientRect()

      let translation = 'No translation found'

      try {
        const response = await fetch('http://localhost:4000/api/translatePhrase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phrase,
            sourceLang: language || 'es', // TODO: replace with real source language
            targetLang: profile?.nativeLanguage || 'English',
          }),
        })

        if (response.ok) {
          const data = await response.json()
          translation = data.translation || translation
        } else {
          console.error('Phrase translation failed:', await response.text())
        }
      } catch (err) {
        console.error('Error translating phrase:', err)
      }

      setPopup({
        x: rect.left + window.scrollX,
        y: rect.bottom + window.scrollY + 8,
        word: phrase,
        translation,
      })

      return
    }

    // Single word
    const clean = selection.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase()
    if (!clean) return

    const translation = pageTranslations[clean] || pageTranslations[selection] || 'No translation found'

    const selectionObj = window.getSelection()
    if (!selectionObj || selectionObj.rangeCount === 0) return

    const range = selectionObj.getRangeAt(0)
    const rect = range.getBoundingClientRect()

    setPopup({
      x: rect.left + window.scrollX,
      y: rect.bottom + window.scrollY + 8,
      word: clean,
      translation,
    })
  }

  const handleSetWordStatus = async (status) => {
    if (!user || !language || !popup?.word) return
    if (!VOCAB_STATUSES.includes(status)) return

    try {
      await upsertVocabEntry(
        user.uid,
        language,
        popup.word,
        popup.translation,
        status
      )

      const key = normaliseExpression(popup.word)

      setVocabEntries((prev) => ({
        ...prev,
        [key]: {
          ...(prev[key] || { text: popup.word, language }),
          status,
          translation: popup.translation,
        },
      }))
    } catch (err) {
      console.error('Failed to update vocab status', err)
    }
  }

  useEffect(() => {
    if (!user || !id) {
      setPages([])
      setLoading(false)
      return undefined
    }

    const loadPages = async () => {
      setLoading(true)
      try {
        const pagesRef = collection(db, 'users', user.uid, 'stories', id, 'pages')
        const pagesQuery = query(pagesRef, orderBy('index', 'asc'))
        const snapshot = await getDocs(pagesQuery)
        const nextPages = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        setPages(nextPages)
        setCurrentIndex(0)
        setError('')
      } catch (loadError) {
        console.error(loadError)
        setError('Unable to load story pages right now.')
      } finally {
        setLoading(false)
      }
    }

    loadPages()
    return undefined
  }, [id, language, user])

  useEffect(() => {
    if (!user || !id) {
      setAudioStatus('')
      setFullAudioUrl('')
      setHasFullAudio(false)
      return
    }

    const loadStoryMeta = async () => {
      try {
        const storyRef = doc(db, 'users', user.uid, 'stories', id)
        const storySnap = await getDoc(storyRef)

        if (!storySnap.exists()) {
          setAudioStatus('')
          setFullAudioUrl('')
          setHasFullAudio(false)
          return
        }

        const data = storySnap.data() || {}
        setAudioStatus(data.audioStatus || '')
        setFullAudioUrl(data.fullAudioUrl || '')
        setHasFullAudio(Boolean(data.hasFullAudio))
      } catch (err) {
        console.error('Failed to load story audio metadata', err)
        setAudioStatus('')
        setFullAudioUrl('')
        setHasFullAudio(false)
      }
    }

    loadStoryMeta()
  }, [user, id])

  useEffect(() => {
    setCurrentIndex(0)
  }, [pages.length])

  const getDisplayText = (page) =>
    page?.adaptedText || page?.originalText || page?.text || ''

  useEffect(() => {
    if (!user || !language) {
      setVocabEntries({})
      return undefined
    }

    let isActive = true

    const fetchVocab = async () => {
      try {
        const entries = await loadUserVocab(user.uid, language)
        if (isActive) {
          setVocabEntries(entries)
        }
      } catch (err) {
        console.error('Failed to load vocabulary entries', err)
        if (isActive) {
          setVocabEntries({})
        }
      }
    }

    fetchVocab()

    return () => {
      isActive = false
    }
  }, [language, user])

  const visiblePages = pages.slice(currentIndex, currentIndex + 2)
  const pageText = visiblePages.map((p) => getDisplayText(p)).join(' ')

  const getNewWordsOnCurrentPages = () => {
    const combinedText = visiblePages.map((p) => getDisplayText(p)).join(' ')

    if (!combinedText) return []

    const rawWords = Array.from(
      new Set(
        combinedText
          .replace(/[^\p{L}\p{N}]+/gu, ' ')
          .toLowerCase()
          .split(/\s+/)
          .filter(Boolean)
      )
    )

    const newWords = rawWords.filter((word) => {
      const key = normaliseExpression(word)
      return !vocabEntries[key]
    })

    return newWords
  }

  const handleNextPages = async () => {
    if (!hasNext) return

    // First-time info popup
    if (!hasSeenAutoKnownInfo) {
      window.alert(
        'When you move to the next page, all new words you have not tagged will automatically be marked as Known.'
      )
      localStorage.setItem('seenAutoKnownInfo', 'true')
      setHasSeenAutoKnownInfo(true)
    }

    // If we don't have user/language, just advance
    if (!user || !language) {
      setCurrentIndex((prev) =>
        Math.min(prev + 2, pages.length - (pages.length % 2 ? 1 : 2))
      )
      return
    }

    const newWords = getNewWordsOnCurrentPages()

    if (newWords.length > 0) {
      const confirmed = window.confirm(
        'By going to the next page, all new words you have not tagged will be marked as Known. Continue?'
      )

      if (!confirmed) {
        // User cancelled: do not advance
        return
      }

      try {
        // Persist each new word as known
        await Promise.all(
          newWords.map((word) => {
            const key = normaliseExpression(word)
            const translation =
              pageTranslations[key] ||
              pageTranslations[word] ||
              'No translation found'

            return upsertVocabEntry(
              user.uid,
              language,
              word,
              translation,
              'known'
            )
          })
        )

        // Update local vocabEntries so they render as known
        setVocabEntries((prev) => {
          const next = { ...prev }
          newWords.forEach((word) => {
            const key = normaliseExpression(word)
            const translation =
              pageTranslations[key] ||
              pageTranslations[word] ||
              'No translation found'

            next[key] = {
              ...(next[key] || { text: word, language }),
              status: 'known',
              translation,
            }
          })
          return next
        })
      } catch (error) {
        console.error('Failed to auto-mark new words as known:', error)
        // Even if this fails, still allow the user to move on
      }
    }

    // Finally, advance to next pages
    setCurrentIndex((prev) =>
      Math.min(prev + 2, pages.length - (pages.length % 2 ? 1 : 2))
    )
  }

  const isWordChar = (ch) => {
    if (!ch) return false
    return /\p{L}|\p{N}/u.test(ch)
  }

  const segmentTextByExpressions = (text, expressions) => {
    if (!text) return []

    const segments = []
    let index = 0
    const lowerText = text.toLowerCase()

    while (index < text.length) {
      let matchedExpression = null

      for (const expression of expressions) {
        if (!expression) continue
        const candidate = lowerText.slice(index, index + expression.length)
        if (candidate === expression) {
          const beforeChar = index === 0 ? '' : lowerText[index - 1]
          const afterChar =
            index + expression.length >= lowerText.length
              ? ''
              : lowerText[index + expression.length]

          if (!isWordChar(beforeChar) && !isWordChar(afterChar)) {
            matchedExpression = expression
            break
          }
        }
      }

      if (matchedExpression) {
        const phraseText = text.slice(index, index + matchedExpression.length)
        const status = vocabEntries[matchedExpression]?.status || 'new'

        segments.push({ type: 'phrase', text: phraseText, status })
        index += matchedExpression.length
        continue
      }

      let nextIndex = text.length
      for (const expression of expressions) {
        const foundIndex = lowerText.indexOf(expression, index)
        if (foundIndex !== -1 && foundIndex < nextIndex) {
          nextIndex = foundIndex
        }
      }

      if (nextIndex === text.length) {
        segments.push({ type: 'text', text: text.slice(index) })
        break
      }

      segments.push({ type: 'text', text: text.slice(index, nextIndex) })
      index = nextIndex
    }

    return segments
  }

  const renderHighlightedText = (text) => {
    const expressions = Object.keys(vocabEntries)
      .filter((key) => key.includes(' '))
      .map((key) => normaliseExpression(key))
      .sort((a, b) => b.length - a.length)

    const segments = segmentTextByExpressions(text || '', expressions)

    const elements = []

    segments.forEach((segment, segmentIndex) => {
      if (segment.type === 'phrase') {
        elements.push(
          <span
            key={`phrase-${segmentIndex}`}
            className={`phrase-${segment.status || 'new'}`}
          >
            {segment.text}
          </span>
        )
        return
      }

      const tokens = (segment.text || '').split(/([\p{L}\p{N}][\p{L}\p{N}'-]*)/gu)

      tokens.forEach((token, index) => {
        if (!token) return

        const isWord = /[\p{L}\p{N}]/u.test(token)

        if (!isWord) {
          elements.push(
            <span key={`separator-${segmentIndex}-${index}`}>
              {token}
            </span>
          )
          return
        }

        const normalised = normaliseExpression(token)
        const entry = vocabEntries[normalised]
        const status = entry?.status

        let className
        if (!status) {
          className = 'word-new'
        } else if (status === 'unknown') {
          className = 'word-unknown'
        } else if (status === 'recognised') {
          className = 'word-recognised'
        } else if (status === 'familiar') {
          className = 'word-familiar'
        } else {
          className = 'word-known'
        }

        elements.push(
          <span key={`word-${segmentIndex}-${index}`} className={className}>
            {token}
          </span>
        )
      })
    })

    return elements
  }

  useEffect(() => {
    if (!pageText || typeof pageText !== 'string') return

    const words = Array.from(
      new Set(
        pageText
          .replace(/[^\p{L}\p{N}]+/gu, ' ')
          .toLowerCase()
          .split(/\s+/)
          .filter(Boolean)
      )
    )

    if (words.length === 0) return

    const controller = new AbortController()

    async function prefetch() {
      try {
        const response = await fetch('http://localhost:4000/api/prefetchTranslations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            languageCode: language || 'es', // TODO: replace with real language code
            targetLang: profile?.nativeLanguage || 'English',
            words,
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          console.error('Failed to prefetch translations', await response.text())
          return
        }

        const data = await response.json()
        setPageTranslations(data.translations || {})
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Error prefetching translations', error)
        }
      }
    }

    prefetch()

    return () => {
      controller.abort()
    }
  }, [language, pageText, profile?.nativeLanguage])

  useEffect(() => {
    function handleGlobalClick(event) {
      // If clicking inside the text area or inside the popup, do NOT close
      if (
        event.target.closest('.page-text') ||
        event.target.closest('.translate-popup')
      ) {
        return
      }

      setPopup(null)
    }

    window.addEventListener('click', handleGlobalClick)
    return () => {
      window.removeEventListener('click', handleGlobalClick)
    }
  }, [])

  const hasPrevious = currentIndex > 0
  const hasNext = currentIndex + 2 < pages.length
  // visiblePages is already defined above

  return (
    <div className="page reader-page">
      <div className="reader-actions">
        <button
          className="button ghost"
          onClick={() => navigate(language ? `/library/${encodeURIComponent(language)}` : '/library')}
        >
          Back to library
        </button>
        {audioStatus === 'ready' && fullAudioUrl && (
          <audio controls src={fullAudioUrl} style={{ width: '100%' }} />
        )}
      </div>

      {loading ? (
        <p className="muted">Loading pages...</p>
      ) : error ? (
        <p className="error">{error}</p>
      ) : pages.length ? (
        <>
          <div className="reader-pages">
            {visiblePages.map((page) => {
              const pageNumber = (page.index ?? pages.indexOf(page)) + 1

              return (
                <div key={page.id || page.index} className="reader-page-block">
                  <div className="page-text" onMouseUp={handleWordClick}>
                    {renderHighlightedText(getDisplayText(page))}
                  </div>
                  <div className="page-number">{pageNumber}</div>
                </div>
              )
            })}
          </div>

          <div className="section" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
            <button
              className="button ghost"
              disabled={!hasPrevious}
              onClick={() => setCurrentIndex((prev) => Math.max(prev - 2, 0))}
            >
              Previous pages
            </button>
            <button
              className="button ghost"
              disabled={!hasNext}
              onClick={handleNextPages}
            >
              Next pages
            </button>
          </div>
        </>
      ) : (
        <p className="muted">Story {id} is ready to read soon.</p>
      )}
      {popup && (
        <div
          className="translate-popup"
          style={{
            position: 'absolute',
            top: popup.y,
            left: popup.x,
            background: 'white',
            padding: '8px 12px',
            borderRadius: '6px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            zIndex: 1000,
            maxWidth: '260px',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <strong>{popup.word}</strong>
          <div style={{ marginTop: '4px' }}>{popup.translation}</div>

          <div
            style={{
              display: 'flex',
              gap: '6px',
              marginTop: '8px',
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              onClick={() => handleSetWordStatus('unknown')}
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: '#001f3f', // navy
                color: 'white',
                fontSize: '0.75rem',
              }}
            >
              Unknown
            </button>
            <button
              type="button"
              onClick={() => handleSetWordStatus('recognised')}
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: '#800000', // maroon
                color: 'white',
                fontSize: '0.75rem',
              }}
            >
              Recognised
            </button>
            <button
              type="button"
              onClick={() => handleSetWordStatus('familiar')}
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: '#0b3d0b', // dark forest green
                color: 'white',
                fontSize: '0.75rem',
              }}
            >
              Familiar
            </button>
            <button
              type="button"
              onClick={() => handleSetWordStatus('known')}
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: '#000000', // black
                color: 'white',
                fontSize: '0.75rem',
              }}
            >
              Known
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default Reader
