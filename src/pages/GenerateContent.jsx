import { useNavigate, useParams } from 'react-router-dom'
import GenerateStoryPanel from '../components/read/GenerateStoryPanel'

const GenerateContent = () => {
  const navigate = useNavigate()
  const { language: languageParam } = useParams()

  return (
    <div className="page">
      <div className="card dashboard-card">
        <GenerateStoryPanel
          languageParam={languageParam || ''}
          headingLevel="h1"
          onBack={() => navigate('/dashboard')}
        />
      </div>
    </div>
  )
}

export default GenerateContent
