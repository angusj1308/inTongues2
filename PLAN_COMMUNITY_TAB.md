# Community Tab Technical Implementation Plan

## Executive Summary

This plan outlines the implementation of a Community tab for the inTongues language learning app. The MVP is a single shared feed ("inTongues community") functioning like a Reddit-style Q&A forum where users can post questions and receive answers from the community.

---

## 1. Component Architecture

### 1.1 New Files Structure

```
src/
├── components/
│   └── community/
│       ├── CommunityHub.jsx          # Main container (like SpeakHub, WritingHub)
│       ├── PostFeed.jsx              # Feed display with infinite scroll
│       ├── PostCard.jsx              # Individual post preview in feed
│       ├── PostDetail.jsx            # Full post view with comments
│       ├── CreatePostModal.jsx       # Modal for creating new posts
│       ├── CommentSection.jsx        # Comments/answers list
│       ├── CommentInput.jsx          # Reply input component
│       ├── VoteButtons.jsx           # Upvote/downvote controls
│       ├── SortControls.jsx          # New/Top/Hot sorting selector
│       ├── UserBadge.jsx             # Author display (avatar, name, level)
│       └── PostFilters.jsx           # Language filter (optional)
├── services/
│   └── community.js                  # Firestore operations for community
├── pages/
│   └── Community.jsx                 # Route page wrapper
```

### 1.2 Component Hierarchy

```
Community.jsx (page)
└── CommunityHub.jsx
    ├── CreatePostButton
    ├── SortControls (new | top | hot)
    ├── PostFilters (language dropdown - optional)
    └── PostFeed
        └── PostCard (multiple)
            ├── UserBadge
            ├── Post preview (title, excerpt)
            ├── VoteButtons
            └── Comment count / Reply CTA

CreatePostModal (portal)
├── Title input
├── Body textarea
├── Language selector
└── Submit button

PostDetail (expanded view / modal)
├── UserBadge
├── Full post content
├── VoteButtons
├── CommentSection
│   └── CommentCard (multiple)
│       ├── UserBadge
│       ├── Comment content
│       ├── VoteButtons
│       └── "Accept answer" button (if post author)
└── CommentInput
```

### 1.3 Integration with Existing Architecture

**DashboardLayout.jsx** - Add 'community' to DASHBOARD_TABS:
```javascript
const DASHBOARD_TABS = ['home', 'read', 'listen', 'speak', 'write', 'review', 'tutor', 'community'];
```

**App.jsx** - Add route:
```javascript
<Route path="/community" element={<ProtectedRoute><Community /></ProtectedRoute>} />
```

---

## 2. Database Schema (Firestore)

### 2.1 Collections Structure

```
// Global collections (not user-scoped for shared feed)

posts/{postId}
├── id: string (auto-generated)
├── authorId: string (userId)
├── authorName: string (display name)
├── authorPhotoURL: string | null
├── title: string (max 200 chars)
├── body: string (max 5000 chars)
├── language: string ('Spanish' | 'French' | 'Italian' | 'English' | 'General')
├── upvotes: number
├── downvotes: number
├── score: number (upvotes - downvotes, for sorting)
├── commentCount: number
├── acceptedAnswerId: string | null
├── createdAt: timestamp
├── updatedAt: timestamp
├── status: string ('active' | 'deleted' | 'flagged')
└── hotScore: number (calculated field for hot sorting)

posts/{postId}/comments/{commentId}
├── id: string (auto-generated)
├── postId: string (parent reference)
├── authorId: string (userId)
├── authorName: string
├── authorPhotoURL: string | null
├── body: string (max 2000 chars)
├── upvotes: number
├── downvotes: number
├── score: number
├── isAccepted: boolean
├── createdAt: timestamp
├── updatedAt: timestamp
└── status: string ('active' | 'deleted' | 'flagged')

votes/{uniqueVoteId}  // Format: {userId}_{postId} or {userId}_{commentId}
├── id: string
├── userId: string
├── targetId: string (postId or commentId)
├── targetType: string ('post' | 'comment')
├── value: number (1 for upvote, -1 for downvote)
└── createdAt: timestamp

// Extend existing users collection
users/{userId}
├── ... (existing fields)
├── communityStats: {
│   ├── postsCount: number
│   ├── commentsCount: number
│   ├── karma: number (total upvotes received)
│   └── acceptedAnswers: number
│   }
└── communityBans: [] // For moderation
```

