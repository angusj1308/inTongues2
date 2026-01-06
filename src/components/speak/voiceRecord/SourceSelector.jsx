import React, { useState, useEffect } from 'react'
import { useAuth } from '../../../contexts/AuthContext'
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore'
import { db } from '../../../firebase'

/**
 * Select content from library or writing for voice recording practice
 */
export function SourceSelector({ sourceType, activeLanguage, onSelect }) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState([])

  useEffect(() => {
    if (!user?.uid || !activeLanguage) return

    const fetchContent = async () => {
      setLoading(true)
      try {
        if (sourceType === 'library') {
          // Fetch stories
          const storiesRef = collection(db, 'users', user.uid, 'stories')
          const storiesQuery = query(
            storiesRef,
            where('language', '==', activeLanguage),
            orderBy('createdAt', 'desc'),
            limit(30)
          )
          const storiesSnap = await getDocs(storiesQuery)
          const stories = storiesSnap.docs.map(doc => ({
            id: doc.id,
            type: 'story',
            ...doc.data()
          }))

          // Fetch YouTube videos
          const videosRef = collection(db, 'users', user.uid, 'youtubeVideos')
          const videosQuery = query(
            videosRef,
            where('language', '==', activeLanguage),
            where('status', '==', 'ready'),
            orderBy('createdAt', 'desc'),
            limit(20)
          )
          const videosSnap = await getDocs(videosQuery)
          const videos = videosSnap.docs.map(doc => ({
            id: doc.id,
            type: 'youtube',
            ...doc.data()
          }))

          setContent([...stories, ...videos])
        } else if (sourceType === 'writing') {
          // Fetch writing pieces
          const writingRef = collection(db, 'users', user.uid, 'writing')
          const writingQuery = query(
            writingRef,
            where('language', '==', activeLanguage),
            orderBy('updatedAt', 'desc'),
            limit(30)
          )
          const writingSnap = await getDocs(writingQuery)
          const writings = writingSnap.docs.map(doc => ({
            id: doc.id,
            type: 'writing',
            ...doc.data()
          }))

          setContent(writings)
        }
      } catch (err) {
        console.error('Error fetching content:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchContent()
  }, [user?.uid, activeLanguage, sourceType])

  if (loading) {
    return (
      <div className="source-selector loading">
        <p className="muted">Loading content...</p>
      </div>
    )
  }

  if (content.length === 0) {
    return (
      <div className="source-selector empty">
        <div className="empty-state">
          <div className="empty-state-icon">
            {sourceType === 'library' ? (
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            ) : (
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            )}
          </div>
          <h4>No Content Found</h4>
          <p className="muted">
            {sourceType === 'library'
              ? `Add stories or import videos in ${activeLanguage} to practice reading.`
              : `Create some writing in ${activeLanguage} first to practice reading aloud.`}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="source-selector">
      <h4>
        {sourceType === 'library' ? 'Select from Library' : 'Select Your Writing'}
      </h4>

      <div className="source-list">
        {content.map(item => (
          <button
            key={item.id}
            className="source-item"
            onClick={() => onSelect(item)}
          >
            {item.type === 'youtube' && item.thumbnailUrl ? (
              <img
                src={item.thumbnailUrl}
                alt=""
                className="source-item-thumbnail"
              />
            ) : (
              <div className="source-item-icon">
                {item.type === 'story' && (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  </svg>
                )}
                {item.type === 'youtube' && (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M23 7l-7 5 7 5V7z" />
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                  </svg>
                )}
                {item.type === 'writing' && (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                )}
              </div>
            )}
            <div className="source-item-info">
              <span className="source-item-title">{item.title}</span>
              <span className="source-item-meta">
                {item.type === 'story' && (item.level || 'Story')}
                {item.type === 'youtube' && (item.channelTitle || 'Video')}
                {item.type === 'writing' && (item.type || 'Writing')}
              </span>
            </div>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  )
}

export default SourceSelector
