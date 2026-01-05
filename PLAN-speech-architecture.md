# Speech Tab Architecture Plan

## Overview

Building the **Speaking** section of the language learning app under the `speak` tab of the dashboard. Three distinct modes are needed to cover different aspects of speaking practice.

---

## Current State Analysis

### Existing Infrastructure We Can Leverage
- ✅ **Tab system**: `speak` tab already exists in `DASHBOARD_TABS` with placeholder content
- ✅ **Audio playback**: HTML5 Audio API + Spotify Web Playback SDK in `AudioPlayer.jsx`
- ✅ **Text-to-speech**: ElevenLabs integration for pronunciation/narration
- ✅ **Speech-to-text**: Whisper API for transcription
- ✅ **Cloud storage**: Firebase Storage for audio files
- ✅ **Pronunciation cache**: Pre-cached word pronunciations system
- ✅ **Tutor memory**: Personalization/feedback system in `tutor.js`

### Missing Infrastructure
- ❌ **Audio recording**: No MediaRecorder implementation
- ❌ **Microphone permissions**: No `getUserMedia` handling
- ❌ **Recording UI**: No waveform visualization or recording controls
- ❌ **Azure Speech Services**: Not integrated (for phoneme-level assessment)
- ❌ **Audio segmentation**: No chunking/splitting functionality

---

## Mode Specifications

### Mode 1: Intensive (Shadowing Practice)
**Purpose**: Pure sound reproduction with zero cognitive load on meaning

**User Flow**:
1. Select audio from library OR upload new audio
2. Audio is segmented into repeatable chunks (sentences/phrases)
3. Listen to a segment → Record themselves mimicking it
4. Side-by-side playback comparison (original vs recording)
5. AI pronunciation scoring at phoneme level
6. Articulatory feedback ("move tongue forward", "round lips more")
7. Repeat until mastered, then move to next segment

### Mode 2: Voice Record (Long-form Production)
**Purpose**: Producing meaning while speaking

**User Flow**:
1. Select content source:
   - Library content (stories, transcripts)
   - Their own writing (from Write tab)
   - Spontaneous (no prompt, free speaking)
2. Record extended passage
3. Receive comprehensive AI feedback report:
   - **Correctness**: Grammar, vocabulary, word choice
   - **Accuracy**: Pronunciation, intonation
   - **Fluency**: Pace, pauses, rhythm, naturalness

### Mode 3: Conversation Practice
**Purpose**: Real-time conversational practice

**Implementation**: Links to existing Tutor tab for voice calls
- No new infrastructure needed
- Navigation button to Tutor with voice mode enabled
- (Dependent on Tutor voice implementation - currently planned but not built)

---

## Component Architecture

```
src/components/speak/
├── SpeakHub.jsx                    # Main hub - mode selection
├── shared/
│   ├── AudioRecorder.jsx           # Core recording component (reusable)
│   ├── WaveformVisualizer.jsx      # Audio waveform display
│   ├── PlaybackComparison.jsx      # Side-by-side audio comparison
│   ├── RecordingControls.jsx       # Record/stop/retry buttons
│   └── AudioPermissionHandler.jsx  # Microphone permission UI
├── intensive/
│   ├── IntensiveModeHub.jsx        # Intensive mode main view
│   ├── ContentSelector.jsx         # Select/upload audio for practice
│   ├── SegmentPlayer.jsx           # Play individual segments with loop
│   ├── ShadowingSession.jsx        # Active shadowing practice UI
│   ├── PronunciationScore.jsx      # Phoneme-level score display
│   └── ArticulatoryFeedback.jsx    # Visual feedback on pronunciation
└── voiceRecord/
    ├── VoiceRecordHub.jsx          # Voice record mode main view
    ├── SourceSelector.jsx          # Choose content source
    ├── ReadingSession.jsx          # Recording with prompt display
    ├── SpontaneousSession.jsx      # Recording without prompt
    └── FeedbackReport.jsx          # Comprehensive feedback display
```

---

## Audio Recording/Playback Infrastructure

### Core Recording Hook: `useAudioRecorder.js`

