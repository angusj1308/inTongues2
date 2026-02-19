import { useMemo, useState } from 'react'
import { filterSupportedLanguages, resolveSupportedLanguageLabel } from '../../constants/languages'
import { useAuth } from '../../context/AuthContext'
import { generateBible, NOVEL_LEVELS, LENGTH_PRESETS } from '../../services/novelApiClient'

const GenerateNovelPanel = ({ onBibleGenerated, onCancel }) => {
  const { user, profile, setLastUsedLanguage } = useAuth()

  const [concept, setConcept] = useState('')
  const [level, setLevel] = useState('Intermediate')
  const [lengthPreset, setLengthPreset] = useState('novella')
  const [generateAudio, setGenerateAudio] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')

  const availableLanguages = useMemo(
    () => filterSupportedLanguages(profile?.myLanguages || []),
    [profile?.myLanguages]
  )

  const activeLanguage = useMemo(() => {
    if (profile?.lastUsedLanguage) {
      return resolveSupportedLanguageLabel(profile.lastUsedLanguage, '')
    }
    if (availableLanguages.length) {
      return availableLanguages[0]
    }
    return ''
  }, [availableLanguages, profile?.lastUsedLanguage])

  const handleLanguageChange = (newLanguage) => {
    if (newLanguage) {
      setLastUsedLanguage(newLanguage)
    }
  }


  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!user || !activeLanguage) {
      setError('Please select a language before generating.')
      return
    }

    const finalConcept = concept.trim()
    if (!finalConcept) {
      setError('Please describe when and where your story takes place.')
      return
    }

    setError('')
    setIsGenerating(true)
    setProgress('Running Phase 1 concept generation...')

    try {
      const result = await generateBible({
        uid: user.uid,
        concept: finalConcept,
        level,
        lengthPreset,
        language: activeLanguage,
        generateAudio,
      })

      if (result.success) {
        setProgress('Phase 1 complete! Check the terminal for full output.')
        onBibleGenerated(result)
      } else {
        setError(result.error || 'Failed to generate story')
      }
    } catch (err) {
      setError(err.message || 'Failed to generate story')
    } finally {
      setIsGenerating(false)
      setProgress('')
    }
  }

  const selectedLength = LENGTH_PRESETS.find((p) => p.value === lengthPreset)

  return (
    <div className="generate-novel-panel">
      <div className="page-header">
        <div className="page-header-title">
          <h2>Generate Novel</h2>
          <p className="ui-text">
            Create a complete novel with an AI-generated story bible and chapters tailored to your level.
          </p>
        </div>
      </div>

      <form className="form" onSubmit={handleSubmit}>
        {/* Language Selection */}
        <div className="section">
          <label className="ui-text">
            Language
            <select
              value={activeLanguage}
              onChange={(e) => handleLanguageChange(e.target.value)}
              disabled={isGenerating}
            >
              {availableLanguages.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Setting */}
        <label className="ui-text">
          Setting
          <textarea
            placeholder="When and where does your story take place?"
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            disabled={isGenerating}
            rows={4}
          />
        </label>

        {/* Level Selection */}
        <label className="ui-text">
          Language Level
          <div className="level-options">
            {NOVEL_LEVELS.map((lvl) => (
              <button
                key={lvl.value}
                type="button"
                className={`level-option ${level === lvl.value ? 'is-active' : ''}`}
                onClick={() => setLevel(lvl.value)}
                disabled={isGenerating}
              >
                <span className="level-label">{lvl.label}</span>
                <span className="level-description">{lvl.description}</span>
              </button>
            ))}
          </div>
        </label>

        {/* Length Selection */}
        <label className="ui-text">
          Story Length
          <div className="length-options">
            {LENGTH_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                className={`length-option ${lengthPreset === preset.value ? 'is-active' : ''}`}
                onClick={() => setLengthPreset(preset.value)}
                disabled={isGenerating}
              >
                <span className="length-label">{preset.label}</span>
                <span className="length-chapters">{preset.chapters} chapters</span>
                <span className="length-description">{preset.description}</span>
              </button>
            ))}
          </div>
        </label>

        {/* Audio Toggle */}
        <label className="ui-text checkbox-label">
          <input
            type="checkbox"
            checked={generateAudio}
            onChange={(e) => setGenerateAudio(e.target.checked)}
            disabled={isGenerating}
          />
          <span>Generate audio narration for chapters</span>
        </label>

        {/* Progress Display */}
        {isGenerating && progress && (
          <div className="generation-progress">
            <div className="progress-spinner" />
            <p className="progress-text">{progress}</p>
            <p className="progress-hint">
              Generating skeleton and concept — output will appear in the terminal.
            </p>
          </div>
        )}

        {/* Error Display */}
        {error && <p className="error ui-text">{error}</p>}

        {/* Actions */}
        <div className="action-row">
          {onCancel && (
            <button
              type="button"
              className="button ghost"
              onClick={onCancel}
              disabled={isGenerating}
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            className="button primary"
            disabled={!activeLanguage || !concept.trim() || isGenerating}
          >
            {isGenerating ? 'Generating Bible...' : 'Generate Story Bible'}
          </button>
        </div>
      </form>

      {/* Info Panel */}
      <div className="info-panel">
        <h4>How it works</h4>
        <ol className="info-steps">
          <li>
            <strong>Bible Generation</strong> - AI creates a detailed story bible including world,
            characters, relationships, and chapter-by-chapter plot outline.
          </li>
          <li>
            <strong>Review &amp; Approve</strong> - Review the generated outline and approve it or
            request changes before proceeding.
          </li>
          <li>
            <strong>Chapter Generation</strong> - Generate chapters one at a time, each building on
            the previous context.
          </li>
        </ol>
        <p className="info-note">
          Estimated time: {selectedLength?.chapters || 12} chapters at your selected length.
        </p>
      </div>
    </div>
  )
}

export default GenerateNovelPanel
