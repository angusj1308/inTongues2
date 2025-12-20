import { useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ImportBookPanel from '../components/read/ImportBookPanel'
import { DEFAULT_LANGUAGE, resolveSupportedLanguageLabel } from '../constants/languages'

const ImportTextPage = () => {
  const navigate = useNavigate()
  const { language } = useParams()
  const resolvedLanguage = useMemo(
    () => resolveSupportedLanguageLabel(language || '', ''),
    [language],
  )

  useEffect(() => {
    if (!language) return
    if (!resolvedLanguage) {
      navigate(`/import/${encodeURIComponent(DEFAULT_LANGUAGE)}`, { replace: true })
      return
    }
    if (language !== resolvedLanguage) {
      navigate(`/import/${encodeURIComponent(resolvedLanguage)}`, { replace: true })
    }
  }, [language, navigate, resolvedLanguage])

  return (
    <div className="page">
      <div className="card">
        <ImportBookPanel
          activeLanguage={resolvedLanguage || ''}
          onBack={() => navigate(-1)}
          headingLevel="h1"
        />
      </div>
    </div>
  )
}

export default ImportTextPage
