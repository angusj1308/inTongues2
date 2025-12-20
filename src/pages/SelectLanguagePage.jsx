import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  filterSupportedLanguages,
  POPULAR_LANGUAGES,
  LANGUAGES,
  resolveSupportedLanguageLabel,
} from '../constants/languages'
import { useAuth } from '../context/AuthContext'

const SelectLanguagePage = () => {
  const navigate = useNavigate()
  const { addLanguage, profile, updateProfile } = useAuth()
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [nativeLanguage, setNativeLanguage] = useState(
    resolveSupportedLanguageLabel(profile?.nativeLanguage, '')
  )

  useEffect(() => {
    setNativeLanguage(resolveSupportedLanguageLabel(profile?.nativeLanguage, ''))
  }, [profile?.nativeLanguage])
  const supportedLanguages = useMemo(
    () => filterSupportedLanguages(profile?.myLanguages || []),
    [profile?.myLanguages],
  )

  const filteredLanguages = useMemo(() => {
    if (!query.trim()) {
      return LANGUAGES
    }
    return LANGUAGES.filter((language) =>
      language.toLowerCase().includes(query.trim().toLowerCase())
    )
  }, [query])

  const handleSelect = async (language) => {
    setSaving(true)

    if (!nativeLanguage) {
      setSaving(false)
      setError('Please choose your native language first.')
      return
    }
    setError('')
    try {
      if (nativeLanguage && nativeLanguage !== profile?.nativeLanguage) {
        await updateProfile({ nativeLanguage })
      }
      await addLanguage(language)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message || 'Could not save language')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <div className="card">
        <div className="page-header">
          <div>
            <h1>Select your language</h1>
            <p className="muted">Choose a language to start practicing.</p>
          </div>
          <button className="button ghost" onClick={() => navigate('/my-languages')}>
            My Languages
          </button>
        </div>

        <section className="section">
          <div className="section-header">
            <h3>Your native language</h3>
            <p className="muted small">We'll translate everything into this language.</p>
          </div>
          <label className="input-label" htmlFor="native-language-select">
            Native language
          </label>
          <select
            id="native-language-select"
            value={nativeLanguage}
            onChange={(event) => setNativeLanguage(event.target.value)}
          >
            <option value="">Select your native language</option>
            {LANGUAGES.map((language) => (
              <option key={language} value={language}>
                {language}
              </option>
            ))}
          </select>
        </section>

        <section className="section">
          <div className="section-header">
            <h3>Most Popular Languages</h3>
            <p className="muted small">Pick one to jump right in.</p>
          </div>
          <div className="language-grid">
            {POPULAR_LANGUAGES.map((language) => (
              <button
                key={language}
                className="chip"
                onClick={() => handleSelect(language)}
                disabled={saving}
              >
                {language}
              </button>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-header">
            <h3>Search all languages</h3>
            <p className="muted small">Type to filter the list below.</p>
          </div>
          <input
            type="search"
            placeholder="Search languages..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="language-list">
            {filteredLanguages.map((language) => (
              <button
                key={language}
                className="language-row"
                onClick={() => handleSelect(language)}
                disabled={saving}
              >
                <span>{language}</span>
                {supportedLanguages.includes(language) && <span className="pill">Saved</span>}
              </button>
            ))}
            {!filteredLanguages.length && <p className="muted">No results found.</p>}
          </div>
        </section>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  )
}

export default SelectLanguagePage
