import { useNavigate, NavLink } from 'react-router-dom'
import './podcast.css'

const PodcastShell = ({ children }) => {
  const navigate = useNavigate()

  return (
    <div className="podcast-page">
      <div className="podcast-hover-nav" aria-hidden="false">
        <button
          type="button"
          className="podcast-back-button ui-text"
          onClick={() => navigate('/dashboard')}
        >
          <span aria-hidden="true">←</span> Listen
        </button>
      </div>

      <header className="podcast-header">
        <div className="podcast-brand-row">
          <span className="podcast-brand-line" />
          <div className="podcast-brand-content">
            <h1 className="podcast-brand-title">PODCASTS</h1>
            <p className="podcast-brand-subtitle">inTongues</p>
          </div>
          <span className="podcast-brand-line" />
        </div>

        <nav className="podcast-subnav" aria-label="Podcast sections">
          <NavLink
            to="/podcasts"
            end
            className={({ isActive }) =>
              `podcast-subnav-link ui-text ${isActive ? 'active' : ''}`
            }
          >
            Library
          </NavLink>
          <NavLink
            to="/podcasts/discover"
            className={({ isActive }) =>
              `podcast-subnav-link ui-text ${isActive ? 'active' : ''}`
            }
          >
            Discover
          </NavLink>
        </nav>
      </header>

      <main className="podcast-main">{children}</main>
    </div>
  )
}

export default PodcastShell