### 2.2 Indexes Required

```javascript
// firestore.indexes.json additions
{
  "indexes": [
    // Hot posts (default feed)
    {
      "collectionGroup": "posts",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "hotScore", "order": "DESCENDING" }
      ]
    },
    // New posts
    {
      "collectionGroup": "posts",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    // Top posts
    {
      "collectionGroup": "posts",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "score", "order": "DESCENDING" }
      ]
    },
    // Filter by language + hot
    {
      "collectionGroup": "posts",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "language", "order": "ASCENDING" },
        { "fieldPath": "hotScore", "order": "DESCENDING" }
      ]
    },
    // Comments sorted by score
    {
      "collectionGroup": "comments",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "score", "order": "DESCENDING" }
      ]
    }
  ]
}
```

### 2.3 Security Rules

```javascript
// firestore.rules additions
match /posts/{postId} {
  // Anyone authenticated can read active posts
  allow read: if request.auth != null && resource.data.status == 'active';

  // Authenticated users can create posts
  allow create: if request.auth != null
    && request.resource.data.authorId == request.auth.uid
    && request.resource.data.status == 'active';

  // Only author can update (title/body), or increment counters
  allow update: if request.auth != null
    && (request.auth.uid == resource.data.authorId
        || onlyCounterUpdates(request.resource.data, resource.data));

  // Soft delete only by author
  allow delete: if false; // Use status field instead

  match /comments/{commentId} {
    allow read: if request.auth != null;
    allow create: if request.auth != null
      && request.resource.data.authorId == request.auth.uid;
    allow update: if request.auth != null
      && request.auth.uid == resource.data.authorId;
  }
}

match /votes/{voteId} {
  allow read, write: if request.auth != null
    && voteId.matches(request.auth.uid + '_.*');
}
```

---

## 3. Feed Algorithms

### 3.1 Sorting Implementations

**New** - Simple chronological:
```javascript
const getNewPosts = (lastDoc, limit = 20) => {
  let q = query(
    collection(db, 'posts'),
    where('status', '==', 'active'),
    orderBy('createdAt', 'desc'),
    limit(limit)
  );
  if (lastDoc) q = query(q, startAfter(lastDoc));
  return getDocs(q);
};
```

**Top** - Highest score (can be time-bounded):
```javascript
const getTopPosts = (lastDoc, limit = 20, timeRange = null) => {
  let q = query(
    collection(db, 'posts'),
    where('status', '==', 'active'),
    orderBy('score', 'desc'),
    limit(limit)
  );
  // Optional: add where('createdAt', '>=', timeRangeStart) for "top this week"
  if (lastDoc) q = query(q, startAfter(lastDoc));
  return getDocs(q);
};
```

**Hot** - Reddit-style algorithm (recency + score):
```javascript
// Hot score calculation (run on write via Cloud Function or client)
const calculateHotScore = (upvotes, downvotes, createdAt) => {
  const score = upvotes - downvotes;
  const order = Math.log10(Math.max(Math.abs(score), 1));
  const sign = score > 0 ? 1 : score < 0 ? -1 : 0;
  const seconds = createdAt.toDate().getTime() / 1000;
  const epochStart = 1704067200; // Jan 1, 2024
  return sign * order + (seconds - epochStart) / 45000;
};

const getHotPosts = (lastDoc, limit = 20) => {
  let q = query(
    collection(db, 'posts'),
    where('status', '==', 'active'),
    orderBy('hotScore', 'desc'),
    limit(limit)
  );
  if (lastDoc) q = query(q, startAfter(lastDoc));
  return getDocs(q);
};
```

### 3.2 Pagination Strategy

**Cursor-based pagination** using Firestore's `startAfter()`:

```javascript
// In PostFeed.jsx
const [posts, setPosts] = useState([]);
const [lastDoc, setLastDoc] = useState(null);
const [hasMore, setHasMore] = useState(true);
const [loading, setLoading] = useState(false);

const loadMore = async () => {
  if (loading || !hasMore) return;
  setLoading(true);

  const snapshot = await getPosts(sortBy, lastDoc, POSTS_PER_PAGE);
  const newPosts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  setPosts(prev => [...prev, ...newPosts]);
  setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
  setHasMore(newPosts.length === POSTS_PER_PAGE);
  setLoading(false);
};

// Infinite scroll trigger
useEffect(() => {
  const observer = new IntersectionObserver(
    entries => { if (entries[0].isIntersecting) loadMore(); },
    { threshold: 0.5 }
  );
  if (loadMoreRef.current) observer.observe(loadMoreRef.current);
  return () => observer.disconnect();
}, [lastDoc, hasMore]);
```

---

## 4. Real-time vs Refresh Strategy

### 4.1 Recommended Approach: Hybrid

| Component | Strategy | Rationale |
|-----------|----------|-----------|
| Feed list | Refresh-based | Real-time updates on feeds cause jarring UX (posts jumping around) |
| Post detail | Real-time | Users expect to see new comments appear |
| Vote counts | Real-time | Immediate feedback is satisfying |
| Own posts | Real-time | Users want to see engagement on their content |

### 4.2 Implementation

**Feed (refresh-based):**
```javascript
// PostFeed.jsx
const [posts, setPosts] = useState([]);

const refreshFeed = async () => {
  setRefreshing(true);
  const snapshot = await getPosts(sortBy, null, POSTS_PER_PAGE);
  setPosts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
  setRefreshing(false);
};

// Pull-to-refresh or "New posts available" banner
```

**Post Detail (real-time comments):**
```javascript
// PostDetail.jsx
useEffect(() => {
  const unsubscribe = onSnapshot(
    query(
      collection(db, 'posts', postId, 'comments'),
      where('status', '==', 'active'),
      orderBy('score', 'desc')
    ),
    (snapshot) => {
      setComments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }
  );
  return () => unsubscribe();
}, [postId]);
```

**Vote counts (optimistic + real-time):**
```javascript
// VoteButtons.jsx
const handleVote = async (value) => {
  // Optimistic update
  setLocalScore(prev => prev + value - currentVote);
  setCurrentVote(value);

  // Persist to Firestore
  await submitVote(targetId, targetType, value);
};

// Real-time sync for accuracy
useEffect(() => {
  const unsubscribe = onSnapshot(doc(db, 'posts', postId), (doc) => {
    if (doc.exists()) {
      setLocalScore(doc.data().score);
    }
  });
  return () => unsubscribe();
}, [postId]);
```

---

## 5. Content Moderation Strategy

### 5.1 MVP Approach (Phase 1)

**Automated:**
- Character limits enforced client-side and in security rules
- Rate limiting: Max 5 posts per hour, 20 comments per hour (Cloud Function)
- Basic profanity filter using word list (server-side on create)

**Manual:**
- "Report" button on posts/comments
- Reports collected in `reports` collection
- Admin review via simple admin panel (future) or direct Firestore access

### 5.2 Report System

```javascript
// Schema
reports/{reportId}
├── reporterId: string
├── targetId: string (post or comment ID)
├── targetType: 'post' | 'comment'
├── reason: 'spam' | 'harassment' | 'inappropriate' | 'other'
├── details: string (optional)
├── status: 'pending' | 'reviewed' | 'actioned'
├── createdAt: timestamp
└── reviewedBy: string | null

// Service function
const reportContent = async (targetId, targetType, reason, details = '') => {
  const user = auth.currentUser;
  await addDoc(collection(db, 'reports'), {
    reporterId: user.uid,
    targetId,
    targetType,
    reason,
    details,
    status: 'pending',
    createdAt: serverTimestamp(),
    reviewedBy: null
  });
};
```

### 5.3 Future Enhancements (Phase 2+)

- AI-powered content moderation (OpenAI moderation API)
- Community moderators with elevated permissions
- Karma-based posting privileges
- Shadow banning for persistent offenders
- Appeals system

