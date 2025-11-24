import { useLocation, useNavigate, useParams } from 'react-router-dom'

const Reader = () => {
  const navigate = useNavigate()
  const { state } = useLocation()
  const { id, language } = useParams()

  return (
    <div className="page">
      <div className="card dashboard-card">
        <div className="page-header">
          <div>
            <h1>Reader</h1>
            <p className="muted small">A simple placeholder to view your generated story.</p>
          </div>
          <button
            className="button ghost"
            onClick={() => navigate(language ? `/library/${encodeURIComponent(language)}` : '/library')}
          >
            Back to library
          </button>
        </div>

        {state?.content ? (
          <div className="preview-card">
            <div className="section-header">
              <div className="pill-row">{language && <span className="pill primary">in{language}</span>}</div>
            </div>
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
