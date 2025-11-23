import { useLocation, useNavigate, useParams } from 'react-router-dom'

const Reader = () => {
  const navigate = useNavigate()
  const { state } = useLocation()
  const { id } = useParams()

  return (
    <div className="page">
      <div className="card dashboard-card">
        <div className="page-header">
          <div>
            <h1>Reader</h1>
            <p className="muted small">A simple placeholder to view your generated story.</p>
          </div>
          <button className="button ghost" onClick={() => navigate('/library')}>
            Back to library
          </button>
        </div>

        {state?.content ? (
          <div className="preview-card">
            <p>{state.content}</p>
          </div>
        ) : (
          <p className="muted">Story {id} is ready to read soon.</p>
        )}
      </div>
    </div>
  )
}

export default Reader
