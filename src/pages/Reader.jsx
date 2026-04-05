import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
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
import { incrementWordsRead } from '../services/stats'
import { generateChapter } from '../services/novelApiClient'
import WordToken from '../components/read/WordToken'
import TutorPanel from '../components/read/TutorPanel'
import { readerModes } from '../constants/readerModes'
import {
  filterSupportedLanguages,
  resolveSupportedLanguageLabel,
  toLanguageLabel,
} from '../constants/languages'
import { normalizeLanguageCode } from '../utils/language'
import { HIGHLIGHT_COLOR, STATUS_OPACITY } from '../constants/highlightColors'

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
    id: 'eb-garamond',
    label: 'EB Garamond',
    fontFamily: "'EB Garamond', 'Times New Roman', serif",
    fontWeight: 400,
    fontSize: '1.625rem',
  },
  {
    id: 'libre-franklin',
    label: 'Libre Franklin',
    fontFamily: "'Libre Franklin', 'Inter', system-ui, -apple-system, sans-serif",
    fontWeight: 400,
    fontSize: '1.35rem',
  },
]

// Count words in text (for tracking words read)
const countWords = (text) => {
  if (!text) return 0
  return text.trim().split(/\s+/).filter(Boolean).length
}

const STATUS_LEVELS = ['new', 'unknown', 'recognised', 'familiar', 'known']
const STATUS_ABBREV = ['N', 'U', 'R', 'F', 'K']

const getStatusStyle = (statusLevel, isActive) => {
  if (!isActive) return {}

  switch (statusLevel) {
    case 'new':
    case 'unknown':
      return {
        background: `color-mix(in srgb, ${HIGHLIGHT_COLOR} ${STATUS_OPACITY[statusLevel === 'new' ? 'new' : 'unknown'] * 100}%, white)`,
        color: '#5C1A22',
      }
    case 'recognised':
      return {
        background: `color-mix(in srgb, ${HIGHLIGHT_COLOR} ${STATUS_OPACITY.recognised * 100}%, white)`,
        color: '#5C1A22',
      }
    case 'familiar':
      return {
        background: `color-mix(in srgb, ${HIGHLIGHT_COLOR} ${STATUS_OPACITY.familiar * 100}%, white)`,
        color: '#64748b',
      }
    case 'known':
      return {
        background: 'color-mix(in srgb, #22c55e 40%, white)',
        color: '#166534',
      }
    default:
      return {}
  }
}

