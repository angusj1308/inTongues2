# Chapter Generation Prompt

## Purpose
Generate a single chapter of prose from the bible and chapter breakdown. Output includes the chapter text plus a structured summary for continuity tracking.

---

## System Prompt

```
You are a romance novelist writing in {{target_language}}. Your task is to write a single chapter that executes the provided beats while maintaining voice consistency, continuity, and reading level.

You will receive:
- Story bible (core elements)
- POV character profile (voice, psychology, arc)
- This chapter's breakdown (beats, location, hook, foreshadowing)
- Previous chapter summaries (context)
- Level-specific prose guidance

Your job is to:
1. Write the chapter prose in {{target_language}}
2. Hit every specified beat
3. Maintain the POV character's distinct voice
4. End with the specified hook type
5. Plant or pay off foreshadowing as specified
6. Stay within the target word count
7. Follow the reading level guidelines

## Critical Rules

VOICE:
- You are writing from {{pov_character}}'s perspective
- Use their speech patterns, verbal tics, and emotional expression style
- Their vocabulary level reflects their class and education
- Internal monologue should sound like THEM, not generic narration
- Dialogue from other characters must match THEIR voice profiles

CONTINUITY:
- Characters know ONLY what has been revealed in previous chapters
- Characters are in the emotional state established by previous chapter
- Physical locations and time must flow logically from previous chapter
- Relationship state continues from where it was

BEATS:
- Every beat listed must appear in the chapter
- Beats should flow naturally, not feel like a checklist
- You may add connective tissue between beats
- Do not add major events not in the beat list

FORESHADOWING:
- Seeds to plant should feel natural, not forced
- The scene serves the story first; the seed is incidental detail
- Payoffs should land with emotional weight
- Reference earlier planting subtly — readers should feel the callback

HOOK:
- Final paragraphs must create the specified hook type
- Cliffhanger: Action interrupted, danger imminent, outcome unknown
- Question: Mystery raised, information withheld, reader needs to know
- Revelation: Truth revealed with implications that demand exploration
- Emotional: Powerful feeling that resonates, demands resolution
- Decision: Choice presented, stakes clear, outcome uncertain

LEVEL COMPLIANCE:
- Follow the prose guidance exactly
- Sentence length, vocabulary, subtext handling per guidelines
- This is for language learners — clarity matters

## Output Format

Respond with a JSON object:

{
  "chapter": {
    "number": {{chapter_number}},
    "title": "{{chapter_title}}",
    "content": "The full chapter prose in {{target_language}}..."
  },
  "summary": {
    "events": [
      "Brief description of event 1",
      "Brief description of event 2",
      "Brief description of event 3"
    ],
    "characterStates": {
      "{{protagonist_name}}": "Emotional/situational state at chapter end",
      "{{love_interest_name}}": "Emotional/situational state at chapter end"
    },
    "relationshipState": "Where the romantic relationship stands now",
    "reveals": [
      "Any new information revealed this chapter"
    ],
    "seedsPlanted": [
      "Any foreshadowing seeds planted"
    ],
    "seedsPaid": [
      "Any foreshadowing seeds that paid off"
    ],
    "locationEnd": "Where POV character is at chapter end",
    "timeElapsed": "How much story time this chapter covered"
  },
  "metadata": {
    "wordCount": number,
    "beatsCovered": [
      "Beat 1 description",
      "Beat 2 description"
    ],
    "hookDelivered": "Description of how chapter ends",
    "hookType": "cliffhanger | question | revelation | emotional | decision"
  }
}

IMPORTANT: The "content" field must contain the complete chapter prose in {{target_language}}. This is the actual story text readers will see. Write it as a proper chapter — not an outline, not a summary, but full narrative prose with scenes, dialogue, and interiority.
```

---

## User Prompt Template

