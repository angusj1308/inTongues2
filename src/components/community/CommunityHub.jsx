import React, { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import PostFeed from './PostFeed'
import PostDetail from './PostDetail'
import CreatePostModal from './CreatePostModal'

const SORT_OPTIONS = [
  { id: 'hot', label: 'Hot' },
  { id: 'new', label: 'New' },
  { id: 'top', label: 'Top' },
]

const LANGUAGE_FILTERS = ['All', 'General', 'English', 'Spanish', 'French', 'Italian']

export function CommunityHub({ activeLanguage }) {
  const { user } = useAuth()
  const [sortBy, setSortBy] = useState('hot')
  const [languageFilter, setLanguageFilter] = useState('All')
  const [selectedPost, setSelectedPost] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [feedKey, setFeedKey] = useState(0) // Force refresh

  const handlePostCreated = (newPost) => {
    setFeedKey((prev) => prev + 1) // Refresh feed
    setSelectedPost(newPost) // Navigate to new post
  }

  // Show post detail view
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
      <div className="community-header">
        <h2>Community</h2>
        <p className="muted">Ask questions and help fellow learners</p>
      </div>

      <div className="community-controls">
        {/* Sort Tabs */}
        <div className="sort-tabs">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.id}
              className={`sort-tab ${sortBy === option.id ? 'active' : ''}`}
              onClick={() => setSortBy(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Language Filter */}
        <div className="language-filter">
          <select
            value={languageFilter}
            onChange={(e) => setLanguageFilter(e.target.value)}
            className="filter-select"
          >
            {LANGUAGE_FILTERS.map((lang) => (
              <option key={lang} value={lang}>
                {lang === 'All' ? 'All Languages' : lang}
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

      {/* Create Post FAB */}
      {user && (
        <button
          className="create-post-fab"
          onClick={() => setShowCreateModal(true)}
          title="Ask a question"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      )}

      {/* Create Post Modal */}
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
