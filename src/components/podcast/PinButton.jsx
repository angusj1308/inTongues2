const PinButton = ({ isPinned, onClick, disabled, title }) => {
  const label = isPinned ? 'Unpin' : 'Pin'
  return (
    <button
      type="button"
      className={`media-pin-button ${isPinned ? 'is-pinned' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={!!isPinned}
      aria-label={label}
      title={title || (disabled ? 'You can only pin up to 4 items.' : label)}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill={isPinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
        <path d="M12 2v6l3 3v3H9v-3l3-3V2z" />
        <line x1="12" y1="14" x2="12" y2="22" />
      </svg>
    </button>
  )
}

export default PinButton
