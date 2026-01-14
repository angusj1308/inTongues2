import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ACTIVITY_TYPES,
  DAYS_OF_WEEK,
  DAY_LABELS,
  addActivity,
  getOrCreateActiveRoutine,
  removeActivity,
} from '../../services/routine'

// Constants
const HOUR_HEIGHT = 40 // pixels per hour (smaller than day view since we have 7 columns)
const HOURS = Array.from({ length: 24 }, (_, i) => i)

// Short labels for activity types
const ACTIVITY_SHORT_LABELS = {
  reading: 'Read',
  listening: 'Listen',
  speaking: 'Speak',
  review: 'Review',
  writing: 'Write',
  tutor: 'Tutor',
}

// Translated day labels by language
const LOCALIZED_DAY_LABELS = {
  Spanish: {
    monday: 'Lunes',
    tuesday: 'Martes',
    wednesday: 'Miércoles',
    thursday: 'Jueves',
    friday: 'Viernes',
    saturday: 'Sábado',
    sunday: 'Domingo',
  },
  French: {
    monday: 'Lundi',
    tuesday: 'Mardi',
    wednesday: 'Mercredi',
    thursday: 'Jeudi',
    friday: 'Vendredi',
    saturday: 'Samedi',
    sunday: 'Dimanche',
  },
  Italian: {
    monday: 'Lunedì',
    tuesday: 'Martedì',
    wednesday: 'Mercoledì',
    thursday: 'Giovedì',
    friday: 'Venerdì',
    saturday: 'Sabato',
    sunday: 'Domenica',
  },
  English: {
    monday: 'Monday',
    tuesday: 'Tuesday',
    wednesday: 'Wednesday',
    thursday: 'Thursday',
    friday: 'Friday',
    saturday: 'Saturday',
    sunday: 'Sunday',
  },
}

// Translated section title
const WEEKLY_ROUTINE_TITLES = {
  Spanish: 'Rutina Semanal',
  French: 'Routine Hebdomadaire',
  Italian: 'Routine Settimanale',
  English: 'Weekly Routine',
}

const getDayLabel = (language, day) => {
  const labels = LOCALIZED_DAY_LABELS[language] || LOCALIZED_DAY_LABELS.English
  return labels[day] || DAY_LABELS[day]
}

// Format hour for display
const formatHour = (hour) => {
  if (hour === 0) return '12am'
  if (hour === 12) return '12pm'
  if (hour < 12) return `${hour}am`
  return `${hour - 12}pm`
}

// Parse time string to minutes from midnight
const parseTimeToMinutes = (timeStr) => {
  if (!timeStr) return 0
  const [hours, minutes] = timeStr.split(':').map(Number)
  return hours * 60 + (minutes || 0)
}

// Activity block positioned on the timeline
const ActivityBlock = ({ activity, onRemove, onClick }) => {
  const startMinutes = parseTimeToMinutes(activity.time)
  const duration = activity.duration || 30
  const shortLabel = ACTIVITY_SHORT_LABELS[activity.activityType] || 'Activity'

  const topPx = (startMinutes / 60) * HOUR_HEIGHT
  const heightPx = Math.max((duration / 60) * HOUR_HEIGHT, 20)

  return (
    <div
      className="routine-activity-block"
      style={{
        top: `${topPx}px`,
        height: `${heightPx}px`,
      }}
      onClick={onClick}
      role="button"
      tabIndex={0}
      title={`${shortLabel} at ${activity.time} (${duration}m)`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick?.()
      }}
    >
      <span className="routine-activity-block-label">{shortLabel}</span>
      {heightPx >= 32 && (
        <span className="routine-activity-block-time">{activity.time}</span>
      )}
      <button
        className="routine-activity-block-remove"
        onClick={(e) => {
          e.stopPropagation()
          onRemove?.()
        }}
        aria-label="Remove activity"
      >
        ×
      </button>
    </div>
  )
}

