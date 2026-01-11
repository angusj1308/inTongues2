import { useCallback, useEffect, useMemo, useState } from 'react'
import { getProgressData } from '../../services/progress'

const PERIODS = [
  { key: 'week', label: 'W', days: 7 },
  { key: 'month', label: 'M', days: 30 },
  { key: 'year', label: 'Y', days: 365 },
  { key: '5year', label: '5Y', days: 1825 },
]

// Stat type display names
const STAT_TITLES = {
  knownWords: 'Known Words',
  wordsRead: 'Words Read',
  listeningSeconds: 'Listening Time',
  reviews: 'Cards Reviewed',
  wordsWritten: 'Words Written',
  speakingSeconds: 'Speaking Time',
}

// Format date for x-axis labels based on period
const formatDateLabel = (dateStr, period) => {
  if (!dateStr) return ''
  const date = new Date(dateStr + 'T00:00:00')

  if (period === 'week') {
    // Show day name: Mon, Tue, etc.
    return date.toLocaleDateString('en-US', { weekday: 'short' })
  } else if (period === 'month') {
    // Show day number: 1, 15, 30
    return date.getDate().toString()
  } else if (period === 'year') {
    // Show month: Jan, Feb, etc.
    return date.toLocaleDateString('en-US', { month: 'short' })
  } else {
    // 5year - show year: 2024, 2025
    return date.getFullYear().toString()
  }
}

// Format word count for y-axis
const formatWordCount = (count) => {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}k`
  }
  return count.toString()
}

const ProgressChart = ({ userId, language, selectedStat = 'knownWords', homeStats = {}, levelThreshold }) => {
  const [period, setPeriod] = useState('week')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  // Get current total for the selected stat
  const currentTotal = useMemo(() => {
    switch (selectedStat) {
      case 'knownWords':
        return homeStats.knownWords || 0
      case 'wordsRead':
        return homeStats.wordsRead || 0
      case 'listeningSeconds':
        return homeStats.listeningSeconds || 0
      case 'reviews':
        return homeStats.reviewCount || 0
      case 'wordsWritten':
        return homeStats.wordsWritten || 0
      case 'speakingSeconds':
        return homeStats.speakingSeconds || 0
      default:
        return 0
    }
  }, [selectedStat, homeStats])

  // For knownWords, use the level threshold as the y-axis max
  const yAxisMax = useMemo(() => {
    if (selectedStat === 'knownWords' && levelThreshold && levelThreshold !== Infinity) {
      return levelThreshold
    }
    return null // Let progress.js calculate naturally
  }, [selectedStat, levelThreshold])

  // Fetch progress data when period, language, stat type, or current total changes
  useEffect(() => {
    if (!userId || !language) {
      setLoading(false)
      return
    }

    let mounted = true
    setLoading(true)

    getProgressData(userId, language, period, currentTotal, selectedStat, yAxisMax)
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
  }, [userId, language, period, currentTotal, selectedStat, yAxisMax])

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

  // Get x-axis date labels (show subset for readability)
  const xAxisLabels = useMemo(() => {
    if (!data?.bars?.length) return []

    const bars = data.bars
    const len = bars.length

    if (period === 'week') {
      // Show all 7 days
      return bars.map((b, i) => ({
        label: formatDateLabel(b.date, period),
        position: i,
      }))
    } else if (period === 'month') {
      // Show ~5 labels: 1st, 8th, 15th, 22nd, last
      const indices = [0, 7, 14, 21, len - 1]
      return indices.filter(i => i < len).map(i => ({
        label: formatDateLabel(bars[i].date, period),
        position: i,
      }))
    } else if (period === 'year') {
      // Show every 2-3 months
      const step = Math.ceil(len / 6)
      const labels = []
      for (let i = 0; i < len; i += step) {
        labels.push({
          label: formatDateLabel(bars[i].date, period),
          position: i,
        })
      }
      // Always include last
      if (labels[labels.length - 1]?.position !== len - 1) {
        labels.push({
          label: formatDateLabel(bars[len - 1].date, period),
          position: len - 1,
        })
      }
      return labels
    } else {
      // 5year - show years
      const step = Math.ceil(len / 5)
      const labels = []
      for (let i = 0; i < len; i += step) {
        labels.push({
          label: formatDateLabel(bars[i].date, period),
          position: i,
        })
      }
      return labels
    }
  }, [data, period])

  // Y-axis labels (min and max)
  const yAxisLabels = useMemo(() => {
    if (!data || data.isEmpty) return { min: '0', max: '0' }
    return {
      min: formatWordCount(data.minWords || 0),
      max: formatWordCount(data.maxWords || 0),
    }
  }, [data])

  // Get label for the current stat type
  const statLabel = useMemo(() => {
    return data?.label || 'words'
  }, [data])

  return (
    <div className="home-card">
      <div className="home-card-header">
        <h3 className="home-card-title">{STAT_TITLES[selectedStat] || 'Progress'}</h3>
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
          <div className="home-progress-content">
            {/* Y-axis labels */}
            <div className="home-progress-y-axis">
              <span className="home-progress-y-label">{yAxisLabels.max}</span>
              <span className="home-progress-y-label">{yAxisLabels.min}</span>
            </div>

            {/* Main chart area */}
            <div className="home-progress-main">
              <div className="home-progress-line">
                <svg viewBox="0 0 200 60" preserveAspectRatio="none" className="home-progress-svg">
                  {linePath && (
                    <polyline
                      fill="none"
                      stroke="#9B2C2C"
                      strokeWidth="0.5"
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
                    className={`home-progress-bar${bar.value > 0 ? ' has-data' : ''}`}
                    style={{ height: `${bar.height}%` }}
                    title={bar.value ? `+${bar.value} ${statLabel}` : ''}
                  />
                ))}
              </div>

              {/* X-axis labels */}
              <div className="home-progress-x-axis">
                {period === 'week' ? (
                  // For week view, show label under each bar
                  bars.map((bar, i) => (
                    <span key={i} className="home-progress-x-label">
                      {formatDateLabel(bar.date, period)}
                    </span>
                  ))
                ) : (
                  // For other periods, show positioned labels
                  xAxisLabels.map((item, i) => (
                    <span
                      key={i}
                      className="home-progress-x-label"
                      style={{ left: `${(item.position / (data.bars.length - 1)) * 100}%` }}
                    >
                      {item.label}
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* Total gain */}
            {data?.totalGain > 0 && (
              <div className="home-progress-gain">
                +{data.totalGain.toLocaleString()} {statLabel}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default ProgressChart
