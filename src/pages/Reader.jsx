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
import { incrementWordsRead } from '../services/stats'
import { generateChapter } from '../services/novelApiClient'
import WordToken from '../components/read/WordToken'
import { readerModes } from '../constants/readerModes'
import {
  filterSupportedLanguages,
  resolveSupportedLanguageLabel,
  toLanguageLabel,
} from '../constants/languages'
import { normalizeLanguageCode } from '../utils/language'
import { waitForFonts } from '../utils/pagination'

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

// Count words in text (for tracking words read)
const countWords = (text) => {
  if (!text) return 0
  return text.trim().split(/\s+/).filter(Boolean).length
}

const Reader = ({ initialMode }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const { id, language: languageParam } = useParams()
  const { user, profile } = useAuth()

  // Client-side pagination state
  const [chapters, setChapters] = useState([])
  const [pages, setPages] = useState([]) // Virtual pages computed from chapters
  const [currentIndex, setCurrentIndex] = useState(0)
  const [paginationReady, setPaginationReady] = useState(false)
  const measureRef = useRef(null) // Hidden div for measuring text overflow
  const pageContainerRef = useRef(null) // Visible page container

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
  const [displayMode, setDisplayMode] = useState(
    () => localStorage.getItem('readerDisplayMode') || 'normal'
  ) // 'normal' (two-page spread) or 'assisted' (single page, large font)
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0)
  const [sentenceTranslations, setSentenceTranslations] = useState({})
  const [sentenceSegments, setSentenceSegments] = useState([])
  const [isIntensiveTranslationVisible, setIsIntensiveTranslationVisible] =
    useState(false)
  const [isLoadingTranslation, setIsLoadingTranslation] = useState(false)
  const [bookmarkIndex, setBookmarkIndex] = useState(null)
  const [isSavingBookmark, setIsSavingBookmark] = useState(false)
  const [contentExpressions, setContentExpressions] = useState([])
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
      setChapters([])
      setPages([])
      setLoading(false)
      return undefined
    }

    const loadContent = async () => {
      setLoading(true)
      setPaginationReady(false)
      setIsGeneratedBook(false)
      setGeneratedBookData(null)

      try {
        // First try regular stories collection
        const storyRef = doc(db, 'users', user.uid, 'stories', id)
        const storySnap = await getDoc(storyRef)

        if (storySnap.exists()) {
          // Regular story found
          const storyData = storySnap.data() || {}

          // Check if pre-computed pages exist
          const pagesRef = collection(db, 'users', user.uid, 'stories', id, 'pages')
          const pagesQuery = query(pagesRef, orderBy('index', 'asc'))
          const pagesSnapshot = await getDocs(pagesQuery)

          if (pagesSnapshot.docs.length > 0) {
            // Pre-computed pages exist - load them directly
            const loadedPages = pagesSnapshot.docs.map((docSnap) => ({
              id: docSnap.id,
              ...docSnap.data(),
            }))
            console.log(`Loaded ${loadedPages.length} pre-computed pages`)
            setPages(loadedPages)
            setPaginationReady(true)
            setChapters([])
            setError('')
            setLoading(false)
            return
          }

          // No pre-computed pages - fall back to loading chapters for on-the-fly pagination
          console.log('No pre-computed pages found, falling back to chapter-based pagination')

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
        setTotalChapters(bookData.chapterCount || 12)

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

  // Compute page breaks based on what fits in the container (fallback for books without pre-computed pages)
  useEffect(() => {
    // Skip if pages are already loaded (pre-computed) or no chapters to paginate
    if (paginationReady || !chapters.length || loading || !measureRef.current) {
      return
    }

    // Check if content fits within the given height
    // For first page of chapter, includes header/outline as part of the content
    const measureFits = (measureDiv, bodyText, maxHeight, header = null, outline = null) => {
      measureDiv.innerHTML = ''

      // Create wrapper for all content
      const contentWrapper = document.createElement('div')

      // Add header/outline if present (first page of chapter)
      if (header || outline) {
        const headerDiv = document.createElement('div')
        headerDiv.className = 'chapter-header-structured'
        if (header) {
          const titleDiv = document.createElement('div')
          titleDiv.className = 'chapter-header-title'
          titleDiv.innerText = header.toUpperCase()
          headerDiv.appendChild(titleDiv)
        }
        if (outline) {
          const outlineDiv = document.createElement('div')
          outlineDiv.className = 'chapter-header-outline'
          outlineDiv.innerText = outline
          headerDiv.appendChild(outlineDiv)
        }
        contentWrapper.appendChild(headerDiv)
      }

      // Add body text as paragraphs
      const textNode = document.createElement('div')
      textNode.className = 'page-text-measure'

      const paragraphs = bodyText.split(/\n\n+/)
      paragraphs.forEach((para) => {
        if (para.trim()) {
          const p = document.createElement('p')
          p.className = 'reader-paragraph'
          p.innerText = para.trim()
          textNode.appendChild(p)
        }
      })

      contentWrapper.appendChild(textNode)
      measureDiv.appendChild(contentWrapper)

      return contentWrapper.scrollHeight <= maxHeight
    }

    const computePages = () => {
      const measureDiv = measureRef.current
      if (!measureDiv) return

      // Fixed container height for all pages - content flows within this
      const computedStyle = window.getComputedStyle(measureDiv)
      const paddingTop = parseFloat(computedStyle.paddingTop) || 0
      const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0
      const SAFETY_MARGIN = 4 // Prevent clipping from sub-pixel rendering differences
      const containerHeight = measureDiv.clientHeight - paddingTop - paddingBottom - SAFETY_MARGIN
      if (containerHeight <= 0) return

      const virtualPages = []
      let globalPageIndex = 0

      for (const chapter of chapters) {
        const text = chapter.adaptedText || ''
        if (!text.trim()) continue

        const chapterHeader = chapter.adaptedChapterHeader || null
        const chapterOutline = chapter.adaptedChapterOutline || null

        // Split text into units (words + paragraph breaks)
        const units = []
        const paragraphs = text.split(/\n\n+/)
        for (let i = 0; i < paragraphs.length; i++) {
          if (i > 0) units.push('\n\n') // paragraph break marker
          const words = paragraphs[i].split(/\s+/).filter(Boolean)
          units.push(...words)
        }

        let currentPageText = ''
        let isFirstPageOfChapter = true
        let unitIndex = 0

        while (unitIndex < units.length) {
          const unit = units[unitIndex]

          // Build test text
          let testText
          if (unit === '\n\n') {
            testText = currentPageText ? currentPageText + '\n\n' : ''
          } else {
            testText = currentPageText ? currentPageText + ' ' + unit : unit
          }

          // Same container height for all pages
          // Header/outline included in measurement for first page (flows as content)
          const headerForMeasure = isFirstPageOfChapter ? chapterHeader : null
          const outlineForMeasure = isFirstPageOfChapter ? chapterOutline : null

          if (measureFits(measureDiv, testText, containerHeight, headerForMeasure, outlineForMeasure)) {
            // Unit fits - add it
            if (unit === '\n\n') {
              currentPageText = currentPageText ? currentPageText + '\n\n' : ''
            } else {
              currentPageText = currentPageText ? currentPageText + ' ' + unit : unit
            }
            unitIndex++
          } else {
            // Doesn't fit - save current page and start new one
            if (currentPageText.trim()) {
              virtualPages.push({
                index: globalPageIndex,
                text: currentPageText.trim(),
                adaptedText: currentPageText.trim(),
                chapterIndex: chapter.index,
                chapterTitle: isFirstPageOfChapter ? chapter.title : null,
                chapterHeader: isFirstPageOfChapter ? chapterHeader : null,
                chapterOutline: isFirstPageOfChapter ? chapterOutline : null,
                isChapterStart: isFirstPageOfChapter,
              })
              globalPageIndex++
              isFirstPageOfChapter = false
            }

            // Start fresh - if unit is paragraph break, skip it at page start
            if (unit === '\n\n') {
              currentPageText = ''
              unitIndex++
            } else {
              currentPageText = unit
              unitIndex++
            }
          }
        }

        // Save last page of chapter
        if (currentPageText.trim()) {
          virtualPages.push({
            index: globalPageIndex,
            text: currentPageText.trim(),
            adaptedText: currentPageText.trim(),
            chapterIndex: chapter.index,
            chapterTitle: isFirstPageOfChapter ? chapter.title : null,
            chapterHeader: isFirstPageOfChapter ? chapterHeader : null,
            chapterOutline: isFirstPageOfChapter ? chapterOutline : null,
            isChapterStart: isFirstPageOfChapter,
          })
          globalPageIndex++
        }
      }

      setPages(virtualPages)
      setPaginationReady(true)
    }

    // Retry logic in case container isn't sized yet, with font loading
    let attempts = 0
    const maxAttempts = 10
    const tryCompute = async () => {
      const measureDiv = measureRef.current
      if (!measureDiv || measureDiv.clientHeight === 0) {
        attempts++
        if (attempts < maxAttempts) {
          setTimeout(tryCompute, 100)
        } else {
          console.warn('Could not get container height after', maxAttempts, 'attempts')
        }
        return
      }
      // Wait for fonts to load before computing pages
      await waitForFonts()
      computePages()
    }

    // Small delay to ensure container is properly sized
    const timer = setTimeout(tryCompute, 100)
    return () => clearTimeout(timer)
  }, [chapters, loading, paginationReady])

  // Note: Window resize no longer triggers re-pagination since pages have fixed dimensions
  // Pre-computed pages are loaded from Firestore and don't change with window size

  // Calculate and apply page scale to fit viewport
  useEffect(() => {
    const SPREAD_WIDTH = 1240
    const SPREAD_HEIGHT = 800
    const MARGIN_X = 100 // horizontal margin
    const MARGIN_Y = 180 // vertical margin for header + page numbers

    const updateScale = () => {
      if (!pageContainerRef.current) return

      const availableWidth = window.innerWidth - MARGIN_X
      const availableHeight = window.innerHeight - MARGIN_Y

      const scaleX = availableWidth / SPREAD_WIDTH
      const scaleY = availableHeight / SPREAD_HEIGHT

      // Use smaller scale to fit both dimensions - cap at 1.0 to keep book-like proportions
      const scale = Math.min(scaleX, scaleY, 1.0)

      // Apply to the spread element (child of pageContainerRef)
      const spreadElement = pageContainerRef.current.querySelector('.reader-spread')
      if (spreadElement) {
        spreadElement.style.setProperty('--page-scale', scale)
      }
    }

    updateScale()
    window.addEventListener('resize', updateScale)
    return () => window.removeEventListener('resize', updateScale)
  }, [])

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

  const pagesPerView = displayMode === 'assisted' ? 1 : 2
  const visiblePages = pages.slice(currentIndex, currentIndex + pagesPerView)
  const pageText = visiblePages.map((p) => getDisplayText(p)).join(' ')

  const splitIntoSentences = (text) => {
    if (!text) return []

    // First split by paragraphs, then by sentences within each paragraph
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
        Math.min(prev + pagesPerView, pages.length - 1)
      )
    }

    const canAdvance = await promoteNewWordsToKnown()
    if (!canAdvance) return

    // Track words read from current pages before advancing
    if (user?.uid && language) {
      const currentPages = pages.slice(currentIndex, currentIndex + 2)
      const wordCount = currentPages.reduce((sum, page) => sum + countWords(getDisplayText(page)), 0)
      if (wordCount > 0) {
        incrementWordsRead(user.uid, language, wordCount)
      }
    }

    advancePages()
  }

  const handleFinishStory = async () => {
    const canFinish = await promoteNewWordsToKnown()

    if (!canFinish) return

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

        // Reset pagination to include new chapter
        setPaginationReady(false)

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

        // Reset pagination to reflect updated content
        setPaginationReady(false)

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
    // Split into paragraphs first (double newline = paragraph break)
    const paragraphs = (text || '').split(/\n\n+/)

    if (readerMode !== 'intensive') {
      // Non-intensive mode: render paragraphs with word segments
      return paragraphs.map((paragraph, pIndex) => (
        <p key={`para-${pIndex}`} className="reader-paragraph">
          {renderWordSegments(paragraph.trim())}
        </p>
      ))
    }

    // Intensive mode: render sentences within paragraphs
    let runningSentenceOffset = sentenceOffset

    return paragraphs.map((paragraph, pIndex) => {
      const sentences = splitIntoSentences(paragraph.trim())

      if (sentences.length === 0) return null

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
        <p key={`para-${pIndex}`} className="reader-paragraph">
          {paragraphContent}
        </p>
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
  const hasNext = currentIndex + pagesPerView < pages.length
  // visiblePages is already defined above

  const handleEdgeNavigation = (direction) => {
    const selection = window.getSelection()
    if (selection && selection.toString().trim()) return

    if (direction === 'previous' && hasPrevious) {
      setCurrentIndex((prev) => Math.max(prev - pagesPerView, 0))
    }

    if (direction === 'next' && hasNext) {
      handleNextPages()
    }
  }

  const toggleDisplayMode = () => {
    const newMode = displayMode === 'normal' ? 'assisted' : 'normal'
    setDisplayMode(newMode)
    localStorage.setItem('readerDisplayMode', newMode)
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
      // Calculate progress as percentage of pages read
      const progress = pages.length > 0
        ? Math.min(100, Math.round(((evenIndex + 2) / pages.length) * 100))
        : 0
      await updateDoc(storyRef, {
        bookmarkIndex: evenIndex,
        bookmarkUpdatedAt: serverTimestamp(),
        progress,
      })

      setBookmarkIndex(evenIndex)

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

  // Auto-save progress periodically and on unmount
  useEffect(() => {
    if (!user || !id || !pages.length) return undefined

    // Save progress every 30 seconds
    const intervalId = setInterval(() => {
      persistBookmark(currentIndex, { notify: false })
    }, 30000)

    // Save on unmount
    return () => {
      clearInterval(intervalId)
      persistBookmark(currentIndex, { notify: false })
    }
  }, [user, id, pages.length, currentIndex])

  // Save progress when page becomes hidden (user switches tabs or closes)
  useEffect(() => {
    if (!user || !id || !pages.length) return undefined

    const handleVisibilityChange = () => {
      if (document.hidden) {
        persistBookmark(currentIndex, { notify: false })
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [user, id, pages.length, currentIndex])

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

    // Track words read when moving forward (completing a sentence)
    if (movingForward && user?.uid && language && currentIntensiveSentence) {
      const wordCount = countWords(currentIntensiveSentence)
      if (wordCount > 0) {
        incrementWordsRead(user.uid, language, wordCount)
      }
    }

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
                  className={`reader-header-button ui-text ${displayMode === 'assisted' ? 'is-active' : ''}`}
                  type="button"
                  aria-label={displayMode === 'assisted' ? 'Switch to normal view' : 'Switch to assisted view'}
                  onClick={(e) => {
                    toggleDisplayMode()
                    e.currentTarget.blur()
                  }}
                  title={displayMode === 'assisted' ? 'Normal view (2 pages)' : 'Assisted view (1 page, larger)'}
                >
                  {displayMode === 'assisted' ? '1pg' : '2pg'}
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
          {/* Hidden measuring div for client-side pagination */}
          <div
            ref={measureRef}
            className="reader-measure-container"
            aria-hidden="true"
          />

          {loading || (chapters.length > 0 && !paginationReady) ? (
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

                <div ref={pageContainerRef} className="reader-pages">
                  <div className={displayMode === 'assisted' ? 'reader-single' : 'reader-spread'}>
                  {visiblePages.map((page, pageIndex) => {
                    const pageNumber = (page.index ?? pages.indexOf(page)) + 1
                    const isLeftPage = pageIndex % 2 === 0

                    return (
                      <div
                        key={page.id || page.index}
                        className={`reader-page-block ${
                          displayMode === 'assisted' ? 'page--single' : (isLeftPage ? 'page--left' : 'page--right')
                        }`}
                      >
                        {/* Structured chapter header for TXT imports */}
                        {page.isChapterStart && page.chapterHeader && (
                          <div className="chapter-header-structured">
                            <div className="chapter-header-title" onMouseUp={handleWordClick}>
                              {renderHighlightedText(
                                page.chapterHeader.toUpperCase(),
                                0
                              )}
                            </div>
                            {page.chapterOutline && (
                              <div className="chapter-header-outline" onMouseUp={handleWordClick}>
                                {renderHighlightedText(
                                  page.chapterOutline,
                                  0
                                )}
                              </div>
                            )}
                          </div>
                        )}
                        {/* Fallback to simple chapter title for EPUB imports */}
                        {page.isChapterStart && !page.chapterHeader && page.chapterTitle && (
                          <div className="chapter-title">{page.chapterTitle}</div>
                        )}
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
                </div>

                <div
                  className={`reader-nav-zone right ${hasNext ? '' : 'disabled'}`}
                  aria-label="Next pages"
                  onClick={() => handleEdgeNavigation('next')}
                />
              </div>

              {!hasNext && (
                <div className="reader-end-actions">
                  {isGeneratedBook ? (
                    // Generated book end actions
                    generatedChapterCount < totalChapters ? (
                      // More chapters to generate
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
                      // All chapters generated - book complete
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
                    // Regular story end action
                    <button
                      type="button"
                      className="reader-end-button"
                      onClick={handleFinishStory}
                    >
                      End story
                    </button>
                  )}
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
