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
import { generateShortStory, generateNovelConcept, generateChapterSummaries } from '../../services/generator'
import { PROSE_STYLES } from '../../services/novelApiClient'
import { GENRES, SHORT_STORY_GENRES, NOVEL_GENRES } from '../../services/Authors'

const LEVELS = ['Beginner', 'Intermediate', 'Native']

// Target language translations for modal title
const GENERATE_TITLES = {
  Spanish: 'Generar',
  French: 'Générer',
  Italian: 'Generare',
  English: 'Generate',
}

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
  const [genre, setGenre] = useState('thriller')
  const [description, setDescription] = useState('')
  const [generateAudio, setGenerateAudio] = useState(false)
  const [voiceGender, setVoiceGender] = useState('male')
  const [styleKey, setStyleKey] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [bibleProgress, setBibleProgress] = useState('') // Progress message for bible generation

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

    // ── Novel pipeline: Call 1 (concept) → Call 2 (chapter summaries) ──
    const isNovelPipeline = lengthPreset === 'novella' || lengthPreset === 'novel'

    if (isNovelPipeline) {
      const FORMAT_MAP = { novella: 'novella', novel: 'novel' }
      const novelFormat = FORMAT_MAP[lengthPreset]
      const genreLabel = GENRES.find((g) => g.id === genre)?.label || genre

      // Call 1 — Concept
      let novelConcept = null
      let novelAuthor = null
      let novelTitle = null
      try {
        const conceptResult = await generateNovelConcept({
          genre,
          format: novelFormat,
          timePlaceSetting: description.trim(),
        })
        novelConcept = conceptResult.concept
        novelAuthor = conceptResult.authorName
        novelTitle = conceptResult.title
      } catch (conceptError) {
        setError(conceptError?.message || 'Unable to generate novel concept.')
        setIsSubmitting(false)
        return
      }

      // Call 2 — Chapter summaries
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

      // Count chapters from the outline headers (match "Chapter N:", "N. Title", "Capítulo N:", etc.)
      const chapterHeaderMatches = chapterSummaries.match(/^(?:#{1,3}\s*)?(?:\*{0,2})?\s*(?:Chapter|Cap[ií]tulo|Chapitre|Kapitel)\s+\d+\s*[:\-–—.]/gim) || []
      const numberedMatches = chapterSummaries.match(/^(?:#{1,3}\s*)?(?:\*{0,2})?\s*\d+\.\s+\S/gim) || []
      const parsedTotalChapters = chapterHeaderMatches.length || numberedMatches.length

      // Store book with concept + chapter summaries, ready for Call 3 (per-chapter writing)
      try {
        const generatedBooksRef = collection(db, 'users', user.uid, 'generatedBooks')
        const bookRef = await addDoc(generatedBooksRef, {
          status: 'outline_complete',
          title: novelTitle || `${genreLabel} ${novelFormat}`,
          author: novelAuthor,
          genre: genreLabel,
          concept: novelConcept,
          chapterSummaries,
          totalChapters: parsedTotalChapters,
          chaptersGenerated: 0,
          level: LEVELS[levelIndex],
          lengthPreset,
          language: activeLanguage,
          generateAudio,
          styleKey: styleKey || null,
          description: description.trim(),
          createdAt: serverTimestamp(),
        })

        console.log(`Novel ${bookRef.id} created — concept + chapter summaries stored`)

        if (onClose) onClose()
        setIsSubmitting(false)
        navigate('/dashboard', { state: { initialTab: 'read' } })
      } catch (storeError) {
        setError(storeError?.message || 'Unable to save novel.')
        setIsSubmitting(false)
      }
      return
    }

    // ── Single-call short story generation (GPT-5.4-pro) ──
    let storyResult = null
    try {
      storyResult = await generateShortStory({
        genre,
        timePlaceSetting: description.trim(),
        language: activeLanguage,
        level: LEVELS[levelIndex],
      })
    } catch (genError) {
      setError(genError?.message || 'Unable to generate short story.')
      setIsSubmitting(false)
      return
    }

    // Save the completed story — prose is already generated, ready to read
    const selectedLevel = LEVELS[levelIndex]
    try {
      const storiesRef = collection(db, 'users', user.uid, 'stories')
      const genreLabel = GENRES.find((g) => g.id === genre)?.label || genre

      const storyDocRef = await addDoc(storiesRef, {
        title: storyResult.storyTitle || `${genreLabel} Short Story`,
        storyTitle: storyResult.storyTitle || '',
        author: storyResult.authorName,
        language: activeLanguage,
        level: selectedLevel,
        genre: genreLabel,
        description: description.trim(),
        concept: '',
        isFlat: true,
        adaptedTextBlob: storyResult.storyText,
        lastPhaseCompleted: 2,
        totalPhases: 2,
        status: 'ready',
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

      // Trigger audio generation if requested
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

      // Trigger cover generation (fire-and-forget)
      try {
        fetch('http://localhost:4000/api/generate-cover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: user.uid, storyId: storyDocRef.id }),
        }).catch((coverErr) => console.error('Cover trigger failed:', coverErr))
      } catch (coverErr) {
        console.error('Cover trigger failed:', coverErr)
      }

      if (onClose) onClose()
      navigate('/dashboard', { state: { initialTab: 'read' } })
    } catch (submissionError) {
      setError(submissionError?.message || 'Unable to save story.')
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
              onChange={(event) => {
                const val = Number(event.target.value)
                // Skip Intermediate (index 1) — snap to nearest allowed level
                if (LEVELS[val] === 'Intermediate') {
                  setLevelIndex(val > levelIndex ? 2 : 0)
                } else {
                  setLevelIndex(val)
                }
              }}
              style={{ '--range-progress': `${(levelIndex / (LEVELS.length - 1)) * 100}%` }}
            />
          </div>
          <div className="slider-marks">
            {LEVELS.map((level, index) => (
              <span
                key={level}
                className={`slider-mark${levelIndex === index ? ' active' : ''}${level === 'Intermediate' ? ' disabled' : ''}`}
                title={level === 'Intermediate' ? 'Coming soon' : undefined}
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
                onClick={() => {
                  setLengthPreset(preset.id)
                  // Reset genre if current selection isn't available in the new pool
                  const pool = preset.id === 'short' ? SHORT_STORY_GENRES : NOVEL_GENRES
                  if (!pool.some((g) => g.id === genre)) {
                    setGenre(pool[0].id)
                  }
                }}
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
            {(lengthPreset === 'short' ? SHORT_STORY_GENRES : NOVEL_GENRES).map((g) => (
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

        {(lengthPreset === 'novella' || lengthPreset === 'novel') && (
          <label className="ui-text">
            Prose Style
            <select
              value={styleKey}
              onChange={(event) => setStyleKey(event.target.value)}
            >
              {PROSE_STYLES.map((style) => (
                <option key={style.value} value={style.value}>
                  {style.label}
                </option>
              ))}
            </select>
          </label>
        )}

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
