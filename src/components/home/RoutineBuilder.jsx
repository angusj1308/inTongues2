import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ACTIVITY_TYPES,
  DAYS_OF_WEEK,
  DAY_LABELS,
  addActivity,
  getOrCreateActiveRoutine,
  removeActivity,
  updateActivity,
} from '../../services/routine'

const ActivityIcon = ({ type, size = 16 }) => {
  const iconMap = {
    reading: (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    ),
    listening: (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
        <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
      </svg>
    ),
    speaking: (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </svg>
    ),
    review: (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="M12 8v4" />
        <path d="M12 16h.01" />
      </svg>
    ),
    writing: (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 19l7-7 3 3-7 7-3-3z" />
        <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
        <path d="M2 2l7.586 7.586" />
        <circle cx="11" cy="11" r="2" />
      </svg>
    ),
    tutor: (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  }

  return iconMap[type] || iconMap.reading
}

const ActivityChip = ({ activity, onRemove, onClick }) => {
  const activityConfig = ACTIVITY_TYPES.find((a) => a.id === activity.activityType) || ACTIVITY_TYPES[0]

  return (
    <div
      className="routine-activity-chip"
      style={{ '--activity-color': activityConfig.color }}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick?.()
      }}
    >
      <div className="routine-activity-chip-icon">
        <ActivityIcon type={activity.activityType} size={14} />
      </div>
      <div className="routine-activity-chip-content">
        <span className="routine-activity-chip-type">{activityConfig.label}</span>
        {activity.title && <span className="routine-activity-chip-title">{activity.title}</span>}
      </div>
      <button
        className="routine-activity-chip-remove"
        onClick={(e) => {
          e.stopPropagation()
          onRemove?.()
        }}
        aria-label="Remove activity"
      >
        <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  )
}

const AddActivityModal = ({ isOpen, onClose, onAdd, day }) => {
  const [activityType, setActivityType] = useState('reading')
  const [time, setTime] = useState('09:00')
  const [duration, setDuration] = useState(30)

  if (!isOpen) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    onAdd({
      activityType,
      time,
      duration,
    })
    setActivityType('reading')
    setTime('09:00')
    setDuration(30)
    onClose()
  }

  return (
    <div className="routine-modal-overlay" onClick={onClose}>
      <div className="routine-modal" onClick={(e) => e.stopPropagation()}>
        <div className="routine-modal-header">
          <h3>Add Activity</h3>
          <span className="routine-modal-day">{DAY_LABELS[day]}</span>
        </div>

        <form onSubmit={handleSubmit} className="routine-modal-form">
          <div className="routine-activity-type-grid">
            {ACTIVITY_TYPES.map((type) => (
              <button
                key={type.id}
                type="button"
                className={`routine-activity-type-btn ${activityType === type.id ? 'active' : ''}`}
                style={{ '--type-color': type.color }}
                onClick={() => setActivityType(type.id)}
              >
                <ActivityIcon type={type.id} size={20} />
                <span>{type.label}</span>
              </button>
            ))}
          </div>

          <div className="routine-modal-row">
            <label>
              <span className="routine-label-text">Time</span>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </label>
            <label>
              <span className="routine-label-text">Duration (min)</span>
              <input
                type="number"
                min={5}
                max={180}
                step={5}
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value, 10) || 30)}
              />
            </label>
          </div>

          <div className="routine-modal-actions">
            <button type="button" className="button ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="button">
              Add Activity
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const DayColumn = ({ day, activities, onAddActivity, onRemoveActivity, onActivityClick, isToday }) => {
  const [showAddModal, setShowAddModal] = useState(false)

  return (
    <div className={`routine-day-column ${isToday ? 'routine-day-today' : ''}`}>
      <div className="routine-day-header">
        <span className="routine-day-label">{DAY_LABELS[day]}</span>
        {isToday && <span className="routine-today-badge">Today</span>}
      </div>

      <div className="routine-day-activities">
        {activities.map((activity) => (
          <ActivityChip
            key={activity.id}
            activity={activity}
            onRemove={() => onRemoveActivity(day, activity.id)}
            onClick={() => onActivityClick?.(activity)}
          />
        ))}

        <button
          className="routine-add-activity-btn"
          onClick={() => setShowAddModal(true)}
          aria-label={`Add activity to ${DAY_LABELS[day]}`}
        >
          <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      <AddActivityModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        day={day}
        onAdd={(activity) => onAddActivity(day, activity)}
      />
    </div>
  )
}

const RoutineBuilder = ({ userId, language }) => {
  const navigate = useNavigate()
  const [routine, setRoutine] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const today = useMemo(() => {
    return new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()
  }, [])

  const loadRoutine = useCallback(async () => {
    if (!userId || !language) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const activeRoutine = await getOrCreateActiveRoutine(userId, language)
      setRoutine(activeRoutine)
      setError('')
    } catch (err) {
      console.error('Failed to load routine:', err)
      setError('Unable to load your routine')
    } finally {
      setLoading(false)
    }
  }, [userId, language])

  useEffect(() => {
    loadRoutine()
  }, [loadRoutine])

  const handleAddActivity = useCallback(
    async (day, activityData) => {
      if (!userId || !routine?.id) return

      try {
        await addActivity(userId, routine.id, day, activityData)
        await loadRoutine()
      } catch (err) {
        console.error('Failed to add activity:', err)
      }
    },
    [userId, routine?.id, loadRoutine]
  )

  const handleRemoveActivity = useCallback(
    async (day, activityId) => {
      if (!userId || !routine?.id) return

      try {
        await removeActivity(userId, routine.id, day, activityId)
        await loadRoutine()
      } catch (err) {
        console.error('Failed to remove activity:', err)
      }
    },
    [userId, routine?.id, loadRoutine]
  )

  const handleActivityClick = useCallback(
    (activity) => {
      // Navigate to the appropriate section based on activity type
      const tabMap = {
        reading: 'read',
        listening: 'listen',
        speaking: 'speak',
        review: 'review',
        writing: 'write',
        tutor: 'tutor',
      }

      const tab = tabMap[activity.activityType] || 'read'

      // If activity has specific content, navigate to it
      if (activity.contentId && activity.contentType === 'story') {
        navigate(`/reader/${activity.contentId}`)
      } else if (activity.contentId && activity.contentType === 'youtube') {
        navigate(`/listen/${activity.contentId}`)
      } else {
        // Navigate to the tab
        navigate('/dashboard', { state: { initialTab: tab } })
      }
    },
    [navigate]
  )

  if (loading) {
    return (
      <div className="routine-builder routine-builder-loading">
        <p className="muted small">Loading your routine...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="routine-builder routine-builder-error">
        <p className="muted small">{error}</p>
        <button className="button ghost small" onClick={loadRoutine}>
          Retry
        </button>
      </div>
    )
  }

  if (!routine) {
    return (
      <div className="routine-builder routine-builder-empty">
        <p className="muted small">No routine set up yet.</p>
      </div>
    )
  }

  return (
    <div className="routine-builder">
      <div className="routine-builder-header">
        <h3>Weekly Routine</h3>
        <p className="muted small">Plan your learning activities for each day</p>
      </div>

      <div className="routine-week-grid">
        {DAYS_OF_WEEK.map((day) => (
          <DayColumn
            key={day}
            day={day}
            activities={routine.schedule?.[day] || []}
            onAddActivity={handleAddActivity}
            onRemoveActivity={handleRemoveActivity}
            onActivityClick={handleActivityClick}
            isToday={day === today}
          />
        ))}
      </div>
    </div>
  )
}

export default RoutineBuilder
