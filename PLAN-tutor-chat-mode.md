# Tutor Chat Mode - Implementation Plan

## Vision

Chat with an AI tutor who feels like a **real person** - someone you're genuinely texting with who happens to be an expert in language learning. They remember your past conversations, know your struggles, and talk to you naturally. Corrections come up organically in conversation, not as structured feedback panels.

---

## Core Philosophy

**Not this:** "Here is your feedback. You made 2 errors. Error 1: grammar..."

**Like this:** "Haha sí! Aunque quick note - it's 'tengo hambre' not 'estoy hambre' - hunger uses tener in Spanish, weird right? Anyway, what did you end up eating?"

The tutor is a person first, teacher second.

---

## Feature Scope

### One Tutor, Three Modes

All in one dedicated **Tutor** tab on the main dashboard:

| Mode | Description | Skills Practiced |
|------|-------------|------------------|
| **Chat** | Text messaging | Reading, Writing |
| **Voice Record** | Send voice notes, get responses | Speaking, Listening |
| **Voice Call** | Real-time conversation | Speaking, Listening |

### Why Consolidated?
- It's ONE relationship - you text AND call the same person
- Fragmenting by skill (Write → chat, Listen → call) breaks the relationship
- Real apps work this way (WhatsApp, iMessage - all modes in one thread)

---

## Key Characteristics

### The Tutor Persona
- Warm, genuine, curious about you
- Remembers what you've talked about before
- Brings up past topics naturally ("How did that job interview go?")
- Expert in language learning but doesn't lecture
- Corrects naturally within conversation flow
- Adjusts complexity based on your level (observed, not configured)
- One consistent persona (not customizable)

### Memory System
The tutor remembers across ALL conversations:
- Your interests and life events you've mentioned
- Recurring mistakes you make
- Words/concepts you've struggled with
- Topics you've discussed
- Your progress over time

---

## App Structure

```
Dashboard
├── Read
├── Write      ← (removed "Chat with Tutor" placeholder)
├── Listen
├── Review
└── Tutor      ← NEW top-level tab
    │
    └── TutorHome
        ├── Current/recent conversation
        ├── Chat history (past conversations)
        └── Active Chat View
            ├── Text messages
            ├── Voice note button (record & send)
            └── Call button (real-time voice)
```

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
└── settings: {
    └── preferredMode: 'chat' | 'voice'  // user preference
  }

users/{userId}/tutorChats/{chatId}
├── createdAt: timestamp
├── updatedAt: timestamp
├── messages: [
│   {
│     id: string
│     role: 'user' | 'tutor'
│     type: 'text' | 'voice'         // message type
│     content: string                 // text or transcript
│     audioUrl: string | null         // for voice messages
│     duration: number | null         // voice message length
│     timestamp: timestamp
│   }
│ ]
├── summary: string | null           // AI-generated summary for memory
└── archived: boolean
```

### 2. Backend API Endpoints

```javascript
// === CHAT (Text) ===

// Send text message, get tutor response
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
  greeting: string
  isReturningUser: boolean
}

// === VOICE RECORD (Async voice notes) ===

// Send voice note, get text + voice response
POST /api/tutor/voice-message
Request: {
  audioBlob: binary
  chatId: string
}
Response: {
  transcript: string          // what user said
  response: string            // tutor's text response
  audioUrl: string            // tutor's voice response
}

// === VOICE CALL (Real-time) ===

// Initiate call session
POST /api/tutor/call/start
Request: {
  chatId: string
}
Response: {
  sessionId: string
  websocketUrl: string        // for real-time audio streaming
}

// End call, save to chat history
POST /api/tutor/call/end
Request: {
  sessionId: string
}
Response: {
  transcript: string[]        // full conversation transcript
  saved: boolean
}

// === MEMORY ===

