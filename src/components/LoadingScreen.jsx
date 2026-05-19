const LoadingScreen = ({ label = 'Loading' }) => (
  <div className="app-loading-screen" role="status" aria-live="polite">
    <div className="music-preparing-card">
      <div className="music-preparing-status">
        <span className="music-preparing-dot" />
        <span className="music-preparing-dot" />
        <span className="music-preparing-dot" />
      </div>
      <p className="music-preparing-label">{label}</p>
    </div>
  </div>
)

export default LoadingScreen
