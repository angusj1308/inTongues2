import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { filterSupportedLanguages, resolveSupportedLanguageLabel, toLanguageLabel } from '../../constants/languages'

export const DASHBOARD_TABS = ['home', 'read', 'listen', 'speak', 'write', 'review']

const LANGUAGE_NATIVE_NAMES = {
  English: 'English',
  French: 'Français',
  Spanish: 'Español',
  Italian: 'Italiano',
}

const DashboardLayout = ({ activeTab = 'home', onTabChange, children }) => {
  const { user, profile, logout, addLanguage, updateProfile, setLastUsedLanguage } = useAuth()
  const navigate = useNavigate()
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [languageSearch, setLanguageSearch] = useState('')

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

  const filteredLanguages = useMemo(() => {
    if (!languageSearch.trim()) return languages
    return languages.filter((language) =>
      language.toLowerCase().includes(languageSearch.toLowerCase().trim()),
    )
  }, [languageSearch, languages])

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
    setLanguageSearch('')
  }

  const handleAddLanguage = async () => {
    const trimmed = languageSearch.trim()
    if (!trimmed) return
    const resolvedLanguage = toLanguageLabel(trimmed)
    if (!resolvedLanguage) return
    await addLanguage(resolvedLanguage)
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
