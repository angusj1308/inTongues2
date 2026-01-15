# Chapter Generation — Planning Brief

## Overview

This document outlines everything needed for the chapter generation prompt and identifies quality control mechanisms. This is a planning document, not the prompt itself.

---

## 1. Input Structure

### What the model receives per chapter call:

| Component | Token Estimate | Notes |
|-----------|----------------|-------|
| Bible (static) | ~2,000 | Core foundation, world, characters, chemistry |
| Full outline (static) | ~3,000 | All chapter breakdowns (reference) |
| Current chapter breakdown | ~300 | This chapter's beats, POV, location, hook |
| Previous chapter summaries | Variable | See compression strategy below |
| Phase 7 prose guidance | ~200 | Level-specific instructions |
| Generation instructions | ~500 | The actual prompt |

### Summary Compression Strategy:

| Chapters Generated | Recent (full) | Older (compressed) | Distant (ultra) |
|--------------------|---------------|--------------------| ----------------|
| Ch 1-5 | All full | — | — |
| Ch 6-15 | Last 5 full | Ch 1-5 compressed | — |
| Ch 16-30 | Last 5 full | Ch 6-10 compressed | Ch 1-5 ultra |
| Ch 31+ | Last 5 full | Ch 11-25 compressed | Ch 1-10 ultra |

**Summary tiers:**
- Full: 300-400 tokens (recent chapters, full detail)
- Compressed: 100-150 tokens (events, character states, key reveals)
- Ultra-compressed: 50 tokens (bare facts only)

---

## 2. Output Structure

### What the model outputs per chapter:

```json
{
  "chapter_number": 14,
  "title": "The Ruins",
  "word_count": 2650,
  "pov_character": "Iria Mariño",
  "content": "The full chapter prose...",
  "summary": {
    "events": ["Event 1", "Event 2", "Event 3"],
    "character_states": {
      "Iria": "State at chapter end",
      "Alberte": "State at chapter end"
    },
    "relationship_state": "Where the relationship is now",
    "reveals": ["Any new information revealed"],
    "seeds_planted": ["Foreshadowing planted"],
    "seeds_paid": ["Foreshadowing paid off"],
    "location_end": "Where chapter ends",
    "time_elapsed": "Story time covered"
  },
  "quality_flags": {
    "hook_present": true,
    "beats_covered": ["Beat 1", "Beat 2", "Beat 3"],
    "voice_consistent": true,
    "level_appropriate": true
  }
}
```

### Why structured output:
- Summary feeds into next chapter's context
- Quality flags enable automated validation
- Word count tracked for consistency

---

## 3. Quality Control Mechanisms

### A. Pre-Generation (built into prompt)

| Control | How Enforced |
|---------|--------------|
| Beat coverage | Prompt lists required beats; output must hit each |
| Hook requirement | Prompt specifies hook type; output must end with it |
| POV lock | Prompt specifies POV character; must maintain throughout |
| Location constraint | Prompt specifies location(s); scenes must occur there |
| Voice profile | Prompt includes character voice profile; must match |
| Level compliance | Prompt includes Phase 7 prose guidance; must follow |
| Word count target | Prompt specifies range based on tension rating |
| Foreshadowing | Prompt flags seeds to plant or pay off this chapter |

### B. Post-Generation (validation checks)

| Check | Method | Action if Fail |
|-------|--------|----------------|
| Word count in range | Count words | Flag for review; optionally regenerate |
| Hook present | Check final paragraphs | Regenerate ending only |
| Beats covered | Compare output to beat list | Flag missing beats |
| Voice drift | Compare to profile (could be automated with embeddings) | Flag for review |
| Continuity error | Compare to previous summaries | Flag contradiction |
| Level appropriate | Sentence length analysis, vocabulary check | Flag if metrics off |

### C. Cross-Chapter (continuity tracking)

| Track | How |
|-------|-----|
| Character locations | End location stored in summary; start must be plausible |
| Time progression | Time elapsed stored; next chapter must follow logically |
| Relationship state | State stored; next chapter must continue from there |
| Information revealed | Reveals stored; characters can't "unknow" things |
| Foreshadowing status | Seeds tracked; prevent duplicate planting or missed payoffs |
| Character emotional arc | Emotional state stored; progression must be visible |

---

## 4. Voice Enforcement

### Problem:
Over 35 chapters, character voices drift. Alberte starts sounding like Iria.

### Solutions:

**In prompt:**
- Include full voice profile for POV character
- Include "voice reminders" — key phrases, speech patterns, verbal tics
- Include contrast notes ("Iria is terse; Alberte over-explains")

**In validation:**
- Track sentence length per POV (Iria = shorter)
- Track hedge words per POV (Alberte = more)
- Flag if metrics drift significantly from profile

**In dialogue:**
- Prompt to include character-specific verbal tics
- Validate tics appear in output

---

## 5. Level Enforcement

### Beginner:
- Sentence length: Target 8-12 words avg, max 15
- Vocabulary: Flag words outside top 3000 frequency
- Subtext: Must be made explicit
- Validation: Automated sentence length analysis

### Intermediate:
- Sentence length: Target 12-18 words avg
- Vocabulary: Broader but with context clues
- Subtext: Some allowed, key meaning clear
- Validation: Spot check vocabulary density

### Native:
- No constraints on prose
- Validation: None needed for level

### Implementation:
- Phase 7 prose guidance included in prompt
- Post-generation: Run sentence length analysis
- Flag if average exceeds target by >20%

