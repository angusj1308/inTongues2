import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { filterSupportedLanguages } from '../constants/languages'
import { useAuth } from '../context/AuthContext'

const Login = () => {
  const navigate = useNavigate()
  const { login, user, profile, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (loading) return
    if (user && profile) {
      if (filterSupportedLanguages(profile.myLanguages || []).length) {
        navigate('/dashboard', { replace: true })
      } else {
        navigate('/select-language', { replace: true })
      }
    }
  }, [loading, navigate, profile, user])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await login(email, password)
    } catch (err) {
      setError(err.message || 'Failed to log in')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-brand">
        inTongues<span className="brand-dot">.</span>
      </div>
      <h1 className="login-title">Welcome back</h1>
      <p className="login-subtitle">Log in with your email and password.</p>
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
            autoComplete="current-password"
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="login-button" disabled={submitting}>
          {submitting ? 'Signing in...' : 'Log in'}
        </button>
      </form>
      <p className="login-footer">
        Need an account? <Link to="/signup">Create one</Link>
      </p>
    </div>
  )
}

export default Login
