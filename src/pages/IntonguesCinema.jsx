import { useEffect, useMemo, useRef, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import YouTubePlayer from '../components/YouTubePlayer'
import CinemaSubtitles from '../components/CinemaSubtitles'
import { VOCAB_STATUSES, loadUserVocab, normaliseExpression, upsertVocabEntry } from '../services/vocab'

const extractVideoId = (video) => {
  if (!video) return ''
  if (video.videoId) return video.videoId

  if (video.youtubeUrl) {
    try {
      const parsed = new URL(video.youtubeUrl)
      if (parsed.searchParams.get('v')) {
        return parsed.searchParams.get('v')
      }
    } catch (err) {
      return ''
    }
  }

  return ''
}

const IntonguesCinema = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, profile } = useAuth()

  const [video, setVideo] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [playbackStatus, setPlaybackStatus] = useState({ currentTime: 0, duration: 0, isPlaying: false })
  const [transcript, setTranscript] = useState([])
  const [transcriptError, setTranscriptError] = useState('')
  const [transcriptLoading, setTranscriptLoading] = useState(false)
  const [vocabEntries, setVocabEntries] = useState({})
  const [translations, setTranslations] = useState({})
  const [popup, setPopup] = useState(null)

  const playerRef = useRef(null)

  useEffect(() => {
    if (!user || !id) {
      setError('Unable to load this video right now.')
      setLoading(false)
      return
    }

    const loadVideo = async () => {
      setLoading(true)
      try {
        const videoRef = doc(db, 'users', user.uid, 'youtubeVideos', id)
        const videoSnap = await getDoc(videoRef)

        if (!videoSnap.exists()) {
          setError('This YouTube video was not found in your library.')
          setVideo(null)
          return
        }

        setVideo({ id: videoSnap.id, ...videoSnap.data() })
        setError('')
      } catch (err) {
        console.error('Failed to load YouTube video', err)
        setError('Unable to load this video right now.')
      } finally {
        setLoading(false)
      }
    }

    loadVideo()
  }, [id, user])

  const videoId = useMemo(() => extractVideoId(video), [video])
  const transcriptLanguage = useMemo(
    () => (video?.language || profile?.lastUsedLanguage || 'auto').toLowerCase(),
    [profile?.lastUsedLanguage, video?.language]
  )

  useEffect(() => {
    if (!videoId) return

    let isCancelled = false
    const transcriptId = `${videoId}_${transcriptLanguage || 'auto'}`

    const loadTranscript = async () => {
      setTranscriptLoading(true)
      setTranscriptError('')
      setTranscript([])
      setTranslations({})

      try {
        const transcriptRef = doc(db, 'videoTranscripts', transcriptId)
        const cached = await getDoc(transcriptRef)

        if (!isCancelled && cached.exists()) {
          const data = cached.data()
          setTranscript(data?.segments || [])
          return
        }

        const response = await fetch('http://localhost:4000/api/youtube/transcript', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoId, language: transcriptLanguage || 'auto' }),
        })

        if (!response.ok) {
          const message = await response.text()
          throw new Error(message || 'Failed to fetch subtitles')
        }

        const data = await response.json()

        if (!isCancelled) {
          setTranscript(data?.segments || [])

          const latest = await getDoc(transcriptRef)
          if (latest.exists()) {
            setTranscript(latest.data()?.segments || data?.segments || [])
          }
        }
      } catch (err) {
        console.error('Failed to load subtitles', err)
        if (!isCancelled) {
          setTranscriptError('Unable to load subtitles right now.')
        }
      } finally {
        if (!isCancelled) {
          setTranscriptLoading(false)
        }
      }
    }

    loadTranscript()

    return () => {
      isCancelled = true
    }
  }, [db, transcriptLanguage, videoId])

  useEffect(() => {
    if (!user || !transcriptLanguage) return

    let isMounted = true

    const fetchVocab = async () => {
      try {
        const entries = await loadUserVocab(user.uid, transcriptLanguage)
        if (isMounted) {
          setVocabEntries(entries)
        }
      } catch (err) {
        console.error('Failed to load vocabulary entries', err)
      }
    }

    fetchVocab()

    return () => {
      isMounted = false
    }
  }, [transcriptLanguage, user])

  useEffect(() => {
    if (!transcript?.length) return

    const words = Array.from(
      new Set(
        transcript
          .map((segment) => segment.text || '')
          .join(' ')
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
            languageCode: transcriptLanguage || 'auto',
            targetLang: profile?.nativeLanguage || 'English',
            words,
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          console.error('Failed to prefetch subtitle translations', await response.text())
          return
        }

        const data = await response.json()
        setTranslations(data.translations || {})
      } catch (prefetchError) {
        if (prefetchError.name !== 'AbortError') {
          console.error('Error prefetching subtitle translations', prefetchError)
        }
      }
    }

    prefetch()

    return () => controller.abort()
  }, [profile?.nativeLanguage, transcript, transcriptLanguage])

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

  async function handleSubtitleWordClick(e) {
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

      try {
        const response = await fetch('http://localhost:4000/api/translatePhrase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phrase,
            sourceLang: transcriptLanguage || 'auto',
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

    const clean = selection.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase()
    if (!clean) return

    const translation = translations[clean] || translations[selection] || 'No translation found'

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
    if (!user || !transcriptLanguage || !popup?.word) return
    if (!VOCAB_STATUSES.includes(status)) return

    try {
      await upsertVocabEntry(user.uid, transcriptLanguage, popup.word, popup.translation, status)

      setVocabEntries((prev) => ({
        ...prev,
        [normaliseExpression(popup.word)]: {
          ...(prev[normaliseExpression(popup.word)] || {}),
          text: popup.word,
          language: transcriptLanguage,
          status,
        },
      }))

      setPopup(null)
    } catch (err) {
      console.error('Failed to update vocab status', err)
    }
  }

  const formatTime = (seconds) => {
    if (!seconds || Number.isNaN(seconds)) return '0:00'
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = Math.floor(seconds % 60)
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  return (
    <div className="page">
      <div className="card dashboard-card">
        <div className="page-header">
          <div>
            <h1>inTongues Cinema</h1>
            <p className="muted small">Watch your imported YouTube videos with subtitles.</p>
          </div>
          <button className="button ghost" onClick={() => navigate('/listening')}>
            Back to listening library
          </button>
        </div>

        {loading ? (
          <p className="muted">Loading video…</p>
        ) : error ? (
          <p className="error">{error}</p>
        ) : !video ? (
          <p className="muted">Video unavailable.</p>
        ) : (
          <div className="section">
            <div className="section-header">
              <div>
                <h3>{video.title || 'Untitled video'}</h3>
                <p className="muted small">Sourced from YouTube</p>
              </div>
              {video.youtubeUrl && (
                <a className="button ghost" href={video.youtubeUrl} target="_blank" rel="noreferrer">
                  Open on YouTube
                </a>
              )}
            </div>

            {videoId ? (
              <div className="video-frame" style={{ position: 'relative', paddingTop: '56.25%' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
                  <YouTubePlayer
                    ref={playerRef}
                    videoId={videoId}
                    onStatus={(status) => setPlaybackStatus(status)}
                  />
                </div>
              </div>
            ) : (
              <p className="error">This video cannot be embedded.</p>
            )}

            <div
              className="card"
              style={{
                marginTop: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button className="button" onClick={() => playerRef.current?.playVideo?.()}>
                  Play
                </button>
                <button className="button ghost" onClick={() => playerRef.current?.pauseVideo?.()}>
                  Pause
                </button>
              </div>
              <p className="muted small" style={{ margin: 0 }}>
                {formatTime(playbackStatus.currentTime)} / {formatTime(playbackStatus.duration)}
              </p>
            </div>
            {transcriptLoading && (
              <p className="muted small" style={{ marginTop: '1rem' }}>
                Preparing subtitles for this video…
              </p>
            )}

            {transcriptError && (
              <p className="error" style={{ marginTop: '1rem' }}>
                {transcriptError}
              </p>
            )}

            <CinemaSubtitles
              transcript={transcript}
              currentTime={playbackStatus.currentTime}
              renderHighlightedText={renderHighlightedText}
              onWordSelect={handleSubtitleWordClick}
            />

            <p className="muted small">
              Current time: {playbackStatus.currentTime.toFixed(1)}s / {playbackStatus.duration.toFixed(1)}s —{' '}
              {playbackStatus.isPlaying ? 'Playing' : 'Paused'}
            </p>
          </div>
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

export default IntonguesCinema
