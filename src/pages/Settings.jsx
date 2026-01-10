import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { filterSupportedLanguages, resolveSupportedLanguageLabel, toLanguageLabel } from '../constants/languages'
import { resetVocabProgress } from '../services/vocab'

const SETTINGS_SECTIONS = [
  { id: 'languages', label: 'Languages', icon: 'globe' },
  { id: 'account', label: 'Account', icon: 'user' },
  { id: 'subscription', label: 'Subscription', icon: 'card' },
]

const Settings = () => {
  const { user, profile, logout, updateProfile, setLastUsedLanguage } = useAuth()
  const navigate = useNavigate()
  const [activeSection, setActiveSection] = useState('languages')
  const [confirmReset, setConfirmReset] = useState(null)
  const [resetting, setResetting] = useState(false)

  const nativeLanguageRaw = profile?.nativeLanguage || ''
  const allLanguages = profile?.myLanguages || []
  const languages = filterSupportedLanguages(allLanguages)

  const activeLanguage = (() => {
    if (profile?.lastUsedLanguage) return resolveSupportedLanguageLabel(profile.lastUsedLanguage, '')
    if (languages.length) return languages[0]
    return ''
  })()

  const handleLanguageChange = async (language) => {
    const nextLanguage = toLanguageLabel(language)
    if (!nextLanguage) return
    await setLastUsedLanguage(nextLanguage)
  }

  const handleRemoveLanguage = async (language) => {
    if (!language) return
    const remaining = allLanguages.filter((entry) => entry !== language)
    const nextActive = resolveSupportedLanguageLabel(
      remaining.find((entry) => toLanguageLabel(entry)),
      '',
    )
    await updateProfile({
      myLanguages: remaining,
      lastUsedLanguage: nextActive,
      nativeLanguage: nativeLanguageRaw === language ? '' : nativeLanguageRaw,
    })
  }

  const handleResetProgress = async (language) => {
    if (!user || !language || resetting) return

    if (confirmReset !== language) {
      setConfirmReset(language)
      return
    }

    setResetting(true)
    try {
      const count = await resetVocabProgress(user.uid, language)
      console.log(`Reset ${count} words for ${language}`)
      setConfirmReset(null)
    } catch (err) {
      console.error('Failed to reset progress:', err)
    } finally {
      setResetting(false)
    }
  }

  const renderIcon = (icon) => {
    switch (icon) {
      case 'globe':
        return (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        )
      case 'user':
        return (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        )
      case 'card':
        return (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
            <line x1="1" y1="10" x2="23" y2="10" />
          </svg>
        )
      default:
        return null
    }
  }

  const renderLanguagesPanel = () => (
    <div className="settings-panel">
      <h2 className="settings-panel-title">Languages</h2>
      <p className="settings-panel-description">Manage your learning languages and progress.</p>

      <div className="settings-section">
        <h3 className="settings-section-title">My Languages</h3>
        {languages.length ? (
          <div className="settings-language-list">
            {languages.map((language) => (
              <div key={language} className="settings-language-item">
                {confirmReset === language ? (
                  <div className="settings-confirm-reset">
                    <span>Reset all progress for {language}?</span>
                    <div className="settings-confirm-actions">
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleResetProgress(language)}
                        disabled={resetting}
                      >
                        {resetting ? 'Resetting...' : 'Yes, reset'}
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setConfirmReset(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="settings-language-info">
                      <button
                        className={`settings-language-name ${activeLanguage === language ? 'active' : ''}`}
                        onClick={() => handleLanguageChange(language)}
                      >
                        {language}
                        {activeLanguage === language && <span className="settings-active-badge">Active</span>}
                      </button>
                    </div>
                    <div className="settings-language-actions">
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setConfirmReset(language)}
                        title="Reset progress"
                      >
                        Reset progress
                      </button>
                      <button
                        className="btn btn-ghost btn-sm danger"
                        onClick={() => handleRemoveLanguage(language)}
                        disabled={languages.length <= 1}
                        title="Remove language"
                      >
                        Remove
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">No languages added yet.</p>
        )}

        <button className="btn btn-secondary" onClick={() => navigate('/select-language')}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add language
        </button>
      </div>
    </div>
  )

  const renderAccountPanel = () => (
    <div className="settings-panel">
      <h2 className="settings-panel-title">Account</h2>
      <p className="settings-panel-description">Manage your account details and preferences.</p>

      <div className="settings-section">
        <h3 className="settings-section-title">Email</h3>
        <p className="settings-value">{user?.email || 'Not set'}</p>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">Danger Zone</h3>
        <button className="btn btn-danger" onClick={logout}>
          Log out
        </button>
      </div>
    </div>
  )

  const renderSubscriptionPanel = () => (
    <div className="settings-panel">
      <h2 className="settings-panel-title">Subscription</h2>
      <p className="settings-panel-description">Manage your subscription and billing.</p>

      <div className="settings-section">
        <p className="muted">Subscription management coming soon.</p>
      </div>
    </div>
  )

  const renderPanel = () => {
    switch (activeSection) {
      case 'languages':
        return renderLanguagesPanel()
      case 'account':
        return renderAccountPanel()
      case 'subscription':
        return renderSubscriptionPanel()
      default:
        return renderLanguagesPanel()
    }
  }

  return (
    <div className="page settings-page">
      <div className="settings-container">
        <div className="settings-header">
          <button className="settings-back-btn" onClick={() => navigate('/dashboard')}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back to Dashboard
          </button>
          <h1 className="settings-title">Settings</h1>
        </div>

        <div className="settings-layout">
          <nav className="settings-sidebar">
            {SETTINGS_SECTIONS.map((section) => (
              <button
                key={section.id}
                className={`settings-nav-item ${activeSection === section.id ? 'active' : ''}`}
                onClick={() => setActiveSection(section.id)}
              >
                {renderIcon(section.icon)}
                {section.label}
              </button>
            ))}
          </nav>

          <main className="settings-content">
            {renderPanel()}
          </main>
        </div>
      </div>
    </div>
  )
}

export default Settings