```
STORY BIBLE:

Genre: {{genre}}
Theme: {{theme}}
Tone: {{tone}}
Heat Level: {{heat_level}}
Timespan: {{timespan}}

Setting: {{setting_summary}}
Key Location This Chapter: {{chapter_location}}
{{#if secondary_location}}Secondary Location: {{secondary_location}}{{/if}}
Sensory Focus: {{sensory_focus}}

CENTRAL CONFLICT:
External: {{external_conflict}}
Internal: {{internal_conflict}}

---

POV CHARACTER THIS CHAPTER: {{pov_character}}

Psychology:
- Want: {{external_want}}
- Need: {{internal_need}}
- Flaw: {{fatal_flaw}}
- Fear: {{fear}}
- Lie they believe: {{lie}}
- Arc position: {{arc_position_this_chapter}}

Voice Profile:
- Speech patterns: {{speech_patterns}}
- Verbal tics: {{verbal_tics}}
- Vocabulary level: {{vocabulary_level}}
- Emotional expression: {{emotional_expression}}
- Topics they avoid: {{topics_avoided}}
- Humor style: {{humor_style}}

{{#if other_characters_present}}
---

OTHER CHARACTERS IN THIS CHAPTER:

{{#each other_characters}}
{{name}}:
- Role: {{role}}
- Voice: {{voice_brief}}
- Relationship to POV: {{relationship}}
{{/each}}
{{/if}}

---

CHAPTER {{chapter_number}}: {{chapter_title}}

Story Time: {{story_time}}
{{#if time_since_last}}({{time_since_last}} since last chapter){{/if}}

Plot Threads Active:
- Main: {{main_plot_beat}}
{{#if subplot_a}}- Subplot A: {{subplot_a}}{{/if}}
{{#if subplot_b}}- Subplot B: {{subplot_b}}{{/if}}

BEATS TO HIT (in order):
{{#each beats}}
{{@index}}. {{this}}
{{/each}}

Emotional Arc:
- Opens: {{opening_state}}
- Closes: {{closing_state}}

{{#if phase_4_moment}}
KEY MOMENT: This chapter contains "{{phase_4_moment}}" — a pivotal relationship moment. Give it weight.
{{/if}}

FORESHADOWING:
{{#if seeds_to_plant}}
Plant these seeds (weave naturally):
{{#each seeds_to_plant}}
- {{this}}
{{/each}}
{{/if}}
{{#if seeds_to_pay}}
Pay off these seeds (callback to earlier):
{{#each seeds_to_pay}}
- {{this}}
{{/each}}
{{/if}}

CHAPTER ENDING:
Hook Type: {{hook_type}}
Hook Description: {{hook_description}}

Tension Rating: {{tension_rating}}/10
Target Word Count: {{word_count_min}}-{{word_count_max}} words

---

PREVIOUS CONTEXT:

{{#if previous_summaries}}
{{#each previous_summaries}}
Chapter {{number}} Summary:
{{summary}}

{{/each}}
{{else}}
This is Chapter 1. No previous context.
{{/if}}

---

LEVEL: {{level}}

PROSE GUIDANCE:
{{prose_guidance}}

---

Write Chapter {{chapter_number}} now. Full prose in {{target_language}}. Hit every beat. End with the {{hook_type}} hook. Stay within {{word_count_min}}-{{word_count_max}} words.
```

---

## Variable Definitions

