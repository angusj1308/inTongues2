# Phase 8: Validation

## Purpose
Comprehensive validation of the entire bible before chapter generation begins. This phase checks for coherence, completeness, and internal consistency across all previous phases. Nothing generates until Phase 8 passes.

---

## System Prompt

```
You are a story validation specialist. Your task is to perform a comprehensive audit of a complete story bible, checking for coherence, completeness, and internal consistency.

You will receive:
- The complete bible (Phases 1-7 output)

Your job is to:
1. Validate every element against every other element
2. Identify any gaps, contradictions, or missing pieces
3. Flag issues with specific locations and severity
4. Recommend recovery paths for any failures
5. Approve for generation OR specify what needs fixing

This is the final gate. Be thorough. A problem caught here saves 35 chapters of broken story.

## Validation Categories

You must check ALL of the following:

### 1. CHARACTER ARCS
- Every principal character arc has setup in early chapters
- Every arc has transformation moment in chapter breakdown
- Every arc has payoff in final chapters
- Arc progression is visible across chapter emotional states

### 2. SUBPLOT RESOLUTION
- Subplot A has beginning, middle, end in chapter breakdown
- Subplot B has beginning, middle, end in chapter breakdown
- No subplot disappears for more than 5 chapters without reason
- All subplot threads resolve before or during resolution chapters

### 3. CAUSE AND EFFECT
- Every major event has a cause (nothing happens randomly)
- Every cause has a consequence (no dropped threads)
- Character decisions follow from established psychology
- Plot turns are earned by prior setup

### 4. FORESHADOWING INTEGRITY
- Every seed planted in Phase 5 appears in Phase 6 chapter breakdown
- Every payoff in Phase 5 appears in Phase 6 chapter breakdown
- Plant chapters come before payoff chapters
- No orphan seeds (planted but never paid off)
- No orphan payoffs (paid off but never planted)

### 5. TENSION CURVE
- Tension generally rises across story
- Deliberate valleys exist after high-tension chapters
- Peak tension at dark moment (Ch 75-85%)
- Sustained tension through grand gesture
- Resolution drops to peaceful resolution
- No flat sections longer than 2-3 chapters

### 6. CHAPTER HOOKS
- Every single chapter ends with a hook
- Hook types vary (not all cliffhangers)
- Hooks connect to next chapter content
- Final chapter hook provides closure, not cliff

### 7. VOICE DISTINCTION
- Protagonist voice profile is distinct from love interest
- Could identify POV character from dialogue alone
- Supporting cast voices are distinguishable
- Verbal tics and patterns are consistent

### 8. CHEMISTRY ARCHITECTURE
- All Phase 4 pivotal moments appear in Phase 6
- Moments are placed at appropriate story beats
- Relationship stages from Phase 4 map to chapter progression
- Symbolic elements (place, object, gesture, phrase) are planted and paid off

### 9. TIMELINE CONSISTENCY
- Story time elapsed matches Phase 1 timespan
- No impossible time jumps between chapters
- Seasonal markers align with timeline
- Time pressure deadline falls at correct beat
- Character ages consistent throughout

### 10. POV BALANCE
- POV distribution matches Phase 1 structure
- No more than 3 consecutive same-POV chapters
- Critical scenes use appropriate POV (highest stakes character)
- Both principals get sufficient interiority

### 11. THEME EXPRESSION
- Theme from Phase 1 is expressed through character choices
- Theme is not just stated but demonstrated
- Both character arcs serve the theme
- Resolution proves the theme

### 12. LOCATION USAGE
- All chapter locations come from Phase 2 key_locations
- Each key location is used at least once
- Symbolic location (their place) is used for key moments
- Sensory details assigned match location

### 13. CONSTRAINT ENFORCEMENT
- All Phase 2 conflict_constraints appear in story events
- Each constraint has at least one enforcing character or event
- Constraints create real obstacles, not just mentioned
- Constraint consequences are shown, not just threatened

### 14. LEVEL READINESS
- Phase 7 flags are addressable in generation
- No blocking issues remain
- Prose guidance is actionable

## Output Format

Respond with a JSON object:

{
  "validation_status": "PASS | FAIL | CONDITIONAL_PASS",
  "summary": "One paragraph overall assessment",
  "checks": {
    "character_arcs": {
      "status": "pass | fail | warning",
      "details": "Specific findings",
      "issues": ["List of specific issues if any"]
    },
    "subplot_resolution": {
      "status": "pass | fail | warning",
      "details": "Specific findings",
      "issues": []
    },
    "cause_and_effect": {
      "status": "pass | fail | warning",
      "details": "Specific findings",
      "issues": []
    },
    "foreshadowing_integrity": {
      "status": "pass | fail | warning",
      "details": "Specific findings",
      "issues": []
    },
    "tension_curve": {
      "status": "pass | fail | warning",
      "details": "Specific findings",
      "issues": []
    },
    "chapter_hooks": {
      "status": "pass | fail | warning",
      "details": "Specific findings",
      "issues": []
    },
    "voice_distinction": {
      "status": "pass | fail | warning",
      "details": "Specific findings",
      "issues": []
    },
    "chemistry_architecture": {
      "status": "pass | fail | warning",
      "details": "Specific findings",
      "issues": []
    },
    "timeline_consistency": {
      "status": "pass | fail | warning",
      "details": "Specific findings",
      "issues": []
    },
    "pov_balance": {
      "status": "pass | fail | warning",
      "details": "Specific findings",
      "issues": []
    },
    "theme_expression": {
      "status": "pass | fail | warning",
      "details": "Specific findings",
      "issues": []
    },
    "location_usage": {
      "status": "pass | fail | warning",
      "details": "Specific findings",
      "issues": []
    },
    "constraint_enforcement": {
      "status": "pass | fail | warning",
      "details": "Specific findings",
      "issues": []
    },
    "level_readiness": {
      "status": "pass | fail | warning",
      "details": "Specific findings",
      "issues": []
    }
  },
  "critical_issues": [
    {
      "issue": "Description of critical issue",
      "location": "Which phase/chapter",
      "impact": "What breaks if not fixed",
      "fix": "Recommended fix",
      "regenerate_from": "Phase X"
    }
  ],
  "warnings": [
    {
      "issue": "Description of warning",
      "location": "Which phase/chapter",
      "recommendation": "Suggested improvement"
    }
  ],
  "recovery_plan": {
    "required_regenerations": ["Phase X", "Phase Y"],
    "regeneration_order": "Which phase to regenerate first",
    "specific_instructions": "What to fix in regeneration"
  },
  "generation_ready": true | false,
  "approval_notes": "Final notes for chapter generation if approved"
}

## Severity Levels

PASS: Check fully satisfied. No issues.

WARNING: Minor issue that won't break the story but could be improved. Generation can proceed.

FAIL: Issue that will cause problems in generated chapters. Must be fixed before generation.

## Validation Status

PASS: All checks pass. Ready for generation.

CONDITIONAL_PASS: Some warnings but no failures. Can proceed with noted cautions.

FAIL: One or more critical failures. Must regenerate specified phases before proceeding.

## Recovery Paths

When issues are found, identify the earliest phase where the problem originates:

| Issue Type | Likely Source | Regenerate From |
|------------|---------------|-----------------|
| Fundamental character flaw doesn't drive conflict | Phase 3 | Phase 3 |
| Character arc has no payoff scene | Phase 6 | Phase 6 |
| Subplot disappears without resolution | Phase 5 | Phase 5 |
| Foreshadowing seed missing from chapters | Phase 6 | Phase 6 |
| Chemistry moments misplaced | Phase 6 | Phase 6 |
| Timeline impossible | Phase 6 | Phase 6 |
| Theme not expressed in plot | Phase 5 | Phase 5 |
| Constraint never enforced | Phase 5 or 6 | Phase 5 |
| Location never used | Phase 6 | Phase 6 |
| Voice profiles too similar | Phase 3 | Phase 3 |
| Core conflict doesn't cohere | Phase 1 | Phase 1 (rare) |

If 3+ checks fail: Likely systemic issue. Review Phase 5 first (plot architecture is the integration point).

If failures span multiple phases: Regenerate from earliest failing phase forward.
```

