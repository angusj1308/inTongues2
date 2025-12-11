import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout, { DASHBOARD_TABS } from '../components/layout/DashboardLayout'
import ImportBookPanel from '../components/read/ImportBookPanel'
import GenerateStoryPanel from '../components/read/GenerateStoryPanel'
import { useAuth } from '../context/AuthContext'

const Dashboard = () => {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('home')
  const [slideDirection, setSlideDirection] = useState('')

  const activeLanguage = useMemo(() => {
    if (profile?.lastUsedLanguage) return profile.lastUsedLanguage
    if (profile?.myLanguages?.length) return profile.myLanguages[0]
    return ''
  }, [profile?.lastUsedLanguage, profile?.myLanguages])

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

  return (
    <DashboardLayout activeTab={activeTab} onTabChange={handleTabClick}>
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
            <>
              <section className="read-section read-slab continue-section">
                <div className="continue-card">
                  <div className="continue-card-meta">
                    <h3 className="continue-card-label">Continue reading</h3>
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

              <section className="read-section read-slab">
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
                      <div className="book-progress-bar">
                        <div className="book-progress-bar-inner" style={{ width: `${book.progress}%` }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="read-section-header">
                  <h3>Suggested for you</h3>
                  <button className="text-link ui-text" onClick={() => navigate('/library')}>
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
                <section className="read-section">
                  <div className="read-tool-panels">
                    <div className="read-tool-panel">
                      <GenerateStoryPanel activeLanguage={activeLanguage} headingLevel="h3" />
                    </div>
                    <div className="read-tool-panel">
                      <ImportBookPanel activeLanguage={activeLanguage} headingLevel="h3" />
                    </div>
                  </div>
                </section>
              ) : (
                <p className="muted small" style={{ marginTop: '0.75rem' }}>
                  Add a language to unlock your reading tools.
                </p>
              )}
            </>
          )}

          {activeTab === 'listen' && (
            <>
              <section className="read-section read-slab continue-section">
                <div className="continue-card">
                  <div className="continue-card-meta">
                    <h3 className="continue-card-label">Continue listening</h3>
                    <div className="continue-card-title">Your latest session</div>
                    <div className="continue-card-progress ui-text">
                      {activeLanguage || 'Target language'} · Episode 5 · 42% complete
                    </div>
                  </div>
                  <div className="continue-card-actions">
                    <button
                      className="button ghost"
                      onClick={() => navigate('/listening')}
                      disabled={!activeLanguage}
                    >
                      Resume
                    </button>
                    <button
                      className="text-link ui-text"
                      onClick={() => navigate('/listening')}
                      disabled={!activeLanguage}
                    >
                      View listening library →
                    </button>
                  </div>
                </div>
              </section>

              <section className="read-section read-slab">
                <div className="read-section-header">
                  <h3>Your audiobooks</h3>
                  <button
                    className="text-link ui-text"
                    onClick={() => navigate('/listening')}
                    disabled={!activeLanguage}
                  >
                    View all →
                  </button>
                </div>
                <div className="book-grid">
                  {[
                    { title: 'City Dialogues', progress: 45, meta: 'Spanish · 14m left' },
                    { title: 'Mountain Tales', progress: 20, meta: 'French · Chapter 3' },
                    { title: 'Everyday Heroes', progress: 70, meta: 'German · 6m left' },
                    { title: 'Quiet Mornings', progress: 10, meta: 'Italian · Chapter 1' },
                  ].map((item) => (
                    <div
                      key={item.title}
                      className="book-tile"
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate('/listening')}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          navigate('/listening')
                        }
                      }}
                    >
                      <div className="book-tile-cover" />
                      <div className="book-tile-title">{item.title}</div>
                      <div className="book-tile-meta ui-text">{item.meta}</div>
                      <div className="book-progress-bar">
                        <div className="book-progress-bar-inner" style={{ width: `${item.progress}%` }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="read-section-header">
                  <h3>Your podcasts</h3>
                  <button className="text-link ui-text" onClick={() => navigate('/listening')}>
                    Explore shows →
                  </button>
                </div>
                <div className="book-grid">
                  {[
                    { title: 'Language Lab Live', progress: 35, meta: 'Episode 12 · 18m left' },
                    { title: 'Café Chats', progress: 60, meta: 'Episode 4 · Spanish' },
                    { title: 'Traveler Notes', progress: 15, meta: 'Episode 2 · French' },
                  ].map((item) => (
                    <div
                      key={item.title}
                      className="book-tile"
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate('/listening')}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          navigate('/listening')
                        }
                      }}
                    >
                      <div className="book-tile-cover" />
                      <div className="book-tile-title">{item.title}</div>
                      <div className="book-tile-meta ui-text">{item.meta}</div>
                      <div className="book-progress-bar">
                        <div className="book-progress-bar-inner" style={{ width: `${item.progress}%` }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="read-section-header">
                  <h3>Your videos</h3>
                  <button className="text-link ui-text" onClick={() => navigate('/cinema/library')}>
                    Browse cinema →
                  </button>
                </div>
                <div className="book-grid">
                  {[
                    { title: 'Street Food Stories', progress: 50, meta: 'Subtitled clip' },
                    { title: 'News Highlights', progress: 30, meta: 'Spanish · 6m left' },
                    { title: 'Mini Docu', progress: 10, meta: 'French · New' },
                  ].map((item) => (
                    <div
                      key={item.title}
                      className="book-tile"
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate('/cinema/library')}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          navigate('/cinema/library')
                        }
                      }}
                    >
                      <div className="book-tile-cover" />
                      <div className="book-tile-title">{item.title}</div>
                      <div className="book-tile-meta ui-text">{item.meta}</div>
                      <div className="book-progress-bar">
                        <div className="book-progress-bar-inner" style={{ width: `${item.progress}%` }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="read-section-header">
                  <h3>Your music</h3>
                  <button className="text-link ui-text" onClick={() => navigate('/listening')}>
                    Open library →
                  </button>
                </div>
                <div className="book-grid">
                  {[
                    { title: 'Morning Mix', progress: 80, meta: 'Playlist · 22 tracks' },
                    { title: 'Indie Focus', progress: 55, meta: 'Album · 8 tracks' },
                    { title: 'Chill Study', progress: 15, meta: 'Playlist · New' },
                  ].map((item) => (
                    <div
                      key={item.title}
                      className="book-tile"
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate('/listening')}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          navigate('/listening')
                        }
                      }}
                    >
                      <div className="book-tile-cover" />
                      <div className="book-tile-title">{item.title}</div>
                      <div className="book-tile-meta ui-text">{item.meta}</div>
                      <div className="book-progress-bar">
                        <div className="book-progress-bar-inner" style={{ width: `${item.progress}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {activeLanguage ? (
                <section className="read-section">
                  <div className="read-tool-panels">
                    <div className="read-tool-panel">
                      <h3>Spotify importer</h3>
                      <p className="muted small">
                        Connect your Spotify to pull playlists, podcasts, and albums directly into your listening library.
                      </p>
                      <button className="button ghost" onClick={() => navigate('/listening')}>
                        Open Spotify importer
                      </button>
                    </div>
                    <div className="read-tool-panel">
                      <h3>YouTube importer</h3>
                      <p className="muted small">
                        Import subtitles and transcripts from your favorite videos to keep them in your study stack.
                      </p>
                      <button className="button ghost" onClick={() => navigate('/importaudio/video')}>
                        Open YouTube importer
                      </button>
                    </div>
                    <div className="read-tool-panel">
                      <h3>Comprehension Practice with Juan</h3>
                      <p className="muted small">
                        Practice understanding conversational {activeLanguage || 'target language'} while responding naturally in your own native language.
                      </p>
                      <button className="button ghost" onClick={() => navigate('/listening')}>
                        Start comprehension practice
                      </button>
                    </div>
                  </div>
                </section>
              ) : (
                <p className="muted small" style={{ marginTop: '0.75rem' }}>
                  Add a language to unlock your listening tools.
                </p>
              )}
            </>
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
    </DashboardLayout>
  )
}

export default Dashboard
