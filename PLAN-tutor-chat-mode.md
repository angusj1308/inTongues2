# Tutor Chat Mode - Implementation Plan

## Vision

Chat with an AI tutor who feels like a **real person** - someone you're genuinely texting with who happens to be an expert in language learning. They remember your past conversations, know your struggles, and talk to you naturally. Corrections come up organically in conversation, not as structured feedback panels.

---

## Core Philosophy

**Not this:** "Here is your feedback. You made 2 errors. Error 1: grammar..."

**Like this:** "Haha sí! Aunque quick note - it's 'tengo hambre' not 'estoy hambre' - hunger uses tener in Spanish, weird right? Anyway, what did you end up eating?"

The tutor is a person first, teacher second.

---

## Key Characteristics

### The Tutor Persona
- Warm, genuine, curious about you
- Remembers what you've talked about before
- Brings up past topics naturally ("How did that job interview go?")
- Expert in language learning but doesn't lecture
- Corrects naturally within conversation flow
- Adjusts complexity based on your level (observed, not configured)

### Memory System
The tutor remembers across ALL conversations:
- Your interests and life events you've mentioned
- Recurring mistakes you make
- Words/concepts you've struggled with
- Topics you've discussed
- Your progress over time

---

## Technical Architecture

### 1. Database Schema (Firestore)

```
users/{userId}/tutorProfile
├── targetLanguage: string
├── sourceLanguage: string
├── createdAt: timestamp
├── lastChatAt: timestamp
├── memory: {
│   ├── userFacts: string[]          // "works as a designer", "has a dog named Luna"
│   ├── recurringMistakes: string[]  // "confuses ser/estar", "forgets subjunctive"
│   ├── topicsDiscussed: string[]    // "travel to Mexico", "cooking"
│   ├── lastConversationSummary: string
│   └── observedLevel: string        // tutor's assessment, updated over time
│ }
└── preferences: {
    └── correctionStyle: 'inline' | 'minimal'  // how often to correct
  }

users/{userId}/tutorChats/{chatId}
├── createdAt: timestamp
├── updatedAt: timestamp
├── messages: [
│   {
│     id: string
│     role: 'user' | 'tutor'
│     content: string
│     timestamp: timestamp
│   }
│ ]
├── summary: string | null           // AI-generated summary for memory
└── archived: boolean
```

### 2. Memory Strategy

**Per-conversation:** Full message history sent to AI (recent conversation context)

**Cross-conversation:** After each chat session ends (or periodically), AI generates:
- Summary of what was discussed
- New facts learned about user
- Mistakes the user made
- Updates to `tutorProfile.memory`

**On new chat:** System prompt includes:
- User facts from memory
- Recent conversation summaries
- Known recurring mistakes
- Observed level

### 3. Backend API Endpoints

```javascript
// Send message, get tutor response
POST /api/tutor/message
Request: {
  message: string
  chatId: string
}
Response: {
  response: string
  chatId: string
}

// Start new conversation (or continue existing)
POST /api/tutor/start
Request: {
  targetLanguage: string
  sourceLanguage: string
}
Response: {
  chatId: string
  greeting: string        // Tutor's opening, informed by memory
  isReturningUser: boolean
}

// End session (triggers memory update)
POST /api/tutor/end-session
Request: {
  chatId: string
}
Response: {
  memoryUpdated: boolean
}

// Get tutor profile (for settings display)
GET /api/tutor/profile
Response: {
  profile: TutorProfile
}
```

### 4. AI System Prompt

```
You are a friendly language tutor chatting naturally with a student learning {targetLanguage}.
Their native language is {sourceLanguage}.

ABOUT THIS PERSON:
{userFacts as bullet points}

WHAT YOU'VE TALKED ABOUT RECENTLY:
{lastConversationSummary}

MISTAKES THEY COMMONLY MAKE:
{recurringMistakes}

YOUR OBSERVED ASSESSMENT:
{observedLevel}

HOW TO BE:
- Talk like a real person texting a friend
- Be warm, curious, genuine
- Ask about their life, remember details
- Keep the conversation flowing naturally
- Correct mistakes NATURALLY within your response - don't make it a lesson
- Use their target language primarily, with {sourceLanguage} for explanations when needed
- Match your vocabulary to their level
- Don't be overly encouraging or teacherly - just be real

CORRECTION STYLE:
When they make a mistake, work the correction into your natural response.
Example: If they say "Yo soy hambre", you might respond:
"Jaja yo también tengo hambre! (btw it's 'tengo hambre' not 'soy' - hunger uses tener)
¿Qué vas a comer?"

NOT like this:
"Great try! Just a small correction: in Spanish we use 'tener' for hunger, so it should be 'tengo hambre'. Keep up the good work!"
```

