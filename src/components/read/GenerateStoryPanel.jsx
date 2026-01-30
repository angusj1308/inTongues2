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
import { generatePrompt, expandPrompt, generateDifferentPrompt } from '../../services/novelApiClient'

const LEVELS = ['Beginner', 'Intermediate', 'Native']

// Target language translations for modal title
const GENERATE_TITLES = {
  Spanish: 'Generar',
  French: 'Générer',
  Italian: 'Generare',
  English: 'Generate',
}

const GENRES = [
  { id: 'romance', label: 'Romance' },
]

// Culturally relevant setting examples that cycle through
const SETTING_EXAMPLES = [
  'Forbidden love during the British occupation of Buenos Aires',
  'A chance encounter in a Parisian café during the 1920s',
  'Star-crossed lovers in feudal Japan',
  'A summer romance on the Amalfi Coast',
  'Love blooming in colonial-era Havana',
  'A passionate affair in revolutionary Mexico',
  'Unexpected connection in modern-day Seoul',
  'Romance amid the vineyards of Tuscany',
]

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

  const [levelIndex, setLevelIndex] = useState(0)
  const [lengthPreset, setLengthPreset] = useState('short')
  const [genre, setGenre] = useState('romance')
  const [description, setDescription] = useState('')
  const [generateAudio, setGenerateAudio] = useState(false)
  const [voiceGender, setVoiceGender] = useState('male')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [exampleIndex, setExampleIndex] = useState(0)
  const [bibleProgress, setBibleProgress] = useState('') // Progress message for bible generation
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false)
  const [isGeneratedContent, setIsGeneratedContent] = useState(false) // Track if description was AI-generated

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

  // Cycle through setting examples
  useEffect(() => {
    const interval = setInterval(() => {
      setExampleIndex((prev) => (prev + 1) % SETTING_EXAMPLES.length)
    }, 4000)
    return () => clearInterval(interval)
  }, [])

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

  const handleGeneratePrompt = async () => {
    setIsGeneratingPrompt(true)
    setError('')
    try {
      const currentText = description.trim()
      let prompt

      if (!currentText) {
        // Empty field: generate fresh concept
        prompt = await generatePrompt()
      } else if (isGeneratedContent) {
        // Already generated: create something completely different
        prompt = await generateDifferentPrompt(currentText)
      } else {
        // User typed something: expand their idea
        prompt = await expandPrompt(currentText)
      }

      setDescription(prompt)
      setIsGeneratedContent(true)
    } catch (err) {
      setError(err.message || 'Failed to generate prompt')
    } finally {
      setIsGeneratingPrompt(false)
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!activeLanguage || !user) {
      setError('Select a valid language before generating a story.')
      return
    }

    setError('')
    setIsSubmitting(true)

    // Use bible generation pipeline for novella/novel length
    const useBiblePipeline = lengthPreset === 'novella' || lengthPreset === 'novel'

    if (useBiblePipeline) {
      // Create placeholder document immediately so user sees it in library
      const placeholderConcept = description.trim() || 'A compelling romance story'
      const generatedBooksRef = collection(db, 'users', user.uid, 'generatedBooks')

      try {
        // Create book document ready for phase-by-phase generation
        const placeholderRef = await addDoc(generatedBooksRef, {
          status: 'ready',
          currentPhase: 0,
          lastPhaseCompleted: null,
          concept: placeholderConcept,
          level: LEVELS[levelIndex],
          lengthPreset: lengthPreset,
          language: activeLanguage,
          generateAudio,
          createdAt: serverTimestamp(),
          bible: {},
        })

        // Close panel immediately and navigate to dashboard
        if (onClose) {
          onClose()
        }
        setIsSubmitting(false)
        navigate('/dashboard', { state: { initialTab: 'read' } })

        // User will use phase controls to run phases manually
        console.log(`Book ${placeholderRef.id} created - ready for phase-by-phase generation`)

      } catch (placeholderError) {
        setError(placeholderError?.message || 'Unable to start novel generation.')
        setIsSubmitting(false)
      }
      return
    }

    // Original short story generation for 'short' preset
    const params = {
      level: LEVELS[levelIndex],
      genre: GENRES.find((g) => g.id === genre)?.label || 'Romance',
      lengthPreset,
      minPages: currentPreset.minPages,
      maxPages: currentPreset.maxPages,
      description: description.trim(),
      language: activeLanguage,
      generateAudio,
      voiceGender: generateAudio ? voiceGender : null,
    }

    try {
      const { pages, title, voiceId, voiceGender: resolvedVoiceGender } = await generateStory(params)
      const storiesRef = collection(db, 'users', user.uid, 'stories')

      const resolvedTitle = (title || '').trim() || params.description || 'Untitled Story'

      const storyRef = await addDoc(storiesRef, {
        ...params,
        title: resolvedTitle,
        voiceGender: generateAudio ? resolvedVoiceGender : null,
        voiceId: generateAudio ? voiceId : null,
        createdAt: serverTimestamp(),
        hasFullAudio: false,
        audioStatus: generateAudio ? 'pending' : 'none',
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

      // Only trigger audio book generation if audio was requested
      if (generateAudio) {
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
          <HeadingTag className="text-center generate-modal-title">
            {GENERATE_TITLES[activeLanguage] || GENERATE_TITLES.English}
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
              max={LEVELS.length - 1}
              value={levelIndex}
              onChange={(event) => setLevelIndex(Number(event.target.value))}
              style={{ '--range-progress': `${(levelIndex / (LEVELS.length - 1)) * 100}%` }}
            />
          </div>
          <div className="slider-marks">
            {LEVELS.map((level, index) => (
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
          Genre
          <select
            className="genre-select"
            value={genre}
            onChange={(event) => setGenre(event.target.value)}
          >
            {GENRES.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </label>

        <label className="ui-text">
          Setting
          <textarea
            placeholder={SETTING_EXAMPLES[exampleIndex]}
            value={description}
            onChange={(event) => {
              setDescription(event.target.value)
              setIsGeneratedContent(false)
            }}
          />
          <div className="setting-actions">
            <button
              type="button"
              className="button ghost small"
              onClick={handleGeneratePrompt}
              disabled={isGeneratingPrompt}
            >
              {isGeneratingPrompt
                ? 'Generating...'
                : !description.trim()
                  ? 'Generate Prompt'
                  : isGeneratedContent
                    ? 'New Story Idea'
                    : 'Expand My Prompt'}
            </button>
            <p className="muted small ui-text">
              {description.trim()
                ? 'Generate a different concept, or edit the one above.'
                : 'Or describe the time, place, and setting for your story.'}
            </p>
          </div>
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

        {/* Progress display for bible generation */}
        {isSubmitting && bibleProgress && (
          <div className="bible-progress">
            <div className="progress-spinner" />
            <p className="progress-text">{bibleProgress}</p>
            <p className="progress-hint muted small">This may take 5-10 minutes as we craft your story through 8 validation phases.</p>
          </div>
        )}

        <div className="action-row">
          {(onBack || onClose) && (
            <button className="button ghost" type="button" onClick={onClose || onBack} disabled={isSubmitting}>
              Cancel
            </button>
          )}
          <button className="button primary" type="submit" disabled={!activeLanguage || isSubmitting}>
            {isSubmitting
              ? (bibleProgress ? 'Generating Novel...' : 'Generating...')
              : 'Generate'}
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