```javascript
// src/hooks/useAudioRecorder.js
export function useAudioRecorder() {
  return {
    // State
    isRecording: boolean,
    isPaused: boolean,
    recordingTime: number,
    audioBlob: Blob | null,
    audioUrl: string | null,
    error: string | null,
    permissionStatus: 'granted' | 'denied' | 'prompt',

    // Actions
    requestPermission: () => Promise<boolean>,
    startRecording: () => Promise<void>,
    stopRecording: () => Promise<Blob>,
    pauseRecording: () => void,
    resumeRecording: () => void,
    resetRecording: () => void,

    // Stream for visualizations
    audioStream: MediaStream | null,
    analyserNode: AnalyserNode | null
  }
}
```

### Implementation Approach

```javascript
// Core recording using MediaRecorder API
const startRecording = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      sampleRate: 44100
    }
  })

  // Set up audio context for visualizations
  const audioContext = new AudioContext()
  const analyser = audioContext.createAnalyser()
  const source = audioContext.createMediaStreamSource(stream)
  source.connect(analyser)

  // MediaRecorder for capturing
  const mediaRecorder = new MediaRecorder(stream, {
    mimeType: 'audio/webm;codecs=opus'  // Good quality, wide support
  })

  const chunks = []
  mediaRecorder.ondataavailable = (e) => chunks.push(e.data)
  mediaRecorder.onstop = () => {
    const blob = new Blob(chunks, { type: 'audio/webm' })
    // Convert to MP3 via server or use as-is
  }

  mediaRecorder.start()
}
```

### Shared Playback Component

```javascript
// AudioPlaybackCompare.jsx - For side-by-side comparison
<div className="playback-comparison">
  <div className="original-audio">
    <label>Original</label>
    <WaveformVisualizer audioUrl={originalUrl} />
    <PlaybackControls audioRef={originalRef} />
  </div>
  <div className="user-recording">
    <label>Your Recording</label>
    <WaveformVisualizer audioUrl={recordingUrl} />
    <PlaybackControls audioRef={recordingRef} />
  </div>
  <button onClick={playBoth}>Play Both</button>
</div>
```

---

## Integration Points with Existing Library System

### Content Access Pattern

```javascript
// For Intensive Mode - fetch audio content with segments
import { getUserStories } from '../services/library'
import { getYouTubeVideos } from '../services/youtube'

// Stories with audio
const stories = await getUserStories(userId, { hasFullAudio: true })

// YouTube videos with transcripts (timestamped segments)
const videos = await getYouTubeVideos(userId)

// Each has segments/sentences with timestamps:
// { text: "...", start: 0.5, end: 2.3 }
```

### Adding Speech Content to Library

```javascript
// New subcollection for speech recordings
// users/{userId}/speechRecordings/{recordingId}
{
  id: string,
  type: 'intensive' | 'voiceRecord',
  sourceType: 'library' | 'upload' | 'writing' | 'spontaneous',
  sourceId: string | null,  // Reference to source content
  language: string,

  // Recording metadata
  audioUrl: string,
  duration: number,
  transcription: string | null,

  // Segment info (for intensive mode)
  segmentIndex: number | null,
  segmentText: string | null,

  // Feedback
  scores: {
    pronunciation: number,
    fluency: number,
    accuracy: number,
    overall: number
  },
  feedback: {
    phonemeAnalysis: PhonemeScore[],
    articulatoryTips: string[],
    corrections: Correction[],
    fluencyAnalysis: FluencyAnalysis
  },

  createdAt: timestamp,
  reviewedAt: timestamp | null
}
```

---

## Azure Speech Services Integration

### Why Azure Over Alternatives

| Feature | Azure Speech | Whisper | Google Speech |
|---------|-------------|---------|---------------|
| Phoneme-level scoring | ✅ Native | ❌ No | ❌ Limited |
| Pronunciation assessment | ✅ Full API | ❌ No | ⚠️ Basic |
| Real-time streaming | ✅ Yes | ❌ No | ✅ Yes |
| Articulatory feedback | ✅ Yes | ❌ No | ❌ No |
| Multi-language | ✅ 90+ | ✅ 90+ | ✅ 120+ |
| Word-level timestamps | ✅ Yes | ✅ Yes | ✅ Yes |

