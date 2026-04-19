import { Component } from 'react'

/**
 * Catches render-time crashes inside the cinema mode subtree so a bug in
 * ExtensiveCinemaMode / ActiveCinemaMode / IntensiveCinemaMode / KaraokeSubtitles
 * doesn't unmount the whole page and leave the user staring at a blank screen.
 * Shows a minimal fallback and logs the error to the console; state clears
 * when the parent re-keys this boundary (e.g. on video change).
 */
class CinemaErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('CinemaErrorBoundary caught:', error, info?.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: '2rem',
          textAlign: 'center',
          color: '#78716c',
          fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        }}>
          <p style={{ fontWeight: 600, marginBottom: '0.5rem', color: '#0f172a' }}>
            Something went wrong loading this video.
          </p>
          <p style={{ fontSize: '0.9rem' }}>
            {this.state.error?.message || 'Unknown error'}
          </p>
          <p style={{ fontSize: '0.8rem', marginTop: '1rem' }}>
            Try reloading the page. Details are in the browser console.
          </p>
        </div>
      )
    }
    return this.props.children
  }
}

export default CinemaErrorBoundary
