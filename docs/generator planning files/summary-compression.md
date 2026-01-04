# Summary Compression Prompt

## Purpose
Compress chapter summaries to fit within context window limits while preserving information essential for continuity. Used when generating later chapters where full summaries would exceed token budget.

---

## When to Use

| Chapters Generated | Action |
|--------------------|--------|
| Ch 1-5 | No compression — use full summaries |
| Ch 6-15 | Compress Ch 1-5 to "compressed" format |
| Ch 16-30 | Compress Ch 1-5 to "ultra", Ch 6-15 to "compressed" |
| Ch 31+ | Compress Ch 1-10 to "ultra", Ch 11-25 to "compressed" |

Always keep last 5 chapters as full summaries.

---

## Compression Levels

### Full Summary (~300-400 tokens)
The complete summary object as generated. No compression.

### Compressed Summary (~100-150 tokens)
Key events, character states, and relationship progress in 2-3 sentences.

### Ultra-Compressed Summary (~50 tokens)
Bare facts only. One sentence. What happened and where relationship stands.

---

## System Prompt

```
You are a continuity editor. Your task is to compress chapter summaries while preserving all information essential for story continuity.

You will receive:
- A batch of full chapter summaries
- Target compression level (compressed or ultra)

Preserve:
- Key plot events (what happened)
- Character emotional states (how they feel now)
- Relationship state (where the romance stands)
- Important reveals (information characters now know)
- Foreshadowing planted (seeds that need future payoff)
- Time and location (when/where chapter ended)

Discard:
- Detailed scene descriptions
- Minor character interactions
- Atmospheric details
- Specific dialogue (unless crucial)
- Redundant information (covered in other summaries)

The compressed summaries will be used as context for generating future chapters. A writer reading these must be able to:
1. Know what has happened in the story
2. Know where each character is emotionally
3. Know what information has been revealed
4. Avoid continuity errors

## Output Format

For COMPRESSED level:
{
  "compressed_summaries": [
    {
      "chapter": 1,
      "pov": "Character name",
      "summary": "2-3 sentences covering events, emotional state, relationship state, any reveals or seeds."
    }
  ]
}

For ULTRA level:
{
  "ultra_summaries": [
    {
      "chapter": 1,
      "summary": "One sentence. Bare facts."
    }
  ]
}
```

---

## User Prompt Template

```
COMPRESSION LEVEL: {{level}}

FULL SUMMARIES TO COMPRESS:

{{#each summaries}}
---
CHAPTER {{number}} (POV: {{pov}})

Events:
{{#each events}}
- {{this}}
{{/each}}

Character States:
{{#each characterStates}}
- {{@key}}: {{this}}
{{/each}}

Relationship State: {{relationshipState}}

Reveals:
{{#each reveals}}
- {{this}}
{{/each}}

Seeds Planted:
{{#each seedsPlanted}}
- {{this}}
{{/each}}

Seeds Paid Off:
{{#each seedsPaid}}
- {{this}}
{{/each}}

Location at End: {{locationEnd}}
Time Elapsed: {{timeElapsed}}
---
{{/each}}

Compress these summaries to {{level}} level. Preserve continuity-critical information.
```

---

## Examples

### Input: Full Summary (Chapter 10)

```json
{
  "chapter": 10,
  "pov": "Alberte",
  "events": [
    "Alberte rode to the cliffs claiming need for fresh air",
    "Found Iria gathering mussels alone",
    "They talked for an hour — longest conversation yet",
    "He asked about her father; she told him more than intended",
    "He shared about university, feeling trapped",
    "Picked wild fennel growing from the rocks",
    "Almost touched her hand, pulled back"
  ],
  "characterStates": {
    "Iria": "Surprised by her own openness, guard lowering",
    "Alberte": "Fascinated, guilty about his privilege, hopeful"
  },
  "relationshipState": "Tentative connection forming — first real conversation, mutual recognition of being trapped",
  "reveals": [
    "Her father drowned when she was 14",
    "He left university after a scandal involving radical ideas"
  ],
  "seedsPlanted": [
    "Wild fennel picked and pocketed"
  ],
  "seedsPaid": [],
  "locationEnd": "Cliffs — parted ways separately",
  "timeElapsed": "One afternoon"
}
```

### Output: Compressed (~120 tokens)

```json
{
  "compressed_summaries": [
    {
      "chapter": 10,
      "pov": "Alberte",
      "summary": "Alberte found Iria alone at the cliffs; they had their first real conversation. She revealed her father drowned when she was 14; he admitted leaving university after a scandal. He picked wild fennel (seed planted). Both recognized they're trapped in different ways. Tentative connection forming, guards lowering."
    }
  ]
}
```

### Output: Ultra (~45 tokens)

```json
{
  "ultra_summaries": [
    {
      "chapter": 10,
      "summary": "First real conversation at cliffs. Shared secrets (her father's death, his university scandal). Wild fennel picked. Connection forming."
    }
  ]
}
```

---

## Batch Processing

For efficiency, compress multiple chapters in one call:

```
COMPRESSION LEVEL: compressed

FULL SUMMARIES TO COMPRESS:

[Chapter 1 full summary]
[Chapter 2 full summary]
[Chapter 3 full summary]
[Chapter 4 full summary]
[Chapter 5 full summary]

Compress all 5 summaries to compressed level.
```

Output:

```json
{
  "compressed_summaries": [
    { "chapter": 1, "pov": "Iria", "summary": "..." },
    { "chapter": 2, "pov": "Alberte", "summary": "..." },
    { "chapter": 3, "pov": "Iria", "summary": "..." },
    { "chapter": 4, "pov": "Alberte", "summary": "..." },
    { "chapter": 5, "pov": "Iria", "summary": "..." }
  ]
}
```

---

## Critical Continuity Elements

Never lose these in compression:

| Element | Why Critical |
|---------|--------------|
| Deaths, injuries | Characters can't un-die or un-heal |
| Information reveals | Characters can't un-know things |
| Relationship milestones | First kiss, intimacy, breakup — can't be undone |
| Location at end | Next chapter must start plausibly |
| Foreshadowing seeds | Must track for future payoff |
| Promises made | Characters must keep or break them |
| Time elapsed | Story timeline must stay consistent |
| Emotional shifts | Character can't reset without cause |

---

## Storage

Compressed summaries stored separately from full summaries:

```
/users/{uid}/generatedBooks/{bookId}/chapters/{chapterIndex}
  - summary: {} (full summary, always kept)
  - compressedSummary: string (generated when needed)
  - ultraSummary: string (generated when needed)
```

Generate compressed versions lazily — only when needed for context window of later chapter.

---

## Notes for Claude Code

- Run compression when generating Ch 6+ (compress Ch 1-5)
- Run ultra-compression when generating Ch 16+ (ultra Ch 1-5)
- Batch process for efficiency (compress 5 at a time)
- Store compressed versions for reuse
- Always keep full summaries — compression is for context window only
- If compression loses critical info, regenerate with emphasis on that element
