import { useNavigate, NavLink } from 'react-router-dom'
import './media-surface.css'

// Shared media-surface shell. Both Podcasts and Music render through this.
//   wordmark — caps top word above "inTongues" (e.g. "PODCASTS", "MUSIC")
//   basePath — base route for the surface (e.g. "/podcasts", "/music")
//   sections — { label, to, end? } entries rendered as the sub-nav
//   sectionsAriaLabel — aria-label for the nav element
const MediaShell = ({
  wordmark,
  basePath,
  sections,
  sectionsAriaLabel = 'Sections',
  children,
}) => {
  const navigate = useNavigate()
  const navItems =
    sections ||
    [
      { label: 'Library', to: basePath, end: true },
      { label: 'Discover', to: `${basePath}/discover` },
    ]

  return (
    <div className="media-page">
      <div className="media-hover-nav" aria-hidden="false">
        <button
          type="button"
          className="media-back-button ui-text"
          onClick={() => navigate('/dashboard')}
        >
          <span aria-hidden="true">←</span> Listen
        </button>
      </div>

      <header className="media-header">
        <div className="media-brand-row">
          <span className="media-brand-line" />
          <div className="media-brand-content">
            <h1 className="media-brand-title">{wordmark}</h1>
            <p className="media-brand-subtitle">inTongues</p>
          </div>
          <span className="media-brand-line" />
        </div>

        <nav className="media-subnav" aria-label={sectionsAriaLabel}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `media-subnav-link ui-text ${isActive ? 'active' : ''}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="media-main">{children}</main>
    </div>
  )
}

export default MediaShell
