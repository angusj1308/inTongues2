import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { getPosts, getUserVotes } from '../../services/community'
import PostCard from './PostCard'

const POSTS_PER_PAGE = 20

// Placeholder posts for development/demo
const PLACEHOLDER_POSTS = [
  {
    id: 'placeholder-1',
    title: 'What\'s the difference between "ser" and "estar" in Spanish?',
    body: 'I keep getting confused about when to use ser vs estar. I know they both mean "to be" but the rules seem inconsistent. Can someone explain with examples? For instance, why do we say "soy alto" but "estoy cansado"?',
    authorName: 'SpanishNewbie',
    language: 'Spanish',
    score: 24,
    commentCount: 8,
    acceptedAnswerId: 'ans-1',
    createdAt: { toDate: () => new Date(Date.now() - 2 * 60 * 60 * 1000) },
  },
  {
    id: 'placeholder-2',
    title: 'Best resources for improving French listening comprehension?',
    body: 'I\'ve been studying French for 6 months and can read fairly well, but when native speakers talk at normal speed, I\'m completely lost. Any recommendations for podcasts, YouTube channels, or other resources that helped you?',
    authorName: 'FrancophileInProgress',
    language: 'French',
    score: 31,
    commentCount: 12,
    acceptedAnswerId: null,
    createdAt: { toDate: () => new Date(Date.now() - 5 * 60 * 60 * 1000) },
  },
  {
    id: 'placeholder-3',
    title: 'How to remember gendered nouns in Italian?',
    body: 'I struggle with remembering whether a noun is masculine or feminine in Italian. Are there any patterns or memory tricks that helped you? I keep making mistakes like "il problema" because it ends in -a.',
    authorName: 'ItalianLearner42',
    language: 'Italian',
    score: 18,
    commentCount: 6,
    acceptedAnswerId: 'ans-3',
    createdAt: { toDate: () => new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) },
  },
  {
    id: 'placeholder-4',
    title: 'Tips for maintaining motivation during the intermediate plateau?',
    body: 'I\'ve been learning Spanish for about 2 years and feel stuck. I\'m past the beginner stage but nowhere near fluent. The progress feels so slow now compared to the beginning. How do you stay motivated during this phase?',
    authorName: 'PolyglotDreamer',
    language: 'General',
    score: 45,
    commentCount: 21,
    acceptedAnswerId: null,
    createdAt: { toDate: () => new Date(Date.now() - 8 * 60 * 60 * 1000) },
  },
  {
    id: 'placeholder-5',
    title: 'Subjunctive mood in Spanish - when is it actually necessary?',
    body: 'I\'ve been avoiding the subjunctive because it seems so complex. My Spanish friends say they understand me fine without it. Is it really that important to learn, or can I communicate effectively without mastering it?',
    authorName: 'GrammarPhobe',
    language: 'Spanish',
    score: 15,
    commentCount: 9,
    acceptedAnswerId: 'ans-5',
    createdAt: { toDate: () => new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
  },
  {
    id: 'placeholder-6',
    title: 'How do you practice speaking without a language partner?',
    body: 'I live in a small town with no native speakers of my target language (French). I can\'t afford regular tutoring sessions. What are some effective ways to practice speaking on my own? I\'ve tried talking to myself but it feels weird.',
    authorName: 'SoloLanguageLearner',
    language: 'French',
    score: 28,
    commentCount: 14,
    acceptedAnswerId: null,
    createdAt: { toDate: () => new Date(Date.now() - 12 * 60 * 60 * 1000) },
  },
]

export function PostFeed({ sortBy = 'hot', languageFilter = 'All', onPostClick }) {
  const { user } = useAuth()
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [lastDoc, setLastDoc] = useState(null)
  const [hasMore, setHasMore] = useState(true)
  const [userVotes, setUserVotes] = useState({})
  const [error, setError] = useState('')
  const [usePlaceholders, setUsePlaceholders] = useState(false)
  const loadMoreRef = useRef(null)

  // Initial load and reload on filter change
  useEffect(() => {
    const loadPosts = async () => {
      setLoading(true)
      setError('')
      setUsePlaceholders(false)
      try {
        const snapshot = await getPosts(sortBy, null, POSTS_PER_PAGE, languageFilter)
        const newPosts = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))

        // If no posts, show placeholders
        if (newPosts.length === 0) {
          setUsePlaceholders(true)
          // Filter placeholders by language if needed
          const filtered = languageFilter === 'All'
            ? PLACEHOLDER_POSTS
            : PLACEHOLDER_POSTS.filter(p => p.language === languageFilter || p.language === 'General')
          setPosts(filtered)
          setHasMore(false)
        } else {
          setPosts(newPosts)
          setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null)
          setHasMore(newPosts.length === POSTS_PER_PAGE)

          if (user && newPosts.length > 0) {
            const votes = await getUserVotes(user.uid, newPosts.map((p) => p.id))
            setUserVotes(votes)
          }
        }
      } catch (err) {
        console.error('Failed to load posts:', err)
        // Show placeholders on error too
        setUsePlaceholders(true)
        const filtered = languageFilter === 'All'
          ? PLACEHOLDER_POSTS
          : PLACEHOLDER_POSTS.filter(p => p.language === languageFilter || p.language === 'General')
        setPosts(filtered)
        setHasMore(false)
      } finally {
        setLoading(false)
      }
    }

    loadPosts()
  }, [sortBy, languageFilter, user])

  // Load more posts
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !lastDoc || usePlaceholders) return

    setLoadingMore(true)
    try {
      const snapshot = await getPosts(sortBy, lastDoc, POSTS_PER_PAGE, languageFilter)
      const newPosts = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))

      setPosts((prev) => [...prev, ...newPosts])
      setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null)
      setHasMore(newPosts.length === POSTS_PER_PAGE)

      if (user && newPosts.length > 0) {
        const votes = await getUserVotes(user.uid, newPosts.map((p) => p.id))
        setUserVotes((prev) => ({ ...prev, ...votes }))
      }
    } catch (err) {
      console.error('Failed to load more posts:', err)
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, hasMore, lastDoc, sortBy, languageFilter, user, usePlaceholders])

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

  if (loading) {
    return (
      <div className="community-feed">
        <div className="community-feed-loading">
          {[1, 2, 3].map((i) => (
            <div key={i} className="community-card-skeleton">
              <div className="skeleton-vote" />
              <div className="skeleton-content">
                <div className="skeleton-title" />
                <div className="skeleton-body" />
                <div className="skeleton-meta" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error && !usePlaceholders) {
    return (
      <div className="community-feed">
        <div className="community-feed-error">
          <p>{error}</p>
          <button className="button ghost" onClick={() => window.location.reload()}>
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="community-feed">
      {usePlaceholders && (
        <div className="community-placeholder-notice">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span>Showing example posts. Be the first to ask a real question!</span>
        </div>
      )}

      <div className="community-posts-grid">
        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            userVote={userVotes[post.id] || null}
            onClick={() => !usePlaceholders && onPostClick?.(post)}
            isPlaceholder={usePlaceholders}
          />
        ))}
      </div>

      {!usePlaceholders && (
        <div ref={loadMoreRef} className="community-load-more">
          {loadingMore && (
            <div className="community-loading-more">
              <div className="loading-dots">
                <span /><span /><span />
              </div>
            </div>
          )}
          {!hasMore && posts.length > 0 && (
            <p className="community-end-message">You've seen all posts</p>
          )}
        </div>
      )}
    </div>
  )
}

export default PostFeed