const Reader = ({ initialMode }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const { id, language: languageParam } = useParams()
  const { user, profile } = useAuth()

  const [chapters, setChapters] = useState([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Generated book state
  const [isGeneratedBook, setIsGeneratedBook] = useState(false)
  const [generatedBookData, setGeneratedBookData] = useState(null)
  const [totalChapters, setTotalChapters] = useState(0)
  const [generatedChapterCount, setGeneratedChapterCount] = useState(0)
  const [isGeneratingChapter, setIsGeneratingChapter] = useState(false)
  const [chapterGenerationError, setChapterGenerationError] = useState('')
  const [voiceGender, setVoiceGender] = useState('male')
  const [popup, setPopup] = useState(null)
  const [vocabEntries, setVocabEntries] = useState({})
  const missingLanguageMessage =
    'Select a language for this content to enable translation/pronunciation.'
  const [showAutoKnownBubble, setShowAutoKnownBubble] = useState(false)
  const [audioStatus, setAudioStatus] = useState('')
  const [fullAudioUrl, setFullAudioUrl] = useState('')
  const [hasFullAudio, setHasFullAudio] = useState(false)
  const [readerTheme, setReaderTheme] = useState('soft-white')
  const [readerFont, setReaderFont] = useState('crimson-pro')
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement))
  const [readerMode, setReaderMode] = useState(
    () => initialMode || location.state?.readerMode || 'active'
  )
  // Display mode is now always single-column
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0)
  const [sentenceTranslations, setSentenceTranslations] = useState({})
  const [sentenceSegments, setSentenceSegments] = useState([])
  const [isIntensiveTranslationVisible, setIsIntensiveTranslationVisible] =
    useState(false)
  const [isLoadingTranslation, setIsLoadingTranslation] = useState(false)
  const [contentExpressions, setContentExpressions] = useState([])
  const [intensiveWordTranslations, setIntensiveWordTranslations] = useState({})
  const [tutorOpen, setTutorOpen] = useState(false)
  const [tutorInitialMessage, setTutorInitialMessage] = useState(null)
  const audioRef = useRef(null)
  const pronunciationAudioRef = useRef(null)
  const sentenceAudioRef = useRef(null)
  const sentenceAudioStopRef = useRef(null)
  const scrollContainerRef = useRef(null)
  const highWaterMarkRef = useRef(0)
  const promotedParagraphsRef = useRef(new Set())
  const globalParagraphCounterRef = useRef(0)
  const vocabEntriesRef = useRef(vocabEntries)
  useEffect(() => { vocabEntriesRef.current = vocabEntries }, [vocabEntries])

  useEffect(() => {
    document.documentElement.classList.add('reader-active')
    return () => document.documentElement.classList.remove('reader-active')
  }, [])

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
      ? Math.max(rect.top - estimatedPopupHeight - margin, margin)
      : Math.min(
          rect.bottom + margin,
          window.innerHeight - estimatedPopupHeight - margin
        )

    const centerX = rect.left + rect.width / 2
    const x = Math.min(
      Math.max(centerX - estimatedPopupWidth / 2, margin),
      viewportWidth - estimatedPopupWidth - margin
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
      const { x, y } = getPopupPosition(rect)

      let translation = 'No translation found'
      let audioBase64 = null
      let audioUrl = null
      let targetText = null

      const ttsLanguage = normalizeLanguageCode(language)

      if (!ttsLanguage) {
        const { x, y } = getPopupPosition(rect)
        setPopup({
          x,
          y,
          word: phrase,
          displayText: selection,
          translation: missingLanguageMessage,
          targetText: missingLanguageMessage,
          audioBase64: null,
          audioUrl: null,
        })

        return
      }

      // Show popup immediately with loading state
      setPopup({
        x, y,
        word: phrase,
        displayText: selection,
        translation: null,
        targetText: null,
        audioBase64: null,
        audioUrl: null,
      })

      // Check if this is a detected expression with pre-stored meaning
      const normalizedPhrase = normaliseExpression(phrase)
      const detectedExpr = contentExpressions.find(
        (expr) => normaliseExpression(expr.text || '') === normalizedPhrase
      )

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
          // Use pre-stored expression meaning if available, otherwise use API translation
          translation = detectedExpr?.meaning || data.translation || translation
          targetText = data.targetText || translation
          audioBase64 = data.audioBase64 || null
          audioUrl = data.audioUrl || null
        } else {
          console.error('Phrase translation failed:', await response.text())
          // Fall back to pre-stored meaning if API fails
          if (detectedExpr?.meaning) {
            translation = detectedExpr.meaning
            targetText = detectedExpr.meaning
          }
        }
      } catch (err) {
        console.error('Error translating phrase:', err)
        // Fall back to pre-stored meaning if API fails
        if (detectedExpr?.meaning) {
          translation = detectedExpr.meaning
          targetText = detectedExpr.meaning
        }
      }

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

    const selectionObj = window.getSelection()
    if (!selectionObj || selectionObj.rangeCount === 0) return

    const range = selectionObj.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    const { x, y } = getPopupPosition(rect)

    let translation = null
    let audioBase64 = null
    let audioUrl = null
    let targetText = null

    const ttsLanguage = normalizeLanguageCode(language)

    if (!ttsLanguage) {
      setPopup({
        x, y,
        word: clean,
        displayText: selection,
        translation: missingLanguageMessage,
        targetText: missingLanguageMessage,
        audioBase64: null,
        audioUrl: null,
      })

      return
    }

    // Show popup immediately with loading state
    setPopup({
      x, y,
      word: clean,
      displayText: selection,
      translation: null,
      targetText: null,
      audioBase64: null,
      audioUrl: null,
    })

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
    const rect = event.currentTarget.getBoundingClientRect()
    const { x, y } = getPopupPosition(rect)

    let translation = null
    let audioBase64 = null
    let audioUrl = null
    let targetText = null

    const ttsLanguage = normalizeLanguageCode(language)

    if (!ttsLanguage) {
      setPopup({
        x, y,
        word: key,
        displayText: text,
        translation: missingLanguageMessage,
        targetText: missingLanguageMessage,
        audioBase64: null,
        audioUrl: null,
      })

      return
    }

    // Show popup immediately with loading state
    setPopup({
      x, y,
      word: key,
      displayText: text,
      translation: null,
      targetText: null,
      audioBase64: null,
      audioUrl: null,
    })

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
      setChapters([])
      setLoading(false)
      return undefined
    }

    const loadContent = async () => {
      setLoading(true)
      setIsGeneratedBook(false)
      setGeneratedBookData(null)

      try {
        // First try regular stories collection
        const storyRef = doc(db, 'users', user.uid, 'stories', id)
        const storySnap = await getDoc(storyRef)

        if (storySnap.exists()) {
          const storyData = storySnap.data() || {}

          if (storyData.isFlat) {
            const flatChapter = {
              id: 'flat-0',
              index: 0,
              title: storyData.title || 'Untitled',
              adaptedText: storyData.adaptedTextBlob || '',
              adaptedChapterHeader: storyData.adaptedChapterHeader || storyData.chapterHeader || null,
              adaptedChapterOutline: storyData.adaptedChapterOutline || storyData.chapterOutline || null,
            }
            setChapters([flatChapter])
          } else {
            const chaptersRef = collection(db, 'users', user.uid, 'stories', id, 'chapters')
            const chaptersQuery = query(chaptersRef, orderBy('index', 'asc'))
            const snapshot = await getDocs(chaptersQuery)
            const loadedChapters = snapshot.docs.map((docSnap) => ({
              id: docSnap.id,
              ...docSnap.data(),
            }))
            setChapters(loadedChapters)
          }
          setError('')
          setLoading(false)
          return
        }

        // Story not found in stories - check generatedBooks collection
        console.log('Story not found in stories, checking generatedBooks...')
        const generatedBookRef = doc(db, 'users', user.uid, 'generatedBooks', id)
        const generatedBookSnap = await getDoc(generatedBookRef)

        if (!generatedBookSnap.exists()) {
          setError('Story not found')
          setLoading(false)
          return
        }

        // Generated book found
        const bookData = generatedBookSnap.data() || {}
        console.log('Found generated book:', bookData.concept)

        setIsGeneratedBook(true)
        setGeneratedBookData(bookData)
        setTotalChapters(bookData.totalChapters || bookData.chapterCount || 12)

        // Load generated chapters
        const chaptersRef = collection(db, 'users', user.uid, 'generatedBooks', id, 'chapters')
        const chaptersQuery = query(chaptersRef, orderBy('index', 'asc'))
        const chaptersSnapshot = await getDocs(chaptersQuery)

        const loadedChapters = chaptersSnapshot.docs.map((docSnap) => {
          const data = docSnap.data()
          return {
            id: docSnap.id,
            index: data.index - 1, // Convert 1-based to 0-based for consistency
            title: data.title || `Chapter ${data.index}`,
            adaptedText: data.content || '',
            // No header/outline for generated books currently
            adaptedChapterHeader: null,
            adaptedChapterOutline: null,
          }
        })

        console.log(`Loaded ${loadedChapters.length} generated chapters`)
        setGeneratedChapterCount(loadedChapters.length)
        setChapters(loadedChapters)
        setError('')
      } catch (loadError) {
        console.error(loadError)
        setError('Unable to load story content right now.')
      } finally {
        setLoading(false)
      }
    }

    loadContent()
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
        setVoiceGender(data.voiceGender || 'male')
      } catch (err) {
        console.error('Failed to load story audio metadata', err)
        setAudioStatus('')
        setFullAudioUrl('')
        setHasFullAudio(false)
        setVoiceGender('male')
      }
    }

    loadStoryMeta()
  }, [user, id])

  // Fetch content expressions (idioms detected by LLM)
  useEffect(() => {
    if (!user || !id || !language) {
      setContentExpressions([])
      return
    }

    let isActive = true

    const fetchExpressions = async () => {
      try {
        const response = await fetch('http://localhost:4000/api/content/expressions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: user.uid,
            contentId: id,
            contentType: 'story',
            language: language,
          }),
        })

        if (!response.ok) {
          throw new Error('Failed to fetch expressions')
        }

        const data = await response.json()
        if (isActive && Array.isArray(data.expressions)) {
          setContentExpressions(data.expressions)
        }
      } catch (err) {
        console.error('Failed to fetch content expressions:', err)
        if (isActive) {
          setContentExpressions([])
        }
      }
    }

    fetchExpressions()

    return () => {
      isActive = false
    }
  }, [user, id, language])

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

  const splitIntoSentences = (text) => {
    if (!text) return []

    const paragraphs = text.split(/\n\n+/)
    const allSentences = []

    paragraphs.forEach((paragraph) => {
      const trimmed = paragraph.trim()
      if (!trimmed) return

      const matches = trimmed.match(/[^.!?]+[.!?]?\s*/g)

      if (!matches || matches.length === 0) {
        allSentences.push(trimmed)
      } else {
        allSentences.push(...matches)
      }
    })

    return allSentences.length > 0 ? allSentences : [text]
  }

  const fullStoryText = useMemo(
    () => chapters.map((ch) => getDisplayText(ch)).join('\n\n'),
    [chapters]
  )

  const chapterSentences = chapters.map((ch) =>
    splitIntoSentences(getDisplayText(ch))
  )

  const chapterSentenceOffsets = []
  let runningOffset = 0
  chapterSentences.forEach((sentences) => {
    chapterSentenceOffsets.push(runningOffset)
    runningOffset += sentences.length
  })

  const allVisibleSentences = chapterSentences.flat()
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
    setCurrentSentenceIndex(0)
    setSentenceTranslations({})
  }, [id, language])

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

  const handleFinishStory = () => {
    navigate('/dashboard', { state: { initialTab: 'read' } })
  }

  // Handle generating the next chapter for generated books
  const handleGenerateNextChapter = async () => {
    if (!isGeneratedBook || !user?.uid || isGeneratingChapter) return

    const nextChapterIndex = generatedChapterCount + 1

    if (nextChapterIndex > totalChapters) {
      console.log('All chapters already generated')
      return
    }

    setIsGeneratingChapter(true)
    setChapterGenerationError('')

    try {
      console.log(`Generating Chapter ${nextChapterIndex}...`)

      const result = await generateChapter({
        uid: user.uid,
        bookId: id,
        chapterIndex: nextChapterIndex,
      })

      if (result.success && result.chapter) {
        // Add the new chapter to our local chapters array
        const newChapter = {
          id: String(nextChapterIndex),
          index: nextChapterIndex - 1, // 0-based for consistency
          title: result.chapter.title || `Chapter ${nextChapterIndex}`,
          adaptedText: result.chapter.content || '',
          adaptedChapterHeader: null,
          adaptedChapterOutline: null,
        }

        setChapters(prev => [...prev, newChapter])
        setGeneratedChapterCount(nextChapterIndex)

        console.log(`Chapter ${nextChapterIndex} generated successfully`)
      } else {
        throw new Error(result.error || 'Failed to generate chapter')
      }
    } catch (err) {
      console.error('Chapter generation failed:', err)
      setChapterGenerationError(err.message || 'Failed to generate chapter. Please try again.')
    } finally {
      setIsGeneratingChapter(false)
    }
  }

  // Handle regenerating the current chapter (for testing)
  const handleRegenerateChapter = async () => {
    if (!isGeneratedBook || !user?.uid || isGeneratingChapter) return
    if (generatedChapterCount < 1) return

    const chapterToRegenerate = generatedChapterCount

    setIsGeneratingChapter(true)
    setChapterGenerationError('')

    try {
      console.log(`Regenerating Chapter ${chapterToRegenerate}...`)

      const result = await generateChapter({
        uid: user.uid,
        bookId: id,
        chapterIndex: chapterToRegenerate,
      })

      if (result.success && result.chapter) {
        // Replace the chapter in our local chapters array
        const updatedChapter = {
          id: String(chapterToRegenerate),
          index: chapterToRegenerate - 1,
          title: result.chapter.title || `Chapter ${chapterToRegenerate}`,
          adaptedText: result.chapter.content || '',
          adaptedChapterHeader: null,
          adaptedChapterOutline: null,
        }

        setChapters(prev => prev.map(ch =>
          ch.index === chapterToRegenerate - 1 ? updatedChapter : ch
        ))

        console.log(`Chapter ${chapterToRegenerate} regenerated successfully`)
      } else {
        throw new Error(result.error || 'Failed to regenerate chapter')
      }
    } catch (err) {
      console.error('Chapter regeneration failed:', err)
      setChapterGenerationError(err.message || 'Failed to regenerate chapter. Please try again.')
    } finally {
      setIsGeneratingChapter(false)
    }
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
    // Combine user's known expressions with content-detected expressions
    const userExpressions = Object.keys(vocabEntries)
      .filter((key) => key.includes(' '))
      .map((key) => normaliseExpression(key))

    const detectedExpressions = contentExpressions
      .map((expr) => normaliseExpression(expr.text || ''))
      .filter((text) => text.includes(' '))

    // Merge and dedupe, keeping user expressions first (they have status)
    const allExpressions = [...new Set([...userExpressions, ...detectedExpressions])]
      .sort((a, b) => b.length - a.length)

    const elements = []

    const segments = segmentTextByExpressions(text || '', allExpressions)

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
    const paragraphs = (text || '').split(/\n\n+/)

    if (readerMode !== 'intensive') {
      return paragraphs.map((paragraph, pIndex) => {
        const paraIdx = globalParagraphCounterRef.current++
        return (
          <p key={`para-${paraIdx}`} className="reader-paragraph" data-paragraph-index={paraIdx}>
            {renderWordSegments(paragraph.trim())}
          </p>
        )
      })
    }

    let runningSentenceOffset = sentenceOffset

    return paragraphs.map((paragraph, pIndex) => {
      const sentences = splitIntoSentences(paragraph.trim())

      if (sentences.length === 0) return null

      const paraIdx = globalParagraphCounterRef.current++

      const paragraphContent = sentences.map((sentence, sIndex) => {
        const globalIndex = runningSentenceOffset + sIndex
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

      runningSentenceOffset += sentences.length

      return (
        <p key={`para-${paraIdx}`} className="reader-paragraph" data-paragraph-index={paraIdx}>
          {paragraphContent}
        </p>
      )
    })
  }

  useEffect(() => {
    function handleGlobalClick(event) {
      // If clicking inside the popup, tutor, or page text, do NOT close
      if (event.target.closest('.translate-popup')) return
      if (event.target.closest('.page-text')) return
      if (event.target.closest('.tutor-panel')) return
      if (event.target.closest('.tutor-fab')) return

      setPopup(null)
    }

    window.addEventListener('click', handleGlobalClick)
    return () => {
      window.removeEventListener('click', handleGlobalClick)
    }
  }, [])

  const handleBackToLibrary = () => {
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

  const handleSentenceNavigation = useCallback(async (direction) => {
    if (readerMode !== 'intensive') return
    if (allVisibleSentences.length === 0) return

    const atLastSentence = currentSentenceIndex >= allVisibleSentences.length - 1
    const atFirstSentence = currentSentenceIndex === 0

    if ((direction === 'next' && atLastSentence) || (direction === 'previous' && atFirstSentence)) {
      return
    }

    await autoMarkSentenceWordsAsKnown(currentIntensiveSentence)

    if (direction === 'next' && user?.uid && language && currentIntensiveSentence) {
      const wordCount = countWords(currentIntensiveSentence)
      if (wordCount > 0) {
        incrementWordsRead(user.uid, language, wordCount)
      }
    }

    if (direction === 'next') {
      setCurrentSentenceIndex((prev) => prev + 1)
    } else {
      setCurrentSentenceIndex((prev) => Math.max(prev - 1, 0))
    }
  }, [readerMode, allVisibleSentences, currentSentenceIndex, currentIntensiveSentence, user, language])

  // High-water mark scroll promotion for active mode
  useEffect(() => {
    if (readerMode !== 'active' || !user?.uid || !language) return undefined

    // Reset on story/language change
    highWaterMarkRef.current = 0
    promotedParagraphsRef.current = new Set()

    let debounceTimer = null

    const promoteWordsInParagraph = (paragraphEl) => {
      const text = paragraphEl.textContent || ''
      const rawWords = Array.from(
        new Set(
          text
            .replace(/[^\p{L}\p{N}]+/gu, ' ')
            .toLowerCase()
            .split(/\s+/)
            .filter(Boolean)
        )
      )

      const newWords = rawWords.filter((word) => {
        const key = normaliseExpression(word)
        return !vocabEntriesRef.current[key]
      })

      if (newWords.length === 0) return

      // Batch Firestore writes
      Promise.all(
        newWords.map((word) => {
          const key = normaliseExpression(word)
          const existingTranslation = vocabEntriesRef.current[key]?.translation || 'No translation found'
          return upsertVocabEntry(user.uid, language, word, existingTranslation, 'known', id)
        })
      ).catch((err) => console.error('Failed to promote paragraph words', err))

      // Update local state immediately
      setVocabEntries((prev) => {
        const next = { ...prev }
        newWords.forEach((word) => {
          const key = normaliseExpression(word)
          next[key] = {
            ...(next[key] || { text: word, language }),
            status: 'known',
            translation: prev[key]?.translation || 'No translation found',
          }
        })
        return next
      })

      // Track words read
      const wordCount = newWords.length
      if (wordCount > 0) {
        incrementWordsRead(user.uid, language, wordCount)
      }
    }

    const container = scrollContainerRef.current
    if (!container) return undefined

    const handleScroll = () => {
      if (debounceTimer) clearTimeout(debounceTimer)

      debounceTimer = setTimeout(() => {
        const scrollY = container.scrollTop
        if (scrollY <= highWaterMarkRef.current) return

        highWaterMarkRef.current = scrollY

        const paragraphs = document.querySelectorAll('[data-paragraph-index]')

        paragraphs.forEach((el) => {
          const idx = Number(el.dataset.paragraphIndex)
          if (promotedParagraphsRef.current.has(idx)) return

          const rect = el.getBoundingClientRect()
          if (rect.bottom < 40) {
            promotedParagraphsRef.current.add(idx)
            promoteWordsInParagraph(el)
          }
        })
      }, 500)
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      container.removeEventListener('scroll', handleScroll)
      if (debounceTimer) clearTimeout(debounceTimer)
    }
  }, [readerMode, user?.uid, language, id])

  // Show auto-known info bubble on first entry to active mode
  useEffect(() => {
    if (readerMode !== 'active') {
      setShowAutoKnownBubble(false)
      return
    }

    const seen = localStorage.getItem('seenAutoKnownScrollInfo')
    if (!seen) {
      setShowAutoKnownBubble(true)
    }
  }, [readerMode])

  const dismissAutoKnownBubble = useCallback(() => {
    localStorage.setItem('seenAutoKnownScrollInfo', 'true')
    setShowAutoKnownBubble(false)
  }, [])

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

  // Extract non-known words from the current intensive sentence
  const intensiveWordList = useMemo(() => {
    if (readerMode !== 'intensive' || !currentIntensiveSentence) return []

    const tokens = (currentIntensiveSentence || '').split(/([\p{L}\p{N}][\p{L}\p{N}'-]*)/gu)
    const seen = new Set()
    const words = []

    tokens.forEach((token) => {
      if (!token || !/[\p{L}\p{N}]/u.test(token)) return

      const key = normaliseExpression(token)
      if (seen.has(key)) return
      seen.add(key)

      const entry = vocabEntries[key]
      const status = entry?.status || 'new'
      if (status === 'known') return

      words.push({
        word: token,
        normalised: key,
        status,
        translation: entry?.translation || intensiveWordTranslations[key]?.translation || null,
        audioBase64: intensiveWordTranslations[key]?.audioBase64 || null,
        audioUrl: intensiveWordTranslations[key]?.audioUrl || null,
      })
    })

    return words
  }, [readerMode, currentIntensiveSentence, vocabEntries, intensiveWordTranslations])

  // Fetch translations for words in the intensive word list that are missing
  useEffect(() => {
    if (readerMode !== 'intensive' || !currentIntensiveSentence) return
    if (!language || !profile?.nativeLanguage) return

    let cancelled = false
    const ttsLang = normalizeLanguageCode(language)

    const fetchMissing = async () => {
      const tokens = (currentIntensiveSentence || '').split(/([\p{L}\p{N}][\p{L}\p{N}'-]*)/gu)
      const seen = new Set()

      for (const token of tokens) {
        if (!token || !/[\p{L}\p{N}]/u.test(token)) continue

        const key = normaliseExpression(token)
        if (seen.has(key)) continue
        seen.add(key)

        const entry = vocabEntries[key]
        const status = entry?.status || 'new'
        if (status === 'known') continue

        // Skip if we already have a translation from vocabEntries or cache
        if (entry?.translation || intensiveWordTranslations[key]?.translation) continue

        if (!ttsLang) continue

        try {
          const response = await fetch('http://localhost:4000/api/translatePhrase', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phrase: token,
              sourceLang: language || 'es',
              targetLang: resolveSupportedLanguageLabel(profile?.nativeLanguage),
              voiceGender,
            }),
          })

          if (cancelled) return

          if (response.ok) {
            const data = await response.json()
            setIntensiveWordTranslations((prev) => ({
              ...prev,
              [key]: {
                translation: data.translation || null,
                audioBase64: data.audioBase64 || null,
                audioUrl: data.audioUrl || null,
              },
            }))
          }
        } catch {
          // silently skip failed translations
        }
      }
    }

    fetchMissing()
    return () => { cancelled = true }
  }, [readerMode, currentIntensiveSentence, language, profile?.nativeLanguage, voiceGender])

  const handleIntensiveWordStatus = useCallback(async (word, translation, newStatus) => {
    if (!user || !language) return

    try {
      await upsertVocabEntry(user.uid, language, word, translation, newStatus, id)

      const key = normaliseExpression(word)
      setVocabEntries((prev) => ({
        ...prev,
        [key]: {
          ...(prev[key] || { text: word, language }),
          status: newStatus,
          translation,
        },
      }))
    } catch (err) {
      console.error('Failed to update word status:', err)
    }
  }, [user, language, id])

  const findContainingSentence = useCallback((word) => {
    if (readerMode === 'intensive' && currentIntensiveSentence) {
      return currentIntensiveSentence.trim()
    }
    const container = scrollContainerRef.current
    if (!container) return word
    const paragraphs = container.querySelectorAll('.reader-paragraph')
    for (const paraEl of paragraphs) {
      const text = paraEl.textContent || ''
      if (!text.toLowerCase().includes(word.toLowerCase())) continue
      const sentences = splitIntoSentences(text)
      const match = sentences.find((s) => s.toLowerCase().includes(word.toLowerCase()))
      if (match) return match.trim()
    }
    return word
  }, [readerMode, currentIntensiveSentence])

  const toggleIntensiveTranslation = () => {
    setIsIntensiveTranslationVisible((prev) => !prev)
  }

  const intensiveTranslation =
    sentenceTranslations[currentIntensiveSentence?.trim?.() || currentIntensiveSentence]

  globalParagraphCounterRef.current = 0

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
                  className="reader-header-button icon-button reader-back-button"
                  onClick={handleBackToLibrary}
                  aria-label="Back to library"
                >
                  <svg className="reader-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="19" y1="12" x2="5" y2="12" />
                    <polyline points="12 19 5 12 12 5" />
                  </svg>
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
                  </div>
                ))}
              </nav>

              <div className="reader-header-actions">
                <button
                  className="reader-header-button ui-text"
                  type="button"
                  aria-label={`Font: ${activeFont.label}`}
                  style={{ fontFamily: activeFont.fontFamily }}
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
                    <svg className="reader-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                    </svg>
                  ) : (
                    <svg className="reader-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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
                    <svg className="reader-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="4" y1="20" x2="10" y2="14" />
                      <polyline points="4 14 4 20 10 20" />
                      <line x1="20" y1="4" x2="14" y2="10" />
                      <polyline points="20 10 20 4 14 4" />
                    </svg>
                  ) : (
                    <svg className="reader-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="14" y1="10" x2="21" y2="3" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="3" y2="21" />
                      <polyline points="9 21 3 21 3 15" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </header>
        </div>
        <div className="reader-body-shell">
          {loading ? (
            <p className="reader-loading-text">Loading</p>
          ) : error ? (
            <p className="error">{error}</p>
          ) : chapters.length ? (
            <div className="reader-scroll-container" ref={scrollContainerRef}>
              {showAutoKnownBubble && (
                <div className="auto-known-bubble">
                  <p>As you read, words you haven&apos;t tagged will automatically be marked as known once you scroll past them.</p>
                  <button type="button" onClick={dismissAutoKnownBubble}>Got it</button>
                </div>
              )}
              <div className="reader-content-column">
                {chapters.map((chapter, chapterIndex) => (
                  <div key={chapter.id || chapterIndex} className="reader-chapter-block">
                    {chapter.adaptedChapterHeader && (
                      <div className="chapter-header-structured">
                        <div className="chapter-header-title" onMouseUp={handleWordClick}>
                          {renderHighlightedText(chapter.adaptedChapterHeader.toUpperCase(), 0)}
                        </div>
                        {chapter.adaptedChapterOutline && (
                          <div className="chapter-header-outline" onMouseUp={handleWordClick}>
                            {renderHighlightedText(chapter.adaptedChapterOutline, 0)}
                          </div>
                        )}
                      </div>
                    )}
                    {!chapter.adaptedChapterHeader && chapter.title && chapters.length > 1 && (
                      <div className="chapter-title">{chapter.title}</div>
                    )}
                    <div className="page-text" onMouseUp={handleWordClick}>
                      {renderHighlightedText(
                        getDisplayText(chapter),
                        chapterSentenceOffsets[chapterIndex] || 0
                      )}
                    </div>
                  </div>
                ))}

                <div className="reader-end-actions">
                  {isGeneratedBook ? (
                    generatedChapterCount < totalChapters ? (
                      <div className="reader-generate-next">
                        {isGeneratingChapter ? (
                          <div className="reader-generating-state">
                            <div className="progress-spinner" />
                            <p>Generating Chapter {generatedChapterCount + 1}...</p>
                            <p className="reader-generating-hint">This may take up to a minute</p>
                          </div>
                        ) : (
                          <>
                            <p className="reader-chapter-progress">
                              Chapter {generatedChapterCount} of {totalChapters}
                            </p>
                            <button
                              type="button"
                              className="reader-end-button reader-generate-button"
                              onClick={handleGenerateNextChapter}
                            >
                              Generate Next Chapter
                            </button>
                            <button
                              type="button"
                              className="reader-end-button reader-regenerate-button"
                              onClick={handleRegenerateChapter}
                              style={{ marginLeft: '10px', backgroundColor: '#666' }}
                            >
                              Regenerate Chapter {generatedChapterCount}
                            </button>
                            {chapterGenerationError && (
                              <p className="error reader-generation-error">{chapterGenerationError}</p>
                            )}
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="reader-book-complete">
                        <p className="reader-the-end">The End</p>
                        <p className="reader-chapter-progress">
                          {totalChapters} chapters complete
                        </p>
                        <button
                          type="button"
                          className="reader-end-button"
                          onClick={handleFinishStory}
                        >
                          Back to Library
                        </button>
                      </div>
                    )
                  ) : (
                    <button
                      type="button"
                      className="reader-end-button"
                      onClick={handleFinishStory}
                    >
                      End story
                    </button>
                  )}
                </div>
              </div>
            </div>
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
            <div className="reader-intensive-top">
              <div className="reader-intensive-sentence" onMouseUp={handleWordClick}>
                {currentIntensiveSentence
                  ? renderWordSegments(currentIntensiveSentence)
                  : 'No text available.'}
              </div>

              <p
                className={`reader-intensive-translation ${
                  isIntensiveTranslationVisible ? 'is-visible' : 'is-hidden'
                }`}
              >
                {isLoadingTranslation
                  ? 'Loading translation...'
                  : intensiveTranslation || 'Translation will appear here.'}
              </p>

              {isIntensiveTranslationVisible && intensiveWordList.length > 0 && (
                <div className="reader-intensive-words">
                  {intensiveWordList.map((wordData) => {
                    const currentStatus = vocabEntries[wordData.normalised]?.status || 'new'
                    const translation = vocabEntries[wordData.normalised]?.translation
                      || intensiveWordTranslations[wordData.normalised]?.translation
                      || null

                    return (
                      <div key={wordData.normalised} className="reader-intensive-word-row">
                        <button
                          type="button"
                          className={`reader-intensive-word-play ${
                            wordData.audioBase64 || wordData.audioUrl ? '' : 'reader-intensive-word-play--disabled'
                          }`}
                          onClick={() => playPronunciationAudio(wordData)}
                          disabled={!wordData.audioBase64 && !wordData.audioUrl}
                          aria-label={`Play pronunciation of ${wordData.word}`}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </button>
                        <span className="reader-intensive-word-text">{wordData.word}</span>
                        <span className="reader-intensive-word-translation">
                          {translation || '...'}
                        </span>
                        <div className="reader-intensive-status-pills">
                          {STATUS_ABBREV.map((abbrev, i) => {
                            const level = STATUS_LEVELS[i]
                            const isActive = level === 'new'
                              ? !vocabEntries[wordData.normalised]?.status
                              : currentStatus === level

                            return (
                              <button
                                key={abbrev}
                                type="button"
                                className={`reader-intensive-status-pill ${isActive ? 'is-active' : ''}`}
                                style={getStatusStyle(level, isActive)}
                                onClick={() => level !== 'new' && handleIntensiveWordStatus(
                                  wordData.word,
                                  translation,
                                  level
                                )}
                                aria-label={`Set ${wordData.word} status to ${level}`}
                                aria-pressed={isActive}
                              >
                                {abbrev}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="reader-intensive-bottom">
              <button
                type="button"
                className="intensive-translation-toggle"
                onClick={toggleIntensiveTranslation}
              >
                {isIntensiveTranslationVisible ? 'Hide translation' : 'Show translation'}
              </button>

              <p className="reader-intensive-helper">
                Space = play / repeat · ← / → = previous / next sentence
              </p>
            </div>
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
                {popup.translation === null ? (
                  <span style={{ opacity: 0.5, fontStyle: 'italic' }}>Translating...</span>
                ) : (
                  popup.translation
                )}
              </p>
            </div>
          </div>

          <div className="translate-popup-status">
            {STATUS_ABBREV.map((abbrev, i) => {
              const level = STATUS_LEVELS[i]
              const currentStatus = vocabEntries[normaliseExpression(popup.word)]?.status
              const isActive = level === 'new'
                ? !currentStatus
                : currentStatus === level

              return (
                <button
                  key={abbrev}
                  type="button"
                  className={`translate-popup-status-button ${isActive ? 'active' : ''}`}
                  style={getStatusStyle(level, isActive)}
                  onClick={() => level !== 'new' && handleSetWordStatus(level)}
                  onMouseDown={(event) => event.preventDefault()}
                  aria-label={`Set status to ${level}`}
                  aria-pressed={isActive}
                >
                  {abbrev}
                </button>
              )
            })}
          </div>
          <button
            type="button"
            className="translate-popup-tutor-button"
            onClick={() => {
              const word = popup.displayText || popup.word
              const sentence = findContainingSentence(word)
              const msg = sentence && sentence !== word
                ? `Explain "${word}" in this sentence: ${sentence}`
                : `Explain "${word}"`
              setTutorInitialMessage(msg)
              setTutorOpen(true)
              setPopup(null)
            }}
          >
            Ask tutor
          </button>
        </div>
      )}

      {!tutorOpen && (
        <div
          className="tutor-fab"
          style={{ position: 'fixed', bottom: 24, right: 24 }}
          role="button"
          aria-label="Open AI Tutor"
          tabIndex={0}
          onClick={() => {
            setTutorInitialMessage(null)
            setTutorOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              setTutorInitialMessage(null)
              setTutorOpen(true)
            }
          }}
        >
          ?
        </div>
      )}

      <TutorPanel
        isOpen={tutorOpen}
        onClose={() => {
          setTutorOpen(false)
          setTutorInitialMessage(null)
        }}
        language={language}
        nativeLanguage={nativeLanguage}
        storyText={fullStoryText}
        initialMessage={tutorInitialMessage}
        storyId={id}
      />
    </div>
  )
}

export default Reader