// End session (triggers memory update)
POST /api/tutor/end-session
Request: {
  chatId: string
}
Response: {
  memoryUpdated: boolean
}
```

### 3. AI System Prompt

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

---

## Frontend Components

### Files to Create

```
src/
├── pages/
│   └── TutorChat.jsx              # Main tutor interface
├── components/
│   └── tutor/
│       ├── TutorHome.jsx          # Landing page with chat history
│       ├── TutorMessage.jsx       # Message bubble with word interaction
│       ├── VoiceRecorder.jsx      # Voice note recording UI
│       └── VoiceCallUI.jsx        # Real-time call interface
├── services/
│   └── tutor.js                   # Firestore + API service
```

### UI Flow

```
┌─────────────────────────────────────────┐
│ ← Tutor                                 │
├─────────────────────────────────────────┤
│                                         │
│  ┌──────────────────────────────────┐   │
│  │ Hey! ¿Cómo te fue con la        │   │
│  │ entrevista del viernes?          │   │
│  └──────────────────────────────────┘   │
│                                         │
│         ┌───────────────────────────┐   │
│         │ 🎤 0:12  [voice note]     │   │
│         └───────────────────────────┘   │
│                                         │
│  ┌──────────────────────────────────┐   │
│  │ 🎤 0:08  [voice response]        │   │
│  │ "¡Qué bien! Me alegro mucho..."  │   │
│  └──────────────────────────────────┘   │
│                                         │
├─────────────────────────────────────────┤
│ ┌─────────────────────────┐ 🎤  📞     │
│ │ Escribe aquí...         │ [rec][call]│
│ └─────────────────────────┘             │
└─────────────────────────────────────────┘
```

### Word Interaction
- Same as rest of app: tap word to translate
- Toggle word status (new/unknown/recognised/familiar/known)
- Words flow into existing vocab system

---

## Implementation Phases

### Phase 1: Core Chat (Text Only)
- [ ] Add Tutor tab to dashboard navigation
- [ ] Create `src/services/tutor.js` - Firestore operations
- [ ] Add `/api/tutor/message` and `/api/tutor/start` endpoints
- [ ] Create `TutorHome.jsx` and `TutorChat.jsx` pages
- [ ] Basic text conversation working

### Phase 2: Memory System
- [ ] Create tutorProfile collection structure
- [ ] Memory-informed greetings
- [ ] End-session memory extraction
- [ ] Cross-conversation context

### Phase 3: Voice Recording
- [ ] `VoiceRecorder.jsx` component
- [ ] Whisper API integration for transcription
- [ ] TTS for tutor voice responses (ElevenLabs)
- [ ] Voice message UI in chat

### Phase 4: Voice Call (Real-time)
- [ ] WebSocket/WebRTC setup for streaming
- [ ] `VoiceCallUI.jsx` component
- [ ] Real-time speech-to-text
- [ ] Real-time TTS responses
- [ ] Call transcript saving

### Phase 5: Polish
- [ ] Word interaction integration
- [ ] Typing/recording indicators
- [ ] Chat history view
- [ ] Mobile responsiveness

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `src/services/tutor.js` | CREATE | Firestore + API service |
| `src/pages/TutorChat.jsx` | CREATE | Main tutor interface |
| `src/components/tutor/TutorHome.jsx` | CREATE | Tutor landing/history |
| `src/components/tutor/TutorMessage.jsx` | CREATE | Message with word interaction |
| `src/components/tutor/VoiceRecorder.jsx` | CREATE | Voice note recording |
| `src/components/tutor/VoiceCallUI.jsx` | CREATE | Real-time call UI |
| `src/App.jsx` | MODIFY | Add Tutor route |
| `src/components/layout/DashboardLayout.jsx` | MODIFY | Add Tutor tab to nav |
| `src/components/write/WritingHub.jsx` | MODIFY | Remove "Chat with Tutor" card ✓ |
| `server.js` | MODIFY | Add tutor API endpoints |

---

## Design Decisions

### Why One Tutor?
Creates a real relationship. You build history with ONE person, not starting fresh with different tutors.

### Why Consolidate All Modes?
You wouldn't use three different apps to text, voice note, and call the same friend. The relationship is the anchor.

### Memory Storage
- Structured facts in Firestore (fast retrieval)
- Conversation summaries (not full history) for context
- Periodic memory consolidation

### Correction Philosophy
Corrections woven into natural responses, not separate feedback blocks.

### Voice Call Architecture
- WebRTC for low-latency audio streaming
- Whisper for speech-to-text
- ElevenLabs for natural TTS
- Conversation saved to chat as transcript after call ends
