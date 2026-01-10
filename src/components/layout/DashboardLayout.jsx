import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { filterSupportedLanguages, resolveSupportedLanguageLabel, toLanguageLabel } from '../../constants/languages'
import { resetVocabProgress } from '../../services/vocab'

export const DASHBOARD_TABS = ['read', 'listen', 'speak', 'write', 'review', 'tutor']

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
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(null) // language being confirmed for reset
  const [resetting, setResetting] = useState(false)

  const languageMenuRef = useRef(null)
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
      if (languageMenuRef.current && !languageMenuRef.current.contains(event.target)) {
        setLanguageMenuOpen(false)
        setConfirmReset(null)
      }
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target)) {
        setAccountMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="page dashboard-page">
      <header className="dashboard-header">
        <div className="dashboard-brand-band">
          <button className="dashboard-brand-button" onClick={() => handleTabClick('home')}>
            <div className="dashboard-brand">
              <span className="dashboard-brand-prefix">{brandPrefix}</span>
              <span className="dashboard-brand-language">{brandLanguage}</span>
              <span className="brand-dot">.</span>
            </div>
          </button>

          <nav className="dashboard-nav" aria-label="Dashboard navigation">
            {DASHBOARD_TABS.map((tab, index) => (
              <div
                key={tab}
                className={`dashboard-nav-item ${activeTab === tab ? 'active' : ''}`}
              >
                <button
                  className={`dashboard-nav-button ui-text ${activeTab === tab ? 'active' : ''}`}
                  onClick={() => handleTabClick(tab)}
                >
                  {tab}
                </button>
                {index < DASHBOARD_TABS.length - 1 && <span className="dashboard-nav-divider">|</span>}
              </div>
            ))}
          </nav>

          <div className="dashboard-controls">
            <div className="dashboard-dropdown" ref={languageMenuRef}>
              <button
                className="dashboard-control ui-text"
                onClick={() => {
                  setLanguageMenuOpen(!languageMenuOpen)
                  setAccountMenuOpen(false)
                }}
              >
                My languages
              </button>
              {languageMenuOpen && (
                <div className="dashboard-menu lang-menu">
                  <div className="lang-menu-section">
                    <p className="lang-menu-label">Studying</p>
                    {languages.length ? (
                      languages.map((language) => (
                        <div key={language} className="lang-menu-item">
                          {confirmReset === language ? (
                            <div className="lang-menu-confirm">
                              <span className="lang-menu-confirm-text">Reset all progress?</span>
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
                                className={`lang-menu-name ${activeLanguage === language ? 'active' : ''}`}
                                onClick={() => handleLanguageChange(language)}
                              >
                                <span className="lang-menu-name-text">
                                  {language}
                                  {nativeLanguage === language && (
                                    <span className="lang-menu-native-tag">native</span>
                                  )}
                                </span>
                                {activeLanguage === language && (
                                  <span className="lang-menu-active-dot" />
                                )}
                              </button>
                              <div className="lang-menu-actions">
                                <button
                                  className="lang-menu-icon-btn"
                                  onClick={() => handleResetProgress(language)}
                                  title="Reset progress"
                                >
                                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
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
                                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M18 6L6 18M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="lang-menu-empty">No languages yet.</p>
                    )}
                  </div>

                  <button className="lang-menu-footer" onClick={() => navigate('/select-language')}>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    Add new language
                  </button>
                </div>
              )}
            </div>

            <div className="dashboard-dropdown" ref={accountMenuRef}>
              <button
                className="dashboard-control ui-text"
                onClick={() => {
                  setAccountMenuOpen(!accountMenuOpen)
                  setLanguageMenuOpen(false)
                }}
              >
                My account
              </button>
              {accountMenuOpen && (
                <div className="dashboard-menu">
                  <div className="menu-section">
                    <p className="menu-label">Profile</p>
                    <p className="muted small">Account settings coming soon.</p>
                  </div>
                  <button className="menu-footer" onClick={handleLogout}>
                    Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="dashboard-main">
        <div className="dashboard-wrapper">{children}</div>
      </main>
    </div>
  )
}

export default DashboardLayout