### Integration Approach

```javascript
// server.js - New endpoint for pronunciation assessment
app.post('/api/speech/assess-pronunciation', async (req, res) => {
  const { audioBase64, referenceText, language } = req.body

  // Azure Speech SDK
  const speechConfig = SpeechConfig.fromSubscription(
    process.env.AZURE_SPEECH_KEY,
    process.env.AZURE_SPEECH_REGION
  )

  const pronunciationConfig = PronunciationAssessmentConfig.fromJSON({
    referenceText,
    gradingSystem: 'HundredMark',
    granularity: 'Phoneme',  // Key: phoneme-level analysis
    enableMiscue: true,
    phonemeAlphabet: 'IPA'
  })

  // Create audio config from buffer
  const audioBuffer = Buffer.from(audioBase64, 'base64')
  const audioConfig = AudioConfig.fromWavFileInput(audioBuffer)

  const recognizer = new SpeechRecognizer(speechConfig, audioConfig)
  pronunciationConfig.applyTo(recognizer)

  // Get assessment result
  const result = await recognizer.recognizeOnceAsync()

  // Parse pronunciation assessment
  const assessment = PronunciationAssessmentResult.fromResult(result)

  return res.json({
    accuracyScore: assessment.accuracyScore,
    pronunciationScore: assessment.pronunciationScore,
    completenessScore: assessment.completenessScore,
    fluencyScore: assessment.fluencyScore,
    words: assessment.words.map(w => ({
      word: w.word,
      accuracyScore: w.accuracyScore,
      errorType: w.errorType,  // None, Omission, Insertion, Mispronunciation
      phonemes: w.phonemes.map(p => ({
        phoneme: p.phoneme,
        score: p.accuracyScore,
        // Map low scores to articulatory tips
      }))
    }))
  })
})
```

### Articulatory Feedback Mapping

```javascript
// Map phoneme errors to articulatory instructions
const ARTICULATORY_TIPS = {
  // Vowels
  'ɪ': { error: 'too open', tip: 'Raise tongue higher, keep it relaxed' },
  'i': { error: 'too lax', tip: 'Tense your tongue, spread lips slightly' },
  'ʊ': { error: 'unrounded', tip: 'Round your lips more, pull tongue back' },
  'æ': { error: 'too closed', tip: 'Open mouth wider, lower jaw' },

  // Consonants - Spanish specific
  'ɾ': { error: 'too heavy', tip: 'Quick tongue tap against alveolar ridge' },
  'r': { error: 'not trilled', tip: 'Relax tongue tip, let it vibrate against palate' },
  'x': { error: 'too soft', tip: 'Raise back of tongue toward soft palate, push air through' },

  // French specific
  'ʁ': { error: 'too fronted', tip: 'Uvular R - constrict back of throat' },
  'y': { error: 'not rounded', tip: 'Say "ee" but round your lips like "oo"' },
  'ø': { error: 'wrong position', tip: 'Say "ay" with rounded lips' },

  // Italian specific
  'ʎ': { error: 'sounds like L', tip: 'Flatten tongue against palate for "gl" sound' },
  'ɲ': { error: 'sounds like N', tip: 'Press tongue flat against hard palate for "gn"' },
}
```

---

## UI/UX Flow for Each Mode

### Mode 1: Intensive (Shadowing) UI Flow

