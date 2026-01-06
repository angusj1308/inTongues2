import React, { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { submitVote, getVote } from '../../services/community'

export function VoteButtons({
  targetId,
  targetType,
  targetPath = null,
  initialScore = 0,
  initialVote = null,
  onVoteChange,
  compact = false
}) {
  const { user } = useAuth()
  const [score, setScore] = useState(initialScore)
  const [currentVote, setCurrentVote] = useState(initialVote) // 1, -1, or null
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setScore(initialScore)
  }, [initialScore])

  useEffect(() => {
    setCurrentVote(initialVote)
  }, [initialVote])

  // Load user's existing vote on mount
  useEffect(() => {
    if (!user || initialVote !== null) return

    const loadVote = async () => {
      const vote = await getVote(user.uid, targetId)
      if (vote) {
        setCurrentVote(vote.value)
      }
    }
    loadVote()
  }, [user, targetId, initialVote])

  const handleVote = async (value) => {
    if (!user || loading) return

    const newValue = currentVote === value ? 0 : value
    const previousVote = currentVote || 0
    const previousScore = score

    // Optimistic update
    const scoreDelta = newValue - previousVote
    setScore(prev => prev + scoreDelta)
    setCurrentVote(newValue === 0 ? null : newValue)
    setLoading(true)

    try {
      await submitVote(user.uid, targetId, targetType, newValue, targetPath)
      if (onVoteChange) {
        onVoteChange(score + scoreDelta, newValue)
      }
    } catch (error) {
      console.error('Vote error:', error)
      // Rollback on error
      setScore(previousScore)
      setCurrentVote(previousVote === 0 ? null : previousVote)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`vote-buttons ${compact ? 'vote-buttons-compact' : ''}`}>
      <button
        className={`vote-btn vote-up ${currentVote === 1 ? 'active' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          handleVote(1)
        }}
        disabled={!user || loading}
        title="Upvote"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
      </button>
      <span className={`vote-score ${score > 0 ? 'positive' : score < 0 ? 'negative' : ''}`}>
        {score}
      </span>
      <button
        className={`vote-btn vote-down ${currentVote === -1 ? 'active' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          handleVote(-1)
        }}
        disabled={!user || loading}
        title="Downvote"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12l7 7 7-7" />
        </svg>
      </button>
    </div>
  )
}

export default VoteButtons
