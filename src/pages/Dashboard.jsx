import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const DASHBOARD_TABS = ['read', 'listen', 'speak', 'write', 'review']

const Dashboard = () => {
  const { user, profile, logout, addLanguage, updateProfile, setLastUsedLanguage } = useAuth()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('read')
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [languageSearch, setLanguageSearch] = useState('')

  const languageMenuRef = useRef(null)
  const accountMenuRef = useRef(null)

  const hasLanguages = Boolean(profile?.myLanguages?.length)

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
    if (profile?.myLanguages?.length) return profile.myLanguages[0]
    return ''
  }, [profile?.lastUsedLanguage, profile?.myLanguages])

  const brandLanguage = useMemo(() => {
    if (!activeLanguage) return '...'
    return activeLanguage.replace(/\s+/g, '')
  }, [activeLanguage])

  const nativeLanguage = profile?.nativeLanguage || ''
  const languages = profile?.myLanguages || []

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

  const handleGenerateClick = () => {
    if (!activeLanguage) return
    navigate(`/generate/${encodeURIComponent(activeLanguage)}`)
  }

  const handleTabClick = (tab) => {
    if (tab === 'review') {
      navigate('/review')
      return
    }
    if (tab === 'listen') {
      navigate('/listening')
      return
    }
    setActiveTab(tab)
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
      <div className="dashboard-wrapper">
        <div className="dashboard-brand-band">
          <div className="dashboard-brand login-brand">
            {`in${brandLanguage}`}
            <span className="brand-dot">.</span>
          </div>
          <div className="dashboard-controls">
            <div className="dashboard-dropdown" ref={languageMenuRef}>
              <button
                className="dashboard-control"
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
                className="dashboard-control"
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

        <div className="dashboard-nav">
          {DASHBOARD_TABS.map((tab, index) => (
            <div key={tab} className="dashboard-nav-item">
              <button
                className={`dashboard-nav-button ${activeTab === tab ? 'active' : ''}`}
                onClick={() => handleTabClick(tab)}
              >
                {tab}
              </button>
              {index < DASHBOARD_TABS.length - 1 && <span className="dashboard-nav-divider">|</span>}
            </div>
          ))}
        </div>

        <div className="card dashboard-card">
          <div className="tab-panel">
            {activeTab === 'read' ? (
              <div className="read-grid">
                <div className="read-card">
                  <h3>Library</h3>
                  <p className="muted small">
                    Browse curated stories and articles tailored for {activeLanguage || 'your language'}.
                  </p>
                  <button
                    className="button ghost"
                    onClick={() => navigate(`/library/${encodeURIComponent(activeLanguage)}`)}
                    disabled={!activeLanguage}
                  >
                    View library
                  </button>
                </div>
                <div className="read-card">
                  <h3>Import</h3>
                  <p className="muted small">Bring in your own texts to practice reading comprehension.</p>
                  <button
                    className="button ghost"
                    onClick={() => navigate(`/import/${encodeURIComponent(activeLanguage)}`)}
                    disabled={!activeLanguage}
                  >
                    Import for {activeLanguage || 'language'}
                  </button>
                </div>
                <div className="read-card">
                  <h3>Generate</h3>
                  <p className="muted small">Create new passages on topics you love.</p>
                  <button className="button ghost" onClick={handleGenerateClick} disabled={!activeLanguage}>
                    Generate for {activeLanguage || 'language'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="coming-soon">
                <p className="muted">{activeTab} — feature coming soon.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
