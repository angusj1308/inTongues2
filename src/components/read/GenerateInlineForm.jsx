import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addDoc, collection, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { useAuth } from '../../context/AuthContext'
import { db } from '../../firebase'
import {
  buildCatalogPayload,
  createSharedAudiobookCatalogEntry,
} from '../../services/sharedAudiobooks'
import { generateShortStory } from '../../services/generator'
import { GENRES, SHORT_STORY_GENRES } from '../../services/Authors'

const LEVELS = ['Beginner', 'Intermediate', 'Native']

const AUDIO_OPTIONS = [
  { id: 'audio', label: 'Audio' },
  { id: 'text', label: 'Text only' },
]

const VOICE_OPTIONS = [
  { id: 'female', label: 'Female' },
  { id: 'male', label: 'Male' },
]

const STEP_ORDER = ['level', 'genre', 'setting', 'audio', 'voice', 'confirm']

export default function GenerateInlineForm({ activeLanguage }) {
  const navigate = useNavigate()
  const { profile, user } = useAuth()

  const initialLevel = useMemo(() => {
    const lvl = profile?.level
    return LEVELS.find((l) => l.toLowerCase() === String(lvl || '').toLowerCase()) || null
  }, [profile?.level])

  const [step, setStep] = useState('level')
  const [level, setLevel] = useState(initialLevel)
  const [genreId, setGenreId] = useState(null)
  const [setting, setSetting] = useState('')
  const [audio, setAudio] = useState(null) // 'audio' | 'text'
  const [voice, setVoice] = useState(null) // 'female' | 'male'

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const settingInputRef = useRef(null)
  const prevStepRef = useRef(step)
  const [stepDirection, setStepDirection] = useState('')

  useEffect(() => {
    const prev = prevStepRef.current
    if (prev !== step) {
      const prevIdx = STEP_ORDER.indexOf(prev)
      const nextIdx = STEP_ORDER.indexOf(step)
      if (prevIdx >= 0 && nextIdx >= 0) {
        setStepDirection(nextIdx > prevIdx ? 'right' : 'left')
      }
      prevStepRef.current = step
    }
    if (step === 'setting' && settingInputRef.current) {
      settingInputRef.current.focus()
    }
  }, [step])

  const genreLabel = useMemo(
    () => GENRES.find((g) => g.id === genreId)?.label || '',
    [genreId],
  )

  const advance = (next) => setStep(next)

  const resetFrom = (target) => {
    const idx = STEP_ORDER.indexOf(target)
    if (idx < 0) return
    if (idx <= STEP_ORDER.indexOf('genre')) setGenreId(null)
    if (idx <= STEP_ORDER.indexOf('setting')) setSetting('')
    if (idx <= STEP_ORDER.indexOf('audio')) setAudio(null)
    if (idx <= STEP_ORDER.indexOf('voice')) setVoice(null)
    setStep(target)
  }

  const handleLevelPick = (value) => {
    setLevel(value)
    advance('genre')
  }

  const handleGenrePick = (value) => {
    setGenreId(value)
    advance('setting')
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
    if (!level || !genreId) return
    setError('')
    setIsSubmitting(true)

    const generateAudio = audio === 'audio'
    const voiceGender = generateAudio ? voice : null
    const genreLabelText = GENRES.find((g) => g.id === genreId)?.label || genreId

    // Create a placeholder doc immediately so the tile appears in the library,
    // then fire the generation in the background.
    try {
      const storiesRef = collection(db, 'users', user.uid, 'stories')
      const storyDocRef = await addDoc(storiesRef, {
        title: `${genreLabelText} Short Story`,
        storyTitle: '',
        author: 'inTongues',
        language: activeLanguage,
        level,
        genre: genreLabelText,
        description: setting.trim(),
        concept: '',
        isFlat: true,
        adaptedTextBlob: '',
        lastPhaseCompleted: 0,
        totalPhases: 2,
        status: 'generating',
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

      // Navigate to library immediately — tile shows "Generating..." spinner
      setIsSubmitting(false)
      navigate('/read/library')

      // Background: generate the story, then update the doc
      const uid = user.uid
      const storyId = storyDocRef.id
      const storyDocPath = doc(db, 'users', uid, 'stories', storyId)
      const capturedGenreId = genreId
      const capturedSetting = setting.trim()
      const capturedLanguage = activeLanguage
      const capturedLevel = level
      const capturedGenerateAudio = generateAudio

      generateShortStory({
        genre: capturedGenreId,
        timePlaceSetting: capturedSetting,
        language: capturedLanguage,
        level: capturedLevel,
      })
        .then(async (storyResult) => {
          await setDoc(storyDocPath, {
            title: storyResult.storyTitle || `${genreLabelText} Short Story`,
            storyTitle: storyResult.storyTitle || '',
            author: 'inTongues',
            adaptedTextBlob: storyResult.storyText,
            lastPhaseCompleted: 2,
            status: 'ready',
          }, { merge: true })

          // Shared catalogue
          try {
            const sharedId = await createSharedAudiobookCatalogEntry(
              buildCatalogPayload({
                kind: 'generated',
                sourceType: 'generated',
                sourceId: storyId,
                title: storyResult.storyTitle || `${genreLabelText} Short Story`,
                author: 'inTongues',
                language: capturedLanguage,
                level: capturedLevel,
                genre: genreLabelText,
                description: capturedSetting,
                isFlat: true,
                createdByUid: uid,
              }),
            )
            if (sharedId) {
              setDoc(storyDocPath, { sharedAudiobookId: sharedId }, { merge: true })
                .catch((linkErr) => console.warn('sharedAudiobookId link failed', linkErr?.message || linkErr))
            }
          } catch (catalogErr) {
            console.warn('Shared catalogue write failed', catalogErr?.message || catalogErr)
          }

          // Trigger audio
          if (capturedGenerateAudio) {
            fetch('http://localhost:4000/api/generate-audio-book', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ uid, storyId }),
            }).catch((err) => console.error('Audio trigger failed:', err))
          }

          // Trigger synopsis
          fetch('http://localhost:4000/api/generate-synopsis', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid, storyId }),
          }).catch((err) => console.error('Synopsis trigger failed:', err))

          // Trigger cover
          fetch('http://localhost:4000/api/generate-cover', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid, storyId }),
          }).catch((err) => console.error('Cover trigger failed:', err))
        })
        .catch(async (genError) => {
          console.error('Short story generation failed:', genError)
          await setDoc(storyDocPath, {
            status: 'failed',
            adaptationError: genError?.message || 'Story generation failed',
          }, { merge: true })
        })
    } catch (submissionError) {
      setError(submissionError?.message || 'Unable to save story.')
      setIsSubmitting(false)
    }
  }

  const breadcrumbs = []
  const completed = STEP_ORDER.indexOf(step)
  if (level && completed > STEP_ORDER.indexOf('level')) {
    breadcrumbs.push({ key: 'level', label: level })
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
    if (step === 'genre') {
      return (
        <>
          <h3 className="genq-heading">Which genre?</h3>
          <div className="genq-options genq-options--grid">
            {SHORT_STORY_GENRES.map((g) => (
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
      const handleSettingKeyDown = (e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          if (setting.trim()) advance('audio')
        }
      }
      return (
        <>
          <h3 className="genq-heading">Describe story setting</h3>
          <div className="genq-setting-form">
            <textarea
              ref={settingInputRef}
              className="genq-textarea"
              placeholder="Where and when does your story take place?"
              value={setting}
              onChange={(e) => setSetting(e.target.value)}
              onKeyDown={handleSettingKeyDown}
              rows={5}
            />
            <button
              type="button"
              className="genq-continue-link"
              onClick={() => setting.trim() && advance('audio')}
              disabled={!setting.trim()}
            >
              Continue <span aria-hidden="true">→</span>
            </button>
          </div>
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
            short story for{' '}
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
        <div
          key={step}
          className={`genq-step ${
            stepDirection === 'right'
              ? 'slide-in-right'
              : stepDirection === 'left'
                ? 'slide-in-left'
                : ''
          }`}
        >
          {renderStep()}
        </div>
      </div>
    </div>
  )
}
