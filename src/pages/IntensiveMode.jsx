import { useNavigate, useParams } from 'react-router-dom'
import { readerModes } from '../constants/readerModes'

const IntensiveMode = () => {
  const navigate = useNavigate()
  const { id, language } = useParams()

  const handleModeSelect = (modeId) => {
    if (modeId === 'intensive') return

    const readerPath = language
      ? `/reader/${encodeURIComponent(language)}/${id}`
      : `/reader/${id}`

    navigate(readerPath, { state: { readerMode: modeId } })
  }

  return (
    <div className="page reader-page reader-themed">
      <div className="reader-hover-shell">
        <div className="reader-hover-hitbox" />
        <header className="dashboard-header reader-hover-header">
          <div className="dashboard-brand-band reader-header-band">
            <div className="reader-header-left">
              <button
                className="dashboard-control ui-text reader-back-button"
                onClick={() =>
                  navigate(language ? `/library/${encodeURIComponent(language)}` : '/library')
                }
              >
                Back to library
              </button>
            </div>

            <nav className="dashboard-nav reader-mode-nav" aria-label="Reading mode">
              {readerModes.map((mode, index) => (
                <div
                  key={mode.id}
                  className={`dashboard-nav-item ${mode.id === 'intensive' ? 'active' : ''}`}
                >
                  <button
                    className={`dashboard-nav-button ui-text ${
                      mode.id === 'intensive' ? 'active' : ''
                    }`}
                    type="button"
                    onClick={() => handleModeSelect(mode.id)}
                  >
                    {mode.label.toUpperCase()}
                  </button>
                  {index < readerModes.length - 1 && <span className="dashboard-nav-divider">|</span>}
                </div>
              ))}
            </nav>

            <div className="reader-header-actions" aria-hidden="true" />
          </div>
        </header>
      </div>

      <main className="reader-intensive-shell">
        <p className="reader-intensive-message">INTENSIVE MODE</p>
      </main>
    </div>
  )
}

export default IntensiveMode
