import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addDoc, collection, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { useAuth } from '../../context/AuthContext'
import { db } from '../../firebase'
import { generateStory } from '../../services/generator'

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

const GENRES = [
  'Adventure',
  'Mystery',
  'Fantasy',
  'Science Fiction',
  'Historical Fiction',
  'Romance',
  'Drama',
  'Comedy',
  'Horror',
  'Thriller',
  'Biography',
  'Non-fiction',
  'Mythology',
  'Folklore',
  'Travel',
  'Opinion',
  'News',
  'Young Adult',
  "Children's",
]

const GenerateStoryPanel = ({
  activeLanguage: activeLanguageProp = '',
  languageParam = '',
  headingLevel = 'h2',
  onBack,
}) => {
  const navigate = useNavigate()
  const { profile, setLastUsedLanguage, user } = useAuth()

  const [levelIndex, setLevelIndex] = useState(2)
  const [length, setLength] = useState(5)
  const [genre, setGenre] = useState(GENRES[0])
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const availableLanguages = profile?.myLanguages || []
  const languageLocked = Boolean(languageParam || activeLanguageProp)

  const activeLanguage = useMemo(() => {
    if (activeLanguageProp) return activeLanguageProp
    if (languageParam) {
      return availableLanguages.includes(languageParam) ? languageParam : ''
    }
    if (profile?.lastUsedLanguage) return profile.lastUsedLanguage
    if (availableLanguages.length) return availableLanguages[0]
    return ''
  }, [activeLanguageProp, availableLanguages, languageParam, profile?.lastUsedLanguage])

  const lockedLanguageUnavailable = languageParam && !availableLanguages.includes(languageParam)
  const languageError = lockedLanguageUnavailable
    ? 'The selected language is not available in your account.'
    : ''

  const environmentLanguage = activeLanguage || ''
  const environmentLanguageCapitalized =
    environmentLanguage.charAt(0).toUpperCase() + environmentLanguage.slice(1)
  const normalizedEnvironmentLanguage = environmentLanguage.toLowerCase()

  useEffect(() => {
    if (profile && !availableLanguages.length) {
      navigate('/select-language')
    }
  }, [availableLanguages.length, navigate, profile])

  useEffect(() => {
    if (activeLanguage) {
      setLastUsedLanguage(activeLanguage)
    }
  }, [activeLanguage, setLastUsedLanguage])

  const HeadingTag = useMemo(() => headingLevel || 'h2', [headingLevel])

  const handleLanguageChange = (newLanguage) => {
    if (!newLanguage || languageLocked) return
    if (languageParam) {
      navigate(`/generate/${encodeURIComponent(newLanguage)}`)
      return
    }
    setLastUsedLanguage(newLanguage)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!activeLanguage || !user) {
      setError('Select a valid language before generating a story.')
      return
    }

    setError('')
    setIsSubmitting(true)

    const minimumPageCount = Math.max(5, length)

    const params = {
      level: CEFR_LEVELS[levelIndex],
      genre,
      length: minimumPageCount,
      pageCount: minimumPageCount,
      description: description.trim(),
      language: activeLanguage,
    }

    try {
      const { pages, title } = await generateStory(params)
      const storiesRef = collection(db, 'users', user.uid, 'stories')

      const resolvedTitle = (title || '').trim() || params.description || 'Untitled Story'

      const storyRef = await addDoc(storiesRef, {
        ...params,
        title: resolvedTitle,
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

      navigate(`/library/${encodeURIComponent(activeLanguage)}`)
    } catch (submissionError) {
      setError(submissionError?.message || 'Unable to generate story.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="generate-story-panel">
      <div className="page-header">
        <div className="page-header-title">
          <HeadingTag className="text-center">
            {`Generate ${environmentLanguageCapitalized} Content`}
          </HeadingTag>
          <p className="text-center ui-text">
            Create original content in your target language, tailored to your level and interests.
          </p>
        </div>
        {onBack && (
          <button className="button ghost" onClick={onBack}>
            Back
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
          Length in pages
          <div className="slider-row">
            <input
              type="range"
              min="5"
              max="25"
              value={length}
              onChange={(event) => setLength(Math.max(5, Number(event.target.value)))}
              style={{ '--range-progress': `${((length - 5) / 20) * 100}%` }}
            />
            <span className="pill">{length} page{length === 1 ? '' : 's'}</span>
          </div>
        </label>

        <label className="ui-text">
          Genre
          <select value={genre} onChange={(event) => setGenre(event.target.value)}>
            {GENRES.map((genreOption) => (
              <option key={genreOption} value={genreOption}>
                {genreOption}
              </option>
            ))}
          </select>
        </label>

        <label className="ui-text">
          Text description
          <textarea
            placeholder="Describe the topic, themes, or characters you want to include."
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>

        <div className="action-row">
          {onBack && (
            <button className="button ghost" type="button" onClick={onBack}>
              Cancel
            </button>
          )}
          <button className="button primary" type="submit" disabled={!activeLanguage || isSubmitting}>
            {isSubmitting ? 'Generating...' : 'Generate'}
          </button>
        </div>
      </form>

      {error && <p className="error ui-text">{error}</p>}
    </div>
  )
}

export default GenerateStoryPanel
