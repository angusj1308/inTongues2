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

export function PostCard({ post, userVote, onClick }) {
  const hasAcceptedAnswer = !!post.acceptedAnswerId

  return (
    <div
      className="community-post-card"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onClick?.()
        }
      }}
    >
      <div className="post-card-vote">
        <VoteButtons
          targetId={post.id}
          targetType="post"
          initialScore={post.score || 0}
          initialVote={userVote}
          compact
        />
      </div>

      <div className="post-card-content">
        <h3 className="post-card-title">{post.title}</h3>
        <p className="post-card-excerpt">
          {post.body.length > 150 ? post.body.substring(0, 150) + '...' : post.body}
        </p>
        <div className="post-card-meta">
          <span className="post-card-author">@{post.authorName}</span>
          <span className="post-card-dot">·</span>
          <span className="post-card-language">{post.language}</span>
          <span className="post-card-dot">·</span>
          <span className="post-card-time">{formatRelativeTime(post.createdAt)}</span>
        </div>
        <div className="post-card-stats">
          <span className={`post-card-comments ${hasAcceptedAnswer ? 'has-accepted' : ''}`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            {post.commentCount || 0} {post.commentCount === 1 ? 'answer' : 'answers'}
            {hasAcceptedAnswer && (
              <svg className="accepted-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </span>
        </div>
      </div>
    </div>
  )
}

export default PostCard
