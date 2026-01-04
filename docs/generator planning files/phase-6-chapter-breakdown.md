# Phase 6: Chapter Breakdown

## Purpose
Transform the plot architecture into a chapter-by-chapter blueprint. Each chapter gets specific beats, POV assignment, location, tension rating, and hook. This is the final planning phase before generation begins.

---

## System Prompt

```
You are a chapter architect for romance novels. Your task is to break down the plot architecture into individual chapters with specific beats, POV assignments, settings, and hooks that will guide chapter generation.

You will receive:
- The original story concept
- Length preset (novella or novel)
- Phase 1 Core Foundation (POV structure, tone, timespan)
- Phase 2 World/Setting (key locations, sensory palette, time pressure)
- Phase 3 Characters (protagonist, love interest, supporting cast)
- Phase 4 Chemistry (pivotal moments, symbolic elements)
- Phase 5 Plot Architecture (beat sheet, subplots, foreshadowing, tension curve)

Your job is to:
1. Create a detailed breakdown for EVERY chapter
2. Assign POV based on Phase 1 structure
3. Place beats from Phase 5 into specific chapters
4. Ensure foreshadowing seeds are planted at correct chapters
5. End every chapter with a hook

CRITICAL: Your output must cohere with Phases 1-5. Before finalizing, verify:
1. POV alternation matches Phase 1 pov_structure
2. All Phase 5 beat sheet beats are placed
3. All Phase 5 foreshadowing seeds are planted at specified chapters
4. All Phase 4 pivotal moments appear in appropriate chapters
5. Locations come from Phase 2 key_locations
6. Tension ratings match Phase 5 tension curve
7. Chapter count matches length preset
8. Story time elapsed stays within Phase 1 timespan

If any element doesn't cohere, adjust your output until it does.

## Output Format

Respond with a JSON object containing exactly these fields:

{
  "chapter_count": number,
  "length_preset": "novella | novel",
  "chapters": [
    {
      "chapter_number": 1,
      "title": "Working title for this chapter",
      "pov_character": "Name of POV character",
      "location": "Primary location (from Phase 2)",
      "secondary_location": "If chapter moves locations (optional)",
      "story_time": {
        "when": "Time within story timeline (e.g., 'March, Week 1')",
        "elapsed_since_last": "Time passed since previous chapter"
      },
      "plot_threads": {
        "main_plot": "Which beat sheet beat this advances",
        "subplot_a": "Subplot A beat if active (or null)",
        "subplot_b": "Subplot B beat if active (or null)"
      },
      "beats": [
        "Specific story event 1",
        "Specific story event 2",
        "Specific story event 3"
      ],
      "phase_4_moment": "Which pivotal moment occurs here (or null)",
      "foreshadowing": {
        "seeds_planted": ["What seeds are planted this chapter"],
        "seeds_paid_off": ["What earlier seeds pay off this chapter"]
      },
      "emotional_arc": {
        "opening_state": "Character's emotional state at chapter start",
        "closing_state": "Character's emotional state at chapter end"
      },
      "tension_rating": "1-10",
      "hook": {
        "type": "cliffhanger | question | revelation | emotional | decision",
        "description": "Specific hook that ends this chapter"
      },
      "key_dialogue_moment": "One important exchange or line in this chapter",
      "sensory_focus": "Which Phase 2 sensory elements to emphasize"
    }
  ],
  "pov_distribution": {
    "protagonist_chapters": [list of chapter numbers],
    "love_interest_chapters": [list of chapter numbers],
    "balance_check": "Assessment of POV balance"
  },
  "timeline_validation": {
    "story_start": "When story begins",
    "story_end": "When story ends",
    "total_elapsed": "Total time covered",
    "matches_phase_1": "Yes/No + explanation"
  },
  "coherence_check": {
    "pov_structure_honored": "How POV alternation matches Phase 1",
    "all_beats_placed": "Confirmation all Phase 5 beats appear",
    "all_seeds_planted": "Confirmation all foreshadowing seeds placed at correct chapters",
    "pivotal_moments_placed": "Where each Phase 4 moment lands",
    "locations_valid": "Confirmation all locations from Phase 2",
    "tension_curve_matched": "How tension ratings follow Phase 5 curve",
    "chapter_count_correct": "Confirmation count matches length preset",
    "timespan_honored": "How elapsed time fits Phase 1 timespan"
  }
}

## Guidelines

CHAPTER COUNT:
- Novella: 10-15 chapters (target 12)
- Novel: 30-40 chapters (target 35)
- Adjust based on story needs, but stay within range

POV ALTERNATION:
- Dual-alternating (default for romance): Roughly alternate between protagonist and love interest
- Don't strictly alternate every chapter — let emotional logic guide
- Protagonist should have slightly more chapters (primary POV per Phase 1)
- Critical scenes should be from POV of character with most at stake
- Never have same POV more than 3 chapters in a row

CHAPTER STRUCTURE:
Each chapter needs:
- 3-7 beats (specific events, not vague)
- Clear emotional arc (opening → closing state must differ)
- At least one plot thread advanced
- A hook ending (readers must want next chapter)

BEATS:
- Be specific: "Iria sees Alberte at market" not "They meet"
- Include action, reaction, and consequence
- Mix external events with internal responses
- Each beat should be 1-2 sentences max

HOOKS (every chapter MUST have one):
- Cliffhanger: Action interrupted, danger imminent
- Question: Mystery raised, information withheld
- Revelation: Truth revealed that changes everything
- Emotional: Powerful feeling that demands resolution
- Decision: Character faces choice, outcome unknown

TENSION RATINGS:
Follow Phase 5 tension curve:
- 3-4: Low tension (setup, breathing room, intimacy)
- 5-6: Moderate tension (growing stakes, complications)
- 7-8: High tension (major obstacles, near-discovery)
- 9-10: Peak tension (crisis, climax, dark moment)

Don't have all high-tension chapters in a row — valleys matter.

STORY TIME:
- Track time elapsed within Phase 1 timespan
- Note when significant time passes between chapters
- Seasonal markers should align with Phase 2 sensory palette
- Time pressure deadline should approach visibly

FORESHADOWING TRACKING:
- Plant seeds at chapters specified in Phase 5
- Track payoffs at specified chapters
- Note in chapter breakdown when seeds are planted/paid

VARIABLE CHAPTER LENGTH:
Tension affects target word count (implemented in generation):
- Low (3-4): 1,800-2,200 words
- Medium (5-7): 2,200-2,800 words
- High (8-10): 2,800-3,500 words

Note this in tension rating — it guides generation.

LOCATIONS:
- Use Phase 2 key_locations by name
- Secondary location if chapter moves
- Note sensory focus for each chapter (which senses to emphasize)
```

