import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { ShadowingSession } from '../components/speak/intensive/ShadowingSession'

/**
 * Standalone page for Pronunciation Practice
 * Clean white background with just the practice card
 */
const PronunciationPractice = () => {
  const { contentType, contentId } = useParams()
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [content, setContent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const activeLanguage = profile?.lastUsedLanguage || 'Spanish'
  const nativeLanguage = profile?.nativeLanguage || 'English'

  // Load content data
  useEffect(() => {
    const loadContent = async () => {
      if (!user?.uid || !contentType || !contentId) {
        setError('Missing content information')
        setLoading(false)
        return
      }

      try {
        let docRef
        let contentData

        if (contentType === 'youtube') {
          docRef = doc(db, 'users', user.uid, 'youtubeVideos', contentId)
          const docSnap = await getDoc(docRef)
          if (docSnap.exists()) {
            contentData = {
              id: docSnap.id,
              type: 'youtube',
              ...docSnap.data()
            }
          }
        } else if (contentType === 'story') {
          docRef = doc(db, 'users', user.uid, 'stories', contentId)
          const docSnap = await getDoc(docRef)
          if (docSnap.exists()) {
            contentData = {
              id: docSnap.id,
              type: 'story',
              ...docSnap.data()
            }
          }
        }

        if (contentData) {
          setContent(contentData)
        } else {
          setError('Content not found')
        }
      } catch (err) {
        console.error('Error loading content:', err)
        setError('Failed to load content')
      } finally {
        setLoading(false)
      }
    }

    loadContent()
  }, [user?.uid, contentType, contentId])

  const handleBack = () => {
    navigate('/dashboard')
  }

  if (loading) {
    return (
      <div className="pronunciation-page">
        <div className="pronunciation-page-loading">
          <p className="muted">Loading...</p>
        </div>
      </div>
    )
  }

  if (error || !content) {
    return (
      <div className="pronunciation-page">
        <div className="pronunciation-page-error">
          <p>{error || 'Content not found'}</p>
          <button className="btn btn-secondary" onClick={handleBack}>
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="pronunciation-page">
      <ShadowingSession
        content={content}
        activeLanguage={activeLanguage}
        nativeLanguage={nativeLanguage}
        onBack={handleBack}
      />
    </div>
  )
}

export default PronunciationPractice
