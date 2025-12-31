import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { VOCAB_STATUSES, loadUserVocab, normaliseExpression, upsertVocabEntry } from '../services/vocab'
import WordToken from '../components/read/WordToken'
import { readerModes } from '../constants/readerModes'
import {
  filterSupportedLanguages,
  resolveSupportedLanguageLabel,
  toLanguageLabel,
} from '../constants/languages'
import { normalizeLanguageCode } from '../utils/language'

const themeOptions = [
  {
    id: 'soft-white',
    label: 'Pure White',
    background: '#FFFFFF',
    text: '#1A1A1A',
    tone: 'light',
    gutter: 'rgba(0, 0, 0, 0.08)',
  },
  {
    id: 'pure-black',
    label: 'Pure Black',
    background: '#000000',
    text: '#FFFFFF',
    tone: 'dark',
    gutter: 'rgba(255, 255, 255, 0.12)',
  },
]

const fontOptions = [
  {
    id: 'crimson-pro',
    label: 'Crimson Pro',
    fontFamily: "'Crimson Pro', 'Times New Roman', serif",
    fontWeight: 300,
    fontSize: '1.125rem',
  },
  {
    id: 'inter',
    label: 'Inter',
    fontFamily: "'Inter', 'SF Pro Text', system-ui, -apple-system, sans-serif",
    fontWeight: 300,
    fontSize: '0.9375rem',
  },
  {
    id: 'atkinson-hyperlegible',
    label: 'Atkinson Hyperlegible',
    fontFamily: "'Atkinson Hyperlegible', 'Inter', system-ui, -apple-system, sans-serif",
    fontWeight: 400,
    fontSize: '1rem',
  },
]

