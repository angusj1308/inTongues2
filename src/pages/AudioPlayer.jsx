import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { collection, doc, getDoc, getDocs, orderBy, query } from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { VOCAB_STATUSES, loadUserVocab, normaliseExpression, upsertVocabEntry } from '../services/vocab'
import {
  getDeviceId,
  initSpotifyPlayer,
  pause as pauseSpotify,
  resume as resumeSpotify,
  seek as seekSpotify,
  subscribeToStateChanges,
} from '../services/spotifyPlayer'
import IntensiveListeningMode from '../components/listen/IntensiveListeningMode'
import ExtensiveMode from '../components/listen/ExtensiveMode'
import ActiveMode from '../components/listen/ActiveMode'
import { normalizeLanguageCode } from '../utils/language'

const getDisplayText = (page) => page?.adaptedText || page?.originalText || page?.text || ''

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

const normaliseTranscriptSegments = (segments = []) =>
  segments
    .filter(Boolean)
    .map((segment) => {
      const start = Number(segment?.start)
      const end = Number(segment?.end)

      return {
        ...segment,
        start: Number.isFinite(start) ? start : undefined,
        end: Number.isFinite(end) ? end : undefined,
        text: (segment?.text || '').trim(),
      }
    })

const AudioPlayer = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const location = useLocation()
  const audioRef = useRef(null)
  const pronunciationAudioRef = useRef(null)
  const popupRef = useRef(null)

  const searchParams = new URLSearchParams(location.search)
  const source = searchParams.get('source')
  const isSpotify = source === 'spotify'

  const [pages, setPages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pageTranslations, setPageTranslations] = useState({})
  const [transcriptDoc, setTranscriptDoc] = useState({ sentenceSegments: [], segments: [] })
  const [popup, setPopup] = useState(null)
  const [popupPosition, setPopupPosition] = useState({ top: null, left: null })
  const missingLanguageMessage =
    'Select a language for this content to enable translation/pronunciation.'
  const [vocabEntries, setVocabEntries] = useState({})
  const [isPlaying, setIsPlaying] = useState(false)
  const [listeningMode, setListeningMode] = useState('extensive')
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(false)
  const [scrubSeconds, setScrubSeconds] = useState(5)
  const [activePageIndex, setActivePageIndex] = useState(0)
  const [hasSeenAdvancePrompt, setHasSeenAdvancePrompt] = useState(false)
  const [showAdvanceModal, setShowAdvanceModal] = useState(false)
  const [intensiveSentenceIndex, setIntensiveSentenceIndex] = useState(0)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [progressSeconds, setProgressSeconds] = useState(0)
  const [durationSeconds, setDurationSeconds] = useState(0)
  const [storyMeta, setStoryMeta] = useState({
    title: '',
    language: '',
    audioStatus: '',
    fullAudioUrl: '',
    spotifyUri: '',
    type: '',
    mediaType: 'audio',
  })
  const [spotifyDeviceId, setSpotifyDeviceId] = useState('')
  const [spotifyPlayerState, setSpotifyPlayerState] = useState(null)
  const [activeChunkIndex, setActiveChunkIndex] = useState(0)
  const [activeStep, setActiveStep] = useState(1)
  const [completedChunks, setCompletedChunks] = useState(new Set())
  const lastCompletionRef = useRef({ chunkIndex: -1, step: null })

  const fetchSpotifyAccessToken = useCallback(async () => {
    if (!user) throw new Error('User not authenticated')

    const response = await fetch(
      `http://localhost:4000/api/spotify/access-token?uid=${encodeURIComponent(user.uid)}`,
    )

    if (!response.ok) {
      throw new Error(await response.text())
    }

    const data = await response.json()
    return data?.accessToken
  }, [user])

  const transcriptText = useMemo(() => pages.map((page) => getDisplayText(page)).join(' '), [pages])

  const transcriptSentences = useMemo(() => {
    if (!transcriptText) return []
    return transcriptText
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean)
  }, [transcriptText])

  const transcriptSegments = useMemo(() => {
    const sentenceSegments = normaliseTranscriptSegments(transcriptDoc?.sentenceSegments)
    if (sentenceSegments.length) return sentenceSegments

    const docSegments = normaliseTranscriptSegments(transcriptDoc?.segments)
    if (docSegments.length) return docSegments

    const pageSegments = normaliseTranscriptSegments(
      pages.flatMap((page) => page?.transcriptSegments || []),
    )
    if (pageSegments.length) return pageSegments

    return transcriptSentences.map((text) => ({ text }))
  }, [pages, transcriptDoc, transcriptSentences])

  const chunkLengthSeconds = 60

  // TODO: Keep declarations above hooks to avoid TDZ crashes.
  const playbackPositionSeconds = progressSeconds
  const playbackDurationSeconds = durationSeconds

  const activeChunks = useMemo(() => {
    if (!Number.isFinite(playbackDurationSeconds) || playbackDurationSeconds <= 0) return []
    const totalChunks = Math.ceil(playbackDurationSeconds / chunkLengthSeconds)

    return Array.from({ length: totalChunks }, (_, index) => {
      const start = index * chunkLengthSeconds
      const end = Math.min((index + 1) * chunkLengthSeconds, playbackDurationSeconds)
      const labelStart = `${Math.floor(start / 60)
        .toString()
        .padStart(2, '0')}:${Math.floor(start % 60)
        .toString()
        .padStart(2, '0')}`
      const labelEnd = `${Math.floor(end / 60)
        .toString()
        .padStart(2, '0')}:${Math.floor(end % 60)
        .toString()
        .padStart(2, '0')}`

      return { index, start, end, labelStart, labelEnd }
    })
  }, [playbackDurationSeconds])

  const playPronunciationAudio = (audioData) => {
    if (!audioData?.audioBase64 && !audioData?.audioUrl) return

    if (pronunciationAudioRef.current) {
      if (pronunciationAudioRef.current._objectUrl) {
        URL.revokeObjectURL(pronunciationAudioRef.current._objectUrl)
      }
      pronunciationAudioRef.current.pause()
    }

    const audio = new Audio()

    if (audioData.audioUrl) {
      audio.src = audioData.audioUrl
    } else {
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
    }

    pronunciationAudioRef.current = audio
    audio.play().catch((err) => console.error('Pronunciation playback failed', err))
  }

  useEffect(() => {
    if (!user || !id) {
      setError('Unable to load audiobook right now.')
      setPages([])
      setLoading(false)
      return
    }

    const loadStoryMeta = async () => {
      try {
        const baseDoc = isSpotify
          ? doc(db, 'users', user.uid, 'spotifyItems', id)
          : doc(db, 'users', user.uid, 'stories', id)
        const storySnap = await getDoc(baseDoc)

        if (!storySnap.exists()) {
          setError(isSpotify ? 'Spotify item not found.' : 'Audiobook not found.')
          setStoryMeta({
            title: '',
            language: '',
            audioStatus: '',
            fullAudioUrl: '',
            spotifyUri: '',
            type: '',
            mediaType: 'audio',
          })
          return
        }

        const data = storySnap.data() || {}

        if (isSpotify) {
          setStoryMeta({
            title: data.title || 'Spotify item',
            language: data.language || data.transcriptLanguage || '',
            audioStatus: 'ready',
            fullAudioUrl: null,
            spotifyUri: data.spotifyUri || '',
            type: data.type || '',
            mediaType: data.mediaType || 'audio',
          })
          return
        }

        setStoryMeta({
          title: data.title || 'Untitled story',
          language: data.language || '',
          audioStatus: data.audioStatus || '',
          fullAudioUrl: data.fullAudioUrl || '',
          spotifyUri: '',
          type: data.type || '',
          mediaType: 'audio',
        })
      } catch (err) {
        console.error('Failed to load audiobook metadata', err)
        setError('Unable to load audiobook right now.')
      }
    }

    loadStoryMeta()
  }, [id, isSpotify, user])

  useEffect(() => {
    if (!isSpotify || !user) return undefined

    let unsubscribe = null
    let isCancelled = false

    const setupSpotifyPlayback = async () => {
      try {
        await initSpotifyPlayer(fetchSpotifyAccessToken)

        if (isCancelled) return

        const nextDeviceId = getDeviceId()
        setSpotifyDeviceId(nextDeviceId || '')

        if (nextDeviceId) {
          const response = await fetch('http://localhost:4000/api/spotify/transfer-playback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid: user.uid, deviceId: nextDeviceId, play: false }),
          })

          if (!response.ok) {
            console.error('Unable to transfer Spotify playback', await response.text())
            setError('Unable to start Spotify playback right now.')
            return
          }
        }

        unsubscribe = subscribeToStateChanges((state) => {
          setSpotifyPlayerState(state)
          setIsPlaying(state ? !state.paused : false)
        })
      } catch (err) {
        console.error('Failed to initialise Spotify playback', err)
        setError('Unable to start Spotify playback right now.')
      }
    }

    setupSpotifyPlayback()

    return () => {
      isCancelled = true
      if (unsubscribe) unsubscribe()
    }
  }, [fetchSpotifyAccessToken, isSpotify, user])

  useEffect(() => {
    if (!user || !id) {
      setPages([])
      setLoading(false)
      return
    }

    const loadPages = async () => {
      setLoading(true)
      try {
        const baseCollection = isSpotify
          ? collection(db, 'users', user.uid, 'spotifyItems', id, 'pages')
          : collection(db, 'users', user.uid, 'stories', id, 'pages')
        const pagesQuery = query(baseCollection, orderBy('index', 'asc'))
        const snapshot = await getDocs(pagesQuery)
        const nextPages = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
        setPages(nextPages)
        setError('')
      } catch (loadError) {
        console.error('Failed to load transcript pages', loadError)
        setError('Unable to load transcript right now.')
      } finally {
        setLoading(false)
      }
    }

    loadPages()
  }, [id, isSpotify, user])

  useEffect(() => {
    if (!user || !id || isSpotify) {
      setTranscriptDoc({ sentenceSegments: [], segments: [] })
      return undefined
    }

    let isActive = true

    const loadTranscriptDoc = async () => {
      try {
        const transcriptRef = doc(db, 'users', user.uid, 'stories', id, 'transcripts', 'intensive')
        const transcriptSnap = await getDoc(transcriptRef)

        if (!isActive) return

        if (!transcriptSnap.exists()) {
          setTranscriptDoc({ sentenceSegments: [], segments: [] })
          return
        }

        const data = transcriptSnap.data() || {}
        const sentenceSegments = Array.isArray(data.sentenceSegments) ? data.sentenceSegments : []
        const segments = Array.isArray(data.segments) ? data.segments : []

        setTranscriptDoc({ sentenceSegments, segments })
      } catch (err) {
        console.error('Failed to load transcript document', err)
        if (isActive) {
          setTranscriptDoc({ sentenceSegments: [], segments: [] })
        }
      }
    }

    loadTranscriptDoc()

    return () => {
      isActive = false
    }
  }, [id, isSpotify, user])

  useEffect(() => {
    if (!user || !storyMeta.language) {
      setVocabEntries({})
      return undefined
    }

    let isActive = true

    const fetchVocab = async () => {
      try {
        const entries = await loadUserVocab(user.uid, storyMeta.language)
        if (isActive) {
          setVocabEntries(entries)
        }
      } catch (err) {
        console.error('Failed to load vocabulary entries', err)
        if (isActive) setVocabEntries({})
      }
    }

    fetchVocab()

    return () => {
      isActive = false
    }
  }, [storyMeta.language, user])

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
        const exprIndex = lowerText.indexOf(expression, index)

        if (exprIndex === index) {
          matchedExpression = expression
          break
        }

        if (exprIndex !== -1 && exprIndex < lowerText.length) {
          const before = lowerText[exprIndex - 1]
          const after = lowerText[exprIndex + expression.length]

          const isWholeWord = !isWordChar(before) && !isWordChar(after)
          if (isWholeWord && exprIndex === index) {
            matchedExpression = expression
            break
          }
        }
      }

      if (matchedExpression) {
        segments.push({
          type: 'phrase',
          text: text.slice(index, index + matchedExpression.length),
          status: vocabEntries[matchedExpression]?.status,
        })
        index += matchedExpression.length
        continue
      }

      let nextIndex = text.length
      for (const expression of expressions) {
        const exprIndex = lowerText.indexOf(expression, index)
        if (exprIndex !== -1 && exprIndex < nextIndex) {
          nextIndex = exprIndex
        }
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
          <span key={`phrase-${segmentIndex}`} className={`phrase-${segment.status || 'new'}`}>
            {segment.text}
          </span>,
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
            </span>,
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
          </span>,
        )
      })
    })

    return elements
  }

  async function handleWordClick(e) {
    e.stopPropagation()

    const selection = window.getSelection()?.toString().trim()

    if (!selection) return

    const parts = selection.split(/\s+/).filter(Boolean)

    if (parts.length > 1) {
      const phrase = selection

      const selectionObj = window.getSelection()
      if (!selectionObj || selectionObj.rangeCount === 0) return

      const range = selectionObj.getRangeAt(0)
      const rect = range.getBoundingClientRect()

      let translation = 'No translation found'
      let audioBase64 = null
      let audioUrl = null

      const ttsLanguage = normalizeLanguageCode(storyMeta.language)

      if (!ttsLanguage) {
        setPopup({
          x: rect.left + window.scrollX,
          y: rect.bottom + window.scrollY + 8,
          word: phrase,
          translation: missingLanguageMessage,
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
              sourceLang: storyMeta.language || 'es',
              targetLang: profile?.nativeLanguage || 'English',
              ttsLanguage,
            }),
          })

        if (response.ok) {
          const data = await response.json()
          translation = data.translation || translation
          audioBase64 = data.audioBase64 || null
          audioUrl = data.audioUrl || null
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
        audioBase64,
        audioUrl,
      })

      return
    }

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
      audioBase64: null,
      audioUrl: null,
    })
  }

  const handleSetWordStatus = async (status) => {
    if (!user || !storyMeta.language || !popup?.word) return
    if (!VOCAB_STATUSES.includes(status)) return

    try {
      await upsertVocabEntry(user.uid, storyMeta.language, popup.word, popup.translation, status)

      const key = normaliseExpression(popup.word)

      setVocabEntries((prev) => ({
        ...prev,
        [key]: {
          ...(prev[key] || { text: popup.word, language: storyMeta.language }),
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
    if (!transcriptText || typeof transcriptText !== 'string') return

    const words = Array.from(
      new Set(
        transcriptText
          .replace(/[^\p{L}\p{N}]+/gu, ' ')
          .toLowerCase()
          .split(/\s+/)
          .filter(Boolean),
      ),
    )

    if (words.length === 0) return

    const controller = new AbortController()

    async function prefetch() {
      try {
        const response = await fetch('http://localhost:4000/api/prefetchTranslations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            languageCode: storyMeta.language || 'es',
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
      } catch (prefetchError) {
        if (prefetchError.name !== 'AbortError') {
          console.error('Error prefetching translations', prefetchError)
        }
      }
    }

    prefetch()

    return () => {
      controller.abort()
    }
  }, [profile?.nativeLanguage, storyMeta.language, transcriptText])

  useEffect(() => {
    function handleGlobalClick(event) {
      if (event.target.closest('.page-text') || event.target.closest('.translate-popup')) {
        return
      }

      setPopup(null)
    }

    window.addEventListener('click', handleGlobalClick)
    return () => {
      window.removeEventListener('click', handleGlobalClick)
    }
  }, [])

  useLayoutEffect(() => {
    if (!popup || !popupRef.current) {
      setPopupPosition({ top: null, left: null })
      return
    }

    const { width, height } = popupRef.current.getBoundingClientRect()
    const padding = 10
    const fallbackLeft = popup.x ?? 0
    const fallbackTop = popup.y ?? 0
    const anchorRect = popup.anchorRect || {
      left: fallbackLeft,
      right: fallbackLeft,
      top: fallbackTop,
      bottom: fallbackTop,
      width: 0,
      height: 0,
    }
    const anchorX = popup.anchorX ?? anchorRect.left + anchorRect.width / 2

    let left = clamp(anchorX - width / 2, padding, window.innerWidth - padding - width)

    const bottomEdge = anchorRect.bottom ?? anchorRect.top ?? fallbackTop
    const topEdge = anchorRect.top ?? anchorRect.bottom ?? fallbackTop

    let top = bottomEdge + 12

    if (top + height > window.innerHeight - padding) {
      top = topEdge - 12 - height
    }

    top = clamp(top, padding, window.innerHeight - padding - height)

    setPopupPosition({ top, left })
  }, [popup])

  useEffect(() => {
    if (isSpotify) return undefined

    const audio = audioRef.current
    if (!audio) return undefined

    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)

    const handleTimeUpdate = () => setProgressSeconds(audio.currentTime || 0)
    const handleDurationChange = () => setDurationSeconds(audio.duration || 0)

    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('ended', handlePause)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('loadedmetadata', handleDurationChange)
    audio.addEventListener('durationchange', handleDurationChange)

    return () => {
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('ended', handlePause)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('loadedmetadata', handleDurationChange)
      audio.removeEventListener('durationchange', handleDurationChange)
    }
  }, [isSpotify, storyMeta.fullAudioUrl])

  useEffect(() => {
    if (!isSpotify) return

    setProgressSeconds((spotifyPlayerState?.position || 0) / 1000)
    setDurationSeconds((spotifyPlayerState?.duration || 0) / 1000)
  }, [isSpotify, spotifyPlayerState])

  useEffect(() => {
    if (!pages.length) {
      setActivePageIndex(0)
      return
    }

    setActivePageIndex((prev) => Math.min(prev, Math.max(pages.length - 1, 0)))
  }, [pages])

  useEffect(() => {
    if (!transcriptSentences.length) {
      setIntensiveSentenceIndex(0)
      return
    }

    setIntensiveSentenceIndex((prev) => Math.min(prev, transcriptSentences.length - 1))
  }, [transcriptSentences])

  useEffect(() => {
    if (!activeChunks.length) {
      setActiveChunkIndex(0)
      return
    }

    setActiveChunkIndex((prev) => Math.min(prev, activeChunks.length - 1))
  }, [activeChunks.length])

  useEffect(() => {
    lastCompletionRef.current = { chunkIndex: -1, step: null }
  }, [activeChunkIndex, activeStep, listeningMode])

  const startSpotifyPlayback = async () => {
    if (!user || !spotifyDeviceId || !storyMeta.spotifyUri) return

    try {
      const response = await fetch('http://localhost:4000/api/spotify/start-playback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: user.uid, deviceId: spotifyDeviceId, spotifyUri: storyMeta.spotifyUri }),
      })

      if (!response.ok) {
        console.error('Unable to start Spotify playback', await response.text())
        setError('Unable to start Spotify playback right now.')
        return
      }

      await resumeSpotify()
    } catch (err) {
      console.error('Unable to start Spotify playback', err)
      setError('Unable to start Spotify playback right now.')
    }
  }

  const togglePlay = async () => {
    if (listeningMode === 'active') {
      const chunk = activeChunks[activeChunkIndex]
      if (chunk && (progressSeconds < chunk.start || progressSeconds > chunk.end)) {
        handleSeekTo(chunk.start)
      }
    }

    if (isSpotify) {
      if (isPlaying) {
        await pauseSpotify()
      } else {
        await startSpotifyPlayback()
      }
      return
    }

    const audio = audioRef.current
    if (!audio) return

    if (audio.paused) {
      audio.play()
    } else {
      audio.pause()
    }
  }

  const handleSeekTo = (seconds = 0) => {
    const duration = playbackDurationSeconds || 0
    let target = Math.max(0, Math.min(duration, Number.isFinite(seconds) ? seconds : 0))

    if (listeningMode === 'active' && activeChunks.length) {
      const chunk = activeChunks[activeChunkIndex]
      if (chunk) {
        target = Math.min(chunk.end, Math.max(chunk.start, target))
      }
    }

    if (isSpotify) {
      seekSpotify(target * 1000)
    } else {
      const audio = audioRef.current
      if (audio) {
        audio.currentTime = target
      }
    }

    setProgressSeconds(target)
  }

  const handleRewind = (seconds = 10) => {
    handleSeekTo((spotifyPlayerState?.position || progressSeconds * 1000 || 0) / 1000 - seconds)
  }

  const handleForward = (seconds = 10) => {
    handleSeekTo((spotifyPlayerState?.position || progressSeconds * 1000 || 0) / 1000 + seconds)
  }

  const handlePlaybackRateChange = (nextRate) => {
    setPlaybackRate(nextRate)

    if (isSpotify) return

    const audio = audioRef.current
    if (!audio) return

    audio.playbackRate = nextRate
  }

  const handleChangeMode = (mode) => {
    setListeningMode(mode)
    setSubtitlesEnabled(false)
    if (mode !== 'active') {
      setActiveStep(1)
      setActiveChunkIndex(0)
    }
  }

  const activePage = pages[activePageIndex]
  const currentChunk = activeChunks[activeChunkIndex]

  const chunkTranscriptSegments = useMemo(() => {
    if (!currentChunk) return transcriptSegments
    if (!transcriptSegments.length) return []

    const hasTimestamps = transcriptSegments.some(
      (segment) => typeof segment.start === 'number' && typeof segment.end === 'number',
    )

    if (!hasTimestamps) return transcriptSegments

    return transcriptSegments.filter(
      (segment) =>
        typeof segment.start === 'number' &&
        typeof segment.end === 'number' &&
        segment.start >= currentChunk.start &&
        segment.start < currentChunk.end,
    )
  }, [currentChunk, transcriptSegments])

  const pauseAllAudio = async () => {
    if (isSpotify) {
      await pauseSpotify()
    } else {
      const audio = audioRef.current
      if (audio) audio.pause()
    }
  }

  const handleNextPage = async () => {
    if (!hasSeenAdvancePrompt) {
      await pauseAllAudio()
      setShowAdvanceModal(true)
      return
    }

    setActivePageIndex((prev) => Math.min(prev + 1, Math.max(pages.length - 1, 0)))
  }

  const handlePreviousPage = () => {
    setActivePageIndex((prev) => Math.max(prev - 1, 0))
  }

  const confirmAdvance = () => {
    setHasSeenAdvancePrompt(true)
    setShowAdvanceModal(false)
    setActivePageIndex((prev) => Math.min(prev + 1, Math.max(pages.length - 1, 0)))
  }

  const handleRestartChunk = () => {
    if (!currentChunk) return
    handleSeekTo(currentChunk.start)
  }

  const handleBeginFinalListen = () => {
    if (!currentChunk) return
    setActiveStep(4)
    handleSeekTo(currentChunk.start)
    if (!isPlaying) togglePlay()
  }

  useEffect(() => {
    if (listeningMode !== 'active') return
    const chunk = currentChunk
    if (!chunk) return

    if (progressSeconds < chunk.start - 0.2) {
      handleSeekTo(chunk.start)
      return
    }

    if (progressSeconds > chunk.end + 0.2) {
      handleSeekTo(chunk.end)
      return
    }

    const completionThreshold = chunk.end - 0.05
    if (progressSeconds < completionThreshold) return

    const lastCompletion = lastCompletionRef.current
    if (lastCompletion.chunkIndex === activeChunkIndex && lastCompletion.step === activeStep) return

    lastCompletionRef.current = { chunkIndex: activeChunkIndex, step: activeStep }

    if (activeStep === 1) {
      setActiveStep(2)
      handleSeekTo(chunk.start)
    } else if (activeStep === 2) {
      pauseAllAudio()
      setActiveStep(3)
      handleSeekTo(chunk.start)
    } else if (activeStep === 4) {
      setCompletedChunks((prev) => {
        const next = new Set(prev)
        next.add(activeChunkIndex)
        return next
      })

      const nextChunkIndex = Math.min(activeChunkIndex + 1, Math.max(activeChunks.length - 1, 0))
      setActiveChunkIndex(nextChunkIndex)
      setActiveStep(1)
      const nextChunk = activeChunks[nextChunkIndex]
      if (nextChunk) {
        handleSeekTo(nextChunk.start)
      }
    }
  }, [activeStep, activeChunkIndex, activeChunks, currentChunk, handleSeekTo, listeningMode, pauseAllAudio, progressSeconds])

  const cancelAdvance = () => setShowAdvanceModal(false)

  const currentIntensiveSentence =
    transcriptSentences[intensiveSentenceIndex] || 'Sentence will appear here.'

  const handleNextSentence = async () => {
    if (!transcriptSentences.length) return

    await pauseAllAudio()
    setIntensiveSentenceIndex((prev) => Math.min(prev + 1, transcriptSentences.length - 1))
  }

  const handlePreviousSentence = async () => {
    if (!transcriptSentences.length) return

    await pauseAllAudio()
    setIntensiveSentenceIndex((prev) => Math.max(prev - 1, 0))
  }

  const showPlaybackControls = isSpotify
    ? Boolean(storyMeta.spotifyUri)
    : storyMeta.audioStatus === 'ready' && storyMeta.fullAudioUrl

  const playbackProgressPercent = playbackDurationSeconds
    ? Math.min(100, (playbackPositionSeconds / playbackDurationSeconds) * 100)
    : 0

  const [activeTranscriptIndex, setActiveTranscriptIndex] = useState(-1)

  useEffect(() => {
    if (!transcriptSegments.length) {
      setActiveTranscriptIndex(-1)
      return
    }

    setActiveTranscriptIndex(() => {
      const timestampedSegments = transcriptSegments
        .map((segment, index) => ({ segment, index }))
        .filter(
          ({ segment }) =>
            Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.end > segment.start,
        )

      if (timestampedSegments.length) {
        const firstTimestamped = timestampedSegments[0]
        const lastTimestamped = timestampedSegments[timestampedSegments.length - 1]

        if (playbackPositionSeconds < firstTimestamped.segment.start) {
          return firstTimestamped.index
        }

        if (playbackPositionSeconds >= lastTimestamped.segment.end) {
          return lastTimestamped.index
        }

        const matchingSegment = timestampedSegments.find(
          ({ segment }) =>
            playbackPositionSeconds >= segment.start && playbackPositionSeconds < segment.end,
        )

        if (matchingSegment) return matchingSegment.index

        const nearestByStart = timestampedSegments.reduce((nearest, current) => {
          const nearestDelta = Math.abs(playbackPositionSeconds - nearest.segment.start)
          const currentDelta = Math.abs(playbackPositionSeconds - current.segment.start)
          return currentDelta < nearestDelta ? current : nearest
        })

        return nearestByStart.index
      }

      return -1
    })
  }, [playbackPositionSeconds, transcriptSegments])

  const chunkActiveTranscriptIndex = useMemo(() => {
    if (!chunkTranscriptSegments.length) return -1
    if (activeTranscriptIndex < 0) return -1

    const activeSegment = transcriptSegments[activeTranscriptIndex]
    if (!activeSegment) return -1

    const hasTimestamps = chunkTranscriptSegments.some(
      (segment) => typeof segment.start === 'number' && typeof segment.end === 'number',
    )

    if (!hasTimestamps) {
      const rawIndex = chunkTranscriptSegments.findIndex((segment) => segment.text === activeSegment.text)
      return rawIndex
    }

    return chunkTranscriptSegments.findIndex(
      (segment) => segment.start === activeSegment.start && segment.end === activeSegment.end,
    )
  }, [activeTranscriptIndex, chunkTranscriptSegments, transcriptSegments])

  return (
    <div
      className={`listening-lab-page listening-mode-${listeningMode} ${
        listeningMode === 'intensive' ? 'reader-intensive-active' : ''
      }`}
    >
      <div className="reader-main-shell">
        <div className="reader-hover-shell">
          <div className="reader-hover-hitbox" />
          <header className="dashboard-header reader-hover-header listening-hover-header">
            <div className="dashboard-brand-band reader-header-band listening-brand-band">
              <div className="listening-header-left">
                <button
                  className="dashboard-control ui-text reader-back-button"
                  onClick={() => navigate('/listening')}
                  type="button"
                >
                  Back to library
                </button>
              </div>
              <nav className="dashboard-nav listening-mode-nav" aria-label="Listening mode">
                {[{ id: 'extensive', label: 'Extensive' }, { id: 'active', label: 'Active' }, { id: 'intensive', label: 'Intensive' }].map(
                  (mode, index) => (
                    <div
                      key={mode.id}
                      className={`dashboard-nav-item ${listeningMode === mode.id ? 'active' : ''}`}
                    >
                      <button
                        className={`dashboard-nav-button ui-text ${
                          listeningMode === mode.id ? 'active' : ''
                        }`}
                        type="button"
                        onClick={() => handleChangeMode(mode.id)}
                      >
                        {mode.label.toUpperCase()}
                      </button>
                      {index < 2 && <span className="dashboard-nav-divider">|</span>}
                    </div>
                  ),
                )}
              </nav>
              <div className="listening-header-actions" />
            </div>
          </header>
        </div>

        <div className="reader-body-shell">
          <main className="listening-lab-main">
            <div className="listening-lab-wrapper">
              <div className={`listening-layout listening-layout--${listeningMode}`}>
            {listeningMode === 'extensive' && (
              <ExtensiveMode
                storyMeta={storyMeta}
                isPlaying={isPlaying}
                playbackPositionSeconds={playbackPositionSeconds}
                playbackDurationSeconds={playbackDurationSeconds}
                onPlayPause={togglePlay}
                onSeek={handleSeekTo}
                playbackRate={playbackRate}
                onPlaybackRateChange={handlePlaybackRateChange}
                subtitlesEnabled={subtitlesEnabled}
                onToggleSubtitles={() => setSubtitlesEnabled((prev) => !prev)}
                scrubSeconds={scrubSeconds}
                onScrubChange={setScrubSeconds}
                transcriptSegments={transcriptSegments}
                activeTranscriptIndex={activeTranscriptIndex}
                vocabEntries={vocabEntries}
                language={storyMeta.language}
                nativeLanguage={profile?.nativeLanguage}
                pageTranslations={pageTranslations}
                setPopup={setPopup}
              />
            )}

            {listeningMode === 'active' && (
              <ActiveMode
                storyMeta={storyMeta}
                chunks={activeChunks}
                activeChunkIndex={activeChunkIndex}
                completedChunks={completedChunks}
                activeStep={activeStep}
                isPlaying={isPlaying}
                playbackPositionSeconds={playbackPositionSeconds}
                playbackDurationSeconds={playbackDurationSeconds}
                scrubSeconds={scrubSeconds}
                onPlayPause={togglePlay}
                onSeek={handleSeekTo}
                playbackRate={playbackRate}
                onPlaybackRateChange={handlePlaybackRateChange}
                subtitlesEnabled={subtitlesEnabled}
                onToggleSubtitles={() => setSubtitlesEnabled((prev) => !prev)}
                transcriptSegments={chunkTranscriptSegments}
                activeTranscriptIndex={chunkActiveTranscriptIndex}
                onBeginFinalListen={handleBeginFinalListen}
                onRestartChunk={handleRestartChunk}
                onScrubChange={setScrubSeconds}
              />
            )}

            {listeningMode === 'intensive' && (
              <>
                <section className="audio-focus-zone" aria-label="Audio controls">
                  <div className="audio-cover" aria-hidden>
                    <div className="audio-cover-portrait">{storyMeta.title?.slice(0, 1) || 'A'}</div>
                  </div>
                  <div className="audio-focus-details">
                    <div className="audio-meta">
                      <h2 className="audio-title">{storyMeta.title || 'Audiobook'}</h2>
                      <p className="muted small">{storyMeta.language ? `in${storyMeta.language}` : 'Language not set'}</p>
                    </div>
                    <div className="audio-controls-row">
                      <button className="transport-btn" type="button" onClick={() => handleRewind()}>
                        −10s
                      </button>
                      <button
                        className="transport-btn transport-btn-primary"
                        type="button"
                        onClick={togglePlay}
                        disabled={!showPlaybackControls}
                      >
                        {isPlaying ? 'Pause' : 'Play'}
                      </button>
                      <button className="transport-btn" type="button" onClick={() => handleForward()}>
                        +10s
                      </button>
                      <div className="playback-speed" aria-label="Playback speed">
                        <span className="muted tiny">Speed</span>
                        <div className="speed-chips">
                          {[0.75, 1, 1.25, 1.5].map((rate) => (
                            <button
                              key={rate}
                              type="button"
                              className={`speed-chip ${playbackRate === rate ? 'active' : ''}`}
                              onClick={() => handlePlaybackRateChange(rate)}
                            >
                              {rate}x
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="audio-progress" role="presentation">
                      <div className="audio-progress-track">
                        <div
                          className="audio-progress-fill"
                          style={{ width: `${playbackProgressPercent}%` }}
                          aria-hidden
                        />
                      </div>
                      <div className="audio-progress-labels">
                        <span>{playbackPositionSeconds.toFixed(1)}s</span>
                        <span>{playbackDurationSeconds ? `${playbackDurationSeconds.toFixed(1)}s` : '—'}</span>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="listening-mode-surface">
                  {loading ? (
                    <p className="muted">Loading transcript…</p>
                  ) : error ? (
                    <p className="error">{error}</p>
                  ) : !pages.length ? (
                    <p className="muted">Transcript not available yet.</p>
                  ) : (
                    <div className="intensive-pane">
                      <div className="intensive-sentence-card">
                        <p className="muted tiny">Sentence workbench</p>
                        <div className="intensive-sentence">{currentIntensiveSentence}</div>
                        <div className="intensive-input-row">
                          <input type="text" placeholder="Type what you hear…" className="intensive-input" />
                          <div className="intensive-actions">
                            <button
                              type="button"
                              className="button ghost"
                              onClick={handlePreviousSentence}
                              disabled={intensiveSentenceIndex === 0}
                            >
                              Previous
                            </button>
                            <button
                              type="button"
                              className="button"
                              onClick={handleNextSentence}
                              disabled={intensiveSentenceIndex >= transcriptSentences.length - 1}
                            >
                              Next
                            </button>
                          </div>
                        </div>
                        <p className="muted tiny">Audio auto-pauses between sentences.</p>
                      </div>
                    </div>
                  )}
                </section>
              </>
            )}
            {!isSpotify && storyMeta.fullAudioUrl && (
              <audio ref={audioRef} src={storyMeta.fullAudioUrl} className="sr-only-audio" />
            )}
          </div>
        </div>
          </main>
        </div>
      </div>

      <IntensiveListeningMode
        listeningMode={listeningMode}
        transcriptSentences={transcriptSentences}
        transcriptSegments={transcriptSegments}
        language={storyMeta.language}
        nativeLanguage={profile?.nativeLanguage}
        vocabEntries={vocabEntries}
        setVocabEntries={setVocabEntries}
        pageTranslations={pageTranslations}
        setPopup={setPopup}
        intensiveSentenceIndex={intensiveSentenceIndex}
        setIntensiveSentenceIndex={setIntensiveSentenceIndex}
        audioRef={audioRef}
        user={user}
      />

      {popup && (
        <div
          ref={popupRef}
          className="translate-popup"
          style={{
            position: 'fixed',
            top: popupPosition.top ?? popup.y,
            left: popupPosition.left ?? popup.x,
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
                {storyMeta.language || 'Target language'}
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
              <p className="translate-popup-language-label">{profile?.nativeLanguage || 'English'}</p>
              <p className="translate-popup-language-text">{popup.translation}</p>
            </div>
          </div>

          <div className="translate-popup-status">
            {VOCAB_STATUSES.map((status) => {
              const isActive = vocabEntries[normaliseExpression(popup.word)]?.status === status

              return (
                <button
                  key={status}
                  type="button"
                  className={`translate-popup-status-button ${isActive ? 'active' : ''}`}
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

      {showAdvanceModal && (
        <div className="listening-modal-overlay" role="dialog" aria-modal="true">
          <div className="listening-modal">
            <h3>Advancing means you’re committing understanding of this page.</h3>
            <p className="muted">Placeholder modal — logic arrives later.</p>
            <div className="modal-actions">
              <button type="button" className="button ghost" onClick={cancelAdvance}>
                Cancel
              </button>
              <button type="button" className="button" onClick={confirmAdvance}>
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AudioPlayer
