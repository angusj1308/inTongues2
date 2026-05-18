import useMusicKit from '../../hooks/useMusicKit'

// Top-of-shell connect button. Renders nothing until MusicKit JS has loaded
// and configured, then flips between Connect / Connected states.
const MusicKitConnect = () => {
  const { ready, isAuthorized, error, connect, disconnect } = useMusicKit()

  if (!ready && !error) return <div className="musickit-connect" />

  return (
    <div className="musickit-connect">
      {error ? (
        <span className="error small ui-text">{error}</span>
      ) : isAuthorized ? (
        <button
          type="button"
          className="media-secondary-button ui-text musickit-connect-button is-connected"
          onClick={disconnect}
        >
          Apple Music · Sign out
        </button>
      ) : (
        <button
          type="button"
          className="media-secondary-button ui-text musickit-connect-button"
          onClick={connect}
        >
          Connect Apple Music
        </button>
      )}
    </div>
  )
}

export default MusicKitConnect
