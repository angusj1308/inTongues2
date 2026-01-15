# TASK ORDER: Novel Generator Implementation

## Classification: Development Task
## Date: 2026-01-04
## Project: inTongues — Novel Generator Feature

---

# 1. SITUATION

## Background
inTongues is a language learning application. Users learn through reading and listening to content in their target language. Currently, users import existing content (books, YouTube, etc.) and the system adapts it to their level.

The Novel Generator extends this by allowing users to generate original novels tailored to their interests and reading level. This is a premium feature enabling unlimited personalized content.

## Current State
- Core app exists with Reader, Listen, Speak, Write modes
- Text adaptation (Beginner/Intermediate/Native) is implemented
- ElevenLabs audio generation is implemented with caching
- Firebase/Firestore backend exists
- OpenAI integration exists for text generation
- No novel generation capability exists yet

## Desired End State
Users can:
1. Enter a story concept (e.g., "Forbidden love in 1920s Buenos Aires")
2. Select level (Beginner/Intermediate/Native) and length (Novella/Novel)
3. System generates complete story bible and outline
4. User reviews outline, approves or regenerates
5. System generates chapters one at a time on demand
6. Generated content appears in Reader like any other book
7. Optional: Audio generation per chapter

---

# 2. MISSION

Implement the Novel Generator feature using the architecture defined in the planning documents. The system must generate structurally sound, emotionally compelling romance novels in the user's target language at their selected reading level.

---

# 3. EXECUTION

## Read Order (MANDATORY FIRST STEP)

Before writing any code, read all planning documents in this order:

### Phase 1: Understand the Overview
1. `novel-generator-planning.md` — Complete architecture overview, resolved decisions, storage model, UX flow

### Phase 2: Understand the Bible Pipeline
Read prompts in order — each builds on previous:
2. `phase-1-core-foundation.md` — Theme, conflict, stakes, tone
3. `phase-2-world-setting.md` — Setting, locations, constraints, naming
4. `phase-3-characters.md` — Protagonist, love interest, supporting cast
5. `phase-4-chemistry.md` — Relationship dynamics, pivotal moments
6. `phase-5-plot-architecture.md` — Beat sheet, subplots, foreshadowing
7. `phase-6-chapter-breakdown.md` — Per-chapter beats, POV, hooks
8. `phase-7-level-check.md` — Level-appropriate prose guidance
9. `phase-8-validation.md` — Comprehensive bible validation

### Phase 3: Understand Chapter Generation
10. `chapter-generation-brief.md` — Planning overview for generation phase
11. `chapter-generation.md` — Master template for prose generation
12. `summary-compression.md` — Context window management
13. `regeneration.md` — Targeted fixes for failed validation

### Phase 4: Confirm Understanding
After reading all documents, summarize:
- The 8-phase bible pipeline
- How phases validate against each other
- The chapter generation flow
- Quality control mechanisms
- Storage structure

Do NOT proceed to implementation until this summary is confirmed.

---

## Implementation Phases

### PHASE A: Foundation (Do First)
**Objective:** Set up storage and basic API structure

Tasks:
1. Create Firestore structure for generated books:
   ```
   /users/{uid}/generatedBooks/{bookId}
   /users/{uid}/generatedBooks/{bookId}/chapters/{chapterIndex}
   ```
2. Create API endpoint structure in server.js:
   - POST `/api/generate/bible` — Runs Phases 1-8
   - POST `/api/generate/chapter/{bookId}/{chapterIndex}` — Generates single chapter
   - GET `/api/generate/book/{bookId}` — Retrieves book status and bible
3. Implement OpenAI retry/streaming wrapper per Section 11.5 of planning doc

**Deliverable:** API skeleton that accepts requests and returns mock responses

---

### PHASE B: Bible Generation (Core Pipeline)
**Objective:** Implement Phases 1-8 to generate complete story bible

Tasks:
1. Implement Phase 1 prompt execution
2. Implement Phase 2 prompt execution with Phase 1 coherence check
3. Implement Phase 3 prompt execution with Phase 1-2 coherence check
4. Implement Phase 4 prompt execution with Phase 1-3 coherence check
5. Implement Phase 5 prompt execution with Phase 1-4 coherence check
6. Implement Phase 6 prompt execution with Phase 1-5 coherence check
7. Implement Phase 7 prompt execution
8. Implement Phase 8 validation
9. If Phase 8 fails, implement regeneration from identified phase
10. Store complete bible in Firestore

**Coherence Check Implementation:**
- Each phase output includes `coherence_check` field
- Validate all sub-fields are non-empty
- If coherence check shows misalignment, regenerate that phase

**Deliverable:** API that generates complete validated bible from user concept

---

### PHASE C: Chapter Generation
**Objective:** Generate chapters one at a time using bible

Tasks:
1. Implement chapter generation prompt with variable substitution
2. Implement context assembly:
   - Bible summary (static)
   - Chapter breakdown (from Phase 6)
   - Previous summaries (compressed per rules)
3. Implement post-generation validation:
   - Word count check
   - Beat coverage check
   - Hook type check
   - JSON structure check
4. Implement summary extraction and storage
5. Implement summary compression (when Ch 6+ generated)
6. Store chapter content and summary in Firestore

**Deliverable:** API that generates validated chapters with proper context management

---

### PHASE D: Regeneration Logic
**Objective:** Handle failed validations gracefully

Tasks:
1. Implement regeneration type selection based on failure
2. Implement full regeneration prompt
3. Implement ending-only regeneration prompt
4. Implement expansion regeneration prompt
5. Implement partial regeneration prompt
6. Implement 2-attempt limit with flag for review
7. Track regeneration count per chapter