const Reader = ({ initialMode }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const { id, language: languageParam } = useParams()
  const { user, profile } = useAuth()

  const [pages, setPages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [voiceGender, setVoiceGender] = useState('male')
  const [popup, setPopup] = useState(null)
  const [vocabEntries, setVocabEntries] = useState({})
  const missingLanguageMessage =
    'Select a language for this content to enable translation/pronunciation.'
  const [hasSeenAutoKnownInfo, setHasSeenAutoKnownInfo] = useState(
    () => localStorage.getItem('seenAutoKnownInfo') === 'true'
  )
  const [audioStatus, setAudioStatus] = useState('')
  const [fullAudioUrl, setFullAudioUrl] = useState('')
  const [hasFullAudio, setHasFullAudio] = useState(false)
  const [readerTheme, setReaderTheme] = useState('soft-white')
  const [readerFont, setReaderFont] = useState('crimson-pro')
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement))
  const [readerMode, setReaderMode] = useState(
    () => initialMode || location.state?.readerMode || 'active'
  )
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0)
  const [sentenceTranslations, setSentenceTranslations] = useState({})
  const [sentenceSegments, setSentenceSegments] = useState([])
  const [isIntensiveTranslationVisible, setIsIntensiveTranslationVisible] =
    useState(false)
  const [isLoadingTranslation, setIsLoadingTranslation] = useState(false)
  const [bookmarkIndex, setBookmarkIndex] = useState(null)
  const [isSavingBookmark, setIsSavingBookmark] = useState(false)
  const audioRef = useRef(null)
  const pronunciationAudioRef = useRef(null)
  const sentenceAudioRef = useRef(null)
  const sentenceAudioStopRef = useRef(null)
  const pointerStartRef = useRef(null)
  const lastPageIndexRef = useRef(currentIndex)
  const hasAppliedBookmarkRef = useRef(false)
  // popup: { x, y, word, displayText, translation } | null

  const supportedLanguages = useMemo(
    () => filterSupportedLanguages(profile?.myLanguages || []),
    [profile?.myLanguages],
  )
  const nativeLanguage = useMemo(
    () => resolveSupportedLanguageLabel(profile?.nativeLanguage, ''),
    [profile?.nativeLanguage],
  )
  const resolvedLanguageParam = useMemo(
    () => resolveSupportedLanguageLabel(languageParam || '', ''),
    [languageParam],
  )
  const fallbackLanguage = useMemo(() => {
    if (profile?.lastUsedLanguage) {
      const resolved = resolveSupportedLanguageLabel(profile.lastUsedLanguage, '')
      if (resolved) return resolved
    }
    return supportedLanguages[0] || ''
  }, [profile?.lastUsedLanguage, supportedLanguages])
  const activeLanguage = resolvedLanguageParam || fallbackLanguage
  const language = activeLanguage

  useEffect(() => {
    if (!languageParam) return
    if (!resolvedLanguageParam) {
      if (fallbackLanguage) {
        navigate(`/reader/${encodeURIComponent(fallbackLanguage)}/${id}`, { replace: true })
      } else {
        navigate('/dashboard', { replace: true })
      }
      return
    }
    const normalizedParam = toLanguageLabel(languageParam)
    if (normalizedParam && normalizedParam !== languageParam) {
      navigate(`/reader/${encodeURIComponent(normalizedParam)}/${id}`, { replace: true })
    }
  }, [fallbackLanguage, id, languageParam, navigate, resolvedLanguageParam])

  const getPopupPosition = (rect) => {
    const margin = 12
    const estimatedPopupHeight = 280
    const estimatedPopupWidth = 360

    const viewportWidth = window.innerWidth
    const spaceAbove = rect.top
    const spaceBelow = window.innerHeight - rect.bottom

    const shouldRenderAbove =
      spaceBelow < estimatedPopupHeight + margin && spaceAbove > spaceBelow

    const y = shouldRenderAbove
      ? Math.max(window.scrollY + rect.top - estimatedPopupHeight - margin, window.scrollY + margin)
      : Math.min(
          window.scrollY + rect.bottom + margin,
          window.scrollY + window.innerHeight - estimatedPopupHeight - margin
        )

    const centerX = rect.left + rect.width / 2 + window.scrollX
    const x = Math.min(
      Math.max(centerX - estimatedPopupWidth / 2, window.scrollX + margin),
      window.scrollX + viewportWidth - estimatedPopupWidth - margin
    )

    return { x, y }
  }

  const playPronunciationAudio = (audioData) => {
    if (!audioData?.audioBase64 && !audioData?.audioUrl) return

    if (pronunciationAudioRef.current) {
      if (pronunciationAudioRef.current._objectUrl) {
        URL.revokeObjectURL(pronunciationAudioRef.current._objectUrl)
      }
      pronunciationAudioRef.current.pause()
    }

    const audio = new Audio()

    if (audioData.audioBase64) {
      const byteCharacters = atob(audioData.audioBase64)
      const byteNumbers = new Array(byteCharacters.length)

      for (let i = 0; i < byteCharacters.length; i += 1) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
      }

      const byteArray = new Uint8Array(byteNumbers)
      const blob = new Blob([byteArray], { type: 'audio/mpeg' })
      const objectUrl = URL.createObjectURL(blob)
      audio.src = objectUrl
      audio._objectUrl = objectUrl

      audio.addEventListener('ended', () => {
        if (audio._objectUrl) {
          URL.revokeObjectURL(audio._objectUrl)
          audio._objectUrl = null
        }
      })
    } else {
      audio.src = audioData.audioUrl
      audio._objectUrl = null
    }

    pronunciationAudioRef.current = audio
    audio.play().catch((err) => console.error('Pronunciation playback failed', err))
  }

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
      let audioBase64 = null
      let audioUrl = null
      let targetText = null

      const ttsLanguage = normalizeLanguageCode(language)

      if (!ttsLanguage) {
        setPopup({
          x: rect.left + window.scrollX,
          y: rect.bottom + window.scrollY + 8,
          word: phrase,
          displayText: selection,
          translation: missingLanguageMessage,
          targetText: missingLanguageMessage,
          audioBase64: null,
          audioUrl: null,
        })

        return
      }

      try {
        const response = await fetch('http://localhost:4000/api/translatePhrase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phrase,
            sourceLang: language || 'es',
            targetLang: resolveSupportedLanguageLabel(profile?.nativeLanguage),
            voiceGender,
          }),
        })

        if (response.ok) {
          const data = await response.json()
          translation = data.translation || translation
          targetText = data.targetText || translation
          audioBase64 = data.audioBase64 || null
          audioUrl = data.audioUrl || null
        } else {
          console.error('Phrase translation failed:', await response.text())
        }
      } catch (err) {
        console.error('Error translating phrase:', err)
      }

      const { x, y } = getPopupPosition(rect)

      setPopup({
        x,
        y,
        word: phrase,
        displayText: selection,
        translation,
        targetText,
        audioBase64,
        audioUrl,
      })

      return
    }

    // Single word
    const clean = selection.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase()
    if (!clean) return

    let translation = null
    let audioBase64 = null
    let audioUrl = null
    let targetText = null

    const ttsLanguage = normalizeLanguageCode(language)

    if (!translation) {
      if (!ttsLanguage) {
        const selectionObj = window.getSelection()
        if (!selectionObj || selectionObj.rangeCount === 0) return

        const range = selectionObj.getRangeAt(0)
        const rect = range.getBoundingClientRect()
        const { x, y } = getPopupPosition(rect)

        setPopup({
          x,
          y,
          word: clean,
          displayText: selection,
          translation: missingLanguageMessage,
          targetText: missingLanguageMessage,
          audioBase64: null,
          audioUrl: null,
        })

        return
      }

      try {
        const response = await fetch('http://localhost:4000/api/translatePhrase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phrase: selection,
            sourceLang: language || 'es',
            targetLang: resolveSupportedLanguageLabel(profile?.nativeLanguage),
            voiceGender,
          }),
        })

        if (response.ok) {
          const data = await response.json()
          translation = data.translation || 'No translation found'
          targetText = data.targetText || translation
          audioBase64 = data.audioBase64 || null
          audioUrl = data.audioUrl || null
        } else {
          translation = 'No translation found'
        }
      } catch (err) {
        translation = 'No translation found'
      }
    }

    const selectionObj = window.getSelection()
    if (!selectionObj || selectionObj.rangeCount === 0) return

    const range = selectionObj.getRangeAt(0)
    const rect = range.getBoundingClientRect()

    const { x, y } = getPopupPosition(rect)

    setPopup({
      x,
      y,
      word: clean,
      displayText: selection,
      translation,
      targetText,
      audioBase64,
      audioUrl,
    })
  }

  const handleSingleWordClick = async (text, event) => {
    const selection = window.getSelection()?.toString().trim()
    const parts = selection ? selection.split(/\s+/).filter(Boolean) : []

    // Let the multi-word path handle multi-word selections
    if (parts.length > 1) return

    const key = normaliseExpression(text)
    let translation = null
    let audioBase64 = null
    let audioUrl = null
    let targetText = null

    const ttsLanguage = normalizeLanguageCode(language)

    if (!ttsLanguage) {
      const rect = event.currentTarget.getBoundingClientRect()
      const { x, y } = getPopupPosition(rect)

      setPopup({
        x,
        y,
        word: key,
        displayText: text,
        translation: translation || missingLanguageMessage,
        targetText: targetText || translation || missingLanguageMessage,
        audioBase64: null,
        audioUrl: null,
      })

      return
    }

    try {
      const response = await fetch('http://localhost:4000/api/translatePhrase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phrase: text,
          sourceLang: language || 'es',
          targetLang: resolveSupportedLanguageLabel(profile?.nativeLanguage),
          voiceGender,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        translation = data.translation || 'No translation found'
        targetText = data.targetText || translation || 'No translation found'
        audioBase64 = data.audioBase64 || null
        audioUrl = data.audioUrl || null
      } else {
        translation = 'No translation found'
        targetText = translation
      }
    } catch (err) {
      translation = 'No translation found'
      targetText = translation
    }

    const rect = event.currentTarget.getBoundingClientRect()
    const { x, y } = getPopupPosition(rect)

    setPopup({
      x,
      y,
      word: key,
      displayText: text,
      translation: translation || 'No translation found',
      targetText: targetText || translation || 'No translation found',
      audioBase64: audioBase64 || null,
      audioUrl: audioUrl || null,
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
        status,
        id
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
    } finally {
      setPopup(null)
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
      setBookmarkIndex(null)
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
        setVoiceGender(data.voiceGender || 'male')
        setBookmarkIndex(
          Number.isFinite(data.bookmarkIndex) ? data.bookmarkIndex : null
        )
        hasAppliedBookmarkRef.current = false
      } catch (err) {
        console.error('Failed to load story audio metadata', err)
        setAudioStatus('')
        setFullAudioUrl('')
        setHasFullAudio(false)
        setVoiceGender('male')
        setBookmarkIndex(null)
        hasAppliedBookmarkRef.current = false
      }
    }

    loadStoryMeta()
  }, [user, id])

  useEffect(() => {
    if (!user || !id || readerMode !== 'intensive') {
      setSentenceSegments([])
      return undefined
    }

    let isActive = true

    const loadIntensiveTranscript = async () => {
      try {
        const transcriptRef = doc(
          db,
          'users',
          user.uid,
          'stories',
          id,
          'transcripts',
          'intensive'
        )

        const transcriptSnap = await getDoc(transcriptRef)

        if (!isActive) return

        if (!transcriptSnap.exists()) {
          setSentenceSegments([])
          return
        }

        const data = transcriptSnap.data() || {}
        const rawSentenceSegments = Array.isArray(data.sentenceSegments)
          ? data.sentenceSegments
          : []

        const normalised = rawSentenceSegments
          .map((seg) => ({
            start: Number(seg.start) || 0,
            end: Number(seg.end) || 0,
            text: (seg.text || '').trim(),
          }))
          .filter((seg) => seg.end > seg.start)

        setSentenceSegments(normalised)
      } catch (error) {
        console.error('Failed to load intensive transcript', error)
        if (isActive) {
          setSentenceSegments([])
        }
      }
    }

    loadIntensiveTranscript()

    return () => {
      isActive = false
    }
  }, [id, readerMode, user])

  useEffect(() => {
    if (!pages.length) return
    if (hasAppliedBookmarkRef.current) return

    const targetIndex = Number.isFinite(bookmarkIndex) ? bookmarkIndex : 0
    const boundedIndex = Math.min(Math.max(targetIndex, 0), Math.max(pages.length - 1, 0))
    const evenIndex = boundedIndex - (boundedIndex % 2)

    setCurrentIndex(evenIndex)
    lastPageIndexRef.current = evenIndex
    hasAppliedBookmarkRef.current = true
  }, [pages.length, bookmarkIndex])

  useEffect(() => {
    hasAppliedBookmarkRef.current = false
  }, [id])

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

  const splitIntoSentences = (text) => {
    if (!text) return []

    const matches = text.match(/[^.!?]+[.!?]?\s*/g)

    if (!matches || matches.length === 0) return [text]

    return matches
  }

  const visiblePageSentences = visiblePages.map((page) =>
    splitIntoSentences(getDisplayText(page))
  )

  const sentenceOffsets = []
  let runningSentenceOffset = 0

  visiblePageSentences.forEach((sentences, index) => {
    sentenceOffsets[index] = runningSentenceOffset
    runningSentenceOffset += sentences.length
  })

  const allVisibleSentences = visiblePageSentences.flat()
  const currentIntensiveSentence =
    readerMode === 'intensive'
      ? allVisibleSentences[currentSentenceIndex]?.trim() || ''
      : ''

  useEffect(() => {
    if (readerMode !== 'intensive') return

    if (allVisibleSentences.length === 0) {
      setCurrentSentenceIndex(0)
      return
    }

    setCurrentSentenceIndex((prev) =>
      Math.min(prev, Math.max(allVisibleSentences.length - 1, 0))
    )
  }, [readerMode, allVisibleSentences.length])

  useEffect(() => {
    if (currentIndex !== lastPageIndexRef.current) {
      if (readerMode !== 'intensive') {
        setCurrentSentenceIndex(0)
      }
      lastPageIndexRef.current = currentIndex
    }
  }, [currentIndex, readerMode])

  useEffect(() => {
    setCurrentSentenceIndex(0)
    lastPageIndexRef.current = 0
    setSentenceTranslations({})
  }, [id, language])

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

  const getNewWordsInSentence = (sentence) => {
    if (!sentence) return []

    const rawWords = Array.from(
      new Set(
        sentence
          .replace(/[^\p{L}\p{N}]+/gu, ' ')
          .toLowerCase()
          .split(/\s+/)
          .filter(Boolean)
      )
    )

    return rawWords.filter((word) => {
      const key = normaliseExpression(word)
      const status = vocabEntries[key]?.status
      return !status || status === 'unknown'
    })
  }

  const autoMarkSentenceWordsAsKnown = async (sentence) => {
    if (!user || !language) return

    const newWords = getNewWordsInSentence(sentence)

    if (newWords.length === 0) return

    try {
      await Promise.all(
        newWords.map((word) => {
          const key = normaliseExpression(word)
          const existingTranslation = vocabEntries[key]?.translation || 'No translation found'

          return upsertVocabEntry(user.uid, language, word, existingTranslation, 'known', id)
        })
      )

      setVocabEntries((prev) => {
        const next = { ...prev }

        newWords.forEach((word) => {
          const key = normaliseExpression(word)
          const existingTranslation = prev[key]?.translation || 'No translation found'

          next[key] = {
            ...(next[key] || { text: word, language }),
            status: 'known',
            translation: existingTranslation,
          }
        })

        return next
      })
    } catch (error) {
      console.error('Failed to auto-mark intensive sentence words as known', error)
    }
  }

  const promoteNewWordsToKnown = async () => {
    const shouldAutoPromote = readerMode === 'active' || readerMode === 'intensive'

    if (!user || !language || !shouldAutoPromote) return true

    if (!hasSeenAutoKnownInfo) {
      window.alert(
        'When you move forward, all new words you have not tagged will automatically be marked as Known.'
      )
      localStorage.setItem('seenAutoKnownInfo', 'true')
      setHasSeenAutoKnownInfo(true)
    }

    const newWords = getNewWordsOnCurrentPages()

    if (newWords.length === 0) return true

    const confirmed = window.confirm(
      'By proceeding, all new words you have not tagged will be marked as Known. Continue?'
    )

    if (!confirmed) {
      return false
    }

    try {
      await Promise.all(
        newWords.map((word) => {
          const key = normaliseExpression(word)
          const existingTranslation = vocabEntries[key]?.translation || 'No translation found'

          return upsertVocabEntry(user.uid, language, word, existingTranslation, 'known', id)
        })
      )

      setVocabEntries((prev) => {
        const next = { ...prev }
        newWords.forEach((word) => {
          const key = normaliseExpression(word)
          const existingTranslation = prev[key]?.translation || 'No translation found'

          next[key] = {
            ...(next[key] || { text: word, language }),
            status: 'known',
            translation: existingTranslation,
          }
        })
        return next
      })
    } catch (error) {
      console.error('Failed to auto-mark new words as known:', error)
    }

    return true
  }

  const handleNextPages = async () => {
    if (!hasNext) return

    const advancePages = () => {
      setCurrentIndex((prev) =>
        Math.min(prev + 2, pages.length - (pages.length % 2 ? 1 : 2))
      )
    }

    const canAdvance = await promoteNewWordsToKnown()
    if (!canAdvance) return

    advancePages()
  }

  const handleFinishStory = async () => {
    const canFinish = await promoteNewWordsToKnown()

    if (!canFinish) return

    navigate('/dashboard', { state: { initialTab: 'read' } })
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

  const getDisplayStatus = (status) => {
    if (!status) return 'new'
    if (status === 'unknown' || status === 'recognised' || status === 'familiar' || status === 'known') {
      return status
    }
    return 'new'
  }

  const renderWordSegments = (text = '') => {
    const expressions = Object.keys(vocabEntries)
      .filter((key) => key.includes(' '))
      .map((key) => normaliseExpression(key))
      .sort((a, b) => b.length - a.length)

    const elements = []

    const segments = segmentTextByExpressions(text || '', expressions)

    segments.forEach((segment, segmentIndex) => {
      if (segment.type === 'phrase') {
        elements.push(
          <WordToken
            key={`phrase-${segmentIndex}`}
            text={segment.text}
            status={getDisplayStatus(segment.status)}
            language={language}
            readerMode={readerMode}
          />
        )
        return
      }

      const tokens = (segment.text || '').split(/([\p{L}\p{N}][\p{L}\p{N}'-]*)/gu)

      tokens.forEach((token, index) => {
        if (!token) return

        const isWord = /[\p{L}\p{N}]/u.test(token)

        if (!isWord) {
          elements.push(
            <span key={`separator-${segmentIndex}-${index}`}>{token}</span>
          )
          return
        }

        const normalised = normaliseExpression(token)
        const entry = vocabEntries[normalised]
        const status = getDisplayStatus(entry?.status)

        elements.push(
          <WordToken
            key={`word-${segmentIndex}-${index}`}
            text={token}
            status={status}
            language={language}
            readerMode={readerMode}
            onWordClick={handleSingleWordClick}
          />
        )
      })
    })

    return elements
  }

  const renderHighlightedText = (text, sentenceOffset = 0) => {
    if (readerMode !== 'intensive') {
      return renderWordSegments(text)
    }

    const sentences = splitIntoSentences(text)

    if (sentences.length === 0) return null

    return sentences.map((sentence, index) => {
      const globalIndex = sentenceOffset + index
      const isActiveSentence = globalIndex === currentSentenceIndex

      return (
        <span
          key={`sentence-${globalIndex}`}
          className={`reader-sentence ${
            isActiveSentence ? 'reader-sentence--active' : 'reader-sentence--muted'
          }`}
          data-active={isActiveSentence}
        >
          {renderWordSegments(sentence)}
        </span>
      )
    })
  }

  useEffect(() => {
    function handleGlobalClick(event) {
      // If clicking inside the popup, do NOT close
      if (event.target.closest('.translate-popup')) return
      if (event.target.closest('.page-text')) return

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

  const handleEdgeNavigation = (direction) => {
    const selection = window.getSelection()
    if (selection && selection.toString().trim()) return

    if (direction === 'previous' && hasPrevious) {
      setCurrentIndex((prev) => Math.max(prev - 2, 0))
    }

    if (direction === 'next' && hasNext) {
      handleNextPages()
    }
  }

  const handlePointerDown = (event) => {
    pointerStartRef.current = { x: event.clientX, y: event.clientY }
  }

  const handlePointerUp = (event) => {
    const start = pointerStartRef.current
    pointerStartRef.current = null

    if (!start) return

    const selection = window.getSelection()
    if (selection && selection.toString().trim()) return

    const dx = event.clientX - start.x
    const dy = event.clientY - start.y

    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 60) {
      if (dx < 0) {
        if (readerMode === 'intensive') {
          handleSentenceNavigation('next')
        } else {
          handleEdgeNavigation('next')
        }
      } else if (readerMode === 'intensive') {
        handleSentenceNavigation('previous')
      } else {
        handleEdgeNavigation('previous')
      }
    }
  }

  const persistBookmark = async (index = currentIndex, { notify = true } = {}) => {
    if (!user || !id) return false

    const boundedIndex = Math.min(
      Math.max(index, 0),
      Math.max(pages.length - 1, 0)
    )
    const evenIndex = boundedIndex - (boundedIndex % 2)

    setIsSavingBookmark(true)

    try {
      const storyRef = doc(db, 'users', user.uid, 'stories', id)
      await updateDoc(storyRef, {
        bookmarkIndex: evenIndex,
        bookmarkUpdatedAt: serverTimestamp(),
      })

      setBookmarkIndex(evenIndex)
      hasAppliedBookmarkRef.current = false

      if (notify) {
        window.alert('Bookmark saved. You\'ll return to this page next time.')
      }

      return true
    } catch (err) {
      console.error('Failed to save bookmark', err)
      if (notify) {
        window.alert('Unable to save bookmark right now.')
      }
      return false
    } finally {
      setIsSavingBookmark(false)
    }
  }

  const handleBackToLibrary = async () => {
    const hasUnsavedProgress =
      !Number.isFinite(bookmarkIndex) || bookmarkIndex !== currentIndex

    if (hasUnsavedProgress) {
      const shouldSave = window.confirm(
        'Save a bookmark for this page before returning to the library?'
      )

      if (shouldSave) {
        await persistBookmark(currentIndex, { notify: false })
      }
    }

    navigate('/dashboard', { state: { initialTab: 'read' } })
  }

  const playSentenceAudio = (sentenceIndex) => {
    if (readerMode !== 'intensive') return
    if (!fullAudioUrl || !sentenceSegments.length) return

    const index = Math.max(0, Math.min(sentenceIndex, sentenceSegments.length - 1))

    const segment = sentenceSegments[index]
    if (
      !segment ||
      !Number.isFinite(segment.start) ||
      !Number.isFinite(segment.end)
    )
      return

    const startTime = Math.max(0, Number(segment.start) || 0)
    const endTime = Math.max(startTime, Number(segment.end) || 0)

    if (!sentenceAudioRef.current || sentenceAudioRef.current.src !== fullAudioUrl) {
      sentenceAudioRef.current = new Audio(fullAudioUrl)
    }

    const audio = sentenceAudioRef.current

    if (sentenceAudioStopRef.current) {
      clearTimeout(sentenceAudioStopRef.current)
      sentenceAudioStopRef.current = null
    }

    try {
      audio.currentTime = startTime
    } catch (error) {
      console.error('Failed to set sentence audio start time', error)
      return
    }

    audio.play().catch((err) => console.error('Sentence playback failed', err))

    const durationMs = Math.max((endTime - startTime) * 1000, 0)

    sentenceAudioStopRef.current = setTimeout(() => {
      audio.pause()
    }, durationMs + 100)
  }

  const handleSentenceNavigation = async (direction) => {
    if (readerMode !== 'intensive') return
    if (allVisibleSentences.length === 0) return

    const movingForward = direction === 'next'
    const movingBackward = direction === 'previous'

    const atLastSentence = currentSentenceIndex >= allVisibleSentences.length - 1
    const atFirstSentence = currentSentenceIndex === 0

    if ((movingForward && atLastSentence && !hasNext) || (movingBackward && atFirstSentence && !hasPrevious)) {
      return
    }

    await autoMarkSentenceWordsAsKnown(currentIntensiveSentence)

    if (movingForward) {
      if (!atLastSentence) {
        setCurrentSentenceIndex((prev) => prev + 1)
        return
      }

      if (hasNext) {
        const nextIndex = Math.min(
          currentIndex + 2,
          pages.length - (pages.length % 2 ? 1 : 2)
        )
        const nextPages = pages.slice(nextIndex, nextIndex + 2)
        const nextSentences = nextPages
          .map((page) => splitIntoSentences(getDisplayText(page)))
          .flat()

        setCurrentIndex(nextIndex)
        setCurrentSentenceIndex(nextSentences.length ? 0 : 0)
      }

      return
    }

    if (movingBackward) {
      if (!atFirstSentence) {
        setCurrentSentenceIndex((prev) => Math.max(prev - 1, 0))
        return
      }

      if (hasPrevious) {
        const previousIndex = Math.max(currentIndex - 2, 0)
        const previousPages = pages.slice(previousIndex, previousIndex + 2)
        const previousSentences = previousPages
          .map((page) => splitIntoSentences(getDisplayText(page)))
          .flat()

        setCurrentIndex(previousIndex)
        setCurrentSentenceIndex(
          previousSentences.length ? previousSentences.length - 1 : 0
        )
      }
    }
  }

  useEffect(() => {
    if (readerMode === 'intensive') {
      return undefined
    }

    const handleSpaceToggle = (event) => {
      const activeTag = document.activeElement?.tagName
      if (
        activeTag &&
        ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(activeTag)
      ) {
        return
      }
      if (document.activeElement?.isContentEditable) return

      if (event.code === 'Space' || event.key === ' ') {
        const audioEl = audioRef.current
        if (!audioEl) return

        event.preventDefault()
        if (audioEl.paused) audioEl.play().catch(() => {})
        else audioEl.pause()
      }
    }

    window.addEventListener('keydown', handleSpaceToggle)
    return () => {
      window.removeEventListener('keydown', handleSpaceToggle)
    }
  }, [readerMode])

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [])

  useEffect(
    () => () => {
      if (sentenceAudioStopRef.current) {
        clearTimeout(sentenceAudioStopRef.current)
        sentenceAudioStopRef.current = null
      }

      if (sentenceAudioRef.current) {
        sentenceAudioRef.current.pause()
      }
    },
    []
  )

  useEffect(() => {
    if (readerMode !== 'intensive') return undefined

    const handleIntensiveShortcuts = (event) => {
      const activeTag = document.activeElement?.tagName
      if (
        activeTag &&
        ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(activeTag)
      ) {
        return
      }

      if (document.activeElement?.isContentEditable) return

      if (event.code === 'Space' || event.key === ' ') {
        if (!sentenceSegments.length) return
        event.preventDefault()
        playSentenceAudio(currentSentenceIndex)
        return
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        handleSentenceNavigation('previous')
        return
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        handleSentenceNavigation('next')
      }
    }

    window.addEventListener('keydown', handleIntensiveShortcuts)

    return () => {
      window.removeEventListener('keydown', handleIntensiveShortcuts)
    }
  }, [
    readerMode,
    currentSentenceIndex,
    sentenceSegments.length,
    handleSentenceNavigation,
  ])

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
      } else if (document.exitFullscreen) {
        await document.exitFullscreen()
      }
    } catch (err) {
      console.error('Failed to toggle fullscreen mode', err)
    }
  }

  const activeTheme =
    themeOptions.find((option) => option.id === readerTheme) || themeOptions[0]

  const activeFont = fontOptions.find((option) => option.id === readerFont) || fontOptions[0]

  const cycleTheme = () => {
    const currentIndex = themeOptions.findIndex((option) => option.id === readerTheme)
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % themeOptions.length
    setReaderTheme(themeOptions[nextIndex].id)
  }

  const cycleFont = () => {
    const currentIndex = fontOptions.findIndex((option) => option.id === readerFont)
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % fontOptions.length
    setReaderFont(fontOptions[nextIndex].id)
  }

  const handleModeSelect = (modeId) => {
    setReaderMode(modeId)
  }

  useEffect(() => {
    setIsIntensiveTranslationVisible(false)
  }, [readerMode, currentIntensiveSentence])

  const intensiveSentences = useMemo(
    () =>
      allVisibleSentences
        .map((sentence) => sentence?.trim())
        .filter((sentence) => Boolean(sentence)),
    [allVisibleSentences.join('|')]
  )

  // Fetch a single sentence translation (no audio for intensive mode)
  const fetchSentenceTranslation = useCallback(
    async (sentence) => {
      if (!sentence) return null

      const ttsLanguage = normalizeLanguageCode(language)
      if (!ttsLanguage) return null

      try {
        const response = await fetch('http://localhost:4000/api/translatePhrase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phrase: sentence,
            sourceLang: language || 'es',
            targetLang: resolveSupportedLanguageLabel(profile?.nativeLanguage),
            ttsLanguage,
            skipAudio: true, // No pronunciation needed for intensive reading
          }),
        })

        if (!response.ok) {
          console.error('Sentence translation failed:', await response.text())
          return 'Unable to fetch translation right now.'
        }

        const data = await response.json()
        return data.translation || 'No translation found.'
      } catch (error) {
        console.error('Error translating sentence:', error)
        return 'Unable to fetch translation right now.'
      }
    },
    [language, profile?.nativeLanguage]
  )

  // Lazy-load translations: current sentence + next 2
  useEffect(() => {
    if (readerMode !== 'intensive') return undefined
    if (intensiveSentences.length === 0) return undefined

    const ttsLanguage = normalizeLanguageCode(language)
    if (!ttsLanguage) return undefined

    let isCancelled = false

    const loadTranslations = async () => {
      // Get current and next 2 sentences
      const indicesToFetch = [
        currentSentenceIndex,
        currentSentenceIndex + 1,
        currentSentenceIndex + 2,
      ].filter((i) => i >= 0 && i < intensiveSentences.length)

      const sentencesToFetch = indicesToFetch
        .map((i) => intensiveSentences[i])
        .filter((sentence) => sentence && !sentenceTranslations[sentence])

      if (sentencesToFetch.length === 0) return

      // Show loading only for current sentence if not cached
      const currentSentence = intensiveSentences[currentSentenceIndex]
      const needsLoadingIndicator = currentSentence && !sentenceTranslations[currentSentence]

      if (needsLoadingIndicator) {
        setIsLoadingTranslation(true)
      }

      // Fetch sentences (current first, then prefetch next ones)
      for (const sentence of sentencesToFetch) {
        if (isCancelled) break

        const translation = await fetchSentenceTranslation(sentence)

        if (isCancelled) break

        if (translation) {
          setSentenceTranslations((prev) => ({
            ...prev,
            [sentence]: translation,
          }))
        }

        // Turn off loading after current sentence is fetched
        if (sentence === currentSentence) {
          setIsLoadingTranslation(false)
        }
      }

      setIsLoadingTranslation(false)
    }

    loadTranslations()

    return () => {
      isCancelled = true
      setIsLoadingTranslation(false)
    }
  }, [
    currentSentenceIndex,
    intensiveSentences,
    language,
    readerMode,
    fetchSentenceTranslation,
    sentenceTranslations,
  ])

  const toggleIntensiveTranslation = () => {
    setIsIntensiveTranslationVisible((prev) => !prev)
  }

  const intensiveTranslation =
    sentenceTranslations[currentIntensiveSentence?.trim?.() || currentIntensiveSentence]

  return (
    <div
      className={`page reader-page reader-themed ${
        readerMode === 'intensive' ? 'reader-intensive-active' : ''
      }`}
      style={{
        '--reader-bg': activeTheme.background,
        '--reader-text': activeTheme.text,
        '--reader-gutter': activeTheme.gutter ?? 'rgba(0, 0, 0, 0.08)',
        '--reader-font-family': activeFont.fontFamily,
        '--reader-font-weight': activeFont.fontWeight,
        '--reader-font-size': activeFont.fontSize ?? '1rem',
      }}
      data-reader-tone={activeTheme.tone}
      data-reader-theme={activeTheme.id}
    >
      <div className="reader-main-shell">
        <div className="reader-hover-shell">
          <div className="reader-hover-hitbox" />
          <header className="dashboard-header reader-hover-header">
            <div className="dashboard-brand-band reader-header-band">
              <div className="reader-header-left">
                <button
                  className="dashboard-control ui-text reader-back-button"
                  onClick={handleBackToLibrary}
                >
                  Back to library
                </button>
              </div>

              <nav className="dashboard-nav reader-mode-nav" aria-label="Reading mode">
                {readerModes.map((mode, index) => (
                  <div
                    key={mode.id}
                    className={`dashboard-nav-item ${readerMode === mode.id ? 'active' : ''}`}
                  >
                    <button
                      className={`dashboard-nav-button ui-text ${
                        readerMode === mode.id ? 'active' : ''
                      }`}
                      type="button"
                      onClick={(e) => {
                        handleModeSelect(mode.id)
                        e.currentTarget.blur()
                      }}
                    >
                      {mode.label.toUpperCase()}
                    </button>
                    {index < readerModes.length - 1 && <span className="dashboard-nav-divider">|</span>}
                  </div>
                ))}
              </nav>

              <div className="reader-header-actions">
                <button
                  className="reader-header-button ui-text"
                  type="button"
                  aria-label={`Font: ${activeFont.label}`}
                  onClick={(e) => {
                    cycleFont()
                    e.currentTarget.blur()
                  }}
                >
                  Aa
                </button>
                <button
                  className="reader-header-button icon-button reader-theme-trigger"
                  type="button"
                  aria-label={activeTheme.tone === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                  onClick={(e) => {
                    cycleTheme()
                    e.currentTarget.blur()
                  }}
                >
                  {activeTheme.tone === 'dark' ? (
                    <svg className="reader-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                    </svg>
                  ) : (
                    <svg className="reader-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="5" />
                      <line x1="12" y1="1" x2="12" y2="3" />
                      <line x1="12" y1="21" x2="12" y2="23" />
                      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                      <line x1="1" y1="12" x2="3" y2="12" />
                      <line x1="21" y1="12" x2="23" y2="12" />
                      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                    </svg>
                  )}
                </button>

                <button
                  className="reader-header-button icon-button"
                  type="button"
                  onClick={(e) => {
                    toggleFullscreen()
                    e.currentTarget.blur()
                  }}
                  aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
                  aria-pressed={isFullscreen}
                >
                  {isFullscreen ? (
                    <svg className="reader-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="4 14 4 20 10 20" />
                      <polyline points="20 10 20 4 14 4" />
                      <polyline points="14 20 20 20 20 14" />
                      <polyline points="10 4 4 4 4 10" />
                    </svg>
                  ) : (
                    <svg className="reader-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 3 21 3 21 9" />
                      <polyline points="9 21 3 21 3 15" />
                      <polyline points="21 15 21 21 15 21" />
                      <polyline points="3 9 3 3 9 3" />
                    </svg>
                  )}
                </button>
                <button
                  className="reader-header-button icon-button"
                  type="button"
                  onClick={(e) => {
                    persistBookmark()
                    e.currentTarget.blur()
                  }}
                  disabled={isSavingBookmark}
                  aria-label={bookmarkIndex === currentIndex ? 'Bookmark saved' : 'Save bookmark'}
                >
                  {bookmarkIndex === currentIndex ? (
                    <svg className="reader-header-icon" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                    </svg>
                  ) : (
                    <svg className="reader-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </header>
        </div>
        <div className="reader-body-shell">
          {loading ? (
            <p className="muted">Loading pages...</p>
          ) : error ? (
            <p className="error">{error}</p>
          ) : pages.length ? (
            <>
              <div
                className="reader-navigation"
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
              >
                <div
                  className={`reader-nav-zone left ${hasPrevious ? '' : 'disabled'}`}
                  aria-label="Previous pages"
                  onClick={() => handleEdgeNavigation('previous')}
                />

                <div className="reader-pages reader-spread">
                  {visiblePages.map((page, pageIndex) => {
                    const pageNumber = (page.index ?? pages.indexOf(page)) + 1
                    const isLeftPage = pageIndex % 2 === 0

                    return (
                      <div
                        key={page.id || page.index}
                        className={`reader-page-block ${
                          isLeftPage ? 'page--left' : 'page--right'
                        }`}
                      >
                        <div className="page-text" onMouseUp={handleWordClick}>
                          {renderHighlightedText(
                            getDisplayText(page),
                            sentenceOffsets[pageIndex] || 0
                          )}
                        </div>
                        <div className="page-number">{pageNumber}</div>
                      </div>
                    )
                  })}
                </div>

                <div
                  className={`reader-nav-zone right ${hasNext ? '' : 'disabled'}`}
                  aria-label="Next pages"
                  onClick={() => handleEdgeNavigation('next')}
                />
              </div>

              {!hasNext && (
                <div className="reader-end-actions">
                  <button
                    type="button"
                    className="reader-end-button"
                    onClick={handleFinishStory}
                  >
                    End story
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="muted">Story {id} is ready to read soon.</p>
          )}
          {audioStatus === 'ready' && fullAudioUrl && (
            <div className="audio-hover-area">
              <div className="audio-player-shell">
                <audio ref={audioRef} controls src={fullAudioUrl} />
              </div>
            </div>
          )}
        </div>
      </div>

      {readerMode === 'intensive' && (
        <div className="reader-intensive-overlay">
          <div className="reader-intensive-card">
            <div className="reader-intensive-sentence" onMouseUp={handleWordClick}>
              {currentIntensiveSentence
                ? renderWordSegments(currentIntensiveSentence)
                : 'No text available for this page.'}
            </div>

            <div className="reader-intensive-controls">
              <button
                type="button"
                className="intensive-translation-toggle"
                onClick={toggleIntensiveTranslation}
              >
                {isIntensiveTranslationVisible ? 'Hide translation' : 'Show translation'}
              </button>

              <p
                className={`reader-intensive-translation ${
                  isIntensiveTranslationVisible ? 'is-visible' : 'is-hidden'
                }`}
              >
                {isLoadingTranslation
                  ? 'Loading translation...'
                  : intensiveTranslation || 'Translation will appear here.'}
              </p>
            </div>

            <p className="reader-intensive-helper">
              Space = play / repeat · ← / → = previous / next sentence
            </p>
          </div>
        </div>
      )}

      {popup && (
        <div
          className="translate-popup"
          style={{
            position: 'fixed',
            top: popup.y,
            left: popup.x,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="translate-popup-header">
            <div className="translate-popup-title">Translation</div>
            <button
              type="button"
              className="translate-popup-close"
              aria-label="Close translation popup"
              onClick={(event) => {
                event.stopPropagation()
                setPopup(null)
              }}
            >
              ×
            </button>
          </div>

          <div className="translate-popup-body">
            <div className="translate-popup-language-column">
              <p className="translate-popup-language-label">
                {language || 'Target language'}
              </p>
              <p
                className="translate-popup-language-text translate-popup-book-text"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <span>{popup.displayText || popup.word}</span>
                {(popup.audioBase64 || popup.audioUrl) && (
                  <button
                    type="button"
                    className="translate-popup-audio"
                    onClick={() => playPronunciationAudio(popup)}
                    aria-label="Play pronunciation"
                    style={{
                      border: '1px solid #d7d7db',
                      background: '#f5f5f7',
                      cursor: 'pointer',
                      padding: '0.35rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#0f172a',
                      borderRadius: '999px',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                    }}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M5 9v6h3.8L14 19V5l-5.2 4H5z" fill="currentColor" />
                      <path d="M16 9.5c1.25 1 1.25 4 0 5" />
                      <path d="M18.5 7c2 2 2 8 0 10" />
                    </svg>
                  </button>
                )}
              </p>
            </div>

            <div className="translate-popup-language-column">
              <p className="translate-popup-language-label">
                {nativeLanguage || 'Native language'}
              </p>
              <p className="translate-popup-language-text translate-popup-book-text">
                {popup.translation}
              </p>
            </div>
          </div>

          <div className="translate-popup-status">
            {VOCAB_STATUSES.map((status) => {
              const isActive =
                vocabEntries[normaliseExpression(popup.word)]?.status === status

              return (
                <button
                  key={status}
                  type="button"
                  className={`translate-popup-status-button ${
                    isActive ? 'active' : ''
                  }`}
                  onClick={() => handleSetWordStatus(status)}
                  onMouseDown={(event) => event.preventDefault()}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default Reader
