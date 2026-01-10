import { useCallback, useMemo, useRef, useState, useEffect } from 'react'
import { HIGHLIGHT_COLOR, STATUS_OPACITY } from '../../constants/highlightColors'
import { normaliseExpression, upsertVocabEntry } from '../../services/vocab'

const STATUS_LEVELS = ['new', 'unknown', 'recognised', 'familiar', 'known']
const STATUS_ABBREV = ['N', 'U', 'R', 'F', 'K']

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
    <path d="M8 5v14l11-7z" />
  </svg>
)

const ChevronUpIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="18 15 12 9 6 15" />
  </svg>
)

const ChevronDownIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="6 9 12 15 18 9" />
  </svg>
)

// Get background style for a status button when active
const getStatusStyle = (statusLevel, isActive) => {
  if (!isActive) return {}

  switch (statusLevel) {
    case 'new':
      return {
        background: `color-mix(in srgb, ${HIGHLIGHT_COLOR} ${STATUS_OPACITY.new * 100}%, white)`,
        color: '#5C1A22'
      }
    case 'unknown':
      return {
        background: `color-mix(in srgb, ${HIGHLIGHT_COLOR} ${STATUS_OPACITY.unknown * 100}%, white)`,
        color: '#5C1A22'
      }
    case 'recognised':
      return {
        background: `color-mix(in srgb, ${HIGHLIGHT_COLOR} ${STATUS_OPACITY.recognised * 100}%, white)`,
        color: '#5C1A22'
      }
    case 'familiar':
      return {
        background: `color-mix(in srgb, ${HIGHLIGHT_COLOR} ${STATUS_OPACITY.familiar * 100}%, white)`,
        color: '#64748b'
      }
    case 'known':
      return {
        background: 'color-mix(in srgb, #22c55e 40%, white)',
        color: '#166534'
      }
    default:
      return {}
  }
}

