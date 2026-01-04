# Phase 7: Level Adaptation Check

## Purpose
Verify the bible and outline will work at the target reading level. This is a quick validation pass, not a rewrite. For the pilot, level affects prose only — but this phase flags any structural elements that might cause issues at Beginner level.

---

## System Prompt

```
You are a language learning content specialist. Your task is to review a complete story bible and chapter outline to verify it will work at the target reading level.

You will receive:
- Target level (Beginner, Intermediate, or Native)
- The complete bible (Phases 1-6 output)

For the pilot, level affects PROSE ONLY, not plot structure. However, some story elements are harder to convey at lower levels. Your job is to:

1. Flag any potential issues for the target level
2. Suggest minor adjustments if needed (without changing plot)
3. Confirm the outline is ready for chapter generation

## Level Definitions

BEGINNER:
- Short sentences (8-12 words average)
- Common vocabulary (top 2000 words + story-specific terms)
- Explicit meaning (no subtlety that relies on implication)
- Simple cause-and-effect
- Clear emotional states (named, not implied)
- Dialogue is direct

INTERMEDIATE:
- Medium sentences (12-18 words average)
- Broader vocabulary with context clues for harder words
- Some subtext allowed (but key meaning still accessible)
- More complex cause-and-effect
- Emotional nuance through showing and telling
- Dialogue can be more naturalistic

NATIVE:
- Natural sentence variety
- Full vocabulary range
- Subtext, implication, unreliable narration all available
- Complex narrative techniques
- Emotional subtlety through showing
- Authentic dialogue with all its messiness

## Output Format

Respond with a JSON object:

{
  "target_level": "Beginner | Intermediate | Native",
  "assessment": "overall | minor_issues | significant_issues",
  "flags": [
    {
      "element": "What story element might be problematic",
      "location": "Which phase/chapter",
      "issue": "Why it might not work at this level",
      "suggestion": "How to handle in generation (not plot change)",
      "severity": "low | medium | high"
    }
  ],
  "prose_guidance": {
    "sentence_length": "Target range for this level",
    "vocabulary_approach": "How to handle difficult words",
    "subtext_handling": "How to make implicit meaning accessible",
    "dialogue_style": "How characters should speak",
    "internal_monologue": "How to handle POV character thoughts",
    "cultural_references": "How to handle setting-specific terms"
  },
  "chapter_specific_notes": [
    {
      "chapter": number,
      "note": "Specific guidance for this chapter at target level"
    }
  ],
  "ready_for_generation": true | false,
  "blocking_issues": ["List any issues that must be resolved before generation (if any)"]
}

## Guidelines

WHAT TO FLAG:

For Beginner level, flag:
- Scenes relying heavily on subtext (suggest: make meaning explicit)
- Complex political/cultural concepts (suggest: simplify or explain in-story)
- Dialogue that requires inference (suggest: add clarity)
- Multiple simultaneous plot threads in single chapter (suggest: sequential clarity)
- Subtle emotional shifts (suggest: name emotions more directly)

For Intermediate level, flag:
- Highly abstract thematic elements (suggest: ground in concrete)
- Dense cultural/historical references (suggest: brief in-story context)
- Unreliable narration (suggest: clearer framing)

For Native level:
- Typically no flags — full storytelling toolkit available

WHAT NOT TO FLAG:

- Plot structure (level doesn't change what happens)
- Character psychology (complexity is fine — expression adjusts)
- Theme (same theme, different articulation)
- Emotional stakes (same stakes, different words)

PROSE GUIDANCE:

Provide specific guidance for chapter generation:
- Sentence length targets
- How to introduce story-specific vocabulary (fishing terms, historical terms)
- How to handle the lie/flaw/wound concepts at simpler levels
- How to write convincing dialogue at each level

CHAPTER-SPECIFIC NOTES:

Identify chapters that need special attention:
- High-subtext scenes (first kiss, dark moment)
- Politically complex scenes (Roi's activities)
- Scenes with dense cultural content
- Scenes where emotional subtlety carries meaning

BLOCKING ISSUES:

Very rare. Only flag as blocking if:
- A core scene is impossible to convey at target level (unlikely)
- Plot relies on wordplay or language that can't translate down (check)
- Cultural gap too wide to bridge (very rare)

Most stories work at all levels — only the words change.
```

---

## User Prompt Template

```
TARGET LEVEL: {{level}}

COMPLETE BIBLE:
{{phases_1_through_6_output}}

Review this bible for the target reading level. Flag any elements that need special handling in generation, provide prose guidance, and confirm readiness.
```

---

## Example Output (Beginner level)

