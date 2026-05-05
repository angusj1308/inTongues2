import { NavLink } from 'react-router-dom'

const DOORS = [
  {
    to: '/read/discover/generate',
    label: 'Generate',
    description: 'Commission a new short story or novel.',
  },
  {
    to: '/read/discover/adapt',
    label: 'Adapt',
    description: 'Re-render a classic at your level.',
  },
  {
    to: '/read/discover/import',
    label: 'Import',
    description: 'Bring your own EPUB or PDF.',
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
