import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addDoc, collection, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import {
  filterSupportedLanguages,
  resolveSupportedLanguageLabel,
  toLanguageLabel,
} from '../../constants/languages'
import { useAuth } from '../../context/AuthContext'
import { db } from '../../firebase'
import { generateStory } from '../../services/generator'

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

// Length presets with page ranges
const LENGTH_PRESETS = [
  { id: 'short', label: 'Short Story', minPages: 5, maxPages: 15, defaultPages: 10 },
  { id: 'novella', label: 'Novella', minPages: 50, maxPages: 100, defaultPages: 75 },
  { id: 'novel', label: 'Novel', minPages: 250, maxPages: 330, defaultPages: 290 },
]

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

  const [levelIndex, setLevelIndex] = useState(2)
  const [lengthPreset, setLengthPreset] = useState('short')
  const [pageCount, setPageCount] = useState(10)
  const [description, setDescription] = useState('')
  const [voiceGender, setVoiceGender] = useState('male')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const availableLanguages = useMemo(
    () => filterSupportedLanguages(profile?.myLanguages || []),
    [profile?.myLanguages],
  )
  const languageLocked = Boolean(languageParam || activeLanguageProp)

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

  const environmentLanguage = activeLanguage || ''
  const environmentLanguageCapitalized =
    environmentLanguage.charAt(0).toUpperCase() + environmentLanguage.slice(1)
  const normalizedEnvironmentLanguage = environmentLanguage.toLowerCase()

  // Get current preset details
  const currentPreset = LENGTH_PRESETS.find((p) => p.id === lengthPreset) || LENGTH_PRESETS[0]

  // Update page count when preset changes
  useEffect(() => {
    setPageCount(currentPreset.defaultPages)
  }, [lengthPreset, currentPreset.defaultPages])

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

  const handleLanguageChange = (newLanguage) => {
    if (!newLanguage || languageLocked) return
    if (languageParam) {
      const resolved = toLanguageLabel(newLanguage)
      if (!resolved) return
      navigate(`/generate/${encodeURIComponent(resolved)}`)
      return
    }
    const resolved = toLanguageLabel(newLanguage)
    if (!resolved) return
    setLastUsedLanguage(resolved)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!activeLanguage || !user) {
      setError('Select a valid language before generating a story.')
      return
    }

    setError('')
    setIsSubmitting(true)

    const params = {
      level: CEFR_LEVELS[levelIndex],
      genre: 'Romance', // Fixed to Romance for now
      length: pageCount,
      pageCount: pageCount,
      description: description.trim(),
      language: activeLanguage,
      voiceGender,
    }

    try {
      const { pages, title, voiceId, voiceGender: resolvedVoiceGender } = await generateStory(params)
      const storiesRef = collection(db, 'users', user.uid, 'stories')

      const resolvedTitle = (title || '').trim() || params.description || 'Untitled Story'

      const storyRef = await addDoc(storiesRef, {
        ...params,
        title: resolvedTitle,
        voiceGender: resolvedVoiceGender,
        voiceId,
        createdAt: serverTimestamp(),
        hasFullAudio: false,
        audioStatus: 'none',
        fullAudioUrl: null,
      })

      const pagesRef = collection(storyRef, 'pages')
      const pageWrites = pages.map((text, index) =>
        setDoc(doc(pagesRef, index.toString()), {
          index,
          text,
        }),
      )

      await Promise.all(pageWrites)

      try {
        await fetch('http://localhost:4000/api/generate-audio-book', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: user.uid,
            storyId: storyRef.id,
          }),
        })
      } catch (err) {
        console.error('Failed to trigger audio book generation:', err)
      }

      if (onClose) {
        onClose()
      }
      navigate('/dashboard', { state: { initialTab: 'read' } })
    } catch (submissionError) {
      setError(submissionError?.message || 'Unable to generate story.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const panelContent = (
    <>
      <div className="page-header">
        <div className="page-header-title">
          <HeadingTag className="text-center">
            {`Generate ${environmentLanguageCapitalized} Romance`}
          </HeadingTag>
          <p className="text-center ui-text">
            Create an original romance story in your target language, tailored to your level.
          </p>
        </div>
        {onClose && (
          <button className="modal-close-button" onClick={onClose} aria-label="Close">
            ×
          </button>
        )}
      </div>

      {normalizedEnvironmentLanguage !== 'spanish' && (
        <div className="section">
          <div className="section-header">
            <h3>Language</h3>
          </div>
          {availableLanguages.length ? (
            <>
              <div className="language-switcher">
                <span className="pill primary">in{activeLanguage || '...'}</span>
                <select
                  className="language-select"
                  value={activeLanguage}
                  onChange={(event) => handleLanguageChange(event.target.value)}
                  disabled={languageLocked}
                >
                  {availableLanguages.map((language) => (
                    <option key={language} value={language}>
                      {language}
                    </option>
                  ))}
                </select>
              </div>
              {languageError && <p className="error small ui-text">{languageError}</p>}
            </>
          ) : (
            <p className="muted ui-text">Add a language to begin generating content.</p>
          )}
        </div>
      )}

      <form className="form" onSubmit={handleSubmit}>
        <label className="ui-text">
          Language level
          <div className="slider-row">
            <input
              type="range"
              min="0"
              max={CEFR_LEVELS.length - 1}
              value={levelIndex}
              onChange={(event) => setLevelIndex(Number(event.target.value))}
              style={{ '--range-progress': `${(levelIndex / (CEFR_LEVELS.length - 1)) * 100}%` }}
            />
          </div>
          <div className="slider-marks">
            {CEFR_LEVELS.map((level, index) => (
              <span
                key={level}
                className={`slider-mark${levelIndex === index ? ' active' : ''}`}
              >
                {level}
              </span>
            ))}
          </div>
        </label>

        <label className="ui-text">
          Story length
          <div className="length-preset-options">
            {LENGTH_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`length-preset-option${lengthPreset === preset.id ? ' is-active' : ''}`}
                onClick={() => setLengthPreset(preset.id)}
              >
                <span className="preset-label">{preset.label}</span>
                <span className="preset-range">{preset.minPages}–{preset.maxPages} pages</span>
              </button>
            ))}
          </div>
        </label>

        <label className="ui-text">
          Page count
          <div className="slider-row">
            <input
              type="range"
              min={currentPreset.minPages}
              max={currentPreset.maxPages}
              value={pageCount}
              onChange={(event) => setPageCount(Number(event.target.value))}
              style={{
                '--range-progress': `${((pageCount - currentPreset.minPages) / (currentPreset.maxPages - currentPreset.minPages)) * 100}%`,
              }}
            />
            <span className="pill">{pageCount} pages</span>
          </div>
        </label>

        <label className="ui-text">
          Text description
          <textarea
            placeholder="Describe the topic, themes, or characters you want to include in your romance story."
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>

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

        <div className="action-row">
          {(onBack || onClose) && (
            <button className="button ghost" type="button" onClick={onClose || onBack}>
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
