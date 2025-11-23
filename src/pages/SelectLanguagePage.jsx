import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const POPULAR_LANGUAGES = [
  'English',
  'Spanish',
  'Mandarin',
  'French',
  'German',
  'Japanese',
  'Korean',
  'Italian',
  'Portuguese',
  'Russian',
  'Arabic',
  'Hindi',
  'Turkish',
  'Dutch',
  'Swedish',
]

const ALL_LANGUAGES = [
  'English',
  'Spanish',
  'Mandarin',
  'French',
  'German',
  'Japanese',
  'Korean',
  'Italian',
  'Portuguese',
  'Russian',
  'Arabic',
  'Hindi',
  'Turkish',
  'Dutch',
  'Swedish',
  'Norwegian',
  'Danish',
  'Finnish',
  'Polish',
  'Greek',
  'Hebrew',
  'Thai',
  'Vietnamese',
  'Indonesian',
  'Czech',
  'Hungarian',
  'Romanian',
  'Ukrainian',
  'Swahili',
  'Zulu',
  'Malay',
  'Filipino',
]

const SelectLanguagePage = () => {
  const navigate = useNavigate()
  const { addLanguage, profile } = useAuth()
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const filteredLanguages = useMemo(() => {
    if (!query.trim()) {
      return ALL_LANGUAGES
    }
    return ALL_LANGUAGES.filter((language) =>
      language.toLowerCase().includes(query.trim().toLowerCase())
    )
  }, [query])

  const handleSelect = async (language) => {
    setSaving(true)
    setError('')
    try {
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
                {profile?.myLanguages?.includes(language) && <span className="pill">Saved</span>}
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
