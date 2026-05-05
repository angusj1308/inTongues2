import { useMemo, useState } from 'react'
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

const LENGTH_PRESETS = [
  { id: 'short', label: 'Short Story', range: '5–15 pp', minPages: 5, maxPages: 15 },
  { id: 'novella', label: 'Novella', range: '50–100 pp', minPages: 50, maxPages: 100 },
  { id: 'novel', label: 'Novel', range: '250–330 pp', minPages: 250, maxPages: 330 },
]

const baseCost = (lengthPreset) =>
  lengthPreset === 'short' ? 1 : lengthPreset === 'novella' ? 5 : 15

export default function GenerateInlineForm({ activeLanguage }) {
  const navigate = useNavigate()
  const { profile, user } = useAuth()

  const initialLevelIndex = useMemo(() => {
    const lvl = profile?.level
    const idx = LEVELS.findIndex(
      (l) => l.toLowerCase() === String(lvl || '').toLowerCase(),
    )
    return idx >= 0 ? idx : 0
  }, [profile?.level])

  const [levelIndex, setLevelIndex] = useState(initialLevelIndex)
  const [lengthPreset, setLengthPreset] = useState('short')
  const [genre, setGenre] = useState(SHORT_STORY_GENRES[0]?.id || 'thriller')
  const [description, setDescription] = useState('')
  const [generateAudio, setGenerateAudio] = useState(true)
  const [voiceGender, setVoiceGender] = useState('female')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const genrePool =
    lengthPreset === 'short' ? SHORT_STORY_GENRES : NOVEL_GENRES
  const selectedGenreLabel =
    GENRES.find((g) => g.id === genre)?.label || 'Choose'

  const credits = baseCost(lengthPreset) + (generateAudio ? 2 : 0)

  const handleLengthChange = (id) => {
    setLengthPreset(id)
    const pool = id === 'short' ? SHORT_STORY_GENRES : NOVEL_GENRES
    if (!pool.some((g) => g.id === genre)) {
      setGenre(pool[0]?.id || '')
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!activeLanguage || !user || isSubmitting) return
    setError('')
    setIsSubmitting(true)

    const isNovelPipeline =
      lengthPreset === 'novella' || lengthPreset === 'novel'
    const selectedLevel = LEVELS[levelIndex]
    const genreLabel = GENRES.find((g) => g.id === genre)?.label || genre

    if (isNovelPipeline) {
      const novelFormat = lengthPreset
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
          title: novelTitle || `${genreLabel} ${novelFormat}`,
          author: novelAuthor,
          genre: genreLabel,
          concept: novelConcept,
          chapterSummaries,
          totalChapters: parsedTotalChapters,
          chaptersGenerated: 0,
          level: selectedLevel,
          lengthPreset,
          language: activeLanguage,
          generateAudio,
          styleKey: null,
          description: description.trim(),
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
        genre,
        timePlaceSetting: description.trim(),
        language: activeLanguage,
        level: selectedLevel,
      })
    } catch (genError) {
      setError(genError?.message || 'Unable to generate short story.')
      setIsSubmitting(false)
      return
    }

    try {
      const storiesRef = collection(db, 'users', user.uid, 'stories')
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

  const canSubmit = Boolean(activeLanguage && user) && !isSubmitting

  return (
    <form className="generate-inline-form" onSubmit={handleSubmit}>
      <div className="gen-section">
        <span className="gen-label">Level</span>
        <div className="gen-options gen-options--3">
          {LEVELS.map((level, index) => (
            <button
              key={level}
              type="button"
              className={`gen-option${levelIndex === index ? ' is-active' : ''}`}
              onClick={() => setLevelIndex(index)}
            >
              <span className="gen-option-label">{level}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="gen-section">
        <span className="gen-label">Length</span>
        <div className="gen-options gen-options--3">
          {LENGTH_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`gen-option gen-option--stacked${lengthPreset === preset.id ? ' is-active' : ''}`}
              onClick={() => handleLengthChange(preset.id)}
            >
              <span className="gen-option-label">{preset.label}</span>
              <span className="gen-option-sub">{preset.range}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="gen-section">
        <span className="gen-label">Genre</span>
        <div className="gen-select-wrap">
          <select
            className="gen-select"
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            aria-label="Genre"
          >
            {genrePool.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
          <span className="gen-select-chevron" aria-hidden="true">▾</span>
          <span className="gen-select-display" aria-hidden="true">
            {selectedGenreLabel}
          </span>
        </div>
      </div>

      <div className="gen-section">
        <span className="gen-label">Setting</span>
        <input
          type="text"
          className="gen-input"
          placeholder="When and where?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="gen-section">
        <span className="gen-label">Audio</span>
        <div className="gen-options gen-options--4">
          <button
            type="button"
            className={`gen-option${generateAudio ? ' is-active' : ''}`}
            onClick={() => setGenerateAudio(true)}
          >
            <span className="gen-option-label">Audio</span>
          </button>
          <button
            type="button"
            className={`gen-option${!generateAudio ? ' is-active' : ''}`}
            onClick={() => setGenerateAudio(false)}
          >
            <span className="gen-option-label">Text</span>
          </button>
          <button
            type="button"
            className={`gen-option${generateAudio && voiceGender === 'female' ? ' is-active' : ''}${!generateAudio ? ' is-disabled' : ''}`}
            onClick={() => generateAudio && setVoiceGender('female')}
            disabled={!generateAudio}
          >
            <span className="gen-option-label">Female</span>
          </button>
          <button
            type="button"
            className={`gen-option${generateAudio && voiceGender === 'male' ? ' is-active' : ''}${!generateAudio ? ' is-disabled' : ''}`}
            onClick={() => generateAudio && setVoiceGender('male')}
            disabled={!generateAudio}
          >
            <span className="gen-option-label">Male</span>
          </button>
        </div>
      </div>

      <div className="gen-spacer" />

      <div className="gen-action-row">
        <div className="gen-cost">
          <span className="gen-label">Cost</span>
          <span className="gen-cost-value">{credits} credits</span>
        </div>
        <button
          type="submit"
          className="gen-submit"
          disabled={!canSubmit}
        >
          {isSubmitting ? 'Generating…' : 'Generate →'}
        </button>
      </div>

      {error && <p className="gen-error">{error}</p>}
    </form>
  )
}
