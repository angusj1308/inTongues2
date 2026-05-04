import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { filterSupportedLanguages, resolveSupportedLanguageLabel, toLanguageLabel } from '../../constants/languages'
import { resetVocabProgress } from '../../services/vocab'
import spanishFlag from '../../assets/spanishflag.png'
import flagEnglish from '../../assets/english.png'
import flagFrench from '../../assets/french.png'
import flagSpanish from '../../assets/spanish.png'
import flagItalian from '../../assets/italian.png'

export const DASHBOARD_TABS = ['read', 'listen', 'speak', 'write', 'review'] // HIDDEN: 'tutor' — restore when speaking build ships

// GATED: Tabs with output features under development — remove entries to un-gate
const GATED_TABS = new Set(['speak', 'write'])

// Flag images for the header language picker. Map by language label
// to the bundled PNG; languages without a registered flag fall back
// to a globe glyph in the JSX.
const LANGUAGE_FLAGS = {
  English: flagEnglish,
  French: flagFrench,
  Spanish: flagSpanish,
  Italian: flagItalian,
}

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

// Acts 2:4 — "and they began to speak in other tongues" in each language
const LANGUAGE_TAGLINE = {
  English: 'and they began to speak in other tongues',
  French: "et ils se mirent à parler en d'autres langues",
  Spanish: 'y comenzaron a hablar en otras lenguas',
  Italian: 'e cominciarono a parlare in altre lingue',
  German: 'und fingen an, in anderen Sprachen zu reden',
  Portuguese: 'e começaram a falar em outras línguas',
  Japanese: '他国のいろいろな言葉で話しはじめた',
  Chinese: '他们就开始说起别种语言来',
  Korean: '다른 언어로 말하기 시작하니라',
  Russian: 'и начали говорить на иных языках',
  Arabic: 'وابتدأوا يتكلمون بألسنة أخرى',
  Dutch: 'en zij begonnen in andere talen te spreken',
  Swedish: 'och började tala andra tungomål',
  Norwegian: 'og de begynte å tale i andre tungemål',
  Danish: 'og de begyndte at tale i andre tungemål',
  Polish: 'i zaczęli mówić innymi językami',
  Turkish: 'başka dillerle konuşmaya başladılar',
  Greek: 'και άρχισαν να μιλούν σε άλλες γλώσσες',
  Hebrew: 'והחלו לדבר בלשונות אחרות',
  Hindi: 'और वे अन्य भाषाओं में बोलने लगे',
}

const DashboardLayout = ({ activeTab = 'home', onTabChange, children }) => {
  const { user, profile, logout, updateProfile, setLastUsedLanguage } = useAuth()
  const navigate = useNavigate()
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(null) // language being confirmed for reset
  const [resetting, setResetting] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode')
    return saved ? JSON.parse(saved) : false
  })

  const accountMenuRef = useRef(null)
  const languageMenuRef = useRef(null)

  // Sync dark mode with document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
    localStorage.setItem('darkMode', JSON.stringify(darkMode))
  }, [darkMode])

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

  const brandTagline = useMemo(() => {
    if (!activeLanguage) return LANGUAGE_TAGLINE.English
    return LANGUAGE_TAGLINE[activeLanguage] || LANGUAGE_TAGLINE.English
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
      if (languageMenuRef.current && !languageMenuRef.current.contains(event.target)) {
        setLanguageMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Toggle is-scrolled on the sticky top nav so the hairline rule
  // appears only past scroll 0.
  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 0)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="page dashboard-page">
      <div className={`dashboard-header-row${isScrolled ? ' is-scrolled' : ''}`}>
          <button
            className="dashboard-logo"
            onClick={() => onTabChange && onTabChange('home')}
            aria-label="Go to home"
          >
            <span className="dashboard-logo-prefix">in</span>
            <span className="dashboard-logo-language">Tongues</span>
            <span className="dashboard-logo-dot">.</span>
          </button>
          <nav className="dashboard-nav" aria-label="Dashboard navigation">
            {DASHBOARD_TABS.map((tab) => (
              <button
                key={tab}
                className={`dashboard-nav-button ui-text ${activeTab === tab ? 'active' : ''}${GATED_TABS.has(tab) ? ' dashboard-nav-gated' : ''}`}
                onClick={() => handleTabClick(tab)}
              >
                {tab}
              </button>
            ))}
          </nav>

          <div className="dashboard-header-actions">
            <div className="dashboard-dropdown" ref={languageMenuRef} style={{ order: 99 }}>
              <button
                type="button"
                className="dashboard-language-btn"
                onClick={() => setLanguageMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={languageMenuOpen}
                aria-label={`Active language: ${activeLanguage || 'none'}`}
              >
                {LANGUAGE_FLAGS[activeLanguage] ? (
                  <img
                    src={LANGUAGE_FLAGS[activeLanguage]}
                    alt=""
                    className="dashboard-language-flag-img"
                  />
                ) : (
                  <span className="dashboard-language-flag" aria-hidden="true">🌐</span>
                )}
              </button>
              {languageMenuOpen && (
                <div className="dashboard-menu language-menu" role="menu">
                  {languages.map((lang) => {
                    const isActive = lang === activeLanguage
                    return (
                      <button
                        key={lang}
                        type="button"
                        className={`language-menu-item${isActive ? ' is-active' : ''}`}
                        onClick={() => handleLanguageChange(lang)}
                        role="menuitem"
                      >
                        <span className="language-menu-flag" aria-hidden="true">
                          {LANGUAGE_FLAGS[lang] ? (
                            <img src={LANGUAGE_FLAGS[lang]} alt="" />
                          ) : (
                            '🌐'
                          )}
                        </span>
                        <span className="language-menu-name">
                          {LANGUAGE_NATIVE_NAMES[lang] || lang}
                        </span>
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    className="language-menu-item language-menu-add"
                    onClick={() => {
                      setLanguageMenuOpen(false)
                      navigate('/select-language')
                    }}
                    role="menuitem"
                  >
                    <span className="language-menu-flag" aria-hidden="true">+</span>
                    <span className="language-menu-name">Add language</span>
                  </button>
                </div>
              )}
            </div>

            <button
              className="dashboard-text-btn"
              onClick={() => setDarkMode(!darkMode)}
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              Theme
            </button>

            <div className="dashboard-dropdown" ref={accountMenuRef}>
              <button
                className="dashboard-text-btn"
                onClick={() => {
                  setAccountMenuOpen(!accountMenuOpen)
                }}
                aria-label="Account menu"
              >
                Account
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

      <main className="dashboard-main">
        <div className="dashboard-wrapper">{children}</div>
      </main>
    </div>
  )
}

export default DashboardLayout
