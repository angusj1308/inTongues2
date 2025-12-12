import React from 'react'

const PASS_LABELS = {
  1: 'First listen — no subtitles',
  2: 'Second listen — subtitles on',
  3: 'Review — adjust words',
  4: 'Final listen — no transcript',
}

const PassLadder = ({ activeStep = 1 }) => (
  <div className="pass-ladder" aria-label="Pass ladder">
    <div className="pass-ladder-heading">Passes</div>
    <ul className="pass-ladder-list">
      {[1, 2, 3, 4].map((step) => {
        const isCurrent = step === activeStep
        const isCompleted = step < activeStep
        const statusIcon = isCompleted ? '✓' : isCurrent ? '▸' : '○'
        return (
          <li key={step} className={`pass-ladder-item ${isCurrent ? 'current' : ''} ${isCompleted ? 'completed' : ''}`}>
            <span className="pass-ladder-icon" aria-hidden="true">
              {statusIcon}
            </span>
            <div className="pass-ladder-text">
              <div className="pass-ladder-title">Pass {step}</div>
              <div className="pass-ladder-subtitle">{PASS_LABELS[step]}</div>
            </div>
          </li>
        )
      })}
    </ul>
    <div className="pass-ladder-footnote">Next chunk unlocks after Pass 4.</div>
  </div>
)

export default PassLadder
