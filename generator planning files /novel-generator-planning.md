# inTongues Novel Generator — Planning Document

---

## 1. Vision

Users can generate full novels, book series, screenplays, articles, lessons, courses, and biographies in any language at their level on any topic they're interested in.

---

## 2. Pilot Scope

| Attribute | Decision |
|-----------|----------|
| **Format** | Novel (60,000–100,000 words) |
| **Constraint** | One chapter generated at a time (cost control, interest validation) |
| **Grading** | Generate at level (Beginner/Intermediate/Native) |
| **Genre** | Romance |

**Why Romance:**
- Large reader base
- Clear, well-documented structure (beat sheets exist)
- Forces system to generate compelling plot — can't rely on historical events
- Works at all grading levels
- Forgiving if prose is slightly off — story still works

---

## 3. User Input

### What the User Provides

| Input | Format | Notes |
|-------|--------|-------|
| **Story concept** | Type + Where + When | Single prompt, e.g., "Forbidden love story set during the British occupation of Buenos Aires" |
| **Level** | Beginner / Intermediate / Native | Affects prose complexity, not plot |
| **Length** | Novella / Novel | Preset options |

**Target language** is locked to user's active learning language (already in place).

### Length Presets

| Name | Pages | Chapters | Words |
|------|-------|----------|-------|
| Novella | 75–125 | 10–15 | 25,000–35,000 |
| Novel | 250–330 | 30–40 | 75,000–100,000 |

### UI Elements

- Cycling example prompts (genre-specific) in text box to inspire users
- Optional: "Generate random concept" button for users who can't think of an idea

**Example Prompts (Romance, Spanish):**
1. Forbidden love between a fisherman's daughter and a landowner's son in 1920s coastal Galicia
2. Second chance romance at a family vineyard in Mendoza during harvest season
3. Enemies to lovers between rival restaurateurs in modern Barcelona
4. Secret affair during the Mexican Revolution in 1910s Chihuahua
5. Workplace romance at a fashion house in 1960s Madrid under Franco
6. Arranged marriage that becomes real love in colonial Lima
7. Summer romance between a local and a traveler in 1980s San Sebastián
8. Star-crossed lovers from feuding families in 19th century Seville
9. Reconnecting with a first love at a Day of the Dead celebration in Oaxaca
10. Opposites attract between a tango dancer and a businessman in 1950s Buenos Aires

### User Touchpoint

**Single gate:** User reviews final outline (chapter titles + one-sentence summaries) before chapter generation begins. Approve or regenerate. No other input required during generation.

---

## 4. Bible + Outline Generation Pipeline

This is the critical architecture. A bad outline produces 30 chapters of polished garbage.

System generates bible + outline through **eight sequential phases:**

---

### PHASE 1: Core Foundation

*Input:* User's concept + length preset + level

*System generates:*
- Central conflict (what keeps them apart?)
- Theme (what is this story really about?)
- Emotional stakes (what do they stand to lose?)
- Tone (light/dark, comedic/serious, sensual/sweet)
- Genre-specific hooks (for romance: what makes this pairing compelling?)
- **Story timespan** (days, weeks, months, years — affects pacing believability)
- **Heat level** (default: warm/fade-to-black for pilot)
- **POV structure** (single POV or dual alternating — default: dual for romance)

---

### PHASE 2: World/Setting Generation

*Input:* User concept + Phase 1

