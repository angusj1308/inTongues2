import { Fragment } from 'react'
import { NavLink } from 'react-router-dom'

const ITEMS = [
  { to: '/write/notebook', label: 'Notebook', match: 'prefix' },
  { to: '/write/compose', label: 'Compose', match: 'prefix' },
]

export default function WriteSubNav() {
  return (
    <nav className="read-sub-nav" aria-label="Write sections">
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
