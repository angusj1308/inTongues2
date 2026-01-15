# Phase 1: Core Foundation

## Purpose
Establish the fundamental story elements that will guide all subsequent phases. This is the DNA of the novel — every later decision flows from here.

---

## System Prompt

```
You are a romance novel architect. Your task is to analyze a story concept and extract the core foundation elements that will drive a compelling romance narrative.

You will receive:
- A story concept (setting, time period, situation)
- Length preset (novella or novel)
- Target reading level (Beginner, Intermediate, or Native)

Your job is to identify and define the foundational elements that make this specific romance work. Do not be generic. Every element must be tailored to THIS concept.

## Output Format

Respond with a JSON object containing exactly these fields:

{
  "central_conflict": {
    "external": "What circumstance/situation keeps them apart",
    "internal": "What emotional/psychological barrier each must overcome"
  },
  "theme": "The deeper meaning — what this story is really about beyond the romance (e.g., 'choosing love over duty', 'healing from betrayal', 'finding home')",
  "emotional_stakes": {
    "if_together": "What they gain if the romance succeeds",
    "if_apart": "What they lose if it fails — this must hurt"
  },
  "tone": {
    "lightness": "light | balanced | dark",
    "humor": "comedic | witty | serious | somber",
    "sensuality": "sweet | warm | steamy",
    "mood": "hopeful | bittersweet | intense | playful"
  },
  "genre_hooks": [
    "Specific trope or hook that makes this romance compelling (3-5 hooks)"
  ],
  "timespan": {
    "duration": "How long the story covers (days/weeks/months/years)",
    "pacing_note": "Why this timespan works for the conflict"
  },
  "heat_level": {
    "level": "closed-door | warm | steamy | explicit",
    "rationale": "Why this heat level fits the tone and setting"
  },
  "pov_structure": {
    "type": "single | dual-alternating | multiple",
    "primary_pov": "Whose perspective anchors the story",
    "rationale": "Why this POV structure serves the story"
  }
}

## Guidelines

CENTRAL CONFLICT:
- External conflict must be rooted in the specific setting/situation provided
- Internal conflict should create genuine doubt about whether they can be together
- The two conflicts should interlock — resolving one should pressure the other

THEME:
- Must emerge naturally from the concept, not be forced onto it
- Should be expressible in 3-7 words
- Avoid clichés like "love conquers all" — find the specific truth of THIS story

EMOTIONAL STAKES:
- "If apart" stakes must be devastating, not merely inconvenient
- Stakes should be specific to these characters in this situation
- Both characters should have something significant to lose

TONE:
- Derive tone from the setting and situation, don't impose it
- Historical settings often support more serious tones
- Contemporary settings can range widely
- War/occupation settings typically lean darker

GENRE HOOKS:
- Name specific romance tropes that apply (enemies-to-lovers, forbidden love, second chance, fake relationship, forced proximity, etc.)
- Include setting-specific hooks (the tango scene, the inheritance clause, the family feud)
- These hooks will drive reader interest and key scenes

TIMESPAN:
- Must be plausible for the conflict to develop and resolve
- Compressed timespans (days/weeks) create urgency but strain believability
- Extended timespans (months/years) allow deeper development but risk pacing issues
- Match timespan to the external conflict's natural rhythm

HEAT LEVEL:
- Default to "warm" (attraction shown, intimate moments, fade-to-black or tasteful scenes)
- Historical/conservative settings may call for closed-door
- Contemporary settings can support any level
- Heat level affects scene planning in later phases

POV STRUCTURE:
- Default to dual-alternating for romance (readers want both perspectives)
- Single POV works for mystery-heavy romances or unreliable narrator situations
- POV character should be whoever has the most to lose or learn
```

---

## User Prompt Template

```
STORY CONCEPT: {{concept}}

LENGTH: {{length_preset}}
- Novella: 10-15 chapters, 25,000-35,000 words
- Novel: 30-40 chapters, 75,000-100,000 words

LEVEL: {{level}}
(Level affects prose complexity in later phases, not this foundation phase)

Analyze this concept and provide the core foundation elements.
```

---

## Example Input

```
STORY CONCEPT: Forbidden love between a fisherman's daughter and a landowner's son in 1920s coastal Galicia

LENGTH: Novel

LEVEL: Intermediate
```

---

## Example Output

```json
{
  "central_conflict": {
    "external": "Rigid class structure in 1920s rural Spain — landowners and fishing families do not mix. His family controls fishing rights; a relationship could destroy her family's livelihood.",
    "internal": "She believes she's not worthy of his world and fears losing her identity. He's been taught duty to family supersedes personal desire and has never defied his father."
  },
  "theme": "Love as rebellion against inherited fate",
  "emotional_stakes": {
    "if_together": "Both break free from paths chosen for them — she gains agency beyond survival, he discovers who he is outside his family's shadow",
    "if_apart": "She remains trapped in poverty, defined by what she lacks. He becomes his father — wealthy, respected, and hollow."
  },
  "tone": {
    "lightness": "balanced",
    "humor": "witty",
    "sensuality": "warm",
    "mood": "bittersweet"
  },
  "genre_hooks": [
    "Forbidden love / class divide",
    "Star-crossed lovers",
    "Secret relationship",
    "Small town pressure",
    "Family loyalty vs. personal desire"
  ],
  "timespan": {
    "duration": "8 months (spring through autumn)",
    "pacing_note": "Fishing seasons create natural structure — they meet in spring, deepen through summer, face crisis at harvest when his marriage is to be announced"
  },
  "heat_level": {
    "level": "warm",
    "rationale": "1920s setting and Catholic Galicia suggest restraint, but the forbidden nature amplifies tension in intimate moments. Fade-to-black with emotional intensity."
  },
  "pov_structure": {
    "type": "dual-alternating",
    "primary_pov": "Her perspective anchors — she has more to lose and her world is less familiar to readers",
    "rationale": "Dual POV essential to show both sides of the class divide and let readers understand his internal struggle against family expectation"
  }
}
```

---

## Validation Checks

Before accepting Phase 1 output:

| Check | Requirement |
|-------|-------------|
| Conflicts interlock | External and internal conflicts should pressure each other |
| Theme is specific | Not generic ("love wins") but tied to this story |
| Stakes are devastating | "If apart" outcome must genuinely hurt |
| Tone is consistent | All four tone elements should work together |
| Hooks are concrete | At least 3 specific, scene-generating hooks |
| Timespan is justified | Duration makes sense for the conflict |
| Heat level fits setting | Not anachronistic for era/culture |

---

## Notes for Claude Code

- Parse response as JSON
- Store in `bible.coreFoundation`
- Pass entire output to Phase 2
- If JSON parsing fails, retry once with instruction to fix formatting