---

## 6. UI/UX Flow

### 6.1 User Journeys

**Browsing the feed:**
```
1. User navigates to Community tab
2. Default view: "Hot" posts across all languages
3. User can switch sort (New | Top | Hot)
4. User can filter by target language (optional)
5. Scroll to load more (infinite scroll)
6. Click post card → expand to PostDetail view
```

**Creating a post:**
```
1. Click "Ask Question" FAB or button
2. Modal opens with form:
   - Title (required, 10-200 chars)
   - Body (required, 20-5000 chars)
   - Language tag (required, dropdown)
3. Submit → Post appears in feed
4. User redirected to their new post
```

**Engaging with posts:**
```
1. View post detail
2. Read question and existing answers
3. Upvote/downvote helpful content
4. Write own answer in CommentInput
5. Submit → Comment appears in list
```

**Marking accepted answer (post author only):**
```
1. Post author views their question
2. Clicks "Accept" on best answer
3. Answer marked with checkmark
4. Answer pinned to top of comments
5. Answerer receives karma boost
```

### 6.2 Wireframes (ASCII)

**Feed View:**
```
┌─────────────────────────────────────┐
│  inTongues Community                │
├─────────────────────────────────────┤
│  [Hot] [New] [Top]    [🌐 All ▼]   │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ ▲ 24  How do you use subjunc... │ │
│ │ ▼     @maria · Spanish · 2h     │ │
│ │       💬 8 answers              │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ ▲ 12  Best podcasts for inter...│ │
│ │ ▼     @jean · French · 5h       │ │
│ │       💬 15 answers ✓           │ │
│ └─────────────────────────────────┘ │
│           ...more posts...          │
│                                     │
│              [Load More]            │
├─────────────────────────────────────┤
│           [+ Ask Question]          │
└─────────────────────────────────────┘
```

**Post Detail View:**
```
┌─────────────────────────────────────┐
│  ← Back                             │
├─────────────────────────────────────┤
│  How do you use the subjunctive     │
│  in everyday Spanish?               │
│                                     │
│  @maria · Spanish · 2 hours ago     │
├─────────────────────────────────────┤
│  I've been studying for 6 months    │
│  and I still struggle with when     │
│  to use subjunctive vs indicative   │
│  in casual conversation...          │
│                                     │
│  ▲ 24 ▼         [🚩 Report]        │
├─────────────────────────────────────┤
│  8 Answers                          │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ ✓ ACCEPTED                      │ │
│ │ @carlos · 1h ago                │ │
│ │ The key is to think about       │ │
│ │ certainty vs uncertainty...     │ │
│ │ ▲ 18 ▼                          │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ @lucia · 45m ago                │ │
│ │ I recommend watching telenovelas│ │
│ │ ▲ 7 ▼     [Accept]              │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│  [Write your answer...]        [→]  │
└─────────────────────────────────────┘
```

### 6.3 Style Guidelines

Following existing app patterns:
- Use `--dashboard-surface` for cards
- `--accent-color` for interactive elements
- Consistent spacing with existing components
- Same font stack (Inter for UI, Atkinson Hyperlegible for readability)
- Icons as inline SVGs (no icon library)

---

## 7. Build Sequence Recommendation

### Phase 1: Foundation (Core CRUD)
**Estimated complexity: Medium**

1. **Database setup**
   - Create Firestore collections structure
   - Add security rules
   - Create required indexes

2. **Service layer** (`src/services/community.js`)
   - CRUD operations for posts
   - CRUD operations for comments
   - Vote management

3. **Basic components**
   - `CommunityHub.jsx` - container
   - `PostFeed.jsx` - list display
   - `PostCard.jsx` - post preview
   - `CreatePostModal.jsx` - post creation

4. **Routing integration**
   - Add to `DASHBOARD_TABS`
   - Add route in `App.jsx`
   - Add nav icon

### Phase 2: Interaction (Voting & Comments)
**Estimated complexity: Medium**

5. **Post detail view**
   - `PostDetail.jsx`
   - `CommentSection.jsx`
   - `CommentInput.jsx`