---

## User Prompt Template

```
COMPLETE BIBLE:

PHASE 1 - CORE FOUNDATION:
{{phase_1_output}}

PHASE 2 - WORLD/SETTING:
{{phase_2_output}}

PHASE 3 - CHARACTERS:
{{phase_3_output}}

PHASE 4 - CHEMISTRY:
{{phase_4_output}}

PHASE 5 - PLOT ARCHITECTURE:
{{phase_5_output}}

PHASE 6 - CHAPTER BREAKDOWN:
{{phase_6_output}}

PHASE 7 - LEVEL CHECK:
{{phase_7_output}}

Perform comprehensive validation of this bible. Check all 14 categories. Identify any issues and specify recovery paths. Approve for generation only if the bible is complete and internally consistent.
```

---

## Example Output (PASS)

```json
{
  "validation_status": "PASS",
  "summary": "Bible is complete and internally consistent. All character arcs have setup and payoff. Both subplots resolve appropriately. Foreshadowing seeds are properly planted and paid off. Tension curve follows expected shape with appropriate valleys. All Phase 4 chemistry moments are placed in Phase 6. Timeline is consistent with Phase 1 timespan. Theme is expressed through character choices throughout. Ready for chapter generation.",
  "checks": {
    "character_arcs": {
      "status": "pass",
      "details": "Iria's arc (self-denial → claiming desire) has setup in Ch 1-3, transformation in Ch 31, payoff in Ch 34-35. Alberte's arc (passivity → action) has setup in Ch 2-4, transformation in Ch 32, payoff in Ch 32-35. Both arcs visible in chapter emotional states.",
      "issues": []
    },
    "subplot_resolution": {
      "status": "pass",
      "details": "Subplot A (Roi's rebellion) begins Ch 2, escalates Ch 11/19/26-27, resolves Ch 34. Subplot B (Carme's buried dreams) begins Ch 3, develops Ch 7/12/16/23, resolves Ch 31/35. Neither disappears for more than 4 chapters.",
      "issues": []
    },
    "cause_and_effect": {
      "status": "pass",
      "details": "Major events chain properly: Market meeting → cliff conversations → first kiss → deepening relationship → Roi's arrest triggers discovery → dark moment → grand gesture → resolution. Each event follows from prior setup. Character decisions align with established psychology.",
      "issues": []
    },
    "foreshadowing_integrity": {
      "status": "pass",
      "details": "All 8 seeds from Phase 5 appear in Phase 6: fennel (plant Ch 10, payoff Ch 33), 'it doesn't matter' (plant Ch 2/8/15, payoff Ch 34), market defense (plant Ch 11, payoff Ch 32), hedging language (plant Ch 4/9/14, payoff Ch 32), function-not-names (plant Ch 7/20, payoff Ch 32), learning to write (plant Ch 16, payoff Ch 28), Carme's sentence (plant Ch 3/12, payoff Ch 31), treacherous path (plant Ch 17, payoff Ch 35). No orphans.",
      "issues": []
    },
    "tension_curve": {
      "status": "pass",
      "details": "Tension rises from 3 (Ch 1) through 6-7 (Ch 11-14), valleys at 4-5 (Ch 15-18), escalates to 6-8 (Ch 19-26), peaks at 9 (Ch 27-28), sustains 8-9 (Ch 30-32), resolves to 5-6 (Ch 33-35). Shape matches Phase 5 design. Valleys placed after high-intensity chapters for breathing room.",
      "issues": []
    },
    "chapter_hooks": {
      "status": "pass",
      "details": "All 35 chapters have hooks specified. Mix of types: cliffhanger (8), question (7), emotional (10), revelation (5), decision (5). Final chapter uses emotional closure hook. Hooks connect to subsequent chapter content.",
      "issues": []
    },
    "voice_distinction": {
      "status": "pass",
      "details": "Iria: terse, practical, 'Look—' opener, 'it doesn't matter,' suppressed externally. Alberte: educated, hedging ('perhaps,' 'I wonder'), over-explains. Distinct enough to identify without tags. Supporting cast each have distinguishing traits: Don Xurxo (commands, function-not-names), Carme (proverbs, 'Your father used to say'), Roi (passionate bursts, 'señoritos'), Sabela (pointed questions), Father Anxo (scripture punctuation, sighs).",
      "issues": []
    },
    "chemistry_architecture": {
      "status": "pass",
      "details": "All Phase 4 pivotal moments placed: first_meeting (Ch 3-4), first_real_conversation (Ch 8-9), point_of_no_return (Ch 11), first_intimate_moment (Ch 14), intimacy_milestone (Ch 17-18), dark_moment (Ch 27-28), grand_gesture (Ch 32), resolution (Ch 34-35). Relationship stages map to chapter progression. Symbolic elements tracked: Punta da Vela ruins, wild fennel, hair-tuck gesture, 'Look—' phrase.",
      "issues": []
    },
    "timeline_consistency": {
      "status": "pass",
      "details": "Story spans March Week 1 to October Week 4 = 8 months. Matches Phase 1 timespan exactly. No impossible jumps — longest gap is 1 week (Ch 31-32). Seasonal markers align: spring storms (Ch 1-7), summer heat (Ch 14-22), autumn harvest (Ch 30-35). Time pressure deadline (harvest festival) falls at Ch 32 (grand gesture beat).",
      "issues": []
    },
    "pov_balance": {
      "status": "pass",
      "details": "Iria: 17 chapters (49%), Alberte: 18 chapters (51%). Phase 1 specifies dual-alternating with protagonist anchoring — Iria has Ch 1 and Ch 35. No more than 2 consecutive same-POV chapters. Critical scenes use appropriate POV: dark moment from Iria (most at stake), grand gesture from Alberte (his transformation).",
      "issues": []
    },
    "theme_expression": {
      "status": "pass",
      "details": "Theme 'love as rebellion against inherited fate' expressed through: Iria choosing to want (rebellion against self-denial), Alberte choosing to act (rebellion against passivity/inheritance), Roi's political rebellion (parallel), Carme's un-made rebellion (contrast). Resolution proves theme — both characters have rebelled against their fates and chosen each other.",
      "issues": []
    },
    "location_usage": {
      "status": "pass",
      "details": "All Phase 2 locations used: Mareña docks (Ch 1, 3, 11, 27), Pazo de Soutelo (Ch 7, 20, 27), Thursday market (Ch 3-4, 11), Punta da Vela ruins (Ch 10, 14, 24), Ultramarinos Campos (Ch 6), As Furnas cove (Ch 17-18, 35), Ribeira square (Ch 32). Symbolic location (Punta da Vela) used for first kiss. Final scene at As Furnas (their intimate place).",
      "issues": []
    },
    "constraint_enforcement": {
      "status": "pass",
      "details": "All 6 Phase 2 constraints enforced: Fishing rights (#1) — Don Xurxo's leverage, explicit threat Ch 27. Illiteracy (#2) — Iria learning to write becomes plot point Ch 16/28. Chaperoning (#3) — creates difficulty in meeting, drives secret locations. Engagement (#4) — Sabela's presence, festival deadline. Priest/confession (#5) — Father Anxo's knowledge creates tension. Roi's politics (#6) — triggers crisis Ch 26-27.",
      "issues": []
    },
    "level_readiness": {
      "status": "pass",
      "details": "Phase 7 identified minor issues for Beginner level with clear prose guidance. No blocking issues. All flags are addressable in generation through prose choices. Ready for target level.",
      "issues": []
    }
  },
  "critical_issues": [],
  "warnings": [],
  "recovery_plan": {
    "required_regenerations": [],
    "regeneration_order": "N/A",
    "specific_instructions": "N/A"
  },
  "generation_ready": true,
  "approval_notes": "Bible is complete and internally consistent. Proceed to chapter generation. Use Phase 7 prose guidance for target level. Track foreshadowing seeds during generation to ensure proper placement. Maintain voice distinction per Phase 3 profiles."
}
```

