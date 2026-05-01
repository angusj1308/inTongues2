import { useState } from 'react'

const FollowButton = ({
  isFollowed,
  isPinned,
  onFollow,
  onUnfollow,
  className = '',
  size = 'normal',
}) => {
  const [confirming, setConfirming] = useState(false)

  const handleClick = async (e) => {
    e?.stopPropagation?.()
    if (!isFollowed) {
      await onFollow?.()
      return
    }
    if (isPinned && !confirming) {
      setConfirming(true)
      return
    }
    setConfirming(false)
    await onUnfollow?.()
  }

  const cancelConfirm = (e) => {
    e?.stopPropagation?.()
    setConfirming(false)
  }

  if (confirming) {
    return (
      <div className={`media-follow-confirm ${className}`} role="dialog" aria-label="Confirm unfollow">
        <p className="media-follow-confirm-text">Unfollow and remove from Pinned?</p>
        <div className="media-follow-confirm-actions">
          <button type="button" className="media-text-button ui-text" onClick={cancelConfirm}>
            Cancel
          </button>
          <button
            type="button"
            className="media-secondary-button ui-text"
            onClick={handleClick}
          >
            Unfollow
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      className={`media-follow-button ${size === 'small' ? 'small' : ''} ${
        isFollowed ? 'is-followed' : ''
      } ${className}`}
      onClick={handleClick}
      aria-pressed={!!isFollowed}
    >
      {isFollowed ? 'Following' : 'Follow'}
    </button>
  )
}

export default FollowButton
