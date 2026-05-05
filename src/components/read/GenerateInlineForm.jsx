import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { useAuth } from '../../context/AuthContext'
import { db } from '../../firebase'
import {
  generateShortStory,
  generateNovelConcept,
  generateChapterSummaries,
} from '../../services/generator'
import { GENRES, SHORT_STORY_GENRES, NOVEL_GENRES } from '../../services/Authors'

const LEVELS = ['Beginner', 'Intermediate', 'Native']

const LENGTHS = [
  { id: 'short', label: 'Short Story', sub: '5–15 pages' },
  { id: 'novella', label: 'Novella', sub: '50–100 pages' },
  { id: 'novel', label: 'Novel', sub: '250–330 pages' },
]

const AUDIO_OPTIONS = [
  { id: 'audio', label: 'Audio' },
  { id: 'text', label: 'Text only' },
]

const VOICE_OPTIONS = [
  { id: 'female', label: 'Female' },
  { id: 'male', label: 'Male' },
]

const STEP_ORDER = ['level', 'length', 'genre', 'setting', 'audio', 'voice', 'confirm']

const baseCost = (lengthId) =>
  lengthId === 'short' ? 1 : lengthId === 'novella' ? 5 : 15

export default function GenerateInlineForm({ activeLanguage }) {
  const navigate = useNavigate()
  const { profile, user } = useAuth()

  const initialLevel = useMemo(() => {
    const lvl = profile?.level
    return LEVELS.find((l) => l.toLowerCase() === String(lvl || '').toLowerCase()) || null
  }, [profile?.level])

  const [step, setStep] = useState('level')
  const [level, setLevel] = useState(initialLevel)
  const [lengthId, setLengthId] = useState(null)
  const [genreId, setGenreId] = useState(null)
  const [setting, setSetting] = useState('')
  const [audio, setAudio] = useState(null) // 'audio' | 'text'
  const [voice, setVoice] = useState(null) // 'female' | 'male'

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const settingInputRef = useRef(null)

  useEffect(() => {
    if (step === 'setting' && settingInputRef.current) {
      settingInputRef.current.focus()
    }
  }, [step])

  const genrePool =
    lengthId === 'short' || !lengthId ? SHORT_STORY_GENRES : NOVEL_GENRES
  const genreLabel = useMemo(
    () => GENRES.find((g) => g.id === genreId)?.label || '',
    [genreId],
  )
  const lengthLabel = useMemo(
    () => LENGTHS.find((l) => l.id === lengthId)?.label || '',
    [lengthId],
  )
  const credits =
    (lengthId ? baseCost(lengthId) : 0) + (audio === 'audio' ? 2 : 0)

  const advance = (next) => setStep(next)

  const resetFrom = (target) => {
    const idx = STEP_ORDER.indexOf(target)
    if (idx < 0) return
    if (idx <= STEP_ORDER.indexOf('length')) {
      setLengthId(null)
      setGenreId(null)
    }
    if (idx <= STEP_ORDER.indexOf('genre')) setGenreId(null)
    if (idx <= STEP_ORDER.indexOf('setting')) setSetting('')
    if (idx <= STEP_ORDER.indexOf('audio')) setAudio(null)
    if (idx <= STEP_ORDER.indexOf('voice')) setVoice(null)
    setStep(target)
  }

  const handleLevelPick = (value) => {
    setLevel(value)
    advance('length')
  }

  const handleLengthPick = (value) => {
    setLengthId(value)
    const pool = value === 'short' ? SHORT_STORY_GENRES : NOVEL_GENRES
    if (genreId && !pool.some((g) => g.id === genreId)) {
      setGenreId(null)
    }
    advance('genre')
  }

  const handleGenrePick = (value) => {
    setGenreId(value)
    advance('setting')
  }

  const handleSettingSubmit = (e) => {
    e?.preventDefault?.()
    if (!setting.trim()) return
    advance('audio')
  }

  const handleAudioPick = (value) => {
    setAudio(value)
    if (value === 'text') {
      setVoice(null)
      advance('confirm')
    } else {
      advance('voice')
    }
  }

  const handleVoicePick = (value) => {
    setVoice(value)
    advance('confirm')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!activeLanguage || !user || isSubmitting) return
    if (!level || !lengthId || !genreId) return
    setError('')
    setIsSubmitting(true)

    const generateAudio = audio === 'audio'
    const voiceGender = generateAudio ? voice : null
    const isNovelPipeline = lengthId === 'novella' || lengthId === 'novel'
    const genreLabelText = GENRES.find((g) => g.id === genreId)?.label || genreId

    if (isNovelPipeline) {
      const novelFormat = lengthId
      let novelConcept = null
      let novelAuthor = null
      let novelTitle = null
      try {
        const conceptResult = await generateNovelConcept({
          genre: genreId,
          format: novelFormat,
          timePlaceSetting: setting.trim(),
        })
        novelConcept = conceptResult.concept
        novelAuthor = conceptResult.authorName
        novelTitle = conceptResult.title
      } catch (conceptError) {
        setError(conceptError?.message || 'Unable to generate novel concept.')
        setIsSubmitting(false)
        return
      }

      let chapterSummaries = null
      try {
        const summariesResult = await generateChapterSummaries({
          authorName: novelAuthor,
          format: novelFormat,
          language: activeLanguage,
          concept: novelConcept,
        })
        chapterSummaries = summariesResult.chapterSummaries
      } catch (summariesError) {
        setError(summariesError?.message || 'Unable to generate chapter summaries.')
        setIsSubmitting(false)
        return
      }

      const chapterHeaderMatches =
        chapterSummaries.match(
          /^(?:#{1,3}\s*)?(?:\*{0,2})?\s*(?:Chapter|Cap[ií]tulo|Chapitre|Kapitel)\s+\d+\s*[:\-–—.]/gim,
        ) || []
      const numberedMatches =
        chapterSummaries.match(/^(?:#{1,3}\s*)?(?:\*{0,2})?\s*\d+\.\s+\S/gim) || []
      const parsedTotalChapters =
        chapterHeaderMatches.length || numberedMatches.length

      try {
        const generatedBooksRef = collection(db, 'users', user.uid, 'generatedBooks')
        await addDoc(generatedBooksRef, {
          status: 'outline_complete',
          title: novelTitle || `${genreLabelText} ${novelFormat}`,
          author: novelAuthor,
          genre: genreLabelText,
          concept: novelConcept,
          chapterSummaries,
          totalChapters: parsedTotalChapters,
          chaptersGenerated: 0,
          level,
          lengthPreset: lengthId,
          language: activeLanguage,
          generateAudio,
          styleKey: null,
          description: setting.trim(),
          createdAt: serverTimestamp(),
        })
        navigate('/dashboard', { state: { initialTab: 'read' } })
      } catch (storeError) {
        setError(storeError?.message || 'Unable to save novel.')
        setIsSubmitting(false)
      }
      return
    }

    let storyResult = null
    try {
      storyResult = await generateShortStory({
        genre: genreId,
        timePlaceSetting: setting.trim(),
        language: activeLanguage,
        level,
      })
    } catch (genError) {
      setError(genError?.message || 'Unable to generate short story.')
      setIsSubmitting(false)
      return
    }

    try {
      const storiesRef = collection(db, 'users', user.uid, 'stories')
      const storyDocRef = await addDoc(storiesRef, {
        title: storyResult.storyTitle || `${genreLabelText} Short Story`,
        storyTitle: storyResult.storyTitle || '',
        author: storyResult.authorName,
        language: activeLanguage,
        level,
        genre: genreLabelText,
        description: setting.trim(),
        concept: '',
        isFlat: true,
        adaptedTextBlob: storyResult.storyText,
        lastPhaseCompleted: 2,
        totalPhases: 2,
        status: 'ready',
        createdAt: serverTimestamp(),
        generateAudio,
        voiceGender,
        hasFullAudio: false,
        audioStatus: generateAudio ? 'pending' : 'none',
        fullAudioUrl: null,
        voiceId: null,
        coverUrl: null,
        coverStatus: 'pending',
      })

      if (generateAudio) {
        try {
          await fetch('http://localhost:4000/api/generate-audio-book', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid: user.uid, storyId: storyDocRef.id }),
          })
        } catch (audioErr) {
          console.error('Audio trigger failed:', audioErr)
        }
      }

      try {
        fetch('http://localhost:4000/api/generate-synopsis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: user.uid, storyId: storyDocRef.id }),
        }).catch((synErr) => console.error('Synopsis trigger failed:', synErr))
      } catch (synErr) {
        console.error('Synopsis trigger failed:', synErr)
      }

      try {
        fetch('http://localhost:4000/api/generate-cover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: user.uid, storyId: storyDocRef.id }),
        }).catch((coverErr) => console.error('Cover trigger failed:', coverErr))
      } catch (coverErr) {
        console.error('Cover trigger failed:', coverErr)
      }

      navigate('/dashboard', { state: { initialTab: 'read' } })
    } catch (submissionError) {
      setError(submissionError?.message || 'Unable to save story.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const breadcrumbs = []
  const completed = STEP_ORDER.indexOf(step)
  if (level && completed > STEP_ORDER.indexOf('level')) {
    breadcrumbs.push({ key: 'level', label: level })
  }
  if (lengthId && completed > STEP_ORDER.indexOf('length')) {
    breadcrumbs.push({ key: 'length', label: lengthLabel })
  }
  if (genreId && completed > STEP_ORDER.indexOf('genre')) {
    breadcrumbs.push({ key: 'genre', label: genreLabel })
  }
  if (setting.trim() && completed > STEP_ORDER.indexOf('setting')) {
    const trimmed = setting.trim()
    const display = trimmed.length > 28 ? `${trimmed.slice(0, 26)}…` : trimmed
    breadcrumbs.push({ key: 'setting', label: display })
  }
  if (audio && completed > STEP_ORDER.indexOf('audio')) {
    breadcrumbs.push({ key: 'audio', label: audio === 'audio' ? 'Audio' : 'Text only' })
  }
  if (voice && completed > STEP_ORDER.indexOf('voice')) {
    breadcrumbs.push({ key: 'voice', label: voice === 'female' ? 'Female' : 'Male' })
  }

  const renderStep = () => {
    if (step === 'level') {
      return (
        <>
          <h3 className="genq-heading">What's your level?</h3>
          <div className="genq-options genq-options--stack">
            {LEVELS.map((value) => (
              <button
                key={value}
                type="button"
                className="genq-option"
                onClick={() => handleLevelPick(value)}
              >
                <span className="genq-option-label">{value}</span>
              </button>
            ))}
          </div>
        </>
      )
    }
    if (step === 'length') {
      return (
        <>
          <h3 className="genq-heading">How long?</h3>
          <div className="genq-options genq-options--stack">
            {LENGTHS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className="genq-option genq-option--stacked"
                onClick={() => handleLengthPick(opt.id)}
              >
                <span className="genq-option-label">{opt.label}</span>
                <span className="genq-option-sub">{opt.sub}</span>
              </button>
            ))}
          </div>
        </>
      )
    }
    if (step === 'genre') {
      return (
        <>
          <h3 className="genq-heading">Which genre?</h3>
          <div className="genq-options genq-options--grid">
            {genrePool.map((g) => (
              <button
                key={g.id}
                type="button"
                className="genq-option genq-option--compact"
                onClick={() => handleGenrePick(g.id)}
              >
                <span className="genq-option-label">{g.label}</span>
              </button>
            ))}
          </div>
        </>
      )
    }
    if (step === 'setting') {
      return (
        <>
          <h3 className="genq-heading">Where and when?</h3>
          <form className="genq-setting-form" onSubmit={handleSettingSubmit}>
            <input
              ref={settingInputRef}
              type="text"
              className="genq-input"
              placeholder="A villa in 1962 Sicily…"
              value={setting}
              onChange={(e) => setSetting(e.target.value)}
            />
            <button
              type="submit"
              className="genq-continue"
              disabled={!setting.trim()}
            >
              Continue →
            </button>
          </form>
        </>
      )
    }
    if (step === 'audio') {
      return (
        <>
          <h3 className="genq-heading">Audio narration?</h3>
          <div className="genq-options genq-options--stack">
            {AUDIO_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className="genq-option"
                onClick={() => handleAudioPick(opt.id)}
              >
                <span className="genq-option-label">{opt.label}</span>
              </button>
            ))}
          </div>
        </>
      )
    }
    if (step === 'voice') {
      return (
        <>
          <h3 className="genq-heading">Whose voice?</h3>
          <div className="genq-options genq-options--stack">
            {VOICE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className="genq-option"
                onClick={() => handleVoicePick(opt.id)}
              >
                <span className="genq-option-label">{opt.label}</span>
              </button>
            ))}
          </div>
        </>
      )
    }
    if (step === 'confirm') {
      return (
        <>
          <h3 className="genq-heading">Ready to generate?</h3>
          <p className="genq-summary">
            A <span className="genq-summary-key">{genreLabel.toLowerCase()}</span>{' '}
            <span className="genq-summary-key">{lengthLabel.toLowerCase()}</span> for{' '}
            <span className="genq-summary-key">{level?.toLowerCase()}</span> level, set in{' '}
            <span className="genq-summary-key">{setting.trim()}</span>
            {audio === 'audio' && voice && (
              <>
                {', with '}
                <span className="genq-summary-key">{voice} narration</span>
              </>
            )}
            .
          </p>
          <div className="genq-spacer" />
          <div className="genq-action-row">
            <div className="genq-cost">
              <span className="genq-cost-label">Cost</span>
              <span className="genq-cost-value">{credits} credits</span>
            </div>
            <button
              type="button"
              className="genq-generate"
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Generating…' : 'Generate →'}
            </button>
          </div>
          {error && <p className="genq-error">{error}</p>}
        </>
      )
    }
    return null
  }

  return (
    <div className="genq-card">
      <div className="genq-breadcrumbs" aria-label="Progress">
        {breadcrumbs.map((b) => (
          <button
            key={b.key}
            type="button"
            className="genq-breadcrumb"
            onClick={() => resetFrom(b.key)}
          >
            {b.label}
          </button>
        ))}
      </div>
      <div className="genq-body">
        {renderStep()}
      </div>
    </div>
  )
}
