import React, { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import PostFeed from './PostFeed'
import PostDetail from './PostDetail'
import CreatePostModal from './CreatePostModal'

const SORT_OPTIONS = [
  { id: 'hot', label: 'Trending', icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  )},
  { id: 'new', label: 'Latest', icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )},
  { id: 'top', label: 'Top', icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )},
]

const LANGUAGE_FILTERS = [
  { id: 'All', label: 'All Languages' },
  { id: 'General', label: 'General' },
  { id: 'English', label: 'English' },
  { id: 'Spanish', label: 'Spanish' },
  { id: 'French', label: 'French' },
  { id: 'Italian', label: 'Italian' },
]

const PenIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 19l7-7 3 3-7 7-3-3z" />
    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
    <path d="M2 2l7.586 7.586" />
    <circle cx="11" cy="11" r="2" />
  </svg>
)

export function CommunityHub({ activeLanguage }) {
  const { user } = useAuth()
  const [sortBy, setSortBy] = useState('hot')
  const [languageFilter, setLanguageFilter] = useState('All')
  const [selectedPost, setSelectedPost] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [feedKey, setFeedKey] = useState(0)

  const handlePostCreated = (newPost) => {
    setFeedKey((prev) => prev + 1)
    setSelectedPost(newPost)
  }

  if (selectedPost) {
    return (
      <div className="community-hub">
        <PostDetail
          postId={selectedPost.id}
          onBack={() => setSelectedPost(null)}
        />
      </div>
    )
  }

  return (
    <div className="community-hub">
      {/* Hero Header */}
      <div className="community-hero">
        <div className="community-hero-content">
          <h1>Community</h1>
          <p>Connect with fellow learners, ask questions, and share your knowledge</p>
        </div>
        {user && (
          <button
            className="community-ask-btn"
            onClick={() => setShowCreateModal(true)}
          >
            <PenIcon />
            <span>Ask a Question</span>
          </button>
        )}
      </div>

      {/* Filter Bar */}
      <div className="community-filter-bar">
        <div className="community-sort-pills">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.id}
              className={`community-pill ${sortBy === option.id ? 'active' : ''}`}
              onClick={() => setSortBy(option.id)}
            >
              {option.icon}
              <span>{option.label}</span>
            </button>
          ))}
        </div>

        <div className="community-lang-filter">
          <select
            value={languageFilter}
            onChange={(e) => setLanguageFilter(e.target.value)}
            className="community-lang-select"
          >
            {LANGUAGE_FILTERS.map((lang) => (
              <option key={lang.id} value={lang.id}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Post Feed */}
      <PostFeed
        key={feedKey}
        sortBy={sortBy}
        languageFilter={languageFilter}
        onPostClick={setSelectedPost}
      />

      {/* Mobile FAB */}
      {user && (
        <button
          className="community-fab"
          onClick={() => setShowCreateModal(true)}
          title="Ask a question"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      )}

      {showCreateModal && (
        <CreatePostModal
          onClose={() => setShowCreateModal(false)}
          onPostCreated={handlePostCreated}
          defaultLanguage={activeLanguage || 'General'}
        />
      )}
    </div>
  )
}

export default CommunityHub
