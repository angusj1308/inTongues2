import React from 'react'

const STEP_CONTENT = {
  1: {
    title: 'First listen — no subtitles. Just listen.',
    subtitle: 'Pass 1/4',
  },
  2: {
    title: 'Second listen — subtitles on. Notice what you missed.',
    subtitle: 'Pass 2/4',
  },
  3: {
    title: 'Review — read + adjust word statuses if needed.',
    subtitle: 'Pass 3/4',
  },
  4: {
    title: 'Final listen — no transcript. Confirm comprehension.',
    subtitle: 'Pass 4/4',
  },
}

const ActiveStepGate = ({ step }) => {
  const content = STEP_CONTENT[step] || STEP_CONTENT[1]

  return (
    <div className="active-step-gate">
      <div className="active-step-progress">{content.subtitle}</div>
      <div className="active-step-text">{content.title}</div>
    </div>
  )
}

export default ActiveStepGate
