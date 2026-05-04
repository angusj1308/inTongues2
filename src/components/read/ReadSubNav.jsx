import { Fragment } from 'react'
import { NavLink } from 'react-router-dom'

const ITEMS = [
  { to: '/read/library', label: 'Library', match: 'exact' },
  { to: '/read/discover', label: 'Discover', match: 'prefix' },
]

export default function ReadSubNav() {
  return (
    <nav className="read-sub-nav" aria-label="Read sections">
      {ITEMS.map((item, idx) => (
        <Fragment key={item.to}>
          {idx > 0 && (
            <span className="read-sub-nav-separator" aria-hidden="true">|</span>
          )}
          <NavLink
            to={item.to}
            end={item.match === 'exact'}
            className={({ isActive }) =>
              `read-sub-nav-item${isActive ? ' is-active' : ''}`
            }
          >
            {item.label}
          </NavLink>
        </Fragment>
      ))}
    </nav>
  )
}