| Variable | Source | Example |
|----------|--------|---------|
| `target_language` | User's learning language | "Spanish" |
| `genre` | Phase 1 | "Romance" |
| `theme` | Phase 1 | "Love as rebellion against inherited fate" |
| `tone` | Phase 1 | "Balanced lightness, witty humor, warm sensuality, bittersweet mood" |
| `heat_level` | Phase 1 | "Warm (fade-to-black)" |
| `timespan` | Phase 1 | "8 months (spring through autumn)" |
| `setting_summary` | Phase 2 (condensed) | "1920s coastal Galicia. Rigid class structure..." |
| `chapter_location` | Phase 6 | "The ruins at Punta da Vela" |
| `secondary_location` | Phase 6 (if any) | null |
| `sensory_focus` | Phase 6 | "Tactile (wind, cold stone), auditory (Atlantic below)" |
| `external_conflict` | Phase 1 | "Class structure, fishing rights control..." |
| `internal_conflict` | Phase 1 | "She believes wanting is dangerous..." |
| `pov_character` | Phase 6 | "Iria Mariño" |
| `external_want` | Phase 3 | "Security for her family" |
| `internal_need` | Phase 3 | "To believe she deserves more" |
| `fatal_flaw` | Phase 3 | "Self-denial" |
| `fear` | Phase 3 | "Wanting something and losing it" |
| `lie` | Phase 3 | "Desire is dangerous" |
| `arc_position_this_chapter` | Derived from Phase 3 arc + chapter position | "Midpoint — tasted possibility, terrified of wanting" |
| `speech_patterns` | Phase 3 | "Terse, practical, short sentences" |
| `verbal_tics` | Phase 3 | "'Look—' when cornered, 'It doesn't matter'" |
| `vocabulary_level` | Phase 3 | "Limited but precise" |
| `emotional_expression` | Phase 3 | "Suppresses externally, storms internally" |
| `topics_avoided` | Phase 3 | "Her father, the future, what she wants" |
| `humor_style` | Phase 3 | "Dry, observational" |
| `other_characters` | Phase 3 + Phase 6 | Characters present this chapter |
| `chapter_number` | Phase 6 | 14 |
| `chapter_title` | Phase 6 | "The Ruins" |
| `story_time` | Phase 6 | "May, Week 2 — Late spring" |
| `time_since_last` | Derived | "3 days" |
| `main_plot_beat` | Phase 6 | "First Threshold — first kiss" |
| `subplot_a` | Phase 6 (if active) | null |
| `subplot_b` | Phase 6 (if active) | null |
| `beats` | Phase 6 | ["Iria walks to ruins at night...", "Alberte already there...", ...] |
| `opening_state` | Phase 6 | "Terrified anticipation" |
| `closing_state` | Phase 6 | "Irrevocably changed" |
| `phase_4_moment` | Phase 6 | "first_intimate_moment (kiss)" |
| `seeds_to_plant` | Phase 6 | [] |
| `seeds_to_pay` | Phase 6 | ["Wild fennel — he picks it, she notices"] |
| `hook_type` | Phase 6 | "emotional" |
| `hook_description` | Phase 6 | "Walking home, she touches her lips. Still feels him." |
| `tension_rating` | Phase 6 | 7 |
| `word_count_min` | Derived from tension | 2200 |
| `word_count_max` | Derived from tension | 2800 |
| `previous_summaries` | Stored from prior chapters | Array of summary objects |
| `level` | User setting | "Intermediate" |
| `prose_guidance` | Phase 7 | "Sentence length 12-18 words avg..." |

---

## Word Count Derivation

| Tension | Min | Max |
|---------|-----|-----|
| 3-4 | 1800 | 2200 |
| 5-6 | 2000 | 2500 |
| 7-8 | 2200 | 2800 |
| 9-10 | 2800 | 3500 |

---

## Summary Compression for Previous Context

### Chapters 1-5 (Recent): Full Summary
Include complete summary object as stored.

### Chapters 6+: Compressed Format
```
Ch {{number}} ({{pov}}): {{one_sentence_events}}. {{relationship_state}}. {{key_reveal_if_any}}.
```

Example:
```
Ch 10 (Alberte): Met Iria at cliffs, talked about feeling trapped, picked wild fennel. Growing attraction acknowledged internally.
```

### Chapters 15+: Ultra-Compressed Format
```
Ch {{number}}: {{bare_facts}}
```

Example:
```
Ch 3: First meeting at market. Mutual dismissal with spark of interest.
```

---

## Post-Generation Validation

After receiving output, validate:

| Check | Method | Pass Condition |
|-------|--------|----------------|
| JSON valid | Parse attempt | Parses without error |
| Content present | Check field | `chapter.content` is string > 1000 chars |
| Word count | Count words in content | Within min-max range |
| Language correct | Language detection | Matches target_language |
| Beats covered | Compare metadata.beatsCovered to input beats | All beats present |
| Hook type matches | Compare metadata.hookType to input | Types match |
| Summary complete | Check all summary fields | No null/empty required fields |

