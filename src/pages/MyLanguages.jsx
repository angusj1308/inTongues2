import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const MyLanguages = () => {
  const navigate = useNavigate()
  const { profile, updateProfile } = useAuth()

  const languages = useMemo(() => profile?.myLanguages || [], [profile?.myLanguages])

  return (
    <div className="page">
      <div className="card">
        <div className="page-header">
          <div>
            <h1>My Languages</h1>
            <p className="muted">Everything you've added so far.</p>
          </div>
          <div className="action-row">
            <button className="button ghost" onClick={() => navigate('/select-language')}>
              Add another
            </button>
            <button className="button" onClick={() => navigate('/dashboard')}>
              Back to dashboard
            </button>
          </div>
        </div>

        <section className="section">
          <div className="section-header">
            <h3>Native language</h3>
            <p className="muted small">Choose the language you want translations in.</p>
          </div>
          <label className="input-label" htmlFor="native-language">
            Native language
          </label>
          <select
            id="native-language"
            value={profile?.nativeLanguage || ''}
            onChange={(event) => updateProfile({ nativeLanguage: event.target.value })}
          >
            <option value="">Select your native language</option>
            {languages.map((language) => (
              <option key={language} value={language}>
                {language}
              </option>
            ))}
          </select>
        </section>

        {languages.length ? (
          <ul className="saved-languages">
            {languages.map((language) => (
              <li key={language} className="language-row saved">
                <span>{language}</span>
                {profile?.nativeLanguage === language && <span className="pill primary">Native</span>}
                {profile?.lastUsedLanguage === language && <span className="pill">Last used</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">You haven't added any languages yet.</p>
        )}
      </div>
    </div>
  )
}

export default MyLanguages
