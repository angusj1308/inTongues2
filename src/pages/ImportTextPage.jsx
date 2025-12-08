import { useNavigate, useParams } from 'react-router-dom'
import ImportBookPanel from '../components/read/ImportBookPanel'

const ImportTextPage = () => {
  const navigate = useNavigate()
  const { language } = useParams()

  return (
    <div className="page">
      <div className="card">
        <ImportBookPanel
          activeLanguage={language || ''}
          onBack={() => navigate(-1)}
          headingLevel="h1"
        />
      </div>
    </div>
  )
}

export default ImportTextPage