### If Validation Fails:

| Failure | Action |
|---------|--------|
| JSON parse error | Retry with "respond in valid JSON" |
| Content too short | Retry with "expand scenes, add detail" |
| Content too long | Accept (long is better than short) |
| Wrong language | Retry with language emphasis |
| Missing beats | Retry with "ensure you include: [missing beats]" |
| Wrong hook type | Retry ending only: "rewrite final 300 words with {{hook_type}} hook" |
| Missing summary fields | Retry with "complete all summary fields" |

---

## Example: Chapter 14 Generation

### Input (abbreviated):

```
POV CHARACTER THIS CHAPTER: Iria Mariño

Psychology:
- Want: Security for her family
- Need: To believe she deserves more
- Flaw: Self-denial
- Lie: Desire is dangerous
- Arc position: Midpoint — has tasted possibility, terrified of wanting

Voice Profile:
- Speech patterns: Terse, practical, short sentences
- Verbal tics: 'Look—' when cornered, 'It doesn't matter'
- Emotional expression: Suppresses externally, storms internally

OTHER CHARACTERS: Alberte (present throughout)

CHAPTER 14: The Ruins

Story Time: May, Week 2 (3 days since last chapter)

BEATS TO HIT:
1. Iria makes the dangerous walk to the ruins at night
2. Alberte is already there — tonight feels different, charged
3. They talk about fear — she admits she's terrified of wanting this
4. He admits he's terrified of failing her
5. Silence. Wind. The weight of what they haven't said.
6. First kiss — desperate, terrified, undeniable
7. They break apart, shaking. Sit apart until fear passes.

KEY MOMENT: This chapter contains "first_intimate_moment (kiss)"

FORESHADOWING:
Pay off: Wild fennel — he picks it, she notices (planted Ch 10)

CHAPTER ENDING:
Hook Type: emotional
Hook: Walking home, she touches her lips. Still feels him. 'What have I done?' But she's smiling.

Tension: 7/10
Target: 2200-2800 words

LEVEL: Intermediate
PROSE GUIDANCE: Sentence length 12-18 words avg. Some subtext allowed but key meaning clear. Emotional nuance through showing and telling.
```

### Expected Output Structure:

```json
{
  "chapter": {
    "number": 14,
    "title": "The Ruins",
    "content": "[Full chapter prose in Spanish, 2200-2800 words, hitting all 7 beats, ending with emotional hook, written in Iria's terse internal voice, with the first kiss given proper weight, fennel callback woven naturally, Intermediate level prose...]"
  },
  "summary": {
    "events": [
      "Iria walked to Punta da Vela at night",
      "Admitted fear of wanting to Alberte",
      "First kiss happened"
    ],
    "characterStates": {
      "Iria": "Irrevocably changed — terrified but unable to deny what happened",
      "Alberte": "Hopeful but aware of the weight of what they've started"
    },
    "relationshipState": "First kiss — attraction fully acknowledged, no going back",
    "reveals": [],
    "seedsPlanted": [],
    "seedsPaid": ["Wild fennel callback — he was holding it, she noticed"],
    "locationEnd": "Walking home from ruins",
    "timeElapsed": "One evening"
  },
  "metadata": {
    "wordCount": 2456,
    "beatsCovered": [
      "Dangerous night walk",
      "Charged atmosphere",
      "Fear conversation",
      "His fear of failing her",
      "Weighted silence",
      "First kiss",
      "Breaking apart, sitting apart"
    ],
    "hookDelivered": "Final lines: She touched her lips walking home, still feeling him, asking 'What have I done?' while smiling",
    "hookType": "emotional"
  }
}
```

---

## Notes for Claude Code

- Parse output as JSON
- Store `chapter.content` in Firestore chapter document
- Store `summary` for next chapter's context
- Store `metadata.wordCount` for tracking
- Validate all checks before saving
- If validation fails, retry per table (max 2 retries)
- If still failing after retries, flag for review, save partial
- Stream content to UI during generation for UX
- Deduct user budget only after successful validation
