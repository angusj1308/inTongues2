import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ImportBookPanel from '../components/read/ImportBookPanel'
import GenerateStoryPanel from '../components/read/GenerateStoryPanel'
import { useAuth } from '../context/AuthContext'

const DASHBOARD_TABS = ['home', 'read', 'listen', 'speak', 'write', 'review']

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

const Dashboard = () => {
  const { user, profile, logout, addLanguage, updateProfile, setLastUsedLanguage } = useAuth()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('home')
  const [slideDirection, setSlideDirection] = useState('')
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
    const nativeName = LANGUAGE_NATIVE_NAMES[activeLanguage] || activeLanguage
    return nativeName.replace(/\s+/g, '')
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

  const handleTabClick = (tab) => {
    if (tab === activeTab) return

    const currentIndex = DASHBOARD_TABS.indexOf(activeTab)
    const nextIndex = DASHBOARD_TABS.indexOf(tab)

    if (nextIndex > currentIndex) {
      setSlideDirection('right')
    } else if (nextIndex < currentIndex) {
      setSlideDirection('left')
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
      <header className="dashboard-header">
        <div className="dashboard-brand-band">
          <button className="dashboard-brand-button" onClick={() => handleTabClick('home')}>
            <div className="dashboard-brand">
              {`in${brandLanguage}`}
              <span className="brand-dot">.</span>
            </div>
          </button>
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

      <nav className="dashboard-nav-bar">
        <div className="dashboard-nav">
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
        </div>
      </nav>

      <div className="dashboard-wrapper">
        <div className="card dashboard-card">
          <div className="tab-panel">
            <div
              className={`tab-panel-inner ${
                slideDirection === 'right'
                  ? 'slide-in-right'
                  : slideDirection === 'left'
                    ? 'slide-in-left'
                    : ''
              }`}
              key={activeTab}
            >
              {activeTab === 'home' && (
                <div className="home-grid">
                  <div className="stat-card">
                    <div className="stat-label ui-text">Daily streak</div>
                    <div className="stat-value">— days</div>
                    <p className="muted small">Keep showing up each day to grow your streak.</p>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label ui-text">Minutes today</div>
                    <div className="stat-value">00:00</div>
                    <p className="muted small">Track how much time you spend practicing.</p>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label ui-text">Words reviewed</div>
                    <div className="stat-value">0</div>
                    <p className="muted small">Your spaced repetition stats will appear here.</p>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label ui-text">Sessions this week</div>
                    <div className="stat-value">0</div>
                    <p className="muted small">See your weekly rhythm at a glance.</p>
                  </div>
                </div>
              )}

              {activeTab === 'read' && (
                <div className="read-layout">
                  <section className="read-section continue-section">
                    <div className="continue-card">
                      <div className="continue-card-meta">
                        <span className="continue-card-label ui-text">Continue reading</span>
                        <div className="continue-card-title">Your current book</div>
                        <div className="continue-card-progress ui-text">Spanish · Chapter X · 12% complete</div>
                      </div>
                      <div className="continue-card-actions">
                        <button
                          className="button ghost"
                          onClick={() => navigate(`/library/${encodeURIComponent(activeLanguage)}`)}
                          disabled={!activeLanguage}
                        >
                          Resume
                        </button>
                      </div>
                    </div>
                  </section>

                  <section className="read-section">
                    <div className="read-section-header">
                      <h3>My library</h3>
                      <button
                        className="text-link ui-text"
                        onClick={() => navigate(`/library/${encodeURIComponent(activeLanguage)}`)}
                        disabled={!activeLanguage}
                      >
                        View all →
                      </button>
                    </div>
                    <div className="book-grid">
                      {[
                        { title: 'Cuentos Cortos', progress: 40 },
                        { title: 'Historias del Día', progress: 65 },
                        { title: 'Diálogos Urbanos', progress: 15 },
                        { title: 'Notas de Viaje', progress: 5 },
                      ].map((book) => (
                        <div
                          key={book.title}
                          className="book-tile"
                          role="button"
                          tabIndex={0}
                          onClick={() => navigate(`/library/${encodeURIComponent(activeLanguage)}`)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              navigate(`/library/${encodeURIComponent(activeLanguage)}`)
                            }
                          }}
                        >
                          <div className="book-tile-cover" />
                          <div className="book-tile-title">{book.title}</div>
                          <div className="book-tile-meta ui-text">Spanish · A2</div>
                          <div className="book-progress-bar">
                            <div className="book-progress-bar-inner" style={{ width: `${book.progress}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="read-section">
                    <div className="read-section-header">
                      <h3>InTongues library</h3>
                      <button
                        className="text-link ui-text"
                        onClick={() => navigate(`/library/${encodeURIComponent(activeLanguage)}`)}
                        disabled={!activeLanguage}
                      >
                        Browse all →
                      </button>
                    </div>
                    <div className="book-grid">
                      {[
                        { title: 'Short Stories A2', level: 'A2', progress: 25 },
                        { title: 'Everyday Dialogues B1', level: 'B1', progress: 50 },
                        { title: 'Cultural Notes A1', level: 'A1', progress: 10 },
                        { title: 'Reading Sprints B2', level: 'B2', progress: 70 },
                      ].map((book) => (
                        <div
                          key={book.title}
                          className="book-tile"
                          role="button"
                          tabIndex={0}
                          onClick={() => navigate(`/library/${encodeURIComponent(activeLanguage)}`)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              navigate(`/library/${encodeURIComponent(activeLanguage)}`)
                            }
                          }}
                        >
                          <div className="book-tile-cover" />
                          <div className="book-tile-title">{book.title}</div>
                          <div className="book-tile-meta ui-text">{book.level} · Curated</div>
                          <div className="book-progress-bar">
                            <div className="book-progress-bar-inner" style={{ width: `${book.progress}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  {activeLanguage ? (
                    <div className="read-tool-panels">
                      <div className="read-tool-panel">
                        <GenerateStoryPanel activeLanguage={activeLanguage} headingLevel="h3" />
                      </div>
                      <div className="read-tool-panel">
                        <ImportBookPanel activeLanguage={activeLanguage} headingLevel="h3" />
                      </div>
                    </div>
                  ) : (
                    <p className="muted small" style={{ marginTop: '0.75rem' }}>
                      Add a language to unlock your reading tools.
                    </p>
                  )}
                </div>
              )}

              {activeTab === 'listen' && (
                <div className="read-grid">
                  <div className="read-card">
                    <h3>Listening library</h3>
                    <p className="muted small">Play stories and dialogues in {activeLanguage || 'your language'}.</p>
                    <button className="button ghost" onClick={() => navigate('/listening')} disabled={!activeLanguage}>
                      Open listening
                    </button>
                  </div>
                  <div className="read-card">
                    <h3>Import audio & video</h3>
                    <p className="muted small">Upload your own clips to create listening practice.</p>
                    <button className="button ghost" onClick={() => navigate('/importaudio/video')}>
                      Import media
                    </button>
                  </div>
                  <div className="read-card">
                    <h3>Intongues cinema</h3>
                    <p className="muted small">Watch curated clips with subtitles and translations.</p>
                    <button className="button ghost" onClick={() => navigate('/cinema/library')}>
                      Browse cinema
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'speak' && (
                <div className="coming-soon">
                  <p className="muted">Speaking workouts will land here soon.</p>
                </div>
              )}

              {activeTab === 'write' && (
                <div className="coming-soon">
                  <p className="muted">Writing prompts and feedback are on the way.</p>
                </div>
              )}

              {activeTab === 'review' && (
                <div className="read-grid">
                  <div className="read-card">
                    <h3>Flashcard review</h3>
                    <p className="muted small">Keep vocabulary fresh with spaced repetition.</p>
                    <button className="button ghost" onClick={() => navigate('/review')} disabled={!activeLanguage}>
                      Start reviewing
                    </button>
                  </div>
                  <div className="read-card">
                    <h3>Recent words</h3>
                    <p className="muted small">Quick access to the latest terms you saved.</p>
                    <button className="button ghost" onClick={() => navigate(`/library/${encodeURIComponent(activeLanguage)}`)}>
                      View words
                    </button>
                  </div>
                  <div className="read-card">
                    <h3>Progress</h3>
                    <p className="muted small">Review streaks and accuracy coming soon.</p>
                    <button className="button ghost" disabled>
                      Tracking soon
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
