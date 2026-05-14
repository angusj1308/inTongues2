import { Fragment } from 'react'
import { NavLink } from 'react-router-dom'

const ITEMS = [
  { to: '/listen/library', label: 'Library', match: 'prefix' },
  { to: '/listen/discover', label: 'Discover', match: 'prefix' },
]

export default function ListenSubNav() {
  return (
    <nav className="read-sub-nav" aria-label="Listen sections">
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
