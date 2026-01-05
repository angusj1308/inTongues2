# Tutor Chat Mode - Implementation Plan

## Overview

A conversational practice mode where users engage in natural dialogue with an AI tutor. Unlike structured writing exercises (sentence translation, free writing), this mode focuses on casual, flowing conversation practice with optional correction feedback.

---

## Core Concept

**What it is:** Real-time chat conversation with an AI language tutor
**How it differs from existing modes:**
- **Practice Lesson**: Translate specific sentences → structured, one-way
- **Free Writing**: Write about a topic line-by-line → user-driven content
- **Tutor Chat (NEW)**: Back-and-forth dialogue → conversational, interactive

---

## Feature Specification

### User Flow
1. User starts a new chat session (selects topic/scenario or free conversation)
2. AI tutor sends opening message in target language
3. User responds in target language
4. AI responds naturally AND optionally provides corrections
5. Conversation continues naturally
6. User can toggle correction mode on/off
7. Words are tracked for vocabulary system

### Key Features
- **Conversation Topics/Scenarios**: Optional prompts (e.g., "At a restaurant", "Meeting someone new", "Discussing hobbies")
- **Difficulty Levels**: Beginner (simple vocab, slow pace), Intermediate (complex topics), Advanced (native-like)
- **Correction Toggle**: User can choose inline corrections or pure conversation
- **Vocabulary Tracking**: New words encountered get added to vocab system
- **Session History**: Chat sessions saved for review
- **Context Awareness**: AI remembers full conversation context

---

## Technical Architecture

### 1. Database Schema (Firestore)

```
users/{userId}/tutorChats/{chatId}
├── title: string (auto-generated or user-defined)
├── topic: string | null (optional conversation topic)
├── scenario: string | null (optional scenario prompt)
├── targetLanguage: string
├── sourceLanguage: string
├── difficulty: 'beginner' | 'intermediate' | 'advanced'
├── correctionMode: 'always' | 'on-request' | 'off'
├── messages: [
│   {
│     id: string (uuid)
│     role: 'user' | 'assistant' | 'system'
│     content: string
│     timestamp: serverTimestamp
│     correction: {
│       hasErrors: boolean
│       overallFeedback: string
│       corrections: [
│         {
│           original: string
│           correction: string
│           explanation: string
│           category: 'spelling' | 'grammar' | 'vocabulary' | 'naturalness'
│           startIndex: number
│           endIndex: number
│         }
│       ]
│     } | null
│     vocabWords: string[] (words to potentially track)
│   }
│ ]
├── messageCount: number
├── status: 'active' | 'archived'
├── createdAt: timestamp
├── updatedAt: timestamp
└── lastMessageAt: timestamp
```

### 2. Backend API Endpoints

**File:** `server.js` (add new routes)

```javascript
// Start new chat session
POST /api/tutor-chat/start
Request: {
  targetLanguage: string
  sourceLanguage: string
  difficulty: string
  topic?: string
  scenario?: string
  correctionMode: string
}
Response: {
  sessionId: string
  openingMessage: string
}

// Send message and get response
POST /api/tutor-chat/message
Request: {
  sessionId: string
  message: string
  includeCorrection: boolean
  conversationHistory: Message[] (last N messages for context)
}
Response: {
  response: string
  correction?: {
    hasErrors: boolean
    overallFeedback: string
    corrections: Correction[]
  }
  suggestedVocab?: string[]
}

// Request correction for specific message (on-demand)
POST /api/tutor-chat/correct
Request: {
  message: string
  targetLanguage: string
  sourceLanguage: string
  conversationContext: string[]
}
Response: {
  correction: CorrectionObject
}
```

### 3. Frontend Service Layer

**File:** `src/services/tutorChat.js`

```javascript
// CRUD Operations
createTutorChat(userId, config) → chatId
getTutorChat(userId, chatId) → chat
getUserTutorChats(userId) → chat[]
updateTutorChat(userId, chatId, updates)
archiveTutorChat(userId, chatId)
deleteTutorChat(userId, chatId)

// Message Operations
addMessage(userId, chatId, message)
getMessages(userId, chatId, limit?) → messages[]

// Real-time
subscribeToChat(userId, chatId, callback) → unsubscribe
subscribeToUserChats(userId, callback) → unsubscribe
```

### 4. Frontend Components

**New Files:**
```
src/
├── pages/
│   └── TutorChat.jsx              # Main chat page
├── components/
│   └── write/
│       ├── TutorChatCard.jsx      # Chat session card for hub
│       └── NewTutorChatModal.jsx  # Create new chat modal
```

