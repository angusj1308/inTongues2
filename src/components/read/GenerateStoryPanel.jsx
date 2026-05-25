import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addDoc, collection, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import {
  filterSupportedLanguages,
  resolveSupportedLanguageLabel,
} from '../../constants/languages'
import { useAuth } from '../../context/AuthContext'
import { db } from '../../firebase'
import { generateShortStory } from '../../services/generator'
import { GENRES, SHORT_STORY_GENRES } from '../../services/Authors'
import {
  buildCatalogPayload,
  createSharedAudiobookCatalogEntry,
} from '../../services/sharedAudiobooks'

const LEVELS = ['Beginner', 'Intermediate', 'Native']

// Target language translations for modal title
const GENERATE_TITLES = {
  Spanish: 'Generar',
  French: 'Générer',
  Italian: 'Generare',
  Russian: 'Создать',
  English: 'Generate',
}

const GenerateStoryPanel = ({
  activeLanguage: activeLanguageProp = '',
  languageParam = '',
  headingLevel = 'h2',
  onBack,
  onClose,
  isModal = false,
}) => {
  const navigate = useNavigate()
  const { profile, setLastUsedLanguage, user } = useAuth()

  const [levelIndex, setLevelIndex] = useState(0)
  const [genre, setGenre] = useState('thriller')
  const [description, setDescription] = useState('')
  const [generateAudio, setGenerateAudio] = useState(false)
  const [voiceGender, setVoiceGender] = useState('male')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const availableLanguages = useMemo(
    () => filterSupportedLanguages(profile?.myLanguages || []),
    [profile?.myLanguages],
  )

  const activeLanguage = useMemo(() => {
    if (activeLanguageProp) return resolveSupportedLanguageLabel(activeLanguageProp, '')
    if (languageParam) {
      const resolved = resolveSupportedLanguageLabel(languageParam, '')
      return availableLanguages.includes(resolved) ? resolved : ''
    }
    if (profile?.lastUsedLanguage) return resolveSupportedLanguageLabel(profile.lastUsedLanguage, '')
    if (availableLanguages.length) return availableLanguages[0]
    return ''
  }, [activeLanguageProp, availableLanguages, languageParam, profile?.lastUsedLanguage])

  const lockedLanguageUnavailable =
    languageParam && !availableLanguages.includes(resolveSupportedLanguageLabel(languageParam, ''))
  const languageError = lockedLanguageUnavailable
    ? 'The selected language is not available in your account.'
    : ''

  useEffect(() => {
    if (profile && !availableLanguages.length && !isModal) {
      navigate('/select-language')
    }
  }, [availableLanguages.length, navigate, profile, isModal])

  useEffect(() => {
    if (activeLanguage) {
      setLastUsedLanguage(activeLanguage)
    }
  }, [activeLanguage, setLastUsedLanguage])

  const HeadingTag = useMemo(() => headingLevel || 'h2', [headingLevel])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!activeLanguage || !user) {
      setError('Select a valid language before generating a story.')
      return
    }

    setError('')
    setIsSubmitting(true)

    // ── Single-call short story generation (GPT-5.4-pro) ──
    // Create a placeholder doc immediately so the tile appears in the library,
    // then fire the generation in the background.
    const selectedLevel = LEVELS[levelIndex]
    const genreLabel = GENRES.find((g) => g.id === genre)?.label || genre

    try {
      const storiesRef = collection(db, 'users', user.uid, 'stories')
      const storyDocRef = await addDoc(storiesRef, {
        title: `${genreLabel} Short Story`,
        storyTitle: '',
        author: 'inTongues',
        language: activeLanguage,
        level: selectedLevel,
        genre: genreLabel,
        description: description.trim(),
        concept: '',
        isFlat: true,
        adaptedTextBlob: '',
        lastPhaseCompleted: 0,
        totalPhases: 2,
        status: 'generating',
        createdAt: serverTimestamp(),
        generateAudio,
        voiceGender: generateAudio ? voiceGender : null,
        hasFullAudio: false,
        audioStatus: generateAudio ? 'pending' : 'none',
        fullAudioUrl: null,
        voiceId: null,
        coverUrl: null,
        coverStatus: 'pending',
      })

      // Navigate to library immediately — tile shows "Generating..." spinner
      if (onClose) onClose()
      setIsSubmitting(false)
      navigate('/read/library')

      // Background: generate the story, then update the doc
      const uid = user.uid
      const storyId = storyDocRef.id
      const storyDocPath = doc(db, 'users', uid, 'stories', storyId)
      const capturedGenre = genre
      const capturedDescription = description.trim()
      const capturedLanguage = activeLanguage
      const capturedGenerateAudio = generateAudio

      generateShortStory({
        genre: capturedGenre,
        timePlaceSetting: capturedDescription,
        language: capturedLanguage,
        level: selectedLevel,
      })
        .then(async (storyResult) => {
          await setDoc(storyDocPath, {
            title: storyResult.storyTitle || `${genreLabel} Short Story`,
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
                title: storyResult.storyTitle || `${genreLabel} Short Story`,
                author: 'inTongues',
                language: capturedLanguage,
                level: selectedLevel,
                genre: genreLabel,
                description: capturedDescription,
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

  const panelContent = (
    <>
      <div className="page-header">
        <div className="page-header-title">
          <HeadingTag className="text-center generate-modal-title">
            {GENERATE_TITLES.English}
          </HeadingTag>
          <p className="text-center ui-text">
            Create an original story in your target language, tailored to your level.
          </p>
        </div>
        {onClose && (
          <button className="modal-close-button" onClick={onClose} aria-label="Close">
            ×
          </button>
        )}
      </div>

      {languageError && <p className="error small ui-text">{languageError}</p>}

      <form className="form" onSubmit={handleSubmit}>
        <label className="ui-text">
          Language level
          <div className="import-level-options" style={{ marginTop: '0.5rem' }}>
            {LEVELS.map((level, index) => (
              <button
                key={level}
                type="button"
                className={`import-level-option${levelIndex === index ? ' is-active' : ''}`}
                onClick={() => setLevelIndex(index)}
              >
                {level}
              </button>
            ))}
          </div>
        </label>

        <label className="ui-text">
          Genre
          <select
            className="genre-select"
            value={genre}
            onChange={(event) => setGenre(event.target.value)}
          >
            {SHORT_STORY_GENRES.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </label>

        <label className="ui-text">
          Setting
          <textarea
            placeholder="When and where does your story take place?"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>

        <label className="checkbox ui-text">
          <span className="ui-text">Generate audio</span>
          <input
            type="checkbox"
            checked={generateAudio}
            onChange={(event) => setGenerateAudio(event.target.checked)}
          />
        </label>

        {generateAudio && (
          <label className="ui-text">
            Voice gender
            <div className="voice-gender-toggle" role="radiogroup" aria-label="Voice gender">
              <button
                className={`voice-gender-option${voiceGender === 'male' ? ' is-active' : ''}`}
                type="button"
                onClick={() => setVoiceGender('male')}
                aria-pressed={voiceGender === 'male'}
              >
                Male
              </button>
              <button
                className={`voice-gender-option${voiceGender === 'female' ? ' is-active' : ''}`}
                type="button"
                onClick={() => setVoiceGender('female')}
                aria-pressed={voiceGender === 'female'}
              >
                Female
              </button>
            </div>
          </label>
        )}

        <div className="action-row">
          {(onBack || onClose) && (
            <button className="button ghost" type="button" onClick={onClose || onBack} disabled={isSubmitting}>
              Cancel
            </button>
          )}
          <button className="button primary" type="submit" disabled={!activeLanguage || isSubmitting}>
            {isSubmitting ? 'Generating...' : 'Generate'}
          </button>
        </div>
      </form>

      {error && <p className="error ui-text">{error}</p>}
    </>
  )

  if (isModal) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-container generate-story-modal" onClick={(e) => e.stopPropagation()}>
          {panelContent}
        </div>
      </div>
    )
  }

  return <div className="generate-story-panel">{panelContent}</div>
}

export default GenerateStoryPanel