---

## User Prompt Template

```
STORY CONCEPT: {{concept}}
LENGTH: {{length_preset}} (Novella: 10-15 chapters | Novel: 30-40 chapters)

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

Create a detailed chapter-by-chapter breakdown. Every chapter needs POV, location, beats, tension rating, and hook. Track foreshadowing plants and payoffs. Ensure the story can be generated chapter by chapter from this blueprint.

Remember to verify coherence with Phases 1-5 before finalizing your output.
```

---

## Example Output (Novel — showing chapters 1, 14, 27, 32, 35 for brevity)

```json
{
  "chapter_count": 35,
  "length_preset": "novel",
  "chapters": [
    {
      "chapter_number": 1,
      "title": "The Mareña Docks",
      "pov_character": "Iria Mariño",
      "location": "The Mareña docks",
      "secondary_location": null,
      "story_time": {
        "when": "March, Week 1 — Early spring",
        "elapsed_since_last": "N/A — opening"
      },
      "plot_threads": {
        "main_plot": "Opening/Normal World",
        "subplot_a": "Seeds of Trouble — hint of Roi's late nights",
        "subplot_b": null
      },
      "beats": [
        "Dawn. Iria wakes before her family, prepares for market day.",
        "At the docks, she checks the catch with her brother Uxío. Notes Roi's absence — he came home late again.",
        "Establishes her competence: negotiating with boat captains, assessing fish quality, managing the family stall setup.",
        "Brief interaction with other market women — she's respected but keeps distance.",
        "Interior moment: watching the fidalgos' houses on the hill, lit against the gray dawn. Wonders what it's like to wake without work waiting."
      ],
      "phase_4_moment": null,
      "foreshadowing": {
        "seeds_planted": ["Roi's late nights (Subplot A seed)"],
        "seeds_paid_off": []
      },
      "emotional_arc": {
        "opening_state": "Resigned functionality — going through motions",
        "closing_state": "Flicker of longing quickly suppressed"
      },
      "tension_rating": "3",
      "hook": {
        "type": "question",
        "description": "Roi finally appears, looking shaken. 'Don't ask,' he says. She doesn't. But she will."
      },
      "key_dialogue_moment": "Uxío: 'You work too hard.' Iria: 'Someone has to.' (Establishes her role)",
      "sensory_focus": "Olfactory (fish, salt, woodsmoke), tactile (cold morning, rough nets)"
    },
    {
      "chapter_number": 14,
      "title": "The Ruins",
      "pov_character": "Iria Mariño",
      "location": "The ruins at Punta da Vela",
      "secondary_location": null,
      "story_time": {
        "when": "May, Week 2 — Late spring",
        "elapsed_since_last": "3 days since last chapter"
      },
      "plot_threads": {
        "main_plot": "First Threshold — first kiss",
        "subplot_a": null,
        "subplot_b": null
      },
      "beats": [
        "Iria makes the dangerous walk to the ruins at night. Every shadow could be discovery.",
        "Alberte is already there. They've been meeting for weeks but tonight feels different. Charged.",
        "They talk about fear. She admits she's terrified — not of discovery, of wanting this.",
        "He tells her he's terrified too — of failing her, of being unable to give her anything real.",
        "Silence. Wind. The weight of what they haven't said.",
        "She moves first. Or he does. It doesn't matter. First kiss — desperate, terrified, undeniable.",
        "They break apart, shaking. Too much. They sit apart, not speaking, until the fear passes."
      ],
      "phase_4_moment": "first_intimate_moment (kiss)",
      "foreshadowing": {
        "seeds_planted": [],
        "seeds_paid_off": ["Wild fennel — he picks it, she notices (planted Ch 10)"]
      },
      "emotional_arc": {
        "opening_state": "Terrified anticipation",
        "closing_state": "Irrevocably changed — no going back"
      },
      "tension_rating": "7",
      "hook": {
        "type": "emotional",
        "description": "Walking home separately, she touches her lips. Still feels him. 'What have I done?' But she's smiling."
      },
      "key_dialogue_moment": "Iria: 'I'm afraid of wanting this.' Alberte: 'I know. I'm afraid I can't be what you deserve.'",
      "sensory_focus": "Tactile (wind, cold stone, warmth of contact), auditory (Atlantic below, silence between words)"
    },
    {
      "chapter_number": 27,
      "title": "Everything Falls",
      "pov_character": "Iria Mariño",
      "location": "The Mariño home",
      "secondary_location": "The Mareña docks",
      "story_time": {
        "when": "September, Week 3 — Early autumn",
        "elapsed_since_last": "Same day as Ch 26"
      },
      "plot_threads": {
        "main_plot": "Dark Moment — discovery and collapse",
        "subplot_a": "Crisis Point — aftermath of Roi's arrest",
        "subplot_b": null
      },
      "beats": [
        "Civil Guard has taken Roi. Carme is inconsolable. Iria must hold the family together.",
        "At the docks, whispers. Everyone knows. The Mariño family is marked.",
        "Don Xurxo's man arrives. Summons Iria to Pazo de Soutelo. Her blood freezes.",
        "At the estate, Don Xurxo has the note — her handwriting, practicing her name, mixed with tender words. Evidence.",
        "He doesn't shout. Worse: cold recitation of consequences. Fishing rights revoked. Family destroyed. Unless.",
        "Unless she ends it. Now. Completely. He'll be watching.",
        "She walks out. Numb. The world she briefly touched has slammed shut."
      ],
      "phase_4_moment": "dark_moment (part 1 — discovery)",
      "foreshadowing": {
        "seeds_planted": [],
        "seeds_paid_off": ["Iria learning to write (planted Ch 16) — her new skill becomes weapon against her"]
      },
      "emotional_arc": {
        "opening_state": "Desperate crisis management",
        "closing_state": "Destroyed. Everything she feared has happened."
      },
      "tension_rating": "9",
      "hook": {
        "type": "cliffhanger",
        "description": "She has to tell Alberte. Has to end it. Has to watch his face when she does."
      },
      "key_dialogue_moment": "Don Xurxo: 'You're the fish-seller from the market. That's all you'll ever be. My son forgot that temporarily. You'll help him remember.'",
      "sensory_focus": "Tactile (cold stone of estate, trembling hands), visual (dark wood, Don Xurxo's still face)"
    },
    {
      "chapter_number": 32,
      "title": "The Festival",
      "pov_character": "Alberte Soutelo Pazos",
      "location": "Ribeira square (harvest festival)",
      "secondary_location": null,
      "story_time": {
        "when": "October, Week 3 — Harvest festival",
        "elapsed_since_last": "1 week"
      },
      "plot_threads": {
        "main_plot": "Grand Gesture",
        "subplot_a": null,
        "subplot_b": null
      },
      "beats": [
        "The festival. Everyone gathered. His father preparing the engagement announcement.",
        "Alberte sees Sabela — she knows something is wrong. A look passes between them. She nods, almost imperceptibly.",
        "His father begins speaking. The families. The honor. The future.",
        "Alberte stands. No hedging. No 'perhaps.' 'I refuse.'",
        "Chaos. His father's face. His mother's gasp. The crowd's murmur.",
        "'I refuse this engagement. I refuse this inheritance. I refuse to become you.'",
        "He names Iria. Publicly. 'I choose her. A woman who has more courage in her callused hands than this entire family has in its bloodline.'",
        "Walks out. Through the crowd. Toward the docks. Having lost everything except himself."
      ],
      "phase_4_moment": "grand_gesture",
      "foreshadowing": {
        "seeds_planted": [],
        "seeds_paid_off": [
          "Alberte's hedging language — finally speaks in declaratives (planted Ch 4, 9, 14)",
          "Don Xurxo calling people by function — Alberte names Iria (planted Ch 7, 20)",
          "Small public defense at market — now writ large (planted Ch 11)"
        ]
      },
      "emotional_arc": {
        "opening_state": "Terrified resolve — knows what he must do",
        "closing_state": "Free. Empty. Walking toward an uncertain answer."
      },
      "tension_rating": "9",
      "hook": {
        "type": "decision",
        "description": "He's given up everything. Now he has to find her. Will she still want him with nothing to offer but himself?"
      },
      "key_dialogue_moment": "'I refuse.' (First time he's spoken without hedge words. Two words that cost him everything.)",
      "sensory_focus": "Auditory (crowd noise, his father's voice, sudden silence), visual (faces in crowd, the long walk out)"
    },
    {
      "chapter_number": 35,
      "title": "As Furnas",
      "pov_character": "Iria Mariño",
      "location": "The cove at As Furnas",
      "secondary_location": "Path down to cove",
      "story_time": {
        "when": "October, Week 4 — Days after festival",
        "elapsed_since_last": "2 days"
      },
      "plot_threads": {
        "main_plot": "Resolution/HEA",
        "subplot_a": "Resolution — Roi's fate resolved",
        "subplot_b": "Witness — Carme sees Iria choose"
      },
      "beats": [
        "Morning. Carme tells Iria: Roi escaped (or was released). He's alive. He's gone, but alive.",
        "Iria knows where Alberte will be. Has known since he walked out of the festival.",
        "The path down to As Furnas. She takes it in daylight. No hiding anymore.",
        "He's there. Sitting on the sand. Looking at the water. Has nothing except what he chose.",
        "She sits beside him. Silence. Then: 'You're an idiot.' 'I know.' 'You gave up everything.' 'Not everything.'",
        "She takes his hand. 'It matters,' she says. 'It all matters.'",
        "The Atlantic stretches ahead. Vast and unknown. They face it together."
      ],
      "phase_4_moment": "resolution",
      "foreshadowing": {
        "seeds_planted": [],
        "seeds_paid_off": [
          "'It doesn't matter' → 'It matters. It all matters.' (planted Ch 2, 8, 15)",
          "Treacherous path — now walked openly together (planted Ch 17)",
          "Wild fennel — she finds the dried sprig in his pocket (planted Ch 10)"
        ]
      },
      "emotional_arc": {
        "opening_state": "Cautious hope",
        "closing_state": "Hard-won peace. Open horizon. Together."
      },
      "tension_rating": "5",
      "hook": {
        "type": "emotional",
        "description": "Final image: Two people with nothing but each other, facing a vast sea. It's enough. It's everything."
      },
      "key_dialogue_moment": "'It matters. It all matters.' (Her reclaimed voice. Her self, no longer denied.)",
      "sensory_focus": "Visual (white sand, clear water, open sky), tactile (his hand, warm sun)"
    }
  ],
  "pov_distribution": {
    "protagonist_chapters": [1, 3, 5, 7, 9, 11, 14, 16, 18, 20, 22, 24, 27, 29, 31, 34, 35],
    "love_interest_chapters": [2, 4, 6, 8, 10, 12, 13, 15, 17, 19, 21, 23, 25, 26, 28, 30, 32, 33],
    "balance_check": "Iria: 17 chapters (49%), Alberte: 18 chapters (51%). Near-equal with slight edge to love interest in middle section where his internal conflict drives plot. Iria anchors opening and closing per Phase 1."
  },
  "timeline_validation": {
    "story_start": "March, Week 1",
    "story_end": "October, Week 4",
    "total_elapsed": "Approximately 8 months",
    "matches_phase_1": "Yes — Phase 1 specifies '8 months (spring through autumn)'. Story spans March to October, covering spring storms through autumn harvest festival."
  },
  "coherence_check": {
    "pov_structure_honored": "Phase 1 specifies dual-alternating with protagonist anchoring. Breakdown alternates POV with Iria at opening (Ch 1) and closing (Ch 35). No more than 2 consecutive chapters same POV.",
    "all_beats_placed": "All 11 beat sheet beats from Phase 5 placed: Opening (Ch 1-3), Meet Cute (Ch 3-4), Resistance (Ch 5-7), Growing Attraction (Ch 8-12), First Threshold (Ch 12-14), Deepening (Ch 14-18), Midpoint (Ch 17-18), Complications (Ch 18-26), Dark Moment (Ch 26-30), Grand Gesture (Ch 30-33), Resolution (Ch 33-35).",
    "all_seeds_planted": "All 8 foreshadowing seeds from Phase 5 planted at specified chapters: Wild fennel (Ch 10), 'It doesn't matter' (Ch 2, 8, 15), Market defense (Ch 11), Hedging language (Ch 4, 9, 14), Function-not-names (Ch 7, 20), Learning to write (Ch 16), Carme's unfinished sentence (Ch 3, 12), Treacherous path (Ch 17). All payoffs tracked.",
    "pivotal_moments_placed": "All Phase 4 moments placed: first_meeting (Ch 3-4), first_real_conversation (Ch 8-9), point_of_no_return (Ch 11), first_intimate_moment (Ch 14), intimacy_milestone (Ch 17-18), dark_moment (Ch 27-28), grand_gesture (Ch 32), resolution (Ch 34-35).",
    "locations_valid": "All locations from Phase 2: Mareña docks (Ch 1, 3, 11, 27), Pazo de Soutelo (Ch 7, 20, 27), Thursday market (Ch 3-4, 11), Punta da Vela ruins (Ch 10, 14, 24), Ultramarinos Campos (Ch 6), As Furnas cove (Ch 17-18, 35), Ribeira square (Ch 32).",
    "tension_curve_matched": "Tension follows Phase 5 curve: Low opening (Ch 1-3: 3-4), rising through middle (Ch 8-14: 5-7), valleys for intimacy (Ch 15-18: 4-5), escalation (Ch 19-26: 6-8), peak at dark moment (Ch 27-28: 9), sustained through climax (Ch 30-32: 8-9), gentle resolution (Ch 33-35: 5-6).",
    "chapter_count_correct": "35 chapters — within novel range (30-40). Matches Phase 5 beat sheet chapter estimates.",
    "timespan_honored": "8 months elapsed (March-October) matches Phase 1 timespan exactly. Seasonal sensory details assigned per Phase 2 palette: spring storms early, summer heat middle, autumn harvest end."
  }
}
```

