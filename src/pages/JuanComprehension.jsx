import { useNavigate } from 'react-router-dom'

const JuanComprehension = () => {
  const navigate = useNavigate()

  return (
    <div className="page">
      <div className="card dashboard-card">
        <div className="page-header">
          <div>
            <h1>Comprehension practice with Juan</h1>
            <p className="muted small">A focused listening session with your conversation partner.</p>
          </div>
          <button className="button ghost" onClick={() => navigate(-1)}>
            Back
          </button>
        </div>

        <div className="read-section read-slab" style={{ marginTop: '0' }}>
          <p className="muted">
            Juan will be here soon. The full conversation experience is on the way—this page is a placeholder
            until the listening lab is ready.
          </p>
        </div>
      </div>
    </div>
  )
}

export default JuanComprehension
