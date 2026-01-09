import { useEffect, useState } from 'react'
import './RecordingCountdown.css'

/**
 * Photo Booth style countdown before recording starts
 * Shows 3, 2, 1 with animation before triggering onComplete
 */
const RecordingCountdown = ({ onComplete, onCancel }) => {
  const [count, setCount] = useState(3)

  useEffect(() => {
    if (count === 0) {
      onComplete()
      return
    }

    const timer = setTimeout(() => {
      setCount(count - 1)
    }, 1000)

    return () => clearTimeout(timer)
  }, [count, onComplete])

  return (
    <div className="recording-countdown-overlay">
      <div className="recording-countdown-container">
        <div className="recording-countdown-number" key={count}>
          {count > 0 ? count : ''}
        </div>
        <p className="recording-countdown-text">
          {count > 0 ? 'Get ready to speak...' : 'Recording!'}
        </p>
        <button
          className="recording-countdown-cancel"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

export default RecordingCountdown
