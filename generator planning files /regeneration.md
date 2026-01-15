# Regeneration Prompt

## Purpose
Targeted fixes for chapters that failed validation. Rather than regenerating the entire chapter, this prompt fixes specific issues while preserving what worked.

---

## When to Use

| Validation Failure | Regeneration Type |
|--------------------|-------------------|
| Missing beats | Full regeneration with beat emphasis |
| Wrong hook type | Ending-only regeneration |
| Too short | Expansion regeneration |
| Voice drift | Full regeneration with voice emphasis |
| Continuity error | Partial regeneration (affected section) |
| Wrong language | Full regeneration with language emphasis |
| Missing foreshadowing | Partial regeneration (weave in seed) |

---

## Regeneration Types

### 1. Full Regeneration
Regenerate entire chapter with adjusted emphasis. Used when core issues affect the whole chapter.

### 2. Ending-Only Regeneration
Keep everything except final ~300 words. Used when hook is wrong but chapter body is good.

### 3. Expansion Regeneration
Keep existing content, expand thin sections. Used when word count is under target.

### 4. Partial Regeneration
Regenerate specific section while preserving rest. Used for localized fixes.

---

## System Prompt (Full Regeneration)

```
You are revising a chapter that failed quality validation. The previous attempt had specific issues that must be fixed.

You will receive:
- The original generation prompt (all context)
- The previous output that failed
- Specific issues to fix
- What worked (preserve these elements)

Your job is to write a complete new version that:
1. Fixes all identified issues
2. Preserves elements that worked
3. Meets all original requirements

Do not simply patch — write a fresh chapter that addresses the problems while maintaining quality.
```

---

## User Prompt Template (Full Regeneration)

```
ORIGINAL REQUIREMENTS:
{{original_chapter_prompt}}

---

PREVIOUS OUTPUT THAT FAILED:

{{previous_content}}

---

VALIDATION ISSUES:

{{#each issues}}
- {{type}}: {{description}}
{{/each}}

---

WHAT WORKED (preserve these):

{{#each preserved}}
- {{this}}
{{/each}}

---

SPECIFIC FIXES REQUIRED:

{{#each fixes}}
{{@index}}. {{this}}
{{/each}}

---

Regenerate the complete chapter. Fix all issues. Preserve what worked. Output in same JSON format as original.
```

---

## System Prompt (Ending-Only)

```
You are rewriting only the ending of a chapter. The body of the chapter is good, but the hook doesn't land correctly.

You will receive:
- The chapter content up to the final section
- The required hook type
- What the ending should accomplish

Write ONLY the new ending (final 200-400 words) that:
1. Flows naturally from the preserved content
2. Delivers the correct hook type
3. Ends the chapter with the right emotional note

Do not rewrite anything before the cut point.
```

---

## User Prompt Template (Ending-Only)

```
CHAPTER CONTENT (preserve everything up to the cut):

{{content_to_preserve}}

[CUT POINT — rewrite from here]

---

REQUIRED HOOK:
Type: {{hook_type}}
Description: {{hook_description}}

EMOTIONAL STATE AT END:
{{closing_state}}

---

Write the new ending (200-400 words). Start exactly where the cut point is. Deliver a {{hook_type}} hook.

Output format:
{
  "new_ending": "The rewritten ending text...",
  "hookDelivered": "Description of how hook lands"
}
```

---

## System Prompt (Expansion)

```
You are expanding a chapter that is too short. The content is good but thin — scenes need more development.

You will receive:
- The current chapter content
- Target word count
- Sections identified as thin
- Expansion guidance

Your job is to:
1. Keep all existing content
2. Expand thin sections with more detail, interiority, and scene development
3. Reach target word count without padding
4. Maintain voice and tone consistency

Do not add new plot events. Expand what's there.
```

---

## User Prompt Template (Expansion)

```
CURRENT CHAPTER:

{{current_content}}

Current word count: {{current_word_count}}
Target word count: {{target_min}}-{{target_max}}

---

THIN SECTIONS TO EXPAND:

{{#each thin_sections}}
{{@index}}. "{{excerpt}}"
   Expansion guidance: {{guidance}}
{{/each}}

---

EXPANSION APPROACH:
- Add interiority (what POV character thinks/feels)
- Add sensory detail (what they see/hear/smell/touch)
- Add micro-actions (small physical movements)
- Extend dialogue exchanges (another beat or two)
- Deepen emotional moments (let them breathe)

Do NOT:
- Add new plot events
- Add new characters
- Change what happens
- Pad with filler

---

Expand the chapter to {{target_min}}-{{target_max}} words. Output complete expanded chapter in same JSON format.
```

---

## System Prompt (Partial — Section Fix)