```
┌─────────────────────────────────────────────────┐
│ INTENSIVE MODE                                   │
├─────────────────────────────────────────────────┤
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │ Select Content to Practice                │   │
│  ├──────────────────────────────────────────┤   │
│  │ 📚 From Library                           │   │
│  │    • Stories with Audio (12)              │   │
│  │    • YouTube Videos (5)                   │   │
│  ├──────────────────────────────────────────┤   │
│  │ 📤 Upload New Audio                       │   │
│  │    Drag & drop or click to upload         │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
└─────────────────────────────────────────────────┘

         ▼ After selecting content ▼

┌─────────────────────────────────────────────────┐
│ SHADOWING SESSION                               │
├─────────────────────────────────────────────────┤
│                                                  │
│  Segment 3 of 24                    [Exit]      │
│  ─────────────────────────────────────────      │
│                                                  │
│  "El gato negro duerme en el sofá"              │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │ ▶️ Original        [====|=========] 0:02  │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │ 🎤 Your Recording  [Press to Record]      │   │
│  │    or              [====|===] 0:01        │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │ PRONUNCIATION SCORE                       │   │
│  │                                           │   │
│  │  Overall: 78/100                          │   │
│  │                                           │   │
│  │  El   gato   negro   duerme   en   sofá  │   │
│  │  ✓    ✓      ⚠️      ✓       ✓    ⚠️     │   │
│  │             92      97      100   85     │   │
│  │                                           │   │
│  │  "negro" - /ˈne.ɣɾo/                      │   │
│  │  ⚠️ 'ɾ' - Try a quicker tongue tap       │   │
│  │                                           │   │
│  │  "sofá" - /so.ˈfa/                        │   │
│  │  ⚠️ 'f' - More air through teeth gap     │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  [◀ Previous]  [🔄 Retry]  [Next ▶]            │
│                                                  │
└─────────────────────────────────────────────────┘
```

### Mode 2: Voice Record UI Flow

```
┌─────────────────────────────────────────────────┐
│ VOICE RECORD                                     │
├─────────────────────────────────────────────────┤
│                                                  │
│  What would you like to practice?               │
│                                                  │
│  ┌──────────────────┐ ┌──────────────────┐      │
│  │ 📖 Read Aloud    │ │ ✍️  My Writing    │      │
│  │                  │ │                  │      │
│  │ Practice with    │ │ Read your own    │      │
│  │ library content  │ │ compositions     │      │
│  └──────────────────┘ └──────────────────┘      │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │ 💭 Speak Freely                           │   │
│  │                                           │   │
│  │ Practice spontaneous speech on any topic │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
└─────────────────────────────────────────────────┘

         ▼ Recording Session ▼

┌─────────────────────────────────────────────────┐
│ RECORDING: Read Aloud                           │
├─────────────────────────────────────────────────┤
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │                                           │   │
│  │  "María siempre llegaba tarde a sus      │   │
│  │   clases. Un día, decidió cambiar su     │   │
│  │   rutina y despertar más temprano..."    │   │
│  │                                           │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│           ┌────────────────────┐                │
│           │   ◉ Recording...   │                │
│           │      02:34         │                │
│           │                    │                │
│           │   [===WAVEFORM===] │                │
│           │                    │                │
│           │   [■ Stop]         │                │
│           └────────────────────┘                │
│                                                  │
└─────────────────────────────────────────────────┘

         ▼ Feedback Report ▼

┌─────────────────────────────────────────────────┐
│ FEEDBACK REPORT                                  │
├─────────────────────────────────────────────────┤
│                                                  │
│  Overall Score: 82/100                          │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━              │
│                                                  │
│  ┌────────────────────────────────────────┐     │
│  │ CORRECTNESS                      85     │     │
│  │ Grammar & vocabulary choices            │     │
│  │                                         │     │
│  │ ✓ Good use of preterite vs imperfect   │     │
│  │ ⚠️ "llegaba tarde a sus clases" -      │     │
│  │    Consider "a clase" (more natural)   │     │
│  └────────────────────────────────────────┘     │
│                                                  │
│  ┌────────────────────────────────────────┐     │
│  │ ACCURACY                         78     │     │
│  │ Pronunciation & intonation              │     │
│  │                                         │     │
│  │ ⚠️ "siempre" - stress on first syllable│     │
│  │ ⚠️ "decidió" - accent on final syllable│     │
│  │ ✓ Good 'rr' trill in "rutina"          │     │
│  └────────────────────────────────────────┘     │
│                                                  │
│  ┌────────────────────────────────────────┐     │
│  │ FLUENCY                          84     │     │
│  │ Pace, pauses & naturalness              │     │
│  │                                         │     │
│  │ Speaking rate: 120 WPM (Good)           │     │
│  │ ⚠️ Long pause at "Un día," - keep flow │     │
│  │ ✓ Natural sentence rhythm               │     │
│  └────────────────────────────────────────┘     │
│                                                  │
│  [🔄 Try Again]  [💾 Save Recording]  [Done]   │
│                                                  │
└─────────────────────────────────────────────────┘
```