const WordRow = ({
  word,
  translation,
  status = 'new',
  audioUrl,
  onStatusChange,
  onPlayAudio,
  isLoadingAudio,
}) => {
  const statusIndex = STATUS_LEVELS.indexOf(status)
  const validStatusIndex = statusIndex >= 0 ? statusIndex : 0
  const hasAudio = Boolean(audioUrl)

  const handleStatusClick = (newStatus) => {
    if (onStatusChange) {
      onStatusChange(word, newStatus)
    }
  }

  const handlePlayClick = () => {
    if (onPlayAudio) {
      onPlayAudio(word, audioUrl)
    }
  }

  return (
    <div className="tutor-vocab-row">
      <div className="tutor-vocab-row-left">
        <button
          type="button"
          className={`tutor-vocab-row-audio ${!hasAudio && !isLoadingAudio ? 'tutor-vocab-row-audio--disabled' : ''}`}
          onClick={handlePlayClick}
          disabled={!hasAudio && !isLoadingAudio}
          aria-label={`Play pronunciation of ${word}`}
        >
          {isLoadingAudio ? (
            <span className="tutor-vocab-loading-dot" />
          ) : (
            <PlayIcon />
          )}
        </button>
        <span className="tutor-vocab-row-word">{word}</span>
        <span className="tutor-vocab-row-translation">{translation || '...'}</span>
      </div>
      <div className="tutor-vocab-status-selector">
        {STATUS_ABBREV.map((abbrev, i) => {
          const isActive = i === validStatusIndex
          const style = getStatusStyle(STATUS_LEVELS[i], isActive)

          return (
            <button
              key={abbrev}
              type="button"
              className={`tutor-vocab-status-option ${isActive ? 'active' : ''}`}
              style={style}
              onClick={() => handleStatusClick(STATUS_LEVELS[i])}
              aria-label={`Set status to ${STATUS_LEVELS[i]}`}
              aria-pressed={isActive}
            >
              {abbrev}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const TutorVocabPanel = ({
  messageText = '',
  userVocab = {},
  language,
  nativeLanguage = 'English',
  userId,
  onVocabUpdate,
}) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [wordTranslations, setWordTranslations] = useState({})
  const [loadingWords, setLoadingWords] = useState(new Set())
  const audioRef = useRef(null)
  const fetchedWordsRef = useRef(new Set())

  // Extract words from the message text
  const words = useMemo(() => {
    if (!messageText) return []

    // Tokenize: split into words
    const tokens = messageText.split(/([^\p{L}\p{N}]+)/gu).filter(Boolean)
    const wordSet = new Map()

    tokens.forEach((token) => {
      // Skip non-word tokens
      if (!/[\p{L}\p{N}]/u.test(token)) return

      const normalised = normaliseExpression(token)
      if (wordSet.has(normalised)) return

      const vocabEntry = userVocab[normalised]
      const status = vocabEntry?.status || 'new'
      const translationData = wordTranslations[normalised] || {}

      wordSet.set(normalised, {
        word: token,
        normalised,
        status,
        translation: translationData.translation || vocabEntry?.translation || null,
        audioUrl: translationData.audioUrl || null,
      })
    })

    return Array.from(wordSet.values())
  }, [messageText, userVocab, wordTranslations])

  // Filter to show only non-known words
  const visibleWords = useMemo(() => {
    return words.filter(w => w.status !== 'known')
  }, [words])

  // Fetch translations for words that don't have them
  useEffect(() => {
    if (!isExpanded || !language || visibleWords.length === 0) return

    const wordsToFetch = visibleWords.filter(w => {
      const normalised = w.normalised
      return !wordTranslations[normalised]?.translation &&
             !fetchedWordsRef.current.has(normalised) &&
             !loadingWords.has(normalised)
    })

    if (wordsToFetch.length === 0) return

    // Batch fetch translations (max 5 at a time)
    const batch = wordsToFetch.slice(0, 5)

    batch.forEach(async (wordData) => {
      const normalised = wordData.normalised
      fetchedWordsRef.current.add(normalised)
      setLoadingWords(prev => new Set([...prev, normalised]))

      try {
        const response = await fetch('/api/translatePhrase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phrase: wordData.word,
            sourceLang: language,
            targetLang: nativeLanguage,
            voiceGender: 'male',
          }),
        })

        if (response.ok) {
          const data = await response.json()
          setWordTranslations(prev => ({
            ...prev,
            [normalised]: {
              translation: data.translation || null,
              audioUrl: data.audioUrl || null,
            }
          }))
        }
      } catch (err) {
        console.error('Failed to fetch translation:', err)
      } finally {
        setLoadingWords(prev => {
          const next = new Set(prev)
          next.delete(normalised)
          return next
        })
      }
    })
  }, [isExpanded, visibleWords, language, nativeLanguage, wordTranslations, loadingWords])

  const handlePlayAudio = useCallback(async (word, audioUrl) => {
    if (audioRef.current) {
      audioRef.current.pause()
    }

    // If no audioUrl, try to fetch it
    if (!audioUrl) {
      const normalised = normaliseExpression(word)
      setLoadingWords(prev => new Set([...prev, normalised]))

      try {
        const response = await fetch('/api/translatePhrase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phrase: word,
            sourceLang: language,
            targetLang: nativeLanguage,
            voiceGender: 'male',
          }),
        })

        if (response.ok) {
          const data = await response.json()
          if (data.audioUrl) {
            const audio = new Audio(data.audioUrl)
            audio.play().catch(err => console.error('Audio playback failed:', err))
            audioRef.current = audio
          }
          // Update translations cache
          setWordTranslations(prev => ({
            ...prev,
            [normalised]: {
              translation: data.translation || prev[normalised]?.translation || null,
              audioUrl: data.audioUrl || null,
            }
          }))
        }
      } catch (err) {
        console.error('Failed to fetch audio:', err)
      } finally {
        setLoadingWords(prev => {
          const next = new Set(prev)
          next.delete(normaliseExpression(word))
          return next
        })
      }
      return
    }

    const audio = new Audio(audioUrl)
    audio.play().catch(err => console.error('Audio playback failed:', err))
    audioRef.current = audio
  }, [language, nativeLanguage])

  const handleStatusChange = useCallback(async (word, newStatus) => {
    if (!userId || !language) return

    const normalised = normaliseExpression(word)
    // Map 'new' to 'unknown' for database
    const dbStatus = newStatus === 'new' ? 'unknown' : newStatus
    const translation = wordTranslations[normalised]?.translation || userVocab[normalised]?.translation || null

    try {
      await upsertVocabEntry(
        userId,
        language,
        word,
        translation,
        dbStatus
      )

      // Update local state via callback
      if (onVocabUpdate) {
        onVocabUpdate(normalised, {
          text: word,
          status: dbStatus,
          translation,
          language,
        })
      }
    } catch (err) {
      console.error('Failed to update word status:', err)
    }
  }, [userId, language, wordTranslations, userVocab, onVocabUpdate])

  // Don't render if no words to review
  const wordCount = visibleWords.length
  if (wordCount === 0) return null

  return (
    <div className={`tutor-msg-vocab-panel ${isExpanded ? 'expanded' : ''}`}>
      <button
        type="button"
        className="tutor-msg-vocab-toggle"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span>{wordCount} word{wordCount !== 1 ? 's' : ''}</span>
        {isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
      </button>

      {isExpanded && (
        <div className="tutor-msg-vocab-body">
          <div className="tutor-vocab-row-list">
            {visibleWords.map((wordData) => (
              <WordRow
                key={wordData.normalised}
                word={wordData.word}
                translation={wordData.translation}
                status={wordData.status}
                audioUrl={wordData.audioUrl}
                onStatusChange={handleStatusChange}
                onPlayAudio={handlePlayAudio}
                isLoadingAudio={loadingWords.has(wordData.normalised)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default TutorVocabPanel
