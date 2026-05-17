import { useEffect } from 'react'

export default function DubConfirmModal({
  open,
  video,
  estimatedCredits,
  durationMin,
  onCancel,
  onConfirm,
  pending,
}) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null
  return (
    <div className="listen-dub-modal-backdrop" onClick={onCancel}>
      <div className="listen-dub-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h3 className="listen-dub-modal-title">Translate this video?</h3>
        <p className="listen-dub-modal-body">
          {video?.title ? <strong>{video.title}</strong> : 'This video'} appears to be in a different language than your target.
          {' '}
          Dubbing it to your target language will use approximately{' '}
          <strong>{estimatedCredits.toLocaleString()} credits</strong>
          {durationMin > 0 && <> (≈{durationMin} min of audio)</>}.
          {' '}Do you wish to continue?
        </p>
        <div className="listen-dub-modal-actions">
          <button type="button" className="listen-dub-modal-btn" onClick={onCancel} disabled={pending}>
            Cancel
          </button>
          <button type="button" className="listen-dub-modal-btn is-primary" onClick={onConfirm} disabled={pending}>
            {pending ? 'Starting…' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  )
}
