import { useNavigate } from 'react-router-dom'
import ImportYouTubePanel from '../components/listen/ImportYouTubePanel'

const ImportAudioVideo = () => {
  const navigate = useNavigate()

  return (
    <div className="page">
      <div className="card dashboard-card">
        <div className="page-header">
          <div>
            <h1>Import audio or video</h1>
            <p className="muted small">
              Add a YouTube video to your listening library and access it inside inTongues Cinema.
            </p>
          </div>
          <button className="button ghost" onClick={() => navigate('/listening')}>
            Back to listening library
          </button>
        </div>

        <ImportYouTubePanel headingLevel="h3" layout="section" onSuccess={() => navigate('/listening')} />
      </div>
    </div>
  )
}

export default ImportAudioVideo
