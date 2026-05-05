import { NavLink } from 'react-router-dom'

const DOORS = [
  {
    to: '/read/discover/generate',
    label: 'Generate',
    description: 'Have an original story written in your target language at your level.',
  },
  {
    to: '/read/discover/import',
    label: 'Import',
    description: 'Upload an EPUB or PDF in any language. We’ll translate it to your target language at your level.',
  },
  {
    to: '/read/discover/classics',
    label: 'Classics',
    description: 'Read public-domain classics adapted to your level.',
  },
]

export default function DiscoverDoors({ mode = 'landing' }) {
  if (mode === 'compact') {
    return (
      <nav className="discover-doors discover-doors--compact" aria-label="Discover sections">
        {DOORS.map((door) => (
          <NavLink
            key={door.to}
            to={door.to}
            className={({ isActive }) =>
              `discover-door discover-door--compact${isActive ? ' is-active' : ''}`
            }
          >
            <span className="discover-door-label">{door.label}</span>
          </NavLink>
        ))}
      </nav>
    )
  }

  return (
    <div className="discover-doors discover-doors--landing">
      {DOORS.map((door) => (
        <NavLink
          key={door.to}
          to={door.to}
          className="discover-door discover-door--landing"
        >
          <h2 className="discover-door-label">{door.label}</h2>
          <span className="discover-door-rule" aria-hidden="true" />
          <p className="discover-door-description">{door.description}</p>
        </NavLink>
      ))}
    </div>
  )
}