6. **Voting system**
   - `VoteButtons.jsx`
   - Vote persistence
   - Score calculations
   - Optimistic updates

7. **Hot score algorithm**
   - Client-side calculation on post create
   - Cloud Function to recalculate periodically (optional)

### Phase 3: Polish (Sorting, UX)
**Estimated complexity: Low-Medium**

8. **Sorting & filtering**
   - `SortControls.jsx`
   - `PostFilters.jsx` (language filter)
   - Index optimization

9. **Pagination**
   - Infinite scroll implementation
   - Load more states
   - Empty states

10. **Real-time updates**
    - Comment subscriptions
    - Vote count sync
    - "New posts available" indicator

### Phase 4: Moderation & Polish
**Estimated complexity: Low**

11. **Moderation basics**
    - Report button/modal
    - Reports collection
    - Rate limiting (Cloud Function)

12. **Accepted answers**
    - Accept button for post authors
    - Visual treatment
    - Sort accepted to top

13. **User profiles enhancement**
    - Community stats
    - Karma tracking
    - `UserBadge.jsx` component

14. **Final polish**
    - Loading skeletons
    - Error handling
    - Empty states
    - Responsive design

---

## 8. Answers to Open Questions

### Q1: Moderation approach?
**Recommendation:** Start with community reporting + manual review.

- Implement report buttons on all content
- Use basic profanity filter on create (server-side)
- Rate limit posting to prevent spam
- Manual review via Firestore console initially
- Add admin panel in Phase 2 if needed

### Q2: Character/word limits on posts?
**Recommendation:**
- Post title: 10-200 characters
- Post body: 20-5,000 characters
- Comments: 10-2,000 characters

These limits balance expressiveness with readability. Enforce client-side + security rules.

### Q3: Can users post in any language or target language only?
**Recommendation:** Allow any supported language + "General" category.

- Users can post in any of the 4 supported languages (English, Spanish, French, Italian)
- Add "General" category for meta-discussions, tips, app feedback
- Language tag is required on all posts
- Users can filter feed by language

### Q4: Notifications for replies?
**Recommendation:** Defer to Phase 2.

MVP should focus on core functionality. Notifications require:
- Push notification infrastructure
- User notification preferences
- Notification center UI

For MVP, users can check their posts manually.

### Q5: Mark answer as "accepted" like Stack Overflow?
**Recommendation:** Yes, include in MVP (Phase 2).

Benefits:
- Helps future users find best answers
- Gamifies helpful participation
- Increases answer quality
- Simple to implement (boolean flag + UI treatment)

---

## 9. API Endpoints (if needed)

Most operations can use Firestore directly, but consider Express endpoints for:

```javascript
// server.js additions

// Rate-limited post creation with profanity check
POST /api/community/posts
Body: { title, body, language }
Response: { postId, success }

// Bulk hot score recalculation (cron job)
POST /api/community/recalculate-hot-scores
(Admin only, triggered by Cloud Scheduler)

// Content moderation check
POST /api/community/moderate
Body: { content }
Response: { allowed: boolean, reason?: string }
```

---

## 10. Dependencies

**No new npm packages required.** The existing stack supports all features:
- React for UI
- Firebase/Firestore for database
- Existing auth system
- CSS for styling

**Optional future additions:**
- `bad-words` - profanity filter library
- Firebase Cloud Functions enhancements for rate limiting
- Push notification service (Firebase Cloud Messaging)

---

## 11. Success Metrics

Track post-launch:
- Daily/weekly active community users
- Posts created per day
- Comments per post average
- Upvote engagement rate
- Report frequency
- User retention (do community users stick around longer?)

---

## Summary

This plan provides a complete roadmap for implementing a Reddit-style community feature within the existing inTongues architecture. The phased approach allows for iterative delivery, starting with core posting functionality and building up to a full-featured community platform.

Key design decisions:
- Global collections for shared feed (not user-scoped)
- Hybrid real-time strategy (comments live, feed on refresh)
- Simple voting with hot/top/new algorithms
- Community reporting for moderation
- Cursor-based pagination with infinite scroll
- Language tagging with optional filtering
