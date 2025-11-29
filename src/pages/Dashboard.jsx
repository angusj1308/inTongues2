import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const DASHBOARD_TABS = ['read', 'listen', 'speak', 'write', 'review']

const Dashboard = () => {
  const { user, profile, logout, setLastUsedLanguage } = useAuth()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('read')

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

  const handleLanguageChange = async (language) => {
    if (!language) return
    await setLastUsedLanguage(language)
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
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
    setActiveTab(tab)
  }

  return (
    <div className="page">
      <div className="card dashboard-card">
        <div className="dashboard__header">
          <div className="language-hero">
            <span className="language-tag">in{activeLanguage || '...'}</span>
            <p className="muted small">Personalized practice for your chosen language.</p>
          </div>
          <div className="dashboard-actions">
            {hasLanguages && (
              <select
                className="language-select"
                value={activeLanguage}
                onChange={(event) => handleLanguageChange(event.target.value)}
              >
                {profile.myLanguages.map((language) => (
                  <option key={language} value={language}>
                    {language}
                  </option>
                ))}
              </select>
            )}
            <div className="action-row">
              <button className="button ghost" onClick={() => navigate('/select-language')}>
                Add language
              </button>
              <button className="button ghost" onClick={() => navigate('/my-languages')}>
                My languages
              </button>
              <button className="button" onClick={handleLogout}>
                Log out
              </button>
            </div>
          </div>
        </div>

        <div className="tab-nav">
          {DASHBOARD_TABS.map((tab) => (
            <button
              key={tab}
              className={`tab-button ${activeTab === tab ? 'active' : ''}`}
              onClick={() => handleTabClick(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

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
                <button
                  className="button ghost"
                  onClick={handleGenerateClick}
                  disabled={!activeLanguage}
                >
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
  )
}

export default Dashboard
