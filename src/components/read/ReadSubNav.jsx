import { NavLink } from 'react-router-dom'

const ITEMS = [
  { to: '/read/library', label: 'My Library', match: 'exact' },
  { to: '/read/discover', label: 'Discover', match: 'prefix' },
]

export default function ReadSubNav() {
  return (
    <nav className="read-sub-nav" aria-label="Read sections">
      {ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.match === 'exact'}
          className={({ isActive }) =>
            `read-sub-nav-item${isActive ? ' is-active' : ''}`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