### Mode 3: Conversation Practice UI

```
┌─────────────────────────────────────────────────┐
│ CONVERSATION PRACTICE                           │
├─────────────────────────────────────────────────┤
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │                                           │   │
│  │        🎙️                                 │   │
│  │                                           │   │
│  │   Practice real conversations with       │   │
│  │   your AI tutor using voice             │   │
│  │                                           │   │
│  │   Your tutor remembers your level,      │   │
│  │   interests, and past conversations     │   │
│  │                                           │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│         [🎤 Start Voice Conversation]           │
│                                                  │
│  ─────────────────────────────────────────      │
│                                                  │
│  Previous conversations:                        │
│  • Yesterday - Talked about weekend plans       │
│  • Dec 28 - Restaurant vocabulary practice      │
│                                                  │
└─────────────────────────────────────────────────┘

  [Clicking button navigates to Tutor tab
   with voice mode enabled]
```

---

## Data Models

### Speech Recording Model

```typescript
interface SpeechRecording {
  id: string
  userId: string
  type: 'intensive' | 'voiceRecord'

  // Source information
  source: {
    type: 'library' | 'upload' | 'writing' | 'spontaneous'
    contentId?: string      // ID of library item, writing piece
    contentType?: string    // 'story' | 'youtube' | 'writing'
    segmentIndex?: number   // For intensive mode segments
  }

  // Content
  language: string
  referenceText?: string    // What they were supposed to say
  transcription?: string    // What they actually said (via Whisper)

  // Audio
  audioUrl: string
  duration: number          // seconds
  fileSize: number          // bytes

  // Assessment (from Azure Speech Services)
  assessment?: {
    overallScore: number    // 0-100
    pronunciation: number
    accuracy: number
    fluency: number
    completeness: number

    // Detailed word-level analysis
    words: WordAssessment[]

    // Phoneme-level for intensive mode
    phonemes?: PhonemeAssessment[]
  }

  // AI Feedback (from GPT)
  feedback?: {
    corrections: Correction[]
    fluencyNotes: string[]
    articulatoryTips: ArticulatoryTip[]
    encouragement: string
    suggestedFocus: string[]
  }

  // Metadata
  createdAt: Timestamp
  reviewedAt?: Timestamp
  practiceCount: number     // How many times they've practiced this
}

interface WordAssessment {
  word: string
  expected: string
  score: number
  errorType: 'none' | 'mispronunciation' | 'omission' | 'insertion'
  phonemes: PhonemeAssessment[]
}

interface PhonemeAssessment {
  phoneme: string          // IPA symbol
  score: number
  expected: string
  actual?: string
}

interface Correction {
  type: 'grammar' | 'vocabulary' | 'pronunciation'
  original: string
  corrected: string
  explanation: string
}

interface ArticulatoryTip {
  phoneme: string
  issue: string
  tip: string
  visualAid?: string       // URL to mouth position diagram
}
```

### Audio Segment Model (for Intensive Mode)

```typescript
interface AudioSegment {
  id: string
  parentId: string          // Story/video ID
  index: number

  text: string
  startTime: number         // seconds
  endTime: number
  duration: number

  // Audio URL can be derived from parent + timestamps
  // or pre-extracted as separate file
  audioUrl?: string

  // IPA transcription for pronunciation reference
  ipaTranscription?: string

  // User's practice history
  practiceHistory: {
    recordingId: string
    score: number
    timestamp: Timestamp
  }[]

  bestScore?: number
  practiceCount: number
}
```

### User Speech Profile Model

```typescript
interface UserSpeechProfile {
  userId: string
  language: string

  // Aggregate statistics
  stats: {
    totalRecordings: number
    totalPracticeTime: number    // seconds
    averageScore: number

    // By mode
    intensiveRecordings: number
    voiceRecordRecordings: number

    // Progress over time
    scoreHistory: {
      date: string
      averageScore: number
    }[]
  }

  // Personalized insights
  insights: {
    strongPhonemes: string[]
    weakPhonemes: string[]
    commonMistakes: {
      pattern: string
      frequency: number
      lastOccurrence: Timestamp
    }[]

    // Areas to focus on
    focusAreas: string[]
  }

  // Settings
  settings: {
    autoSegmentLength: number   // seconds, for intensive mode
    showIPA: boolean
    feedbackDetailLevel: 'basic' | 'detailed' | 'expert'
    voiceGender: 'male' | 'female'
  }

  updatedAt: Timestamp
}
```

