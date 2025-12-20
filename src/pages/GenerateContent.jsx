import { useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import GenerateStoryPanel from '../components/read/GenerateStoryPanel'
import { DEFAULT_LANGUAGE, resolveSupportedLanguageLabel } from '../constants/languages'

const GenerateContent = () => {
  const navigate = useNavigate()
  const { language: languageParam } = useParams()
  const resolvedLanguageParam = useMemo(
    () => resolveSupportedLanguageLabel(languageParam || '', ''),
    [languageParam],
  )

  useEffect(() => {
    if (!languageParam) return
    if (!resolvedLanguageParam) {
      navigate(`/generate/${encodeURIComponent(DEFAULT_LANGUAGE)}`, { replace: true })
      return
    }
    if (languageParam !== resolvedLanguageParam) {
      navigate(`/generate/${encodeURIComponent(resolvedLanguageParam)}`, { replace: true })
    }
  }, [languageParam, navigate, resolvedLanguageParam])

  return (
    <div className="page">
      <div className="card dashboard-card">
        <GenerateStoryPanel
          languageParam={resolvedLanguageParam || ''}
          headingLevel="h1"
          onBack={() => navigate('/dashboard')}
        />
      </div>
    </div>
  )
}

export default GenerateContent
