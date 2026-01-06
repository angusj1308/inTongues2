import React, { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import {
  getPost,
  subscribeToPost,
  subscribeToComments,
  createComment,
  acceptAnswer,
  reportContent,
  getUserVotes,
} from '../../services/community'
import VoteButtons from './VoteButtons'

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

export function PostDetail({ postId, onBack }) {
  const { user, profile } = useAuth()
  const [post, setPost] = useState(null)
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [commentInput, setCommentInput] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [userVotes, setUserVotes] = useState({})
  const [showReportModal, setShowReportModal] = useState(null)
  const [reportReason, setReportReason] = useState('spam')
  const [reportDetails, setReportDetails] = useState('')
  const [reportSubmitting, setReportSubmitting] = useState(false)

  const isPostAuthor = user && post?.authorId === user.uid
  const COMMENT_MIN = 10
  const COMMENT_MAX = 2000

  // Load post and comments
  useEffect(() => {
    if (!postId) return

    setLoading(true)

    // Subscribe to post updates
    const unsubPost = subscribeToPost(postId, (updatedPost) => {
      setPost(updatedPost)
      setLoading(false)
    })

    // Subscribe to comments
    const unsubComments = subscribeToComments(postId, (updatedComments) => {
      setComments(updatedComments)
    })

    return () => {
      unsubPost()
      if (unsubComments) unsubComments()
    }
  }, [postId])

  // Load user votes
  useEffect(() => {
    if (!user || !post || comments.length === 0) return

    const loadVotes = async () => {
      const targetIds = [post.id, ...comments.map((c) => c.id)]
      const votes = await getUserVotes(user.uid, targetIds)
      setUserVotes(votes)
    }
    loadVotes()
  }, [user, post, comments])

  const handleSubmitComment = async (e) => {
    e.preventDefault()
    if (!user || !commentInput.trim() || commentInput.trim().length < COMMENT_MIN) return

    setSubmittingComment(true)
    try {
      await createComment(postId, user.uid, profile, commentInput)
      setCommentInput('')
    } catch (error) {
      console.error('Failed to submit comment:', error)
    } finally {
      setSubmittingComment(false)
    }
  }

  const handleAcceptAnswer = async (commentId) => {
    if (!isPostAuthor) return

    try {
      await acceptAnswer(postId, commentId, user.uid, post.authorId)
    } catch (error) {
      console.error('Failed to accept answer:', error)
    }
  }

  const handleReport = async (targetId, targetType) => {
    if (!user || reportSubmitting) return

    setReportSubmitting(true)
    try {
      await reportContent(user.uid, targetId, targetType, reportReason, reportDetails)
      setShowReportModal(null)
      setReportReason('spam')
      setReportDetails('')
    } catch (error) {
      console.error('Failed to report:', error)
    } finally {
      setReportSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="post-detail">
        <button className="btn-back" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <div className="loading-placeholder">Loading post...</div>
      </div>
    )
  }

  if (!post) {
    return (
      <div className="post-detail">
        <button className="btn-back" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <div className="empty-state">Post not found</div>
      </div>
    )
  }

  return (
    <div className="post-detail">
      <button className="btn-back" onClick={onBack}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      {/* Post */}
      <article className="post-detail-main">
        <h1 className="post-detail-title">{post.title}</h1>
        <div className="post-detail-meta">
          <span className="post-author">@{post.authorName}</span>
          <span className="dot">·</span>
          <span className="post-language">{post.language}</span>
          <span className="dot">·</span>
          <span className="post-time">{formatRelativeTime(post.createdAt)}</span>
        </div>
        <div className="post-detail-body">{post.body}</div>
        <div className="post-detail-actions">
          <VoteButtons
            targetId={post.id}
            targetType="post"
            initialScore={post.score || 0}
            initialVote={userVotes[post.id] || null}
          />
          <button
            className="btn-report"
            onClick={() => setShowReportModal({ id: post.id, type: 'post' })}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
              <line x1="4" y1="22" x2="4" y2="15" />
            </svg>
            Report
          </button>
        </div>
      </article>

      {/* Comments Section */}
      <section className="comments-section">
        <h2>{comments.length} {comments.length === 1 ? 'Answer' : 'Answers'}</h2>

        {/* Comment Input */}
        <form className="comment-form" onSubmit={handleSubmitComment}>
          <textarea
            value={commentInput}
            onChange={(e) => setCommentInput(e.target.value)}
            placeholder="Write your answer..."
            rows={4}
            maxLength={COMMENT_MAX}
          />
          <div className="comment-form-footer">
            <span className={`char-count ${commentInput.trim().length < COMMENT_MIN ? 'invalid' : ''}`}>
              {commentInput.trim().length}/{COMMENT_MAX}
            </span>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!user || submittingComment || commentInput.trim().length < COMMENT_MIN}
            >
              {submittingComment ? 'Posting...' : 'Post Answer'}
            </button>
          </div>
        </form>

        {/* Comments List */}
        <div className="comments-list">
          {comments.map((comment) => (
            <div
              key={comment.id}
              className={`comment-card ${comment.isAccepted ? 'is-accepted' : ''}`}
            >
              {comment.isAccepted && (
                <div className="accepted-badge">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Accepted Answer
                </div>
              )}
              <div className="comment-meta">
                <span className="comment-author">@{comment.authorName}</span>
                <span className="dot">·</span>
                <span className="comment-time">{formatRelativeTime(comment.createdAt)}</span>
              </div>
              <div className="comment-body">{comment.body}</div>
              <div className="comment-actions">
                <VoteButtons
                  targetId={comment.id}
                  targetType="comment"
                  targetPath={postId}
                  initialScore={comment.score || 0}
                  initialVote={userVotes[comment.id] || null}
                  compact
                />
                {isPostAuthor && !comment.isAccepted && (
                  <button
                    className="btn-accept"
                    onClick={() => handleAcceptAnswer(comment.id)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Accept
                  </button>
                )}
                <button
                  className="btn-report"
                  onClick={() => setShowReportModal({ id: comment.id, type: 'comment' })}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                    <line x1="4" y1="22" x2="4" y2="15" />
                  </svg>
                </button>
              </div>
            </div>
          ))}

          {comments.length === 0 && (
            <div className="empty-comments">
              No answers yet. Be the first to help!
            </div>
          )}
        </div>
      </section>

      {/* Report Modal */}
      {showReportModal && (
        <div className="modal-overlay" onClick={() => setShowReportModal(null)}>
          <div className="modal-content report-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Report {showReportModal.type}</h3>
            <div className="form-group">
              <label>Reason</label>
              <select
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
              >
                <option value="spam">Spam</option>
                <option value="harassment">Harassment</option>
                <option value="inappropriate">Inappropriate content</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="form-group">
              <label>Details (optional)</label>
              <textarea
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
                placeholder="Provide additional context..."
                rows={3}
              />
            </div>
            <div className="form-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setShowReportModal(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={() => handleReport(showReportModal.id, showReportModal.type)}
                disabled={reportSubmitting}
              >
                {reportSubmitting ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PostDetail
