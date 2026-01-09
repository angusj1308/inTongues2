import { useEffect, useMemo, useRef, useState } from 'react'
import { ACTIVITY_TYPES } from '../../services/routine'

// Generate all 24 hours
const HOURS = Array.from({ length: 24 }, (_, i) => i)
const HOUR_HEIGHT = 60 // pixels per hour

// Format hour for display (e.g., "9am", "11pm", "12pm")
const formatHour = (hour) => {
  if (hour === 0) return '12am'
  if (hour === 12) return '12pm'
  if (hour < 12) return `${hour}am`
  return `${hour - 12}pm`
}

// Parse time string "HH:MM" to minutes from midnight
const parseTimeToMinutes = (timeStr) => {
  if (!timeStr) return 0
  const [hours, minutes] = timeStr.split(':').map(Number)
  return hours * 60 + (minutes || 0)
}

// Activity block positioned on the calendar
const ActivityBlock = ({ activity, onActivityClick }) => {
  const startMinutes = parseTimeToMinutes(activity.time)
  const duration = activity.duration || 30
  const activityConfig = ACTIVITY_TYPES.find((a) => a.id === activity.activityType) || ACTIVITY_TYPES[0]

  // Calculate position
  const topPx = (startMinutes / 60) * HOUR_HEIGHT
  const heightPx = Math.max((duration / 60) * HOUR_HEIGHT, 24) // Min height of 24px for readability

  return (
    <button
      className="day-calendar-activity"
      style={{
        top: `${topPx}px`,
        height: `${heightPx}px`,
      }}
      onClick={() => onActivityClick?.(activity)}
      title={`${activityConfig.label} at ${activity.time} (${duration}m)`}
    >
      <span className="day-calendar-activity-label">{activityConfig.label}</span>
      {heightPx >= 40 && (
        <span className="day-calendar-activity-duration">{duration}m</span>
      )}
    </button>
  )
}

const DayCalendar = ({ activities = [], onActivityClick }) => {
  const scrollRef = useRef(null)
  const [currentTimePosition, setCurrentTimePosition] = useState(0)

  // Sort activities by time
  const sortedActivities = useMemo(() => {
    return [...activities].sort((a, b) => {
      return parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time)
    })
  }, [activities])

  // Calculate total planned time
  const totalMinutes = useMemo(() => {
    return activities.reduce((sum, a) => sum + (a.duration || 0), 0)
  }, [activities])

  const totalFormatted = useMemo(() => {
    const hours = Math.floor(totalMinutes / 60)
    const mins = totalMinutes % 60
    if (hours === 0) return `${mins}m`
    if (mins === 0) return `${hours}h`
    return `${hours}h ${mins}m`
  }, [totalMinutes])

  // Update current time position and auto-scroll on mount
  useEffect(() => {
    const updateCurrentTime = () => {
      const now = new Date()
      const minutes = now.getHours() * 60 + now.getMinutes()
      const position = (minutes / 60) * HOUR_HEIGHT
      setCurrentTimePosition(position)
      return position
    }

    const position = updateCurrentTime()

    // Auto-scroll to current time (centered in view) on mount
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current
      const containerHeight = scrollContainer.clientHeight
      const scrollTarget = Math.max(0, position - containerHeight / 2)
      scrollContainer.scrollTop = scrollTarget
    }

    // Update time indicator every minute
    const interval = setInterval(updateCurrentTime, 60000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="day-calendar">
      <div className="day-calendar-header">
        <span className="day-calendar-total">
          {activities.length > 0 ? `${totalFormatted} planned` : 'No activities scheduled'}
        </span>
      </div>

      <div className="day-calendar-scroll" ref={scrollRef}>
        <div className="day-calendar-grid">
          {/* Hour markers and grid lines */}
          {HOURS.map((hour) => (
            <div key={hour} className="day-calendar-hour">
              <span className="day-calendar-hour-label">{formatHour(hour)}</span>
              <div className="day-calendar-hour-line" />
            </div>
          ))}

          {/* Current time indicator */}
          <div
            className="day-calendar-now"
            style={{ top: `${currentTimePosition}px` }}
          />

          {/* Activity blocks overlay */}
          <div className="day-calendar-activities">
            {sortedActivities.map((activity) => (
              <ActivityBlock
                key={activity.id}
                activity={activity}
                onActivityClick={onActivityClick}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default DayCalendar
