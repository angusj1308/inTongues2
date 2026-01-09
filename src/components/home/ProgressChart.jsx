import { useCallback, useEffect, useMemo, useState } from 'react'
import { getProgressData } from '../../services/progress'

const PERIODS = [
  { key: 'week', label: 'W', days: 7 },
  { key: 'month', label: 'M', days: 30 },
  { key: 'year', label: 'Y', days: 365 },
  { key: '5year', label: '5Y', days: 1825 },
]

const ProgressChart = ({ userId, language, currentKnownWords }) => {
  const [period, setPeriod] = useState('week')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  // Fetch progress data when period, language, or known words changes
  useEffect(() => {
    if (!userId || !language) {
      setLoading(false)
      return
    }

    let mounted = true
    setLoading(true)

    getProgressData(userId, language, period, currentKnownWords)
      .then((result) => {
        if (mounted) {
          setData(result)
          setLoading(false)
        }
      })
      .catch((err) => {
        console.error('Failed to load progress:', err)
        if (mounted) {
          setLoading(false)
        }
      })

    return () => {
      mounted = false
    }
  }, [userId, language, period, currentKnownWords])

  // Generate SVG path for line graph
  const linePath = useMemo(() => {
    if (!data?.points?.length) return ''

    const points = data.points
    const height = 60
    const width = 200

    // Scale Y values
    const minY = data.minWords || 0
    const maxY = data.maxWords || 1
    const range = maxY - minY || 1

    const scaledPoints = points.map((p, i) => {
      const x = (i / (points.length - 1 || 1)) * width
      const y = height - ((p.y - minY) / range) * height * 0.9 - height * 0.05
      return `${x},${y}`
    })

    return scaledPoints.join(' ')
  }, [data])

  // Get bar heights
  const bars = useMemo(() => {
    if (!data?.bars?.length) {
      // Return placeholder bars
      return Array.from({ length: 7 }, () => ({ height: 5 }))
    }
    // Ensure minimum height for visibility when there's data
    return data.bars.map((b) => ({
      ...b,
      height: b.value > 0 ? Math.max(b.height, 8) : 3,
    }))
  }, [data])

  const handlePeriodChange = useCallback((newPeriod) => {
    setPeriod(newPeriod)
  }, [])

  return (
    <div className="home-card">
      <div className="home-card-header">
        <h3 className="home-card-title">Progress</h3>
        <div className="home-progress-periods">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              className={`home-period-btn ${period === p.key ? 'active' : ''}`}
              onClick={() => handlePeriodChange(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="home-progress-chart">
        {loading ? (
          <div className="home-progress-loading">
            <span className="muted small">Loading...</span>
          </div>
        ) : data?.isEmpty ? (
          <div className="home-progress-empty">
            <span className="muted small">Start learning to see your progress</span>
          </div>
        ) : (
          <>
            <div className="home-progress-line">
              <svg viewBox="0 0 200 60" preserveAspectRatio="none" className="home-progress-svg">
                {linePath && (
                  <polyline
                    fill="none"
                    stroke="#0f172a"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={linePath}
                  />
                )}
              </svg>
            </div>
            <div className="home-progress-bars">
              {bars.map((bar, i) => (
                <div
                  key={i}
                  className="home-progress-bar"
                  style={{ height: `${bar.height}%` }}
                  title={bar.value ? `+${bar.value} words` : ''}
                />
              ))}
            </div>
            {data?.totalGain > 0 && (
              <div className="home-progress-gain">
                +{data.totalGain.toLocaleString()} words
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default ProgressChart
