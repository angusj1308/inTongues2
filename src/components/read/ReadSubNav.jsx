import { NavLink } from 'react-router-dom'

const ITEMS = [
  { to: '/read/library', label: 'My Library' },
  { to: '/read/discover', label: 'Discover' },
  { to: '/read/generate', label: 'Generate' },
  { to: '/read/import', label: 'Import' },
]

export default function ReadSubNav() {
  return (
    <nav className="read-sub-nav" aria-label="Read sections">
      {ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            `read-sub-nav-item${isActive ? ' is-active' : ''}`
          }
          end
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
