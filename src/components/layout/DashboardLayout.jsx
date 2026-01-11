import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import spanishFlame from '../../assets/redflame.png'
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

          <div className="dashboard-header-actions">
            <button
              className="dashboard-icon-btn"
              onClick={() => {
                // TODO: Toggle dark mode
                console.log('Toggle dark mode')
              }}
              aria-label="Toggle dark mode"
              title="Toggle dark mode"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="5" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            </button>

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
                  <button
                    className="menu-item"
                    onClick={() => {
                      setAccountMenuOpen(false)
                      navigate('/settings')
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                    </svg>
                    Account Settings
                  </button>
                  <button className="menu-item danger" onClick={handleLogout}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                    </svg>
                    Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Centered brand below nav */}
        <div className="dashboard-brand-row">
          <span className="dashboard-brand-line" />
          <button
            className="dashboard-brand-center"
            onClick={() => onTabChange && onTabChange('home')}
            aria-label="Go to home"
          >
            {activeLanguage === 'Spanish' && (
              <img src={spanishFlame} alt="" className="brand-flame brand-flame-above" />
            )}
            <div className="dashboard-brand">
              <span className="dashboard-brand-prefix">{brandPrefix}</span>
              <span className="dashboard-brand-language">{brandLanguage}</span>
              {activeLanguage !== 'Spanish' && <span className="brand-dot">.</span>}
            </div>
            <p className="dashboard-tagline">y comenzaron a hablar en otras lenguas</p>
          </button>
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