---

## API Endpoints

### New Server Endpoints

```javascript
// Pronunciation Assessment (Azure)
POST /api/speech/assess-pronunciation
Body: { audioBase64, referenceText, language, granularity }
Response: { scores, words, phonemes, articulatoryTips }

// Full Speech Analysis (Whisper + GPT)
POST /api/speech/analyze
Body: { audioBase64, referenceText?, language, type }
Response: { transcription, assessment, feedback }

// Audio Segmentation
POST /api/speech/segment-audio
Body: { contentId, contentType }
Response: { segments: AudioSegment[] }

// Upload Recording
POST /api/speech/upload
Body: FormData { audio, metadata }
Response: { recordingId, audioUrl }

// Get User Speech Profile
GET /api/speech/profile/:userId/:language
Response: UserSpeechProfile

// Update Practice Stats
POST /api/speech/log-practice
Body: { recordingId, score, duration }
Response: { updated: true }
```

---

## Build Sequence Recommendation

### Phase 1: Core Recording Infrastructure (Week 1-2)
**Priority: CRITICAL - Foundational**

1. **Create `useAudioRecorder` hook**
   - MediaRecorder implementation
   - Permission handling
   - Audio stream for visualizations
   - File: `src/hooks/useAudioRecorder.js`

2. **Create AudioRecorder component**
   - Recording controls (start/stop/retry)
   - Timer display
   - Permission request UI
   - File: `src/components/speak/shared/AudioRecorder.jsx`

3. **Create WaveformVisualizer component**
   - Canvas-based visualization
   - Uses analyserNode from recorder
   - File: `src/components/speak/shared/WaveformVisualizer.jsx`

4. **Add upload endpoint**
   - Accept audio blob
   - Save to Firebase Storage
   - Return URL
   - File: `server.js` additions

### Phase 2: SpeakHub & Mode Selection (Week 2)
**Priority: HIGH - User entry point**

1. **Create SpeakHub component**
   - Mode selection UI
   - Language-aware
   - File: `src/components/speak/SpeakHub.jsx`

2. **Update Dashboard.jsx**
   - Replace placeholder with SpeakHub
   - Pass activeLanguage prop

3. **Add basic styling**
   - Follow existing patterns
   - File: `src/style.css` additions

### Phase 3: Voice Record Mode (Week 2-3)
**Priority: HIGH - Simpler to implement**

1. **Create VoiceRecordHub**
   - Source selection (library/writing/spontaneous)
   - File: `src/components/speak/voiceRecord/VoiceRecordHub.jsx`

2. **Create SourceSelector**
   - Integration with library service
   - Integration with writing content
   - File: `src/components/speak/voiceRecord/SourceSelector.jsx`

3. **Create recording sessions**
   - ReadingSession.jsx (with prompt)
   - SpontaneousSession.jsx (without prompt)

4. **Integrate Whisper transcription**
   - Use existing Whisper setup
   - New endpoint for speech analysis

5. **Create FeedbackReport**
   - Display transcription
   - Show correctness/accuracy/fluency
   - GPT-powered detailed feedback
   - File: `src/components/speak/voiceRecord/FeedbackReport.jsx`

### Phase 4: Azure Speech Services Integration (Week 3-4)
**Priority: HIGH - Core differentiator**

1. **Set up Azure Speech SDK**
   - Add Azure credentials to env
   - Install @azure/cognitiveservices-speech-sdk
   - File: `server.js` additions

2. **Create pronunciation assessment endpoint**
   - Phoneme-level analysis
   - Return structured scores

3. **Create articulatory feedback mapping**
   - Phoneme → tip database
   - Language-specific rules

### Phase 5: Intensive Mode (Week 4-5)
**Priority: MEDIUM - Complex but valuable**