**TutorChat.jsx Structure:**
```jsx
- Header (chat title, settings toggle)
- Message Container (scrollable)
  - TutorMessage (AI messages)
  - UserMessage (user messages with optional corrections)
  - CorrectionPanel (expandable correction details)
- Input Area
  - Text input
  - Send button
  - Correction toggle
  - Voice input (future)
```

### 5. AI Prompts

**System Prompt (Conversation):**
```
You are a friendly language tutor having a natural conversation in {targetLanguage}.
Difficulty level: {difficulty}
Topic: {topic}

Guidelines:
- Respond naturally as a conversation partner
- Match complexity to difficulty level
- Ask follow-up questions to keep conversation flowing
- Be encouraging but authentic
- Use vocabulary appropriate to level
```

**System Prompt (Correction):**
```
Analyze the following message in {targetLanguage} for errors.
The user's native language is {sourceLanguage}.
Context: [previous messages]

Provide corrections in JSON format:
{
  "hasErrors": boolean,
  "overallFeedback": "brief encouraging feedback",
  "corrections": [
    {
      "original": "exact text",
      "correction": "corrected text",
      "explanation": "why this is wrong (in {feedbackLanguage})",
      "category": "spelling|grammar|vocabulary|naturalness",
      "startIndex": number,
      "endIndex": number
    }
  ]
}
```

---

## Implementation Phases

### Phase 1: Core Infrastructure
- [ ] Create `src/services/tutorChat.js` with Firestore operations
- [ ] Add API endpoints to `server.js`
- [ ] Create AI prompt templates

### Phase 2: UI Components
- [ ] Create `TutorChat.jsx` page
- [ ] Create `TutorChatCard.jsx` for WritingHub
- [ ] Create `NewTutorChatModal.jsx`
- [ ] Add route to App.jsx

### Phase 3: Chat Functionality
- [ ] Implement message sending/receiving
- [ ] Add real-time message updates
- [ ] Implement correction display
- [ ] Add correction toggle

### Phase 4: Integration
- [ ] Integrate with vocabulary tracking system
- [ ] Add word status highlighting
- [ ] Add to WritingHub navigation

### Phase 5: Polish
- [ ] Add conversation topics/scenarios
- [ ] Add difficulty adjustment
- [ ] Session history and archive
- [ ] Mobile responsiveness

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `src/services/tutorChat.js` | CREATE | Firestore service layer |
| `src/pages/TutorChat.jsx` | CREATE | Main chat page |
| `src/components/write/TutorChatCard.jsx` | CREATE | Hub card component |
| `src/components/write/NewTutorChatModal.jsx` | CREATE | New chat modal |
| `src/components/write/WritingHub.jsx` | MODIFY | Add tutor chat section |
| `src/App.jsx` | MODIFY | Add route |
| `server.js` | MODIFY | Add API endpoints |

---

## Design Decisions

### Why separate from Free Writing?
- Different mental model (conversation vs. composition)
- Different UI patterns (chat bubbles vs. editor)
- Different AI behavior (responsive vs. evaluative)

### Message Storage Strategy
- Store messages in array within chat document (Firestore)
- Pros: Single read for full conversation, atomic updates
- Cons: Document size limit (1MB) - mitigate with archiving old messages

### Correction Modes
- **Always**: Every user message gets correction (learning-focused)
- **On-Request**: User taps to request correction (flow-focused)
- **Off**: Pure conversation practice (confidence-building)

---

## UI Mockup (ASCII)

```
┌─────────────────────────────────────────┐
│ ← Tutor Chat: Coffee Shop        ⚙️    │
├─────────────────────────────────────────┤
│                                         │
│  ┌──────────────────────────────────┐   │
│  │ 🤖 ¡Hola! ¿Cómo estás hoy?      │   │
│  └──────────────────────────────────┘   │
│                                         │
│         ┌───────────────────────────┐   │
│         │ Estoy bien, gracías!      │   │
│         └───────────────────────────┘   │
│         ⚠️ 1 correction                 │
│         ┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐   │
│         │ gracías → gracias         │   │
│         │ (no accent needed)        │   │
│         └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘   │
│                                         │
│  ┌──────────────────────────────────┐   │
│  │ 🤖 ¡Qué bueno! ¿Qué vas a       │   │
│  │ pedir hoy?                       │   │
│  └──────────────────────────────────┘   │
│                                         │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────┐ [Send]  │
│ │ Type your message...        │ ✓corr   │
│ └─────────────────────────────┘         │
└─────────────────────────────────────────┘
```

---

## Open Questions for Consideration

1. **Topic Library**: Should we provide pre-built conversation scenarios?
2. **Voice Input**: Priority for speech-to-text input?
3. **Vocab Integration**: Auto-add corrected words to vocab, or user-initiated?
4. **Message Limit**: Archive after N messages or let documents grow?
5. **Tutor Persona**: Same tutor personality or customizable?
