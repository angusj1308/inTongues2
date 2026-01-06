import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  increment,
  onSnapshot,
  setDoc,
} from 'firebase/firestore'
import { db } from '../firebase'

// ============ HOT SCORE ALGORITHM ============
// Reddit-style ranking: balances recency with popularity
const calculateHotScore = (upvotes, downvotes, createdAt) => {
  const score = upvotes - downvotes
  const order = Math.log10(Math.max(Math.abs(score), 1))
  const sign = score > 0 ? 1 : score < 0 ? -1 : 0
  const seconds = createdAt instanceof Date
    ? createdAt.getTime() / 1000
    : createdAt?.toDate?.().getTime() / 1000 || Date.now() / 1000
  const epochStart = 1704067200 // Jan 1, 2024
  return sign * order + (seconds - epochStart) / 45000
}

// ============ POSTS ============

export const createPost = async (userId, userProfile, postData) => {
  const now = new Date()
  const hotScore = calculateHotScore(0, 0, now)

  const post = {
    authorId: userId,
    authorName: userProfile?.displayName || userProfile?.email?.split('@')[0] || 'Anonymous',
    authorPhotoURL: userProfile?.photoURL || null,
    title: postData.title.trim(),
    body: postData.body.trim(),
    language: postData.language || 'General',
    upvotes: 0,
    downvotes: 0,
    score: 0,
    commentCount: 0,
    acceptedAnswerId: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    status: 'active',
    hotScore,
  }

  const docRef = await addDoc(collection(db, 'posts'), post)
  return { id: docRef.id, ...post, createdAt: now, updatedAt: now }
}

export const getPost = async (postId) => {
  const docRef = doc(db, 'posts', postId)
  const docSnap = await getDoc(docRef)
  if (!docSnap.exists()) return null
  return { id: docSnap.id, ...docSnap.data() }
}

export const getPosts = async (sortBy = 'hot', lastDoc = null, pageSize = 20, languageFilter = null) => {
  let q
  const postsRef = collection(db, 'posts')
  const constraints = [where('status', '==', 'active')]

  if (languageFilter && languageFilter !== 'All') {
    constraints.push(where('language', '==', languageFilter))
  }

  switch (sortBy) {
    case 'new':
      q = query(postsRef, ...constraints, orderBy('createdAt', 'desc'), limit(pageSize))
      break
    case 'top':
      q = query(postsRef, ...constraints, orderBy('score', 'desc'), limit(pageSize))
      break
    case 'hot':
    default:
      q = query(postsRef, ...constraints, orderBy('hotScore', 'desc'), limit(pageSize))
      break
  }

  if (lastDoc) {
    q = query(postsRef, ...constraints,
      orderBy(sortBy === 'new' ? 'createdAt' : sortBy === 'top' ? 'score' : 'hotScore', 'desc'),
      startAfter(lastDoc),
      limit(pageSize)
    )
  }

  const snapshot = await getDocs(q)
  return snapshot
}

export const subscribeToPost = (postId, callback) => {
  return onSnapshot(doc(db, 'posts', postId), (docSnap) => {
    if (docSnap.exists()) {
      callback({ id: docSnap.id, ...docSnap.data() })
    }
  })
}

export const updatePost = async (postId, updates) => {
  const docRef = doc(db, 'posts', postId)
  await updateDoc(docRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  })
}

export const deletePost = async (postId) => {
  // Soft delete
  const docRef = doc(db, 'posts', postId)
  await updateDoc(docRef, {
    status: 'deleted',
    updatedAt: serverTimestamp(),
  })
}

// ============ COMMENTS ============

export const createComment = async (postId, userId, userProfile, body) => {
  const comment = {
    postId,
    authorId: userId,
    authorName: userProfile?.displayName || userProfile?.email?.split('@')[0] || 'Anonymous',
    authorPhotoURL: userProfile?.photoURL || null,
    body: body.trim(),
    upvotes: 0,
    downvotes: 0,
    score: 0,
    isAccepted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    status: 'active',
  }

  const docRef = await addDoc(collection(db, 'posts', postId, 'comments'), comment)

  // Increment comment count on post
  await updateDoc(doc(db, 'posts', postId), {
    commentCount: increment(1),
  })

  return { id: docRef.id, ...comment }
}

