import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

const getDisplayText = (page) => page?.adaptedText || page?.originalText || page?.text || ''

const AudioPlayer = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const location = useLocation()
  const audioRef = useRef(null)
  const pronunciationAudioRef = useRef(null)

  const searchParams = new URLSearchParams(location.search)
  const source = searchParams.get('source')
  const isSpotify = source === 'spotify'

  const [pages, setPages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pageTranslations, setPageTranslations] = useState({})
  const [popup, setPopup] = useState(null)
  const [vocabEntries, setVocabEntries] = useState({})
  const [isPlaying, setIsPlaying] = useState(false)
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

      try {
        const response = await fetch('http://localhost:4000/api/translatePhrase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phrase,
            sourceLang: storyMeta.language || 'es',
            targetLang: profile?.nativeLanguage || 'English',
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

  useEffect(() => {
    if (isSpotify) return undefined

    const audio = audioRef.current
    if (!audio) return undefined

    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)

    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('ended', handlePause)

    return () => {
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('ended', handlePause)
    }
  }, [isSpotify, storyMeta.fullAudioUrl])

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

  const handleRewind = (seconds = 10) => {
    if (isSpotify) {
      const positionMs = spotifyPlayerState?.position || 0
      const nextPosition = Math.max(0, positionMs - seconds * 1000)
      seekSpotify(nextPosition)
      return
    }

    const audio = audioRef.current
    if (!audio) return

    audio.currentTime = Math.max(0, (audio.currentTime || 0) - seconds)
  }

  const showPlaybackControls = isSpotify
    ? Boolean(storyMeta.spotifyUri)
    : storyMeta.audioStatus === 'ready' && storyMeta.fullAudioUrl

  const playbackPositionSeconds = isSpotify
    ? (spotifyPlayerState?.position || 0) / 1000
    : audioRef.current?.currentTime || 0

  const playbackDurationSeconds = isSpotify
    ? (spotifyPlayerState?.duration || 0) / 1000
    : audioRef.current?.duration || 0

  return (
    <div className="page">
      <div className="card dashboard-card">
        <div className="page-header">
          <div>
            <h1>{storyMeta.title || 'Audiobook'}</h1>
            <p className="muted small">Listen while reviewing the full transcript.</p>
          </div>
          <button className="button ghost" onClick={() => navigate('/listening')}>
            Back to listening library
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.75rem',
            gap: '0.5rem',
            flexWrap: 'wrap',
          }}
        >
          <div className="pill-row" style={{ gap: '0.5rem', alignItems: 'center' }}>
            {storyMeta.language && <span className="pill primary">in{storyMeta.language}</span>}
            {isSpotify ? (
              <span className="pill" style={{ background: '#dcfce7', color: '#166534' }}>
                Spotify playback
              </span>
            ) : (
              <span
                className="pill"
                style={{
                  background:
                    storyMeta.audioStatus === 'ready'
                      ? '#dcfce7'
                      : storyMeta.audioStatus === 'processing'
                        ? '#fef9c3'
                        : '#e2e8f0',
                  color:
                    storyMeta.audioStatus === 'ready'
                      ? '#166534'
                      : storyMeta.audioStatus === 'processing'
                        ? '#854d0e'
                        : '#0f172a',
                }}
              >
                {storyMeta.audioStatus === 'ready'
                  ? 'Audio Ready'
                  : storyMeta.audioStatus === 'processing'
                    ? 'Audio Processing…'
                    : 'No Audio'}
              </span>
            )}
          </div>
        </div>

        {showPlaybackControls && (
          <div className="section" style={{ position: 'sticky', bottom: 0, background: '#f8fafc', zIndex: 2 }}>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button className="button ghost" onClick={() => handleRewind()}>
                ⏪ Rewind 10s
              </button>
              <button className="button ghost" onClick={togglePlay}>
                {isPlaying ? 'Pause' : 'Play'}
              </button>
            </div>
            {isSpotify ? (
              <p className="muted small" style={{ textAlign: 'center' }}>
                Playing from Spotify — {playbackPositionSeconds.toFixed(1)}s /{' '}
                {playbackDurationSeconds.toFixed(1)}s
              </p>
            ) : (
              <audio
                ref={audioRef}
                src={storyMeta.fullAudioUrl}
                style={{ width: '100%', marginTop: '0.5rem' }}
                controls
              />
            )}
          </div>
        )}

        {loading ? (
          <p className="muted">Loading transcript…</p>
        ) : error ? (
          <p className="error">{error}</p>
        ) : pages.length ? (
            <div className="preview-card">
              <div className="section-header">
                <div className="pill-row">{storyMeta.language && <span className="pill primary">in{storyMeta.language}</span>}</div>
              </div>
            <div
              className="page-text"
              onMouseUp={handleWordClick}
              style={{ cursor: 'pointer', userSelect: 'text', whiteSpace: 'pre-wrap' }}
            >
              {renderHighlightedText(transcriptText)}
            </div>
          </div>
        ) : (
          <p className="muted">Transcript not available yet.</p>
        )}
      </div>
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
          <div
            style={{
              marginTop: '4px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <span>{popup.translation}</span>
            {(popup.audioBase64 || popup.audioUrl) && (
              <button
                type="button"
                aria-label="Play pronunciation"
                onClick={() => playPronunciationAudio(popup)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                🔊
              </button>
            )}
          </div>

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
                backgroundColor: '#001f3f',
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
                backgroundColor: '#800000',
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
                backgroundColor: '#0b3d0b',
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
                backgroundColor: '#000000',
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

export default AudioPlayer
