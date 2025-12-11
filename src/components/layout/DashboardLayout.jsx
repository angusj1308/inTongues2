import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export const DASHBOARD_TABS = ['home', 'read', 'listen', 'speak', 'write', 'review']

const LANGUAGE_NATIVE_NAMES = {
  Arabic: 'العربية',
  Danish: 'Dansk',
  Dutch: 'Nederlands',
  English: 'English',
  Filipino: 'Filipino',
  Finnish: 'Suomi',
  French: 'Français',
  German: 'Deutsch',
  Greek: 'Ελληνικά',
  Hebrew: 'עברית',
  Hindi: 'हिन्दी',
  Hungarian: 'Magyar',
  Indonesian: 'Bahasa Indonesia',
  Italian: 'Italiano',
  Japanese: '日本語',
  Korean: '한국어',
  Malay: 'Bahasa Melayu',
  Mandarin: '中文',
  Norwegian: 'Norsk',
  Polish: 'Polski',
  Portuguese: 'Português',
  Romanian: 'Română',
  Russian: 'Русский',
  Spanish: 'Español',
  Swahili: 'Kiswahili',
  Swedish: 'Svenska',
  Thai: 'ไทย',
  Turkish: 'Türkçe',
  Ukrainian: 'Українська',
  Vietnamese: 'Tiếng Việt',
  Zulu: 'isiZulu',
}

const DashboardLayout = ({ activeTab = 'home', onTabChange, children }) => {
  const { user, profile, logout, addLanguage, updateProfile, setLastUsedLanguage } = useAuth()
  const navigate = useNavigate()
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [languageSearch, setLanguageSearch] = useState('')

  const languageMenuRef = useRef(null)
  const accountMenuRef = useRef(null)

  const nativeLanguage = profile?.nativeLanguage || ''
  const languages = profile?.myLanguages || []

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
    if (profile?.lastUsedLanguage) return profile.lastUsedLanguage
    if (languages.length) return languages[0]
    return ''
  }, [languages, profile?.lastUsedLanguage])

  const brandLanguage = useMemo(() => {
    if (!activeLanguage) return '...'
    const nativeName = LANGUAGE_NATIVE_NAMES[activeLanguage] || activeLanguage
    return nativeName.replace(/\s+/g, '')
  }, [activeLanguage])

  const filteredLanguages = useMemo(() => {
    if (!languageSearch.trim()) return languages
    return languages.filter((language) =>
      language.toLowerCase().includes(languageSearch.toLowerCase().trim()),
    )
  }, [languageSearch, languages])

  const handleLanguageChange = async (language) => {
    if (!language) return
    await setLastUsedLanguage(language)
    setLanguageMenuOpen(false)
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const handleRemoveLanguage = async (language) => {
    if (!language) return
    const remaining = languages.filter((entry) => entry !== language)
    const nextActive = remaining[0] || ''
    await updateProfile({
      myLanguages: remaining,
      lastUsedLanguage: nextActive,
      nativeLanguage: nativeLanguage === language ? '' : nativeLanguage,
    })
    setLanguageSearch('')
  }

  const handleAddLanguage = async () => {
    const trimmed = languageSearch.trim()
    if (!trimmed) return
    await addLanguage(trimmed)
    setLanguageSearch('')
    setLanguageMenuOpen(true)
  }

  const handleTabClick = (tab) => {
    if (!tab || tab === activeTab) return
    if (onTabChange) onTabChange(tab)
  }

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (languageMenuRef.current && !languageMenuRef.current.contains(event.target)) {
        setLanguageMenuOpen(false)
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
              <span className="dashboard-brand-prefix">in</span>
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
                <div className="dashboard-menu">
                  <div className="menu-search">
                    <input
                      type="text"
                      placeholder="Search or add language"
                      value={languageSearch}
                      onChange={(event) => setLanguageSearch(event.target.value)}
                    />
                    <button className="menu-add" onClick={handleAddLanguage} disabled={!languageSearch.trim()}>
                      Add
                    </button>
                  </div>
                  <div className="menu-section">
                    <p className="menu-label">Native language</p>
                    {nativeLanguage ? (
                      <div className="menu-row">
                        <div className="menu-language">
                          <span>{nativeLanguage}</span>
                          <span className="pill">Native</span>
                        </div>
                        <button
                          className="menu-action"
                          onClick={() => handleLanguageChange(nativeLanguage)}
                          disabled={activeLanguage === nativeLanguage}
                        >
                          {activeLanguage === nativeLanguage ? 'Active' : 'Use'}
                        </button>
                      </div>
                    ) : (
                      <p className="muted small">Set your native language inside My account.</p>
                    )}
                  </div>
                  <div className="menu-section">
                    <p className="menu-label">Studying</p>
                    {filteredLanguages.length ? (
                      filteredLanguages.map((language) => (
                        <div key={language} className="menu-row">
                          <div className="menu-language">
                            <span>{language}</span>
                            {activeLanguage === language && <span className="pill">Active</span>}
                          </div>
                          <div className="menu-actions-inline">
                            <button
                              className="menu-action"
                              onClick={() => handleLanguageChange(language)}
                              disabled={activeLanguage === language}
                            >
                              {activeLanguage === language ? 'Current' : 'Use'}
                            </button>
                            <button
                              className="menu-action subtle"
                              onClick={() => handleRemoveLanguage(language)}
                              disabled={languages.length <= 1}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="muted small">No matches. Add a new language above.</p>
                    )}
                  </div>
                  <button className="menu-footer" onClick={() => navigate('/select-language')}>
                    Open language finder
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