---

## 6. Length Control

### Target word counts by tension:

| Tension | Target | Range |
|---------|--------|-------|
| Low (3-4) | 2,000 | 1,800-2,200 |
| Medium (5-7) | 2,500 | 2,200-2,800 |
| High (8-10) | 3,100 | 2,800-3,500 |

### Enforcement:
- Prompt includes target and range
- Post-generation: Count words
- If under: Flag as potentially thin
- If over: Flag but allow (better too long than too short)
- Significant over (>4,000): May indicate pacing issue

---

## 7. Hook Enforcement

### Hook types and validation:

| Type | What to Check |
|------|---------------|
| Cliffhanger | Action incomplete, danger present |
| Question | Mystery raised, answer withheld |
| Revelation | Truth revealed with implications |
| Emotional | Strong feeling demanding resolution |
| Decision | Choice presented, outcome unknown |

### Enforcement:
- Prompt specifies hook type from Phase 6
- Prompt includes "final paragraphs must..."
- Post-generation: Check final 200 words for hook elements
- Flag if hook type doesn't match specification

---

## 8. Foreshadowing Execution

### Problem:
Seeds feel mechanical. "She noticed the fennel" feels planted.

### Solution:
- Prompt includes the seed but frames it as "weave naturally"
- Seed should serve the scene first, foreshadow second
- Example: "The fennel scene should be about him finding peace at the ruins. The fennel is incidental detail he notices — it gains meaning later."

### Tracking:
- Phase 6 specifies which seeds plant/pay in each chapter
- Generation prompt includes these
- Output summary confirms seeds handled
- Cross-chapter validation ensures no orphans

---

## 9. Continuity Tracking

### What to track per chapter:

```json
{
  "end_state": {
    "iria_location": "Walking home from ruins",
    "iria_emotional": "Terrified but exhilarated",
    "iria_knows": ["Alberte's engagement", "His university scandal"],
    "alberte_location": "Ruins, watching her leave",
    "alberte_emotional": "Hopeful but guilty",
    "alberte_knows": ["Her father's death", "Her brother's politics"],
    "relationship": "First kiss happened, acknowledged attraction",
    "time": "May, Week 2, Night"
  }
}
```

### Validation:
- Next chapter's opening must be plausible from this state
- Characters can't know things not yet revealed
- Emotional progression must be visible (can't reset)
- Time can't go backward

---

## 10. Error Recovery

### If generation fails validation:

| Issue | Recovery |
|-------|----------|
| Missing beat | Regenerate with emphasis on missed beat |
| Hook wrong type | Regenerate final scene only |
| Voice drift | Regenerate with stronger voice reminders |
| Continuity error | Regenerate with explicit state reminder |
| Too short | Regenerate with instruction to expand |
| Too long | Allow (or regenerate with tighter focus) |
| Level inappropriate | Regenerate with stronger level guidance |

### Regeneration limit:
- Max 2 regeneration attempts per chapter
- If still failing, flag for human review
- Never proceed with known broken chapter

---

## 11. User Touchpoints

### Per Phase 6 design, user involvement is minimal:

| Touchpoint | What User Sees |
|------------|----------------|
| Pre-generation | Final outline (chapter titles + summaries) — approve or regenerate |
| Per-chapter | "Generate Next Chapter" button + cost display |
| Post-chapter | Chapter text in reader |
| Optional | Download/export completed chapters |

### User does NOT:
- Edit chapter breakdowns
- Modify generation parameters
- Review validation flags (internal only)
- Choose regeneration strategies (automated)

---

## 12. Open Questions

| Question | Options | Decision Needed |
|----------|---------|-----------------|
| Summary generation | Same call or separate call? | Same (cheaper, atomic) |
| Validation automation | Full auto or human review? | Auto with flags for edge cases |
| Regeneration trigger | Auto or user-initiated? | Auto for clear failures, user for edge |
| Chapter streaming | Stream tokens or deliver complete? | Stream for UX, validate after |
| Partial chapter save | Save incomplete if timeout? | Yes, allow resume |

---

## 13. Prompt Components Needed

The chapter generation prompt needs these sections:

1. **System context** — Role, task, constraints
2. **Bible summary** — Core elements (not full bible)
3. **Character voice profiles** — For POV character + dialogue characters
4. **This chapter's breakdown** — Beats, location, hook, tension, foreshadowing
5. **Previous context** — Compressed summaries
6. **Level guidance** — From Phase 7
7. **Output format** — JSON structure expected
8. **Quality requirements** — Explicit checklist

---

## 14. Next Steps

1. [ ] Decide open questions (Section 12)
2. [ ] Design summary compression prompt
3. [ ] Design chapter generation prompt
4. [ ] Design post-generation validation logic
5. [ ] Design regeneration prompt (targeted fixes)
6. [ ] Test end-to-end on 5-chapter novella
7. [ ] Evaluate quality
8. [ ] Refine prompts
9. [ ] Scale to full novel

---

## 15. Dependencies

Before chapter generation can work:

| Dependency | Status |
|------------|--------|
| Phases 1-8 prompts | ✅ Complete |
| Bible storage structure | Defined in planning doc |
| Chapter storage structure | Defined in planning doc |
| Summary compression logic | Needs prompt |
| Generation prompt | Needs prompt |
| Validation logic | Needs implementation spec |
| Regeneration prompt | Needs prompt |
| UI for chapter reading | Existing Reader component |
| Cost calculation | Needs implementation |