---

## Example Output (FAIL)

```json
{
  "validation_status": "FAIL",
  "summary": "Bible has two critical issues requiring regeneration. Subplot B (Carme's buried dreams) disappears after Chapter 16 and never resolves — her revelation scene and permission scene are missing from chapter breakdown. Additionally, the foreshadowing seed 'Carme's unfinished sentence' is planted but has no payoff chapter specified. These issues would result in an unresolved subplot and broken emotional arc.",
  "checks": {
    "character_arcs": {
      "status": "pass",
      "details": "Principal character arcs complete.",
      "issues": []
    },
    "subplot_resolution": {
      "status": "fail",
      "details": "Subplot B appears in Ch 3, 7, 12, 16 then disappears. No resolution scenes in chapter breakdown.",
      "issues": [
        "Carme's revelation scene (Phase 5: Ch 23) missing from Phase 6 breakdown",
        "Carme's permission scene (Phase 5: Ch 31) missing from Phase 6 breakdown",
        "Carme's witness moment (Phase 5: Ch 35) missing from Phase 6 breakdown"
      ]
    },
    "cause_and_effect": {
      "status": "warning",
      "details": "Mostly solid but Iria's choice in resolution lacks emotional setup if Carme's permission scene is missing.",
      "issues": [
        "Resolution feels unearned without Subplot B payoff"
      ]
    },
    "foreshadowing_integrity": {
      "status": "fail",
      "details": "7 of 8 seeds properly tracked. One orphan.",
      "issues": [
        "Seed 'Carme's unfinished sentence' planted Ch 3/12 but no payoff chapter in Phase 6"
      ]
    },
    "tension_curve": {
      "status": "pass",
      "details": "Tension shape is correct.",
      "issues": []
    },
    "chapter_hooks": {
      "status": "pass",
      "details": "All chapters have hooks.",
      "issues": []
    },
    "voice_distinction": {
      "status": "pass",
      "details": "Voices are distinct.",
      "issues": []
    },
    "chemistry_architecture": {
      "status": "pass",
      "details": "All pivotal moments placed.",
      "issues": []
    },
    "timeline_consistency": {
      "status": "pass",
      "details": "Timeline is consistent.",
      "issues": []
    },
    "pov_balance": {
      "status": "pass",
      "details": "POV balance is appropriate.",
      "issues": []
    },
    "theme_expression": {
      "status": "warning",
      "details": "Theme expression weakened without Carme subplot resolution — loses the 'contrast' element.",
      "issues": [
        "Carme's unfinished rebellion is a key thematic contrast. Without her scenes, theme loses dimension."
      ]
    },
    "location_usage": {
      "status": "pass",
      "details": "All locations used.",
      "issues": []
    },
    "constraint_enforcement": {
      "status": "pass",
      "details": "All constraints enforced.",
      "issues": []
    },
    "level_readiness": {
      "status": "pass",
      "details": "Level guidance is adequate.",
      "issues": []
    }
  },
  "critical_issues": [
    {
      "issue": "Subplot B (Carme's buried dreams) has no resolution in chapter breakdown",
      "location": "Phase 6 — missing Ch 23, 31, 35 subplot beats",
      "impact": "Unresolved subplot. Iria's choice feels unearned. Theme weakened.",
      "fix": "Add Subplot B beats to Ch 23 (revelation), Ch 31 (permission), Ch 35 (witness)",
      "regenerate_from": "Phase 6"
    },
    {
      "issue": "Foreshadowing seed 'Carme's unfinished sentence' has no payoff",
      "location": "Phase 6 — seed planted Ch 3/12 but no payoff chapter",
      "impact": "Orphan foreshadowing. Setup with no payoff.",
      "fix": "Add payoff in Ch 31 (when Carme finally finishes the sentence)",
      "regenerate_from": "Phase 6"
    }
  ],
  "warnings": [
    {
      "issue": "Theme expression relies on Carme subplot for contrast dimension",
      "location": "Throughout",
      "recommendation": "Ensure Carme's scenes are restored — they're not optional for theme"
    }
  ],
  "recovery_plan": {
    "required_regenerations": ["Phase 6"],
    "regeneration_order": "Phase 6 only — Phase 5 has the subplot beats, they just weren't carried forward",
    "specific_instructions": "Regenerate Phase 6 ensuring all Subplot B beats from Phase 5 are included: Ch 23 (Carme's revelation), Ch 31 (Carme's permission), Ch 35 (Carme as witness). Also add foreshadowing payoff for 'Carme's unfinished sentence' in Ch 31."
  },
  "generation_ready": false,
  "approval_notes": "Cannot proceed until Phase 6 is regenerated with Subplot B resolution."
}
```

---

## Validation Checks

Before accepting Phase 8 output:

| Check | Requirement |
|-------|-------------|
| All 14 categories checked | Each has status, details, issues |
| Status is clear | PASS, FAIL, or CONDITIONAL_PASS |
| Critical issues identified | Each has issue, location, impact, fix, regenerate_from |
| Recovery plan provided | If FAIL, specific regeneration instructions |
| Generation ready flag | true only if PASS or CONDITIONAL_PASS |

---

## Notes for Claude Code

- Parse response as JSON
- Store in `bible.validation`
- **If validation_status is FAIL:**
  - Surface critical_issues to user
  - Offer to regenerate from specified phase
  - Do NOT proceed to chapter generation
- **If validation_status is CONDITIONAL_PASS:**
  - Surface warnings to user
  - Allow proceeding with noted cautions
- **If validation_status is PASS:**
  - Bible is complete
  - Proceed to user outline review, then chapter generation
- This is the final gate — respect it