const AddActivityModal = ({ isOpen, onClose, onAdd, day, defaultTime, anchorPosition, language }) => {
  const [activityType, setActivityType] = useState('reading')
  const [time, setTime] = useState(defaultTime || '09:00')
  const [duration, setDuration] = useState(30)
  const modalRef = useRef(null)
  const [position, setPosition] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (defaultTime) setTime(defaultTime)
  }, [defaultTime])

  // Calculate position when modal opens
  useEffect(() => {
    if (isOpen && anchorPosition && modalRef.current) {
      const modalRect = modalRef.current.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight

      let top = anchorPosition.y + 8
      let left = anchorPosition.x

      // Adjust if modal would go off right edge
      if (left + modalRect.width > viewportWidth - 16) {
        left = viewportWidth - modalRect.width - 16
      }

      // Adjust if modal would go off bottom edge
      if (top + modalRect.height > viewportHeight - 16) {
        top = anchorPosition.y - modalRect.height - 8
      }

      // Ensure minimum positioning
      left = Math.max(16, left)
      top = Math.max(16, top)

      setPosition({ top, left })
    }
  }, [isOpen, anchorPosition])

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
      <div
        ref={modalRef}
        className="routine-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ top: position.top, left: position.left }}
      >
        <div className="routine-modal-header">
          <h3>Add Activity</h3>
          <span className="routine-modal-day">{getDayLabel(language, day)}</span>
        </div>

        <form onSubmit={handleSubmit} className="routine-modal-form">
          <div className="routine-activity-type-list">
            {ACTIVITY_TYPES.map((type) => (
              <label key={type.id} className="routine-activity-type-option">
                <input
                  type="radio"
                  name="activityType"
                  value={type.id}
                  checked={activityType === type.id}
                  onChange={() => setActivityType(type.id)}
                />
                <span>{type.label}</span>
              </label>
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
              Add
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const DayColumn = ({ day, activities, onAddActivity, onRemoveActivity, onActivityClick, isToday, language }) => {
  const [modalState, setModalState] = useState({ isOpen: false, hour: null, position: null })

  const handleTimeSlotClick = (hour, e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setModalState({
      isOpen: true,
      hour: `${hour.toString().padStart(2, '0')}:00`,
      position: { x: rect.left, y: rect.top }
    })
  }

  return (
    <div className={`routine-day-column ${isToday ? 'routine-day-today' : ''}`}>
      <div className="routine-day-timeline">
        {/* Clickable hour slots */}
        {HOURS.map((hour) => (
          <div
            key={hour}
            className="routine-hour-slot"
            onClick={(e) => handleTimeSlotClick(hour, e)}
            title={`Add activity at ${formatHour(hour)}`}
          />
        ))}

        {/* Activity blocks */}
        {activities.map((activity) => (
          <ActivityBlock
            key={activity.id}
            activity={activity}
            onRemove={() => onRemoveActivity(day, activity.id)}
            onClick={() => onActivityClick?.(activity)}
          />
        ))}
      </div>

      <AddActivityModal
        isOpen={modalState.isOpen}
        onClose={() => setModalState({ isOpen: false, hour: null, position: null })}
        day={day}
        defaultTime={modalState.hour}
        onAdd={(activity) => onAddActivity(day, activity)}
        anchorPosition={modalState.position}
        language={language}
      />
    </div>
  )
}

// Current time indicator
const CurrentTimeIndicator = () => {
  const [position, setPosition] = useState(0)

  useEffect(() => {
    const updatePosition = () => {
      const now = new Date()
      const minutes = now.getHours() * 60 + now.getMinutes()
      setPosition((minutes / 60) * HOUR_HEIGHT)
    }

    updatePosition()
    const interval = setInterval(updatePosition, 60000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div
      className="routine-current-time"
      style={{ top: `${position}px` }}
    />
  )
}

const RoutineBuilder = ({ userId, language }) => {
  const navigate = useNavigate()
  const scrollRef = useRef(null)
  const [routine, setRoutine] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const today = useMemo(() => {
    return new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()
  }, [])

  // Auto-scroll to current time on mount
  useEffect(() => {
    if (scrollRef.current && !loading) {
      const now = new Date()
      const minutes = now.getHours() * 60 + now.getMinutes()
      const position = (minutes / 60) * HOUR_HEIGHT
      const containerHeight = scrollRef.current.clientHeight
      const scrollTarget = Math.max(0, position - containerHeight / 3)
      scrollRef.current.scrollTop = scrollTarget
    }
  }, [loading])

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
      const tabMap = {
        reading: 'read',
        listening: 'listen',
        speaking: 'speak',
        review: 'review',
        writing: 'write',
        tutor: 'tutor',
      }

      const tab = tabMap[activity.activityType] || 'read'

      if (activity.contentId && activity.contentType === 'story') {
        navigate(`/reader/${activity.contentId}`)
      } else if (activity.contentId && activity.contentType === 'youtube') {
        navigate(`/listen/${activity.contentId}`)
      } else {
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
      <h3 className="home-section-title">{WEEKLY_ROUTINE_TITLES[language] || WEEKLY_ROUTINE_TITLES.English}</h3>

      <div className="routine-week-container">
        {/* Sticky day headers row */}
        <div className="routine-day-headers">
          <div className="routine-hour-labels-spacer" />
          {DAYS_OF_WEEK.map((day) => (
            <div
              key={day}
              className={`routine-day-header-cell ${day === today ? 'routine-day-today' : ''}`}
            >
              <span className="routine-day-label">{getDayLabel(language, day)}</span>
              {day === today && <span className="routine-today-dot" />}
            </div>
          ))}
        </div>

        {/* Scrollable area with hour labels + grid */}
        <div className="routine-week-scroll" ref={scrollRef}>
          <div className="routine-week-inner">
            {/* Hour labels column - scrolls with content */}
            <div className="routine-hour-labels">
              {HOURS.map((hour) => (
                <div key={hour} className="routine-hour-label">
                  {hour !== 0 && formatHour(hour)}
                </div>
              ))}
            </div>

            {/* Week grid */}
            <div className="routine-week-grid">
              {/* Hour grid lines */}
              <div className="routine-hour-lines">
                {HOURS.map((hour) => (
                  <div key={hour} className="routine-hour-line" />
                ))}
              </div>

              {/* Current time indicator */}
              <CurrentTimeIndicator />

              {/* Day columns */}
              {DAYS_OF_WEEK.map((day) => (
                <DayColumn
                  key={day}
                  day={day}
                  activities={routine.schedule?.[day] || []}
                  onAddActivity={handleAddActivity}
                  onRemoveActivity={handleRemoveActivity}
                  onActivityClick={handleActivityClick}
                  isToday={day === today}
                  language={language}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default RoutineBuilder