*System generates:*
- Social rules of the era/place (what's forbidden, what's expected)
- Key locations (3–5 recurring spaces)
- Cultural context (religion, politics, class structure)
- Constraints that create conflict (why can't they just be together?)
- Sensory palette (sights, sounds, smells of this world)
- Time pressure (if any)
- **Plausible names for era/culture**
- **Available occupations/roles**
- **Class structures that constrain romance**

World comes before characters — setting determines who can exist in it.

---

### PHASE 3: Character Generation

*Input:* Phase 1 + Phase 2

**Character Hierarchy:**

| Tier | Who | Bible Depth | Arc | Voice Profile |
|------|-----|-------------|-----|---------------|
| **Principal** | Protagonist, Love Interest | Full | Full growth arc | Detailed |
| **Supporting** | Best friend, mentor, antagonist, family | Medium | Mini-arc (serves principal's arc) | Brief |
| **Incidental** | Shopkeeper, guard, stranger | None (created during chapter generation) | None | Setting-appropriate only |

**For Principal Characters (Protagonist + Love Interest):**
- Name, age, background (informed by setting)
- External want (goal they're pursuing)
- Internal need (what they actually need to grow)
- Fatal flaw (what holds them back)
- Backstory wound (why they have this flaw)
- Growth arc (flaw at start → growth → resolution)
- Physical/sensory details

**Voice Profile (Principal):**
- Speech patterns (formal/casual, verbose/terse)
- Verbal tics or habits
- Vocabulary level
- Topics they gravitate toward vs avoid
- How they express emotion (internal vs external)

**Supporting Cast (3–5 characters):**
- Narrative function (mentor, antagonist, mirror, comic relief, etc.)
- Relationship to protagonist
- How they challenge or support the romance
- Their own mini-arc
- Distinct voice profile (even if brief)

---

### PHASE 4: Chemistry Architecture

*Input:* Phase 1–3

**Magnetic Pull — why these two belong together:**
- Complementary flaws (her weakness is his strength)
- What specifically attracts them to each other
- Shared values or experiences that create bond
- What each sees in the other that others miss

**Friction — why it's difficult:**
- Opposing worldviews that create conflict
- Why they're wrong for each other on the surface
- External barriers (setting-based)
- Internal barriers (flaw-based)

**Relationship Arc:**
- Where they start (strangers, enemies, acquaintances, reunited)
- Key turning points in how they see each other
- Where they end (and why it's earned)

---

### PHASE 5: Plot Architecture

*Input:* All previous phases

**Main Plot (Romance Arc):**

Genre-specific beat sheet using **percentages** (maps to chapter count):

| Beat | % of Story | Novella (12ch) | Novel (35ch) |
|------|------------|----------------|--------------|
| Setup / normal world | 0–8% | Ch 1 | Ch 1–3 |
| Meet cute / inciting incident | 8–12% | Ch 1–2 | Ch 3–4 |
| Resistance / denial | 12–20% | Ch 2–3 | Ch 5–7 |
| Growing attraction | 20–35% | Ch 3–4 | Ch 8–12 |
| First threshold | 35–40% | Ch 4–5 | Ch 12–14 |
| Deepening relationship | 40–50% | Ch 5–6 | Ch 14–18 |
| Midpoint commitment | 50% | Ch 6 | Ch 17–18 |
| Complications escalate | 50–75% | Ch 6–9 | Ch 18–26 |
| Dark moment | 75–85% | Ch 9–10 | Ch 26–30 |
| Grand gesture | 85–95% | Ch 10–11 | Ch 30–33 |
| Resolution / HEA | 95–100% | Ch 11–12 | Ch 33–35 |

**Subplot A (External):**
- External goal protagonist pursues
- How it intersects with romance at specific chapters
- Cause-and-effect: subplot event in Ch X causes main plot consequence in Ch Y

**Subplot B (Internal/Secondary):**
- Friendship arc, family reconciliation, self-discovery
- How it mirrors or contrasts main theme
- Pressure points: where subplot forces a choice that affects romance

**Subplot Integration Map:**

| Chapter | Main Plot | Subplot A | Subplot B | Intersection |
|---------|-----------|-----------|-----------|--------------|
| Ch 3 | Growing attraction | Job pressure introduced | — | Job keeps them apart |
| Ch 8 | First threshold | — | Friend gives advice | Advice leads to vulnerability |
| Ch 15 | Complication | Job crisis | Friend betrayal | Double pressure on protagonist |
| ... | ... | ... | ... | ... |

Subplots must *pressure* the romance, not just exist alongside it.

**Foreshadowing & Callbacks:**

| Seed | Plant Chapter | Payoff Chapter | Description |
|------|---------------|----------------|-------------|
| Object | Ch 2 | Ch 30 | Locket mentioned early, becomes symbol in declaration |
| Line | Ch 5 | Ch 28 | "I never stay" → "I'm staying" |
| Action | Ch 8 | Ch 25 | Small kindness repaid in crisis |
| ... | ... | ... | ... |

---

### PHASE 6: Chapter Breakdown

*Input:* All previous phases

*System generates for each chapter:*
- Chapter number and working title
- **POV character** (if dual POV)
- Primary plot thread being advanced
- Secondary thread (if any)
- Characters present
- Setting/location
- **Story time elapsed** (maintains timespan consistency)
- Opening state (where are we emotionally?)
- Beats (3–7 specific story events)
- Key revelations or turning points
- **Tension rating (1–10)**
- **Hook type:** cliffhanger / question raised / emotional resonance / revelation incoming

**Tension Curve Validation:**

```
Ch: 1  2  3  4  5  6  7  8  9  10 11 12 ...
    3  4  5  4  6  7  5  8  9  6  10 8  ...
       ↗     ↘  ↗        ↘     ↗
```

- Generally rises across the book
- Deliberate valleys after high-tension chapters (breathing room)
- Peak at dark moment, sustained through climax
- Validation fails if tension is flat or chaotic

**Hook Requirement:**

Every chapter must end with explicit hook. For serialized reading, the end-of-chapter hook determines whether user generates the next chapter.

---

### PHASE 7: Level Adaptation Check

*Input:* Complete outline + target level

**Decision:** Level affects prose only, not plot structure (for pilot).

Future consideration:
- Beginner: Could simplify subplot count (1 instead of 2)
- Beginner: Could make cause-and-effect more linear
- Native: Can handle ambiguity, unreliable narration, parallel timelines

Outline remains constant across levels. Chapter generation prompt adjusts prose complexity.

---

### PHASE 8: Validation Pass

*Input:* Complete bible + outline

*System checks:*
- Every character arc has setup and payoff
- Every subplot resolves
- Cause-and-effect logic holds
- No orphaned plot threads
- All foreshadowing seeds have payoffs
- All payoffs have seeds
- Tension curve follows expected shape
- Every chapter has a hook
- Voice profiles are distinct
- Chemistry architecture is reflected in key scenes
- Timespan is consistent (no impossible jumps)
- POV rotation is balanced (if dual)
- Heat level scenes are placed appropriately
- Theme expressed through character choices
- Tone consistency

**Recovery Path:**

| Issue Detected | Action |
|----------------|--------|
| Missing payoff | Generate seed in earlier chapter |
| Orphaned subplot | Add resolution scene or remove subplot |
| Flat tension | Increase stakes in flagged chapters |
| Missing hook | Regenerate chapter ending beat |
| Voice bleed | Strengthen voice profile, flag for generation |
| Timeline error | Adjust story time in affected chapters |

If validation fails 3+ checks, regenerate from Phase 5. If fundamental issues, regenerate from Phase 4.

---

## 5. Per-Chapter Generation

### Input to Model

- Bible (static — ~2,000 tokens)
- Full outline (static — ~3,000 tokens)
- Current chapter beats + context (location, POV, hook type, tension target)
- Previous chapter summaries (compressed)

### Output

- Chapter text at appropriate level
- Auto-generated chapter summary (for next chapter's context)

### Chapter Length (Variable by Tension)

| Tension Rating | Word Range |
|----------------|------------|
| Low (3–4) | 1,800–2,200 |
| Medium (5–7) | 2,200–2,800 |
| High (8–10) | 2,800–3,500 |

Prevents AI producing 800-word stubs or 6,000-word monsters. Climactic chapters breathe, transition chapters don't pad.

### Incidental Characters

The bible defines the **principal cast**. Chapter generation is explicitly permitted to create **incidental characters** as scenes require:
- Shopkeeper who delivers a message
- Servant who witnesses a moment
- Stranger at a party
- Guard who blocks the path

Rules for incidentals:
- No arc required
- No bible entry needed
- Can recur if useful, but not obligated
- Must fit setting (era-appropriate names, roles, speech)
- Must not upstage principal cast or become plot-critical without bible entry

### Context Management (Token Bloat Prevention)

| Chapter | Full Summaries | Compressed Summaries | Total Context |
|---------|----------------|----------------------|---------------|
| Ch 1–5 | All | — | ~7,000 tokens |
| Ch 6–15 | Last 5 | Ch 1–5 compressed | ~9,000 tokens |
| Ch 16–30 | Last 5 | Ch 1–15 compressed | ~12,000 tokens |
| Ch 31+ | Last 5 | Ch 1–25 ultra-compressed | ~15,000 tokens |

**Summary compression tiers:**
- Full: 300–500 tokens per chapter (recent)
- Compressed: 100–150 tokens per chapter (older)
- Ultra-compressed: 50 tokens per chapter (distant)

**Summary structure (JSON):**
```json
{
  "chapter": 5,
  "events": ["Maria discovers letter", "Confronts Diego", "Kiss interrupted"],
  "character_changes": {"Maria": "now suspects truth", "Diego": "guilt increasing"},
  "relationship_state": "attraction acknowledged but untrusted",
  "new_info": ["Diego's brother is alive"],
  "location_end": "garden",
  "time_elapsed": "2 days"
}
```

---

## 6. Genre Modules

The eight-phase pipeline is **reusable across genres**. What changes:

| Phase | Genre-Specific? |
|-------|-----------------|
| 1. Core Foundation | Slightly (stakes, heat level defaults) |
| 2. World/Setting | No |
| 3. Characters | Moderately (archetypes differ) |
| 4. Chemistry | **Romance-specific** (other genres: different relationship types) |
| 5. Plot Architecture | **Heavily** (beat sheets differ) |
| 6. Chapter Breakdown | **Heavily** (pacing, hook types differ) |
| 7. Level Adaptation | No |
| 8. Validation | Slightly (genre requirements — HEA for romance, solution for mystery) |

For pilot: build Romance module only. Later genres = new modules, same pipeline.

### Future Genre Examples

**Mystery:**
- Plant clues in specific chapters
- Red herrings
- Detective/investigation beats
- Revelation timing

**Sci-Fi:**
- World-building density
- Exposition pacing
- Technical consistency
- "Rules" of the universe

**Thriller:**
- Ticking clock mechanics
- Escalating threat
- False safety beats
- Climactic confrontation

---

## 7. Storage Model

```
/users/{uid}/generatedBooks/{bookId}
  - concept: string (user's original prompt)
  - bible: {} (full bible document)
  - outline: [] (all chapter breakdowns)
  - language: string
  - level: string
  - genre: string
  - lengthPreset: 'novella' | 'novel'
  - chapterCount: number
  - generateAudio: boolean
  - status: 'planning' | 'in_progress' | 'complete'
  - createdAt: timestamp

/users/{uid}/generatedBooks/{bookId}/chapters/{chapterIndex}
  - index: number
  - beats: []
  - text: string
  - summary: {} (JSON structure)
  - wordCount: number
  - tensionRating: number
  - hookType: string
  - audioUrl: string | null
  - audioStatus: 'none' | 'pending' | 'ready' | 'error'
  - generatedAt: timestamp
```

### Series Storage (Future Feature)

```
/users/{uid}/series/{seriesId}
  - title: string
  - bible: {} (grows across books)
  - timeline: [] (events in chronological order)
  - books: [bookId references]

/users/{uid}/generatedBooks/{bookId}
  - seriesId: string | null
  - seriesIndex: number (1st book, 2nd book, etc.)
```

---

## 8. User Experience Flow

```
1. User clicks "Generate New Book"
2. User provides:
   - Story concept (Type + Where + When)
   - Level (Beginner/Intermediate/Native)
   - Length (Novella/Novel)
   - Generate audio (checkbox, optional)
3. System shows:
   - Monthly budget remaining (text + audio)
   - Cost of this generation
4. User confirms
5. System generates bible + outline (8 phases)
6. User reviews outline (chapter titles + summaries)
7. User approves or requests regeneration
8. System generates Chapter 1
9. User reads Chapter 1 in Reader
10. User clicks "Generate Next Chapter"
    - Cost shown before each chapter generation
11. Repeat until complete
12. Option: "Start New Book in Series" (future feature)
```

### Audio Generation

- Optional checkbox at book creation
- Tier-based monthly limits
- If over limit: pay-per-use pricing
- Audio generated per chapter after text generation

---

## 9. Technical Constraints

### Token Limits

| Component | Tokens |
|-----------|--------|
| Bible | ~2,000 |
| Outline | ~3,000 |
| Summaries (30ch compressed) | ~5,000 |
| Current chapter context | ~500 |
| **Total by Ch 30** | ~15,000 |

Within GPT-4's 128k context window. Safe.

### Cost Estimation

Per chapter (rough):
- Input: ~15,000 tokens
- Output: ~3,000 tokens
- GPT-4o: ~$0.15–0.30 per chapter
- 35 chapters: ~$7–12 per novel

Need to validate actual costs.

### Generation Time

- Bible + Outline: 60–120 seconds (one-time)
- Per chapter: 20–40 seconds
- Full novel: Only matters if user generates all at once (we don't allow this)

---

## 10. Architecture vs Prompts

The pipeline above is the **architecture** — the skeleton that ensures structural soundness.

The **prompts** (built separately) generate unique content within each beat. The beat sheet says *what* needs to happen. The prompt generates *how* it manifests for this specific story.

Example — "Meet cute" could manifest as:
- Hostile first encounter (enemies to lovers)
- Accidental collision
- Forced proximity
- Mistaken identity
- Reunion after years
- Rescue situation
- Competition

The user's concept flows through every phase and ensures infinite variation within the same structure.

---

## 11. Resolved Decisions

| Decision | Resolution | Rationale |
|----------|------------|-----------|
| Pilot genre | Romance | Large reader base, clear structure, forces compelling plot |
| User input format | Type + Where + When | Simple, not user's job to create plot |
| Length options | Novella (10-15ch) / Novel (30-40ch) | Presets over slider, predictable pacing |
| Level affects... | Prose only, not plot | Keep pilot simple |
| Chapter length | Variable by tension (1,800–3,500 words) | Organic pacing |
| Regeneration | Not allowed | Simplifies architecture for v1 |
| User touchpoints | Final outline review only | System handles complexity |
| POV default | Dual alternating | Standard for romance |
| Heat level default | Warm (fade-to-black) | Safe default for pilot |
| World vs Character order | World first | Setting informs who can exist |
| Grading approach | Generate at level | No second adaptation pass needed |
| LLM provider | OpenAI | Fine-tuning available if prompting hits ceiling |
| Fine-tuning approach | Start with prompting, fine-tune later if needed | Validate quality before investing in training |
| Cost display | Show monthly budget remaining + generation cost before confirm | Transparency, prevents surprise usage |
| Audio generation | Optional checkbox, tier-based limits, pay-per-use if over limit | Expensive API, user choice |
| Series manager | Future feature | Not needed for pilot |
| API failure handling | Retry with backoff + streaming + user notification | Covers 99% of failure cases |

---

## 11.5 API Resilience

### Strategy
| Mechanism | Implementation |
|-----------|----------------|
| Retry | 3 attempts with exponential backoff (2s, 4s, 8s) |
| Timeout | 90 seconds per call |
| Streaming | Real-time token delivery for chapter generation |
| Partial recovery | If timeout with >500 tokens, save partial output |
| Budget protection | Only deduct on confirmed success |

### Risk Profile by Call Type
| Call | Tokens Out | Timeout Risk | Recovery |
|------|------------|--------------|----------|
| Phase 1-8 | ~500 each | Very low | Retry from failed phase |
| Chapter gen | ~3,000 | Low | Partial save + retry |

### User-Facing States
| State | Message | Action |
|-------|---------|--------|
| Retrying | "Generation failed, retrying..." | Auto-retry in progress |
| Partial | "Timed out. Partial chapter saved." | Offer retry button |
| Failed | "Generation failed. Please try again." | Retry button, no budget deducted |
| Success | (none) | Budget deducted, content saved |

### Implementation Instructions

When building the novel generator API calls:

1. **Wrap all OpenAI calls** in retry logic with exponential backoff (2s → 4s → 8s), max 3 attempts
2. **Set AbortController timeout** at 90 seconds per call
3. **Use streaming** for chapter generation — send tokens to client as they arrive via SSE
4. **Track partial output** during streaming — if timeout occurs after >500 tokens, save what exists and flag as partial
5. **Deduct budget only after confirmed success** — failed/partial calls should not charge user
6. **Phase calls are non-streaming** — small outputs, just retry on failure
7. **Save after each phase** — if Phase 4 fails, Phases 1-3 are already persisted

---

## 12. Open Questions

No open questions remaining for pilot scope.

---

## 13. Prompts to Build

| Prompt | Input | Output |
|--------|-------|--------|
| Phase 1: Core Foundation | User concept, length, level | Conflict, theme, stakes, tone, timespan, heat, POV |
| Phase 2: World/Setting | Phase 1 | Locations, rules, constraints, sensory palette, names, roles |
| Phase 3: Characters | Phase 1–2 | Principal + supporting cast with full profiles |
| Phase 4: Chemistry | Phase 1–3 | Magnetic pull, friction, relationship arc |
| Phase 5: Plot Architecture | Phase 1–4 | Beat sheet, subplots, integration map, foreshadowing |
| Phase 6: Chapter Breakdown | Phase 1–5 | Per-chapter beats, tension, hooks |
| Phase 7: Level Check | Full outline | Adjustments if needed |
| Phase 8: Validation | Bible + outline | Pass/fail + fixes |
| Chapter Generation | Bible + outline + summaries + beats | Chapter text + summary |
| Summary Compression | Full summary | Compressed summary (100–150 tokens) |

---

## 14. Future Expansion

| Content Type | Differences from Novel |
|--------------|----------------------|
| Short Story | No chapters, single generation, simpler structure |
| Screenplay | Format-specific (sluglines, dialogue format) |
| Biography | Research phase, factual constraints |
| Article | No narrative arc, argument structure |
| Course/Lesson | Learning objectives, exercises, progression |
| Series | Series manager, cross-book continuity |

---

## 15. Next Steps

1. ✅ Pick pilot genre (Romance)
2. ✅ Define user input format
3. ✅ Define pipeline architecture
4. ✅ Implement API resilience (retry, streaming, timeout)
5. [ ] Write Phase 1 prompt
6. [ ] Write Phase 2 prompt
7. [ ] Write Phase 3 prompt
8. [ ] Write Phase 4 prompt
9. [ ] Write Phase 5 prompt
10. [ ] Write Phase 6 prompt
11. [ ] Write Validation prompt
12. [ ] Write Chapter Generation prompt
13. [ ] Test end-to-end on 5-chapter novella
14. [ ] Evaluate quality
15. [ ] Refine prompts
16. [ ] Scale to full novel

---

## Revision History

| Date | Changes |
|------|---------|
| 2026-01-04 | Initial planning document created |
| 2026-01-04 | Added 8-phase pipeline |
| 2026-01-04 | Added character tiers, incidental characters |
| 2026-01-04 | Added variable chapter length by tension |
| 2026-01-04 | Restructured document for clarity |
| 2026-01-04 | Resolved: cost display, audio generation, API resilience |
