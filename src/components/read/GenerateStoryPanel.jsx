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
  const [length, setLength] = useState(3)
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

    const params = {
      level: CEFR_LEVELS[levelIndex],
      genre,
      length,
      pageCount: length,
      description: description.trim(),
      language: activeLanguage,
    }

    try {
      const pages = await generateStory(params)
      const storiesRef = collection(db, 'users', user.uid, 'stories')

      const storyRef = await addDoc(storiesRef, {
        ...params,
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
        <div>
          <HeadingTag>Generate content</HeadingTag>
          <p className="muted small">Configure a custom passage to practice reading in your selected language.</p>
        </div>
        {onBack && (
          <button className="button ghost" onClick={onBack}>
            Back
          </button>
        )}
      </div>

      <div className="section">
        <div className="section-header">
          <h3>Language</h3>
          <p className="muted small">We will tailor the output for this language.</p>
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
            {languageLocked && (
              <p className="muted small">Language is locked to your current selection.</p>
            )}
            {languageError && <p className="error small">{languageError}</p>}
          </>
        ) : (
          <p className="muted">Add a language to begin generating content.</p>
        )}
      </div>

      <form className="form" onSubmit={handleSubmit}>
        <label>
          Language level
          <div className="slider-row">
            <input
              type="range"
              min="0"
              max={CEFR_LEVELS.length - 1}
              value={levelIndex}
              onChange={(event) => setLevelIndex(Number(event.target.value))}
            />
            <span className="pill primary">{CEFR_LEVELS[levelIndex]}</span>
          </div>
          <p className="muted small">CEFR scale from A1 (beginner) to C2 (mastery).</p>
        </label>

        <label>
          Length in pages
          <div className="slider-row">
            <input
              type="range"
              min="1"
              max="25"
              value={length}
              onChange={(event) => setLength(Number(event.target.value))}
            />
            <span className="pill">{length} page{length === 1 ? '' : 's'}</span>
          </div>
          <p className="muted small">Adjust based on how long you want the reading passage to be.</p>
        </label>

        <label>
          Genre
          <select value={genre} onChange={(event) => setGenre(event.target.value)}>
            {GENRES.map((genreOption) => (
              <option key={genreOption} value={genreOption}>
                {genreOption}
              </option>
            ))}
          </select>
          <p className="muted small">Choose the tone and style for the generated content.</p>
        </label>

        <label>
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
          <button className="button" type="submit" disabled={!activeLanguage || isSubmitting}>
            {isSubmitting ? 'Generating...' : 'Generate'}
          </button>
        </div>
      </form>

      {error && <p className="error">{error}</p>}
    </div>
  )
}

export default GenerateStoryPanel