```
You are fixing a specific section of a chapter. Most of the chapter is good, but one section has a problem.

You will receive:
- Content before the problem section
- The problem section
- Content after the problem section
- What's wrong and how to fix it

Write ONLY the replacement section that:
1. Fixes the identified problem
2. Flows naturally from what comes before
3. Connects smoothly to what comes after
4. Maintains voice and tone
```

---

## User Prompt Template (Partial)

```
CONTENT BEFORE (preserve exactly):

{{content_before}}

---

PROBLEM SECTION (replace this):

{{problem_section}}

ISSUE: {{issue_description}}
FIX: {{fix_instruction}}

---

CONTENT AFTER (must connect to):

{{content_after}}

---

Write the replacement section. Must flow from "before" and connect to "after."

Output format:
{
  "replacement_section": "The fixed section text..."
}
```

---

## Issue-Specific Fix Instructions

### Missing Beats

```
FIXES REQUIRED:
1. The following beats were missing from previous output:
{{#each missing_beats}}
   - {{this}}
{{/each}}

2. Ensure ALL beats appear in regenerated chapter
3. Beats should flow naturally, not feel inserted
4. Keep beats in specified order
```

### Voice Drift

```
FIXES REQUIRED:
1. POV character's voice drifted from their profile
2. Review voice profile:
   - Speech patterns: {{speech_patterns}}
   - Verbal tics: {{verbal_tics}}
   - Vocabulary level: {{vocabulary_level}}
   - Emotional expression: {{emotional_expression}}
   
3. Internal monologue must sound like {{pov_character}}, not generic narrator
4. Dialogue must use their patterns
5. Especially watch: {{specific_drift_noted}}
```

### Continuity Error

```
FIXES REQUIRED:
1. Continuity error detected: {{error_description}}
2. Correct state from previous chapter:
   - {{character}}'s location: {{correct_location}}
   - {{character}}'s emotional state: {{correct_state}}
   - {{character}} knows: {{what_they_know}}
   - {{character}} does NOT know: {{what_they_dont_know}}
   
3. Fix the error while preserving scene intent
4. Ensure characters act on correct information
```

### Wrong Hook Type

```
FIXES REQUIRED:
1. Chapter ended with {{actual_hook_type}} hook instead of {{required_hook_type}}
2. Required hook: {{hook_description}}
3. Rewrite ending to deliver {{required_hook_type}}:
   {{#if cliffhanger}}- End mid-action, danger present, outcome unknown{{/if}}
   {{#if question}}- Raise mystery, withhold answer, reader must know{{/if}}
   {{#if revelation}}- Reveal truth with implications demanding exploration{{/if}}
   {{#if emotional}}- Land powerful feeling that resonates and demands resolution{{/if}}
   {{#if decision}}- Present choice, stakes clear, outcome uncertain{{/if}}
```

### Missing Foreshadowing

```
FIXES REQUIRED:
1. Foreshadowing seed was not planted: {{seed_description}}
2. This seed must appear in this chapter for later payoff in Ch {{payoff_chapter}}
3. Weave naturally — scene serves story first, seed is incidental detail
4. Seed should be:
   - Noticeable enough to register subconsciously
   - Not so obvious it feels planted
   - Connected to scene action or setting
```

### Level Inappropriate

```
FIXES REQUIRED:
1. Prose did not match target level: {{level}}
2. Issues detected:
   {{#each level_issues}}
   - {{this}}
   {{/each}}
3. Level requirements:
   - Sentence length: {{sentence_target}}
   - Vocabulary: {{vocabulary_guidance}}
   - Subtext handling: {{subtext_guidance}}
4. Regenerate with strict level compliance
```

---

## Regeneration Limits

| Attempt | Action |
|---------|--------|
| 1st regeneration | Apply targeted fix |
| 2nd regeneration | Apply fix with stronger emphasis |
| 3rd failure | Flag for human review, save best attempt |

Never loop infinitely. After 2 regenerations, accept best version and flag.

---

## Output Validation

After regeneration, run same validation as original:

| Check | Pass Condition |
|-------|----------------|
| Original issue fixed | Specific problem resolved |
| No new issues | Didn't break something else |
| Word count | Still in range |
| Hook present | Correct type delivered |
| Beats covered | All present |

If regeneration introduces new issues, weigh severity:
- New issue less severe than original → Accept
- New issue equally/more severe → Try different fix approach
- Circular issues → Flag for human review

---

## Notes for Claude Code

- Track regeneration count per chapter
- Store all attempts (for debugging/refinement)
- Use most targeted regeneration type possible (ending-only > full)
- Pass previous output to model so it knows what to preserve
- If same issue persists after 2 tries, the template may need refinement — log for review
- Deduct budget only for successful final output, not failed attempts