### 5. Memory Update Prompt

```
Based on this conversation, extract:

1. NEW_FACTS: Any new things learned about this person (interests, life events, etc.)
2. MISTAKES: Language mistakes they made (patterns, not one-offs)
3. TOPICS: Main topics discussed
4. SUMMARY: 2-3 sentence summary of the conversation
5. LEVEL_ASSESSMENT: Your current assessment of their level (beginner/intermediate/advanced)

Respond in JSON format.
```

---

## Frontend Components

### Files to Create

```
src/
├── pages/
│   └── TutorChat.jsx           # Main chat interface
├── components/
│   └── tutor/
│       └── TutorMessage.jsx    # Message bubble with word interaction
├── services/
│   └── tutor.js                # Firestore + API service
```

### TutorChat.jsx Structure

```
┌─────────────────────────────────────────┐
│ ← Tu Tutor                              │
├─────────────────────────────────────────┤
│                                         │
│  ┌──────────────────────────────────┐   │
│  │ Hey! ¿Cómo te fue con la        │   │
│  │ entrevista del viernes?          │   │
│  └──────────────────────────────────┘   │
│                                         │
│         ┌───────────────────────────┐   │
│         │ Muy bien! Yo pienso que   │   │
│         │ ellos van a llamarme      │   │
│         └───────────────────────────┘   │
│                                         │
│  ┌──────────────────────────────────┐   │
│  │ Qué bueno!! Creo que* van a     │   │
│  │ llamarte 😊 ¿Cuándo te avisan?  │   │
│  │                                  │   │
│  │ *pienso que = I think (opinion) │   │
│  │  creo que = I think (belief) -  │   │
│  │  more natural here              │   │
│  └──────────────────────────────────┘   │
│                                         │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────┐ [Send]  │
│ │ Escribe aquí...             │         │
│ └─────────────────────────────┘         │
└─────────────────────────────────────────┘
```

### Word Interaction
- Same as rest of app: tap word to translate
- Toggle word status (new/unknown/recognised/familiar/known)
- Words flow into existing vocab system

---

## Implementation Phases

### Phase 1: Core Chat
- [ ] Create `src/services/tutor.js` - Firestore operations
- [ ] Add `/api/tutor/message` endpoint
- [ ] Create `TutorChat.jsx` page with basic chat UI
- [ ] Add route to App.jsx
- [ ] Basic conversation (no memory yet)

### Phase 2: Memory System
- [ ] Create tutorProfile collection structure
- [ ] Add `/api/tutor/start` with memory-informed greeting
- [ ] Add `/api/tutor/end-session` with memory extraction
- [ ] Update system prompt to include memory context

### Phase 3: Integration
- [ ] Word interaction (tap to translate, status toggle)
- [ ] Add to WritingHub or main navigation
- [ ] Session continuity (resume vs new chat)

### Phase 4: Polish
- [ ] Smooth message animations
- [ ] Typing indicator
- [ ] Mobile responsiveness
- [ ] Edge cases (long conversations, memory limits)

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `src/services/tutor.js` | CREATE | Firestore + API service |
| `src/pages/TutorChat.jsx` | CREATE | Main chat page |
| `src/components/tutor/TutorMessage.jsx` | CREATE | Message with word interaction |
| `src/App.jsx` | MODIFY | Add route |
| `server.js` | MODIFY | Add tutor API endpoints |
| `src/components/write/WritingHub.jsx` | MODIFY | Add tutor chat entry point |

---

## Design Decisions

### Why One Tutor, Not Multiple?
Creates a real relationship. You're building history with ONE person, not starting fresh with different tutors.

### Memory Storage
- Structured facts in Firestore (fast retrieval)
- Conversation summaries (not full history) for context
- Periodic memory consolidation to keep context window manageable

### Correction Philosophy
Corrections are woven into natural responses, not separate feedback blocks. The tutor is helpful but doesn't make everything about teaching.

### Session Boundaries
- New chat = same tutor, new conversation thread
- Memory persists across all chats
- User can scroll back through old chats if needed