export const getComments = async (postId) => {
  const q = query(
    collection(db, 'posts', postId, 'comments'),
    where('status', '==', 'active'),
    orderBy('score', 'desc')
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
}

export const subscribeToComments = (postId, callback) => {
  const q = query(
    collection(db, 'posts', postId, 'comments'),
    where('status', '==', 'active'),
    orderBy('isAccepted', 'desc'),
    orderBy('score', 'desc')
  )
  return onSnapshot(q, (snapshot) => {
    const comments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    callback(comments)
  }, (error) => {
    // Fallback if index doesn't exist yet
    console.warn('Comment subscription error, using fallback:', error)
    const fallbackQ = query(
      collection(db, 'posts', postId, 'comments'),
      where('status', '==', 'active')
    )
    return onSnapshot(fallbackQ, (snapshot) => {
      const comments = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => {
          if (a.isAccepted && !b.isAccepted) return -1
          if (!a.isAccepted && b.isAccepted) return 1
          return (b.score || 0) - (a.score || 0)
        })
      callback(comments)
    })
  })
}

export const acceptAnswer = async (postId, commentId, userId, postAuthorId) => {
  // Only post author can accept
  if (userId !== postAuthorId) {
    throw new Error('Only the post author can accept an answer')
  }

  // First, unaccept any previously accepted answer
  const commentsRef = collection(db, 'posts', postId, 'comments')
  const acceptedQuery = query(commentsRef, where('isAccepted', '==', true))
  const acceptedSnap = await getDocs(acceptedQuery)

  for (const docSnap of acceptedSnap.docs) {
    await updateDoc(doc(db, 'posts', postId, 'comments', docSnap.id), {
      isAccepted: false,
    })
  }

  // Accept the new answer
  await updateDoc(doc(db, 'posts', postId, 'comments', commentId), {
    isAccepted: true,
  })

  // Update post with accepted answer ID
  await updateDoc(doc(db, 'posts', postId), {
    acceptedAnswerId: commentId,
  })
}

// ============ VOTES ============

export const getVote = async (userId, targetId) => {
  const voteId = `${userId}_${targetId}`
  const docRef = doc(db, 'votes', voteId)
  const docSnap = await getDoc(docRef)
  if (!docSnap.exists()) return null
  return docSnap.data()
}

export const getUserVotes = async (userId, targetIds) => {
  const votes = {}
  // Batch fetch votes for multiple targets
  for (const targetId of targetIds) {
    const vote = await getVote(userId, targetId)
    if (vote) {
      votes[targetId] = vote.value
    }
  }
  return votes
}

export const submitVote = async (userId, targetId, targetType, value, targetPath = null) => {
  const voteId = `${userId}_${targetId}`
  const voteRef = doc(db, 'votes', voteId)

  // Get existing vote
  const existingVote = await getVote(userId, targetId)
  const previousValue = existingVote?.value || 0

  // Calculate the delta
  const delta = value - previousValue

  if (delta === 0) return // No change

  // Update or create vote
  await setDoc(voteRef, {
    userId,
    targetId,
    targetType,
    value,
    createdAt: existingVote ? existingVote.createdAt : serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  // Update target's vote counts
  let targetRef
  if (targetType === 'post') {
    targetRef = doc(db, 'posts', targetId)
  } else if (targetType === 'comment' && targetPath) {
    // targetPath should be the postId for comments
    targetRef = doc(db, 'posts', targetPath, 'comments', targetId)
  }

  if (targetRef) {
    const updates = { score: increment(delta) }

    // Track upvotes/downvotes separately
    if (value === 1 && previousValue !== 1) {
      updates.upvotes = increment(1)
      if (previousValue === -1) {
        updates.downvotes = increment(-1)
      }
    } else if (value === -1 && previousValue !== -1) {
      updates.downvotes = increment(1)
      if (previousValue === 1) {
        updates.upvotes = increment(-1)
      }
    } else if (value === 0) {
      if (previousValue === 1) {
        updates.upvotes = increment(-1)
      } else if (previousValue === -1) {
        updates.downvotes = increment(-1)
      }
    }

    await updateDoc(targetRef, updates)

    // Recalculate hot score for posts
    if (targetType === 'post') {
      const postSnap = await getDoc(targetRef)
      if (postSnap.exists()) {
        const postData = postSnap.data()
        const newHotScore = calculateHotScore(
          postData.upvotes || 0,
          postData.downvotes || 0,
          postData.createdAt
        )
        await updateDoc(targetRef, { hotScore: newHotScore })
      }
    }
  }
}

export const removeVote = async (userId, targetId, targetType, targetPath = null) => {
  await submitVote(userId, targetId, targetType, 0, targetPath)
}

// ============ REPORTS ============

export const reportContent = async (userId, targetId, targetType, reason, details = '') => {
  const report = {
    reporterId: userId,
    targetId,
    targetType,
    reason,
    details: details.trim(),
    status: 'pending',
    createdAt: serverTimestamp(),
    reviewedBy: null,
  }

  await addDoc(collection(db, 'reports'), report)
}
