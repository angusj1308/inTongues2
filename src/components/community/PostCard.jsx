import React from 'react'
import VoteButtons from './VoteButtons'

// Format relative time
const formatRelativeTime = (timestamp) => {
  if (!timestamp) return ''
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

// Language badge colors
const LANGUAGE_COLORS = {
  Spanish: { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
  French: { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  Italian: { bg: '#dcfce7', text: '#166534', border: '#86efac' },
  English: { bg: '#f3e8ff', text: '#6b21a8', border: '#d8b4fe' },
  General: { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' },
}

export function PostCard({ post, userVote, onClick, isPlaceholder = false }) {
  const hasAcceptedAnswer = !!post.acceptedAnswerId
  const langColors = LANGUAGE_COLORS[post.language] || LANGUAGE_COLORS.General

  return (
    <article
      className={`community-card ${isPlaceholder ? 'is-placeholder' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onClick?.()
        }
      }}
    >
      {/* Vote Section */}
      <div className="community-card-votes">
        {isPlaceholder ? (
          <div className="community-card-vote-display">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="18 15 12 9 6 15" />
            </svg>
            <span className={`vote-count ${post.score > 0 ? 'positive' : ''}`}>{post.score}</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        ) : (
          <VoteButtons
            targetId={post.id}
            targetType="post"
            initialScore={post.score || 0}
            initialVote={userVote}
            compact
          />
        )}
      </div>

      {/* Content Section */}
      <div className="community-card-body">
        <div className="community-card-header">
          <span
            className="community-card-lang"
            style={{
              backgroundColor: langColors.bg,
              color: langColors.text,
              borderColor: langColors.border,
            }}
          >
            {post.language}
          </span>
          {hasAcceptedAnswer && (
            <span className="community-card-solved">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Solved
            </span>
          )}
        </div>

        <h3 className="community-card-title">{post.title}</h3>

        <p className="community-card-excerpt">
          {post.body.length > 140 ? post.body.substring(0, 140) + '...' : post.body}
        </p>

        <div className="community-card-footer">
          <div className="community-card-author">
            <div className="community-card-avatar">
              {post.authorName?.charAt(0).toUpperCase()}
            </div>
            <span>{post.authorName}</span>
          </div>
          <div className="community-card-stats">
            <span className="community-card-stat">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              {post.commentCount || 0}
            </span>
            <span className="community-card-time">{formatRelativeTime(post.createdAt)}</span>
          </div>
        </div>
      </div>
    </article>
  )
}

export default PostCard
