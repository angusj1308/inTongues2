import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { filterSupportedLanguages, resolveSupportedLanguageLabel, toLanguageLabel } from '../../constants/languages'
import { resetVocabProgress } from '../../services/vocab'

export const DASHBOARD_TABS = ['home', 'read', 'listen', 'speak', 'write', 'review', 'tutor']

const LANGUAGE_NATIVE_NAMES = {
  English: 'English',
  French: 'Français',
  Spanish: 'Español',
  Italian: 'Italiano',
  German: 'Deutsch',
  Portuguese: 'Português',
  Japanese: '日本語',
  Chinese: '中文',
  Korean: '한국어',
  Russian: 'Русский',
  Arabic: 'العربية',
  Dutch: 'Nederlands',
  Swedish: 'Svenska',
  Norwegian: 'Norsk',
  Danish: 'Dansk',
  Polish: 'Polski',
  Turkish: 'Türkçe',
  Greek: 'Ελληνικά',
  Hebrew: 'עברית',
  Hindi: 'हिन्दी',
}

// "in" translated to each language
const LANGUAGE_PREFIX = {
  English: 'in',
  French: 'en',
  Spanish: 'en',
  Italian: 'in',
  German: 'auf',
  Portuguese: 'em',
  Japanese: 'で',
  Chinese: '用',
  Korean: '로',
  Russian: 'на',
  Arabic: 'بـ',
  Dutch: 'in',
  Swedish: 'på',
  Norwegian: 'på',
  Danish: 'på',
  Polish: 'po',
  Turkish: 'de',
  Greek: 'στα',
  Hebrew: 'ב',
  Hindi: 'में',
}

const DashboardLayout = ({ activeTab = 'home', onTabChange, children }) => {
  const { user, profile, logout, updateProfile, setLastUsedLanguage } = useAuth()
  const navigate = useNavigate()
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(null) // language being confirmed for reset
  const [resetting, setResetting] = useState(false)

  const accountMenuRef = useRef(null)

  const nativeLanguageRaw = profile?.nativeLanguage || ''
  const nativeLanguage = resolveSupportedLanguageLabel(nativeLanguageRaw, '')
  const allLanguages = profile?.myLanguages || []
  const languages = filterSupportedLanguages(allLanguages)

  const hasLanguages = Boolean(languages.length)

  useEffect(() => {
    if (!user) {
      navigate('/login')
    }
  }, [navigate, user])

  useEffect(() => {
    if (user && profile && !hasLanguages) {
      navigate('/select-language')
    }
  }, [hasLanguages, navigate, profile, user])

  const activeLanguage = useMemo(() => {
    if (profile?.lastUsedLanguage) return resolveSupportedLanguageLabel(profile.lastUsedLanguage, '')
    if (languages.length) return languages[0]
    return ''
  }, [languages, profile?.lastUsedLanguage])

  const brandLanguage = useMemo(() => {
    if (!activeLanguage) return '...'
    const nativeName = LANGUAGE_NATIVE_NAMES[activeLanguage] || activeLanguage
    return nativeName.replace(/\s+/g, '')
  }, [activeLanguage])

  const brandPrefix = useMemo(() => {
    if (!activeLanguage) return 'in'
    return LANGUAGE_PREFIX[activeLanguage] || 'in'
  }, [activeLanguage])

  const handleLanguageChange = async (language) => {
    const nextLanguage = toLanguageLabel(language)
    if (!nextLanguage) return
    await setLastUsedLanguage(nextLanguage)
    setLanguageMenuOpen(false)
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
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

    // If not confirmed, show confirmation
    if (confirmReset !== language) {
      setConfirmReset(language)
      return
    }

    // Confirmed - do the reset
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

  const handleTabClick = (tab) => {
    if (!tab || tab === activeTab) return
    // Navigate to /tutor for tutor tab instead of showing inline
    if (tab === 'tutor') {
      navigate('/tutor')
      return
    }
    if (onTabChange) onTabChange(tab)
  }

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target)) {
        setAccountMenuOpen(false)
        setConfirmReset(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="page dashboard-page">
      <header className="dashboard-header dashboard-header-minimal">
        <div className="dashboard-header-row">
          <nav className="dashboard-nav" aria-label="Dashboard navigation">
            {DASHBOARD_TABS.map((tab) => (
              <button
                key={tab}
                className={`dashboard-nav-button ui-text ${activeTab === tab ? 'active' : ''}`}
                onClick={() => handleTabClick(tab)}
              >
                {tab}
              </button>
            ))}
          </nav>

          <div className="dashboard-dropdown" ref={accountMenuRef}>
            <button
              className="dashboard-account-btn"
              onClick={() => {
                setAccountMenuOpen(!accountMenuOpen)
              }}
              aria-label="Account menu"
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </button>
            {accountMenuOpen && (
              <div className="dashboard-menu account-menu">
                {/* Languages section */}
                <div className="menu-section">
                  <p className="menu-label">My Languages</p>
                  {languages.length ? (
                    <div className="account-lang-list">
                      {languages.map((language) => (
                        <div key={language} className="account-lang-item">
                          {confirmReset === language ? (
                            <div className="lang-menu-confirm">
                              <span className="lang-menu-confirm-text">Reset progress?</span>
                              <div className="lang-menu-confirm-actions">
                                <button
                                  className="lang-menu-confirm-yes"
                                  onClick={() => handleResetProgress(language)}
                                  disabled={resetting}
                                >
                                  {resetting ? '...' : 'Yes'}
                                </button>
                                <button
                                  className="lang-menu-confirm-no"
                                  onClick={() => setConfirmReset(null)}
                                >
                                  No
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <button
                                className={`account-lang-name ${activeLanguage === language ? 'active' : ''}`}
                                onClick={() => handleLanguageChange(language)}
                              >
                                {language}
                                {activeLanguage === language && <span className="account-lang-dot" />}
                              </button>
                              <div className="account-lang-actions">
                                <button
                                  className="lang-menu-icon-btn"
                                  onClick={() => handleResetProgress(language)}
                                  title="Reset progress"
                                >
                                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M1 4v6h6" />
                                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                                  </svg>
                                </button>
                                <button
                                  className="lang-menu-icon-btn danger"
                                  onClick={() => handleRemoveLanguage(language)}
                                  disabled={languages.length <= 1}
                                  title="Remove language"
                                >
                                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M18 6L6 18M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="muted small">No languages yet.</p>
                  )}
                  <button className="account-add-lang" onClick={() => navigate('/select-language')}>
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    Add language
                  </button>
                </div>

                <div className="menu-divider" />

                {/* Account section */}
                <div className="menu-section">
                  <p className="menu-label">Account</p>
                  <p className="muted small">{user?.email || 'Settings coming soon'}</p>
                </div>

                <button className="menu-footer" onClick={handleLogout}>
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Centered brand below nav */}
        <div className="dashboard-brand-row">
          <span className="dashboard-brand-line" />
          <div className="dashboard-brand-center">
            <div className="dashboard-brand">
              <span className="dashboard-brand-prefix">{brandPrefix}</span>
              <span className="dashboard-brand-language">{brandLanguage}</span>
              <span className="brand-dot">.</span>
            </div>
            <p className="dashboard-tagline">y comenzaron a hablar en otras lenguas</p>
          </div>
          <span className="dashboard-brand-line" />
        </div>
      </header>

      <main className="dashboard-main">
        <div className="dashboard-wrapper">{children}</div>
      </main>
    </div>
  )
}

export default DashboardLayout