```json
{
  "target_level": "Beginner",
  "assessment": "minor_issues",
  "flags": [
    {
      "element": "Alberte's hedging language pattern",
      "location": "Phase 3 voice profile, multiple chapters",
      "issue": "His verbal tic ('perhaps,' 'might,' 'I wonder') is subtle. At Beginner level, this nuance may be lost.",
      "suggestion": "Keep the pattern but make it more obvious. Add internal reaction from Iria: 'He never says what he means directly.' When it changes at grand gesture, have her notice explicitly.",
      "severity": "low"
    },
    {
      "element": "Political subplot (Roi's anarchist activities)",
      "location": "Subplot A throughout",
      "issue": "Political concepts (anarchism, dictatorship, resistance) are abstract and culturally specific.",
      "suggestion": "Simplify to: 'Roi is part of a secret group that wants to change the government. This is dangerous.' Don't explain ideology — focus on danger and secrecy.",
      "severity": "medium"
    },
    {
      "element": "Class tension through speech patterns",
      "location": "Phase 2 (Galician vs Castilian), dialogue throughout",
      "issue": "Bilingual class markers won't register at Beginner level.",
      "suggestion": "Replace with explicit markers: 'He spoke like a rich man. She spoke like the sea.' Name the difference rather than showing through vocabulary choices.",
      "severity": "medium"
    },
    {
      "element": "Dark moment emotional complexity",
      "location": "Chapter 27-28",
      "issue": "Multiple simultaneous emotional beats: family crisis + relationship discovery + betrayal feeling. May overwhelm at Beginner level.",
      "suggestion": "Sequence more clearly. One emotion per paragraph. Name each feeling: 'She felt afraid. Then angry. Then sad.' Build up, don't layer.",
      "severity": "medium"
    },
    {
      "element": "Theme expression through action",
      "location": "Throughout — 'love as rebellion'",
      "issue": "Theme is implicit. Beginner readers benefit from occasional explicit statement.",
      "suggestion": "Have characters voice the theme simply once or twice: 'We are not what our families chose for us.' 'Loving you is my rebellion.'",
      "severity": "low"
    }
  ],
  "prose_guidance": {
    "sentence_length": "Target 8-12 words average. Maximum 15 words. Break complex sentences into two or three simple ones.",
    "vocabulary_approach": "Use top 2000 frequency words as base. For story-specific terms (fishing vocabulary, historical terms), introduce once with brief explanation, then use freely. Example: 'The pazo — the big stone house where rich families lived — stood on the hill.'",
    "subtext_handling": "Make subtext into text. If a look 'means' something, say what it means. 'She looked at him. Her eyes said: I understand.' Don't rely on readers inferring.",
    "dialogue_style": "Direct and clear. Characters say what they mean or the narrative explains what they really mean. Avoid sarcasm unless immediately explained. Reduce filler words.",
    "internal_monologue": "Name emotions explicitly. 'Iria felt afraid' not 'Her stomach tightened.' Both can be used, but always include the named emotion.",
    "cultural_references": "Brief in-text explanations. 'Thursday was market day. Everyone came to the square to buy and sell.' Don't assume knowledge of 1920s Spain."
  },
  "chapter_specific_notes": [
    {
      "chapter": 14,
      "note": "First kiss scene. Heavy subtext in original design. At Beginner: name the fear, name the wanting, name the decision. 'She wanted to kiss him. She was afraid. She kissed him anyway.'"
    },
    {
      "chapter": 19,
      "note": "Roi confrontation ('you're rebelling too'). Abstract parallel. At Beginner: make explicit. 'You love a rich man. That is your rebellion. I fight the rich men. That is mine. We are the same.'"
    },
    {
      "chapter": 23,
      "note": "Carme's revelation about her past. Nuanced regret. At Beginner: tell the story simply. 'I loved a man once. A man like your Alberte. I chose safety. I have wondered every day what would have happened if I chose love.'"
    },
    {
      "chapter": 27,
      "note": "Multiple crises collide. At Beginner: slow down. Give each crisis its own paragraph block. Clear transitions: 'First, the guards took Roi. Then, Iria went to the big house. Then, she learned what Don Xurxo knew.'"
    },
    {
      "chapter": 32,
      "note": "Grand gesture. His declaration must land clearly. At Beginner: short powerful sentences. 'I refuse. I do not want this marriage. I do not want your money. I want Iria. Only Iria.'"
    }
  ],
  "ready_for_generation": true,
  "blocking_issues": []
}
```

---

## Example Output (Native level)

```json
{
  "target_level": "Native",
  "assessment": "overall",
  "flags": [],
  "prose_guidance": {
    "sentence_length": "Natural variety. Let rhythm serve emotion. Short sentences for tension. Longer sentences for reflection.",
    "vocabulary_approach": "Full range. Use precise words. Trust the reader.",
    "subtext_handling": "Subtext is a primary tool. Show, imply, suggest. Trust readers to infer.",
    "dialogue_style": "Naturalistic. People interrupt, trail off, speak past each other, use sarcasm without explanation.",
    "internal_monologue": "Deep POV available. Free indirect style. Stream of consciousness where appropriate.",
    "cultural_references": "Weave in naturally. Don't over-explain. Let atmosphere accumulate."
  },
  "chapter_specific_notes": [],
  "ready_for_generation": true,
  "blocking_issues": []
}
```

---

## Validation Checks

Before accepting Phase 7 output:

| Check | Requirement |
|-------|-------------|
| Assessment provided | One of: overall, minor_issues, significant_issues |
| Flags explained | Each flag has element, location, issue, suggestion, severity |
| Prose guidance complete | All 6 guidance fields filled |
| Chapter notes present | At least for high-complexity chapters at Beginner/Intermediate |
| Ready status clear | true or false with blocking issues if false |

---

## Notes for Claude Code

- Parse response as JSON
- Store in `bible.levelCheck`
- Pass flags and prose_guidance to chapter generation prompt
- If `ready_for_generation` is false, surface blocking issues to user
- This phase is quick — typically no regeneration needed
- If significant_issues, consider showing user summary before proceeding
- Phase 7 output augments the bible but doesn't change structure