---

## Validation Checks

Before accepting Phase 6 output:

| Check | Requirement |
|-------|-------------|
| All chapters present | Count matches chapter_count field |
| Every chapter has required fields | POV, location, beats, tension, hook all present |
| POV alternates appropriately | No more than 3 consecutive same-POV chapters |
| All beats placed | Every Phase 5 beat sheet beat appears |
| All seeds tracked | Every foreshadowing seed planted and paid off |
| Hooks on every chapter | No chapter ends without a hook |
| Tension curve shapes correctly | Ratings follow Phase 5 pattern |
| Timeline consistent | Elapsed time matches Phase 1 timespan |
| **Coherence check complete** | All 8 coherence fields filled with specific explanations |

---

## Notes for Claude Code

- Parse response as JSON
- Store in `bible.chapters` (this completes the bible)
- This is the final planning phase — bible is now complete
- **Validate coherence_check field exists and all 8 sub-fields are non-empty**
- If coherence_check shows misalignment, regenerate Phase 6
- Each chapter breakdown feeds directly into chapter generation prompt
- Tension rating determines target word count for generation
- For novella length, request 10-15 chapters; for novel, 30-40
- If JSON parsing fails, retry once with instruction to fix formatting

---

## What Happens Next

After Phase 6, the bible is complete. The pipeline proceeds to:

1. **Phase 7: Level Adaptation Check** (optional pass to verify outline works at target level)
2. **Phase 8: Validation** (comprehensive check of entire bible)
3. **Chapter Generation** (using bible + chapter breakdown to generate actual text)
