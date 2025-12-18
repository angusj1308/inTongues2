import React from 'react'

const STEP_CONTENT = {
  1: {
    title: 'Listen',
    subtitle: 'Pass 1/4',
  },
  2: {
    title: 'Listen + Read',
    subtitle: 'Pass 2/4',
  },
  3: {
    title: 'Read',
    subtitle: 'Pass 3/4',
  },
  4: {
    title: 'Listen',
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