1. **Create audio segmentation**
   - Use existing sentence timestamps
   - Or create new segmentation endpoint
   - File: server.js additions

2. **Create IntensiveModeHub**
   - Content selection
   - File: `src/components/speak/intensive/IntensiveModeHub.jsx`

3. **Create ShadowingSession**
   - Segment playback
   - Recording
   - Side-by-side comparison
   - File: `src/components/speak/intensive/ShadowingSession.jsx`

4. **Create PlaybackComparison**
   - Dual waveform display
   - Synchronized playback option
   - File: `src/components/speak/shared/PlaybackComparison.jsx`

5. **Create PronunciationScore & ArticulatoryFeedback**
   - Visual score display
   - Phoneme highlighting
   - Articulatory tips
   - Files in `src/components/speak/intensive/`

### Phase 6: Conversation Practice Link (Week 5)
**Priority: LOW - Dependent on Tutor voice**

1. **Add conversation practice entry point**
   - Navigation to Tutor tab
   - Pass voice mode flag

2. **Update Tutor to accept voice mode**
   - When Tutor voice is implemented
   - Or show "coming soon" state

### Phase 7: Polish & Integration (Week 5-6)
**Priority: MEDIUM - User experience**

1. **Create UserSpeechProfile management**
   - Stats aggregation
   - Insights generation
   - Settings persistence

2. **Add recordings to Review tab**
   - Practice history
   - Progress visualization

3. **Cross-feature integration**
   - Link from Library to Intensive mode
   - Link from Write to Voice Record
   - Shared pronunciation data

---

## Dependencies & Environment

### New NPM Packages

```json
{
  "dependencies": {
    "@azure/cognitiveservices-speech-sdk": "^1.34.0"
  }
}
```

### New Environment Variables

```env
# Azure Speech Services
AZURE_SPEECH_KEY=your_key_here
AZURE_SPEECH_REGION=eastus

# Optional: Alternative pronunciation API
AZURE_SPEECH_ENDPOINT=https://eastus.api.cognitive.microsoft.com/
```

### Browser Compatibility

- MediaRecorder API: Chrome 49+, Firefox 25+, Safari 14.1+, Edge 79+
- getUserMedia: All modern browsers (require HTTPS in production)
- Web Audio API: Universal support

---

## File Structure Summary

```
src/
├── components/
│   └── speak/
│       ├── SpeakHub.jsx
│       ├── shared/
│       │   ├── AudioRecorder.jsx
│       │   ├── WaveformVisualizer.jsx
│       │   ├── PlaybackComparison.jsx
│       │   ├── RecordingControls.jsx
│       │   └── AudioPermissionHandler.jsx
│       ├── intensive/
│       │   ├── IntensiveModeHub.jsx
│       │   ├── ContentSelector.jsx
│       │   ├── SegmentPlayer.jsx
│       │   ├── ShadowingSession.jsx
│       │   ├── PronunciationScore.jsx
│       │   └── ArticulatoryFeedback.jsx
│       └── voiceRecord/
│           ├── VoiceRecordHub.jsx
│           ├── SourceSelector.jsx
│           ├── ReadingSession.jsx
│           ├── SpontaneousSession.jsx
│           └── FeedbackReport.jsx
├── hooks/
│   └── useAudioRecorder.js
├── services/
│   └── speech.js
└── pages/
    └── Dashboard.jsx (modified)

server.js (modified - new endpoints)
```

---

## Risk Considerations

### Technical Risks
1. **Azure Speech costs** - Monitor usage, implement rate limiting
2. **Audio quality** - Different microphones produce varying results
3. **Browser compatibility** - MediaRecorder codec support varies
4. **Large audio files** - Implement size limits and compression

### Mitigation Strategies
1. Cache pronunciation assessments where possible
2. Provide audio quality guidance to users
3. Use widely-supported codecs (WebM Opus → MP3 conversion)
4. Client-side compression before upload

---

## Success Metrics

- Recording success rate (% of attempts that complete)
- Average pronunciation score improvement over time
- User engagement (sessions per week, recordings per session)
- Time spent in each mode
- Completion rate for intensive mode segments
