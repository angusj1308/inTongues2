import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LANGUAGES } from '../constants/languages'
import { useAuth } from '../context/AuthContext'

const Signup = () => {
  const navigate = useNavigate()
  const { signup, user, profile, loading, updateProfile } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nativeLanguage, setNativeLanguage] = useState('')
  const [targetLanguage, setTargetLanguage] = useState('')
  const [nativeQuery, setNativeQuery] = useState('')
  const [targetQuery, setTargetQuery] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (loading) return
    if (user && profile) {
      navigate('/dashboard', { replace: true })
    }
  }, [loading, navigate, profile, user])

  const filterLanguages = useMemo(
    () =>
      (query) => {
        if (!query.trim()) return LANGUAGES
        return LANGUAGES.filter((language) =>
          language.toLowerCase().includes(query.trim().toLowerCase())
        )
      },
    []
  )

  const nativeSuggestions = useMemo(
    () => filterLanguages(nativeQuery).slice(0, 8),
    [filterLanguages, nativeQuery]
  )

  const targetSuggestions = useMemo(
    () => filterLanguages(targetQuery).slice(0, 8),
    [filterLanguages, targetQuery]
  )

  const handleLanguageInputChange = (value, setLanguage, setQuery) => {
    setQuery(value)
    const match = LANGUAGES.find(
      (language) => language.toLowerCase() === value.trim().toLowerCase()
    )
    if (match) {
      setLanguage(match)
      setQuery(match)
    } else {
      setLanguage('')
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      if (!nativeLanguage || !targetLanguage) {
        setError('Please choose your native language and first target language.')
        return
      }
      await signup(email, password)
      await updateProfile({
        nativeLanguage,
        myLanguages: [targetLanguage],
        targetLanguages: [targetLanguage],
        lastUsedLanguage: targetLanguage,
      })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err.message || 'Failed to create account')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-brand">
        inTongues<span className="brand-dot">.</span>
      </div>
      <h1 className="login-title">Create your account</h1>
      <p className="login-subtitle">Sign up to start your language learning journey.</p>
      <form onSubmit={handleSubmit} className="login-form">
        <label>
          Email
          <input
            className="login-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </label>
        <label>
          Password
          <input
            className="login-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
          />
        </label>
        <label>
          Native language
          <span className="input-helper">We'll translate everything into this language.</span>
          <input
            className="login-input"
            type="text"
            list="native-language-options"
            placeholder="Select your native language"
            value={nativeQuery}
            onChange={(e) =>
              handleLanguageInputChange(e.target.value, setNativeLanguage, setNativeQuery)
            }
          />
          <datalist id="native-language-options">
            {nativeSuggestions.map((language) => (
              <option key={language} value={language} />
            ))}
          </datalist>
        </label>
        <label>
          First target language
          <span className="input-helper">Pick the language you want to learn first.</span>
          <input
            className="login-input"
            type="text"
            list="target-language-options"
            placeholder="Select your first target language"
            value={targetQuery}
            onChange={(e) =>
              handleLanguageInputChange(e.target.value, setTargetLanguage, setTargetQuery)
            }
          />
          <datalist id="target-language-options">
            {targetSuggestions.map((language) => (
              <option key={language} value={language} />
            ))}
          </datalist>
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="login-button" disabled={submitting}>
          {submitting ? 'Creating account...' : 'Sign up'}
        </button>
      </form>
      <p className="login-footer">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </div>
  )
}

export default Signup
