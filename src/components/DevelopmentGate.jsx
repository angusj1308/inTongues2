const DevelopmentGate = ({ feature }) => (
  <div className="development-gate">
    <div className="development-gate-content">
      <svg
        className="development-gate-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
      <h2 className="development-gate-title">
        inTongues {feature} Environment
      </h2>
      <p className="development-gate-message">
        Currently under development
      </p>
      <p className="development-gate-sub">
        This feature is being built and will be available soon.
      </p>
    </div>
  </div>
)

export default DevelopmentGate
