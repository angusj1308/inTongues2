import React from 'react'

const PASS_LABELS = {
  1: 'Pass 1 — Listen',
  2: 'Pass 2 — Listen + Read',
  3: 'Pass 3 — Read',
  4: 'Pass 4 — Listen',
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
              <div className="pass-ladder-title">{PASS_LABELS[step]}</div>
            </div>
          </li>
        )
      })}
    </ul>
  </div>
)

export default PassLadder
