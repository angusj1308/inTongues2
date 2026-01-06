import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { getPosts, getUserVotes } from '../../services/community'
import PostCard from './PostCard'

const POSTS_PER_PAGE = 20

export function PostFeed({ sortBy = 'hot', languageFilter = 'All', onPostClick }) {
  const { user } = useAuth()
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [lastDoc, setLastDoc] = useState(null)
  const [hasMore, setHasMore] = useState(true)
  const [userVotes, setUserVotes] = useState({})
  const [error, setError] = useState('')
  const loadMoreRef = useRef(null)

  // Initial load and reload on filter change
  useEffect(() => {
    const loadPosts = async () => {
      setLoading(true)
      setError('')
      try {
        const snapshot = await getPosts(sortBy, null, POSTS_PER_PAGE, languageFilter)
        const newPosts = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
        setPosts(newPosts)
        setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null)
        setHasMore(newPosts.length === POSTS_PER_PAGE)

        // Load user votes for these posts
        if (user && newPosts.length > 0) {
          const votes = await getUserVotes(user.uid, newPosts.map((p) => p.id))
          setUserVotes(votes)
        }
      } catch (err) {
        console.error('Failed to load posts:', err)
        setError('Failed to load posts. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    loadPosts()
  }, [sortBy, languageFilter, user])

  // Load more posts
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !lastDoc) return

    setLoadingMore(true)
    try {
      const snapshot = await getPosts(sortBy, lastDoc, POSTS_PER_PAGE, languageFilter)
      const newPosts = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))

      setPosts((prev) => [...prev, ...newPosts])
      setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null)
      setHasMore(newPosts.length === POSTS_PER_PAGE)

      // Load user votes for new posts
      if (user && newPosts.length > 0) {
        const votes = await getUserVotes(user.uid, newPosts.map((p) => p.id))
        setUserVotes((prev) => ({ ...prev, ...votes }))
      }
    } catch (err) {
      console.error('Failed to load more posts:', err)
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, hasMore, lastDoc, sortBy, languageFilter, user])

  // Infinite scroll observer
  useEffect(() => {
    if (!loadMoreRef.current) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadMore()
        }
      },
      { threshold: 0.5 }
    )

    observer.observe(loadMoreRef.current)
    return () => observer.disconnect()
  }, [loadMore, hasMore, loadingMore])

  // Refresh feed
  const refresh = async () => {
    setLoading(true)
    try {
      const snapshot = await getPosts(sortBy, null, POSTS_PER_PAGE, languageFilter)
      const newPosts = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      setPosts(newPosts)
      setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null)
      setHasMore(newPosts.length === POSTS_PER_PAGE)

      if (user && newPosts.length > 0) {
        const votes = await getUserVotes(user.uid, newPosts.map((p) => p.id))
        setUserVotes(votes)
      }
    } catch (err) {
      console.error('Failed to refresh posts:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="post-feed">
        <div className="post-feed-loading">
          <div className="loading-skeleton post-skeleton" />
          <div className="loading-skeleton post-skeleton" />
          <div className="loading-skeleton post-skeleton" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="post-feed">
        <div className="post-feed-error">
          <p>{error}</p>
          <button className="btn btn-secondary" onClick={refresh}>
            Try Again
          </button>
        </div>
      </div>
    )
  }

  if (posts.length === 0) {
    return (
      <div className="post-feed">
        <div className="post-feed-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            <line x1="9" y1="9" x2="15" y2="9" />
            <line x1="9" y1="13" x2="13" y2="13" />
          </svg>
          <h3>No posts yet</h3>
          <p>Be the first to ask a question!</p>
        </div>
      </div>
    )
  }

  return (
    <div className="post-feed">
      {posts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          userVote={userVotes[post.id] || null}
          onClick={() => onPostClick?.(post)}
        />
      ))}

      {/* Load more trigger */}
      <div ref={loadMoreRef} className="load-more-trigger">
        {loadingMore && <div className="loading-spinner">Loading more...</div>}
        {!hasMore && posts.length > 0 && (
          <p className="end-of-feed">You've reached the end</p>
        )}
      </div>
    </div>
  )
}

export default PostFeed