**Deliverable:** Self-healing generation that fixes most issues automatically

---

### PHASE E: Frontend Integration
**Objective:** User-facing UI for novel generation

Tasks:
1. Create GenerateBookPanel component:
   - Story concept input
   - Level selector (Beginner/Intermediate/Native)
   - Length selector (Novella/Novel)
   - Generate audio checkbox
   - Budget display
   - Example prompts rotation
2. Create OutlineReview component:
   - Display chapter titles and summaries
   - Approve / Regenerate buttons
3. Create ChapterGenerator component:
   - "Generate Next Chapter" button
   - Cost display before generation
   - Streaming text display during generation
   - Progress indicator
4. Integrate generated books into existing Reader component
5. Add generated books to Library view

**Deliverable:** Complete user flow from concept to reading generated chapters

---

### PHASE F: Audio Integration (Optional)
**Objective:** Generate audio for chapters using existing ElevenLabs integration

Tasks:
1. Add "Generate Audio" option per chapter
2. Use existing TTS caching architecture
3. Store audioUrl and audioStatus per chapter
4. Display audio player in Reader for generated chapters

**Deliverable:** Audio generation for generated content

---

## Control Measures

### Code Quality
- No hallucinated APIs — use only OpenAI endpoints that exist
- Parse all LLM responses as JSON with try/catch
- Validate JSON structure before storing
- Log all generation attempts for debugging

### Prompt Integrity
- Load prompts from files, do not hardcode
- Variable substitution must be complete (no {{undefined}})
- Preserve prompt structure exactly as documented

### Error Handling
- Implement retry with backoff (2s, 4s, 8s) — max 3 attempts
- 90 second timeout per API call
- Save partial output if timeout with >500 tokens
- Never deduct budget on failed generation

### Testing Checkpoints
After each phase, test before proceeding:

| Phase | Test |
|-------|------|
| A | Mock endpoints return expected structure |
| B | Generate bible for test concept, validate Phase 8 passes |
| C | Generate 3 chapters, validate continuity |
| D | Inject failures, verify regeneration works |
| E | Full user flow works end-to-end |
| F | Audio generates and plays |

### Budget Protection
- Show cost estimate before generation
- Deduct only on successful validated output
- Track monthly usage per user
- Enforce tier limits

---

# 4. END STATE

## Minimum Viable Feature (Phases A-E)
- User enters concept, selects options
- System generates bible (60-120 seconds)
- User reviews and approves outline
- User generates chapters one at a time (20-40 seconds each)
- Chapters appear in Reader
- Generated books appear in Library
- Quality is consistent, voices are distinct, plot is coherent

## Full Feature (Phase F)
- All above plus audio generation per chapter

## Success Criteria
1. Bible generation completes without manual intervention
2. Phase 8 validation passes on first attempt >80% of time
3. Chapter generation passes validation on first attempt >90% of time
4. Generated prose matches target reading level
5. Character voices remain distinct across 35 chapters
6. No continuity errors across full novel
7. Foreshadowing seeds plant and pay off correctly
8. User can generate complete novella (12 chapters) end-to-end

---

# 5. COORDINATION

## Files to Reference
All prompt files are the source of truth. When implementing:
- System prompts: Copy exactly from prompt files
- User prompt templates: Implement variable substitution
- Output formats: Validate against documented JSON structures
- Validation checks: Implement all listed checks

## Questions / Blockers
If unclear on any aspect:
1. Re-read relevant prompt file
2. Check `novel-generator-planning.md` for resolved decisions
3. Ask for clarification before guessing

## Progress Reporting
After completing each phase (A-F):
1. Report what was implemented
2. Report test results
3. Report any deviations from plan and why
4. Get confirmation before proceeding to next phase

---

# ANNEXES

## Annex A: File List
```
/generator-planning/
├── novel-generator-planning.md (overview)
├── phase-1-core-foundation.md
├── phase-2-world-setting.md
├── phase-3-characters.md
├── phase-4-chemistry.md
├── phase-5-plot-architecture.md
├── phase-6-chapter-breakdown.md
├── phase-7-level-check.md
├── phase-8-validation.md
├── chapter-generation-brief.md
├── chapter-generation.md
├── summary-compression.md
├── regeneration.md
└── TASK-ORDER.md (this file)
```

## Annex B: Key Decisions (from planning doc)
- Pilot genre: Romance
- Level affects prose only, not plot
- Chapter length varies by tension (1,800-3,500 words)
- User touchpoint: Outline review only
- Default POV: Dual alternating
- Default heat level: Warm (fade-to-black)
- LLM: OpenAI (GPT-4o)
- Retry: 3 attempts with exponential backoff
- Timeout: 90 seconds
- Budget: Deduct on success only

## Annex C: Storage Structure
```
/users/{uid}/generatedBooks/{bookId}
  - concept: string
  - bible: {
      coreFoundation: {},
      world: {},
      characters: {},
      chemistry: {},
      plot: {},
      chapters: [],
      levelCheck: {},
      validation: {}
    }
  - language: string
  - level: string
  - genre: string
  - lengthPreset: string
  - chapterCount: number
  - generateAudio: boolean
  - status: 'planning' | 'in_progress' | 'complete'
  - createdAt: timestamp

/users/{uid}/generatedBooks/{bookId}/chapters/{chapterIndex}
  - index: number
  - title: string
  - pov: string
  - content: string
  - wordCount: number
  - tensionRating: number
  - summary: {}
  - compressedSummary: string
  - ultraSummary: string
  - audioUrl: string | null
  - audioStatus: string
  - validationPassed: boolean
  - regenerationCount: number
  - generatedAt: timestamp
```
