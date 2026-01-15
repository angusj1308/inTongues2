# Phase 5: Plot Architecture

## Purpose
Build the complete plot structure — main romance arc, subplots, and how they weave together. This phase transforms character arcs and chemistry into a cause-and-effect story engine with proper pacing, escalation, and payoff.

---

## System Prompt

```
You are a plot architect for romance novels. Your task is to construct the complete narrative structure — the main romance arc mapped to a beat sheet, subplots that pressure the romance, and the integration of all story threads into a cohesive whole.

You will receive:
- The original story concept
- Phase 1 Core Foundation (conflict, theme, stakes, tone, timespan)
- Phase 2 World/Setting (constraints, time pressure, locations)
- Phase 3 Characters (protagonist, love interest, supporting cast with arcs)
- Phase 4 Chemistry (relationship arc, pivotal moments, friction)

Your job is to:
1. Map the romance arc to a percentage-based beat sheet
2. Design subplots that PRESSURE the main romance (not just exist alongside it)
3. Create an integration map showing how threads intersect
4. Plant foreshadowing seeds with planned payoffs

CRITICAL: Your output must cohere with Phases 1-4. Before finalizing, verify:
1. Beat sheet timing fits Phase 1 timespan
2. Time pressure deadline from Phase 2 falls at correct beat
3. All supporting cast from Phase 3 have subplot involvement
4. Phase 4 pivotal moments are placed at appropriate beats
5. Subplots pressure Phase 1 central conflict
6. Theme from Phase 1 is expressed through plot choices
7. Phase 3 character arcs are delivered through plot events

If any element doesn't cohere, adjust your output until it does.

## Output Format

Respond with a JSON object containing exactly these fields:

{
  "main_plot": {
    "beat_sheet": [
      {
        "beat_name": "Name of this story beat",
        "percentage": "X-Y%",
        "chapter_estimate": "Ch X-Y (for novella) | Ch X-Y (for novel)",
        "description": "What happens in this beat",
        "romance_state": "Where the relationship is at this point",
        "phase_4_moment": "Which pivotal moment from Phase 4 occurs here (if any)",
        "emotional_tone": "The feeling of this section"
      }
    ]
  },
  "subplot_a": {
    "name": "Subplot name",
    "type": "external (goal/obstacle) | internal (growth/realization) | relational (other relationship)",
    "owner": "Which character this subplot primarily belongs to",
    "description": "What this subplot is about",
    "why_it_matters": "How it connects to theme or main conflict",
    "supporting_cast_involved": ["Which Phase 3 supporting characters are involved"],
    "beats": [
      {
        "beat_name": "Name of subplot beat",
        "chapter_estimate": "Ch X-Y",
        "what_happens": "The subplot event",
        "how_it_pressures_romance": "Specific impact on main plot"
      }
    ]
  },
  "subplot_b": {
    // Same structure as subplot_a
  },
  "integration_map": {
    "chapter_intersections": [
      {
        "chapter_estimate": "Ch X",
        "main_plot_beat": "What's happening in romance",
        "subplot_a_beat": "What's happening in subplot A (if active)",
        "subplot_b_beat": "What's happening in subplot B (if active)",
        "collision": "How they pressure each other in this chapter"
      }
    ]
  },
  "foreshadowing": {
    "seeds": [
      {
        "seed_type": "object | line | action | detail | character_trait",
        "what_is_planted": "The specific seed",
        "plant_chapter": "Ch X (estimate)",
        "payoff_chapter": "Ch Y (estimate)",
        "payoff_description": "How the seed pays off"
      }
    ]
  },
  "tension_curve": {
    "description": "Overall shape of tension across the story",
    "peaks": [
      {
        "chapter_estimate": "Ch X",
        "tension_level": "1-10",
        "source": "What creates the tension"
      }
    ],
    "valleys": [
      {
        "chapter_estimate": "Ch X",
        "purpose": "Why tension drops here (breathing room, false security, intimacy)"
      }
    ]
  },
  "coherence_check": {
    "timespan_honored": "How beat sheet timing fits Phase 1 timespan",
    "deadline_placed": "Where Phase 2 time pressure deadline falls in beat sheet",
    "supporting_cast_used": "How each Phase 3 supporting character appears in subplots",
    "pivotal_moments_placed": "Where each Phase 4 pivotal moment lands",
    "conflict_pressured": "How subplots pressure Phase 1 central conflict",
    "theme_expressed": "How plot choices express Phase 1 theme",
    "arcs_delivered": "How Phase 3 character arcs are realized through plot events"
  }
}

## Guidelines

BEAT SHEET (Romance structure):
Use this percentage-based framework, adjusted to chapter count:

| Beat | % | What Happens |
|------|---|--------------|
| Opening/Normal World | 0-8% | Establish protagonist's life before love interest |
| Meet Cute/Inciting Incident | 8-12% | First meeting, initial spark or friction |
| Resistance/Denial | 12-20% | Fighting the attraction, maintaining distance |
| Growing Attraction | 20-35% | Drawn together despite themselves |
| First Threshold | 35-40% | First kiss or commitment to explore connection |
| Deepening Relationship | 40-50% | Getting to know each other, falling in love |
| Midpoint Commitment | 50% | Major milestone — full acknowledgment of feelings or intimacy |
| Complications Escalate | 50-75% | Stakes rise, obstacles multiply, pressure mounts |
| Dark Moment | 75-85% | Everything falls apart, seems impossible |
| Grand Gesture | 85-95% | One or both fight for the relationship |
| Resolution/HEA | 95-100% | Together, having earned it |

For novella (12 chapters): Compress — some beats share chapters
For novel (35 chapters): Expand — beats get multiple chapters, more subplot room

SUBPLOTS:
- Create exactly 2 subplots (A and B)
- Each subplot must PRESSURE the romance, not just exist alongside it
- Subplot A: Usually external (a goal, obstacle, or external threat)
- Subplot B: Usually internal or relational (growth arc, family relationship, friendship)

Subplot pressure examples:
- Family subplot forces protagonist to choose between loyalty and love
- Career subplot creates time pressure that strains relationship
- Friend subplot brings near-discovery of the secret
- Political subplot raises stakes for everyone

Each subplot needs:
- Clear beginning, middle, end
- Connection to at least one supporting cast member
- Moments where it directly impacts main romance decisions

INTEGRATION MAP:
- Show how subplots intersect with main plot chapter by chapter
- Identify "collision" points where subplot events force main plot decisions
- Ensure no subplot is dormant for more than 5 chapters
- Climaxes should converge — subplot crises amplify dark moment

FORESHADOWING:
- Plant 5-8 seeds throughout the story
- Types: objects, lines of dialogue, actions, details, character traits
- Every seed must have a planned payoff
- Payoffs should land in second half of story
- At least one seed should pay off in the climax

Seed examples:
- Object: Locket mentioned casually in Ch 3, becomes proof of love in Ch 28
- Line: "I never stay" said dismissively in Ch 5, echoed as "I'm staying" in Ch 32
- Action: Small kindness in Ch 8 is repaid in crisis in Ch 25
- Detail: Character's fear of water mentioned early, must cross water at climax
- Trait: His habit of hedging words, finally speaks directly at grand gesture

TENSION CURVE:
- Generally rises across the story with deliberate valleys
- Valleys after high-tension chapters (breathing room, intimacy, false hope)
- Peak at dark moment (8-9/10)
- Sustained high through grand gesture
- Resolution can drop to peaceful 5-6/10

Tension sources:
- Discovery risk
- Time pressure
- Internal conflict
- External obstacles
- Relationship conflict
- Stakes escalation
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

Construct the complete plot architecture for this romance. Map the main arc to a beat sheet, design subplots that pressure the romance, integrate all threads, and plant foreshadowing with payoffs.

Remember to verify coherence with Phases 1-4 before finalizing your output.
```

---

## Example Output (Novel length — 35 chapters)

```json
{
  "main_plot": {
    "beat_sheet": [
      {
        "beat_name": "Opening/Normal World",
        "percentage": "0-8%",
        "chapter_estimate": "Ch 1-3",
        "description": "Iria's daily life: the docks, the market, her family's precarious survival. Establish her competence, her invisibility to the wealthy, her suppressed dreams. Introduce mother's pressure toward safe marriage.",
        "romance_state": "Love interest not yet met",
        "phase_4_moment": null,
        "emotional_tone": "Resigned, quietly suffocating"
      },
      {
        "beat_name": "Meet Cute/Inciting Incident",
        "percentage": "8-12%",
        "chapter_estimate": "Ch 3-4",
        "description": "Thursday market. Alberte wanders, avoiding duties. Asks a stupid question about fish. Iria dismisses him, makes a joke at his expense. He laughs. Something shifts.",
        "romance_state": "First meeting — friction and spark",
        "phase_4_moment": "first_meeting",
        "emotional_tone": "Unexpected, intriguing"
      },
      {
        "beat_name": "Resistance/Denial",
        "percentage": "12-20%",
        "chapter_estimate": "Ch 5-7",
        "description": "Both find reasons to be where the other might be. Deny it to themselves. She tells herself he's just another fidalgo. He tells himself he's just curious about her world.",
        "romance_state": "Orbiting, not admitting attraction",
        "phase_4_moment": null,
        "emotional_tone": "Tension, self-deception"
      },
      {
        "beat_name": "Growing Attraction",
        "percentage": "20-35%",
        "chapter_estimate": "Ch 8-12",
        "description": "First real conversation at the cliffs. They begin meeting intentionally. Talk about everything except what's happening. He does something small but costly (defends her at market). She sees he's real.",
        "romance_state": "Tentative connection forming",
        "phase_4_moment": "first_real_conversation, point_of_no_return",
        "emotional_tone": "Hopeful, dangerous"
      },
      {
        "beat_name": "First Threshold",
        "percentage": "35-40%",
        "chapter_estimate": "Ch 12-14",
        "description": "Ruins at Punta da Vela. Night. Both risked everything to be there. She admits she's afraid of wanting this. First kiss. No going back.",
        "romance_state": "Attraction acknowledged, first kiss",
        "phase_4_moment": "first_intimate_moment (kiss)",
        "emotional_tone": "Terrified, exhilarating"
      },
      {
        "beat_name": "Deepening Relationship",
        "percentage": "40-50%",
        "chapter_estimate": "Ch 14-18",
        "description": "Secret meetings intensify. They learn each other — her dreams, his doubts, their fears. Joy mixed with constant vigilance. She teaches him Galician; he teaches her to write her name.",
        "romance_state": "Falling in love, secret relationship",
        "phase_4_moment": null,
        "emotional_tone": "Bittersweet joy, stolen time"
      },
      {
        "beat_name": "Midpoint Commitment",
        "percentage": "50%",
        "chapter_estimate": "Ch 17-18",
        "description": "As Furnas cove, midsummer. Full intimacy (fade-to-black). This is the point of no return — they've chosen each other completely, consequences be damned.",
        "romance_state": "Full commitment, physical intimacy",
        "phase_4_moment": "intimacy_milestone",
        "emotional_tone": "Transcendent, defiant"
      },
      {
        "beat_name": "Complications Escalate",
        "percentage": "50-75%",
        "chapter_estimate": "Ch 18-26",
        "description": "Near discoveries. Roi's political activities draw attention. Sabela (intended bride) arrives, suspects something. Engagement announcement approaches. Each close call raises stakes. Mother pressures Iria about fisherman suitor.",
        "romance_state": "Under siege, increasingly desperate",
        "phase_4_moment": null,
        "emotional_tone": "Mounting dread, precious stolen moments"
      },
      {
        "beat_name": "Dark Moment",
        "percentage": "75-85%",
        "chapter_estimate": "Ch 26-30",
        "description": "Roi arrested for political activity. In the chaos, Don Xurxo discovers evidence of the relationship. Threatens to revoke fishing rights, destroy her family. Alberte confronts his father, but folds under pressure. Iria tells him to go — she was stupid to want this.",
        "romance_state": "Separated, seemingly destroyed",
        "phase_4_moment": "dark_moment",
        "emotional_tone": "Devastating, all hope lost"
      },
      {
        "beat_name": "Grand Gesture",
        "percentage": "85-95%",
        "chapter_estimate": "Ch 30-33",
        "description": "Harvest festival. Engagement announcement expected. Alberte publicly refuses — not in private, but before everyone. Renounces inheritance. Names Iria. Loses everything to prove he can act. Goes to her with nothing but himself.",
        "romance_state": "Fighting for love against all odds",
        "phase_4_moment": "grand_gesture",
        "emotional_tone": "Terrifying hope, leap of faith"
      },
      {
        "beat_name": "Resolution/HEA",
        "percentage": "95-100%",
        "chapter_estimate": "Ch 33-35",
        "description": "She finds him. He's lost everything. She has nothing. They're equals now. She reaches for him — choosing to want, openly. Together at As Furnas cove. Future uncertain but faced together.",
        "romance_state": "Together, having earned it",
        "phase_4_moment": "resolution",
        "emotional_tone": "Hard-won peace, open horizon"
      }
    ]
  },
  "subplot_a": {
    "name": "Roi's Rebellion",
    "type": "external",
    "owner": "Iria (her brother, her stakes)",
    "description": "Roi's involvement with anarchist organizers escalates from secret meetings to active resistance to arrest. His actions bring scrutiny to the family and ultimately trigger the crisis.",
    "why_it_matters": "Embodies the theme — rebellion against inherited fate. His rebellion is political; Iria's is personal. Same impulse, different expression. His fate shows the cost of defiance.",
    "supporting_cast_involved": ["Roi Mariño", "Father Anxo (suspects him)"],
    "beats": [
      {
        "beat_name": "Seeds of Trouble",
        "chapter_estimate": "Ch 2, 6",
        "what_happens": "Hints of Roi's activities — late nights, new vocabulary, hidden pamphlets. Iria worries but doesn't probe.",
        "how_it_pressures_romance": "Establishes family is already vulnerable. Any additional scandal is catastrophic."
      },
      {
        "beat_name": "Close Call",
        "chapter_estimate": "Ch 11",
        "what_happens": "Civil Guard visits the docks asking questions. Roi lies smoothly. Iria realizes how deep he's in.",
        "how_it_pressures_romance": "Iria knows she's adding risk to an already endangered family. Guilt intensifies."
      },
      {
        "beat_name": "Confrontation",
        "chapter_estimate": "Ch 19",
        "what_happens": "Iria confronts Roi. He argues she's the same — rebelling in her own way. She denies it. Both know it's true.",
        "how_it_pressures_romance": "Forces Iria to see her relationship AS rebellion. Raises the question: is love worth the risk?"
      },
      {
        "beat_name": "Crisis Point",
        "chapter_estimate": "Ch 26-27",
        "what_happens": "Roi arrested. Family's livelihood immediately threatened. Father Anxo saw this coming, did nothing.",
        "how_it_pressures_romance": "Creates the chaos that allows discovery of Iria's secret. Her two worlds collide catastrophically."
      },
      {
        "beat_name": "Resolution",
        "chapter_estimate": "Ch 34",
        "what_happens": "Roi escapes (or is released, depending on tone). Returns changed but alive. His rebellion cost him; Iria's may yet save her.",
        "how_it_pressures_romance": "Parallels Alberte's sacrifice. Two kinds of rebellion, two costs, two outcomes."
      }
    ]
  },
  "subplot_b": {
    "name": "Carme's Buried Dreams",
    "type": "relational/internal",
    "owner": "Iria (her mother, her mirror)",
    "description": "Slowly revealed: Carme once wanted more too. She had her own moment of choice and chose safety. Her pressure on Iria to marry safe comes from love AND from protecting herself from watching her daughter make the choice she didn't.",
    "why_it_matters": "Carme is who Iria becomes if she denies herself. Her arc shows the cost of the lie Iria believes. Her eventual support is Iria's permission.",
    "supporting_cast_involved": ["Carme Mariño"],
    "beats": [
      {
        "beat_name": "Pressure Applied",
        "chapter_estimate": "Ch 3, 7, 12",
        "what_happens": "Carme pushes the safe fisherman match. Arguments. Proverbs about knowing your place. Iria resists but can't explain why.",
        "how_it_pressures_romance": "Every conversation reinforces Iria's lie: wanting more is dangerous. Mother's fear is contagious."
      },
      {
        "beat_name": "Cracks Show",
        "chapter_estimate": "Ch 16",
        "what_happens": "Carme sees Iria writing (Alberte taught her). Moment of strange emotion — pride? Grief? Doesn't ask questions. Something unspoken passes between them.",
        "how_it_pressures_romance": "Hints that Carme understands more than she says. Tension shifts."
      },
      {
        "beat_name": "Revelation",
        "chapter_estimate": "Ch 23",
        "what_happens": "Carme reveals: she once loved someone 'above her.' Chose safety when her family threatened consequences. Has wondered ever since. 'I'm not telling you what to do. I'm telling you the cost of both choices.'",
        "how_it_pressures_romance": "Destroys the lie that safety is safe. Carme's regret is the proof. Now Iria must choose knowing the full picture."
      },
      {
        "beat_name": "Support",
        "chapter_estimate": "Ch 31",
        "what_happens": "After the dark moment, Carme doesn't say 'I told you so.' Says: 'What do you want, Iria? Not what's safe. What do you want?'",
        "how_it_pressures_romance": "Permission. The voice that taught her the lie now releases her from it."
      },
      {
        "beat_name": "Witness",
        "chapter_estimate": "Ch 35",
        "what_happens": "Carme sees Iria choose Alberte. Weeps. Not from sadness — from watching her daughter do what she couldn't.",
        "how_it_pressures_romance": "Full circle. Theme embodied in generation gap healed."
      }
    ]
  },
  "integration_map": {
    "chapter_intersections": [
      {
        "chapter_estimate": "Ch 6",
        "main_plot_beat": "Resistance/Denial — Iria avoiding feelings",
        "subplot_a_beat": "Roi's late nights noticed",
        "subplot_b_beat": "Carme pushes safe marriage",
        "collision": "Family pressure from two directions reinforces Iria's need to stay invisible"
      },
      {
        "chapter_estimate": "Ch 11",
        "main_plot_beat": "Growing Attraction — first real conversations",
        "subplot_a_beat": "Civil Guard visits docks",
        "subplot_b_beat": null,
        "collision": "External threat reminds Iria what her family risks. She pulls back from Alberte."
      },
      {
        "chapter_estimate": "Ch 19",
        "main_plot_beat": "Complications — secret relationship deepening",
        "subplot_a_beat": "Roi confrontation — 'you're rebelling too'",
        "subplot_b_beat": null,
        "collision": "Forces Iria to name what she's doing. Can't hide behind 'it's different.'"
      },
      {
        "chapter_estimate": "Ch 23",
        "main_plot_beat": "Complications — stakes rising, engagement approaches",
        "subplot_a_beat": null,
        "subplot_b_beat": "Carme's revelation about her past",
        "collision": "Iria learns the cost of both choices right as she faces the same crossroads."
      },
      {
        "chapter_estimate": "Ch 26-27",
        "main_plot_beat": "Dark Moment begins",
        "subplot_a_beat": "Roi arrested — chaos erupts",
        "subplot_b_beat": null,
        "collision": "Subplot A crisis creates the conditions for romance discovery. Everything falls at once."
      },
      {
        "chapter_estimate": "Ch 31",
        "main_plot_beat": "Grand Gesture building",
        "subplot_a_beat": null,
        "subplot_b_beat": "Carme gives permission — 'What do you want?'",
        "collision": "Subplot B resolves right before climax, freeing Iria to choose."
      }
    ]
  },
  "foreshadowing": {
    "seeds": [
      {
        "seed_type": "object",
        "what_is_planted": "Wild fennel at Punta da Vela — Alberte picks a sprig, tucks it in his pocket",
        "plant_chapter": "Ch 10",
        "payoff_chapter": "Ch 33",
        "payoff_description": "At grand gesture, he's still carrying dried fennel. She finds it. Their place, always with him."
      },
      {
        "seed_type": "line",
        "what_is_planted": "Iria says 'It doesn't matter' about her own dreams (verbal tic)",
        "plant_chapter": "Ch 2, 8, 15",
        "payoff_chapter": "Ch 34",
        "payoff_description": "When she chooses Alberte, she says: 'It matters. It all matters.' Reclaiming her voice."
      },
      {
        "seed_type": "action",
        "what_is_planted": "Alberte defends Iria at market (small public act)",
        "plant_chapter": "Ch 11",
        "payoff_chapter": "Ch 32",
        "payoff_description": "Grand gesture is the same action writ large — public defense, but now with everything at stake."
      },
      {
        "seed_type": "detail",
        "what_is_planted": "Alberte's hedging language — 'perhaps,' 'might,' 'I wonder'",
        "plant_chapter": "Ch 4, 9, 14",
        "payoff_chapter": "Ch 32",
        "payoff_description": "At grand gesture, he speaks in declaratives for the first time. 'I refuse. I choose her. I'm done.'"
      },
      {
        "seed_type": "character_trait",
        "what_is_planted": "Don Xurxo calls people by function ('the fish-seller'), never names",
        "plant_chapter": "Ch 7, 20",
        "payoff_chapter": "Ch 32",
        "payoff_description": "Alberte names Iria publicly — the opposite of his father. Claiming her as a person."
      },
      {
        "seed_type": "object",
        "what_is_planted": "Iria learning to write her name (Alberte teaches her)",
        "plant_chapter": "Ch 16",
        "payoff_chapter": "Ch 28",
        "payoff_description": "Written note is how Don Xurxo discovers them. Her new skill becomes the weapon against her."
      },
      {
        "seed_type": "line",
        "what_is_planted": "Carme says 'Your father used to say—' (never finishes)",
        "plant_chapter": "Ch 3, 12",
        "payoff_chapter": "Ch 31",
        "payoff_description": "Finally finishes: 'Your father used to say: the only thing worse than wanting and losing is never wanting at all.'"
      },
      {
        "seed_type": "detail",
        "what_is_planted": "The treacherous path down to As Furnas cove",
        "plant_chapter": "Ch 17",
        "payoff_chapter": "Ch 35",
        "payoff_description": "Final scene — they walk down together, no longer hiding. The difficult path is now just theirs."
      }
    ]
  },
  "tension_curve": {
    "description": "Rising overall with valleys for intimacy and false hope. Peak at dark moment (Ch 27-28), sustained high through climax, gentle release in resolution.",
    "peaks": [
      {
        "chapter_estimate": "Ch 11",
        "tension_level": "6",
        "source": "Civil Guard visit — first external threat"
      },
      {
        "chapter_estimate": "Ch 14",
        "tension_level": "7",
        "source": "First kiss — exhilarating but terrifying"
      },
      {
        "chapter_estimate": "Ch 22",
        "tension_level": "7",
        "source": "Sabela suspects — near discovery"
      },
      {
        "chapter_estimate": "Ch 27-28",
        "tension_level": "9",
        "source": "Roi arrested + relationship discovered + Alberte folds — everything collapses"
      },
      {
        "chapter_estimate": "Ch 32",
        "tension_level": "9",
        "source": "Grand gesture — will it work? Has he lost everything for nothing?"
      }
    ],
    "valleys": [
      {
        "chapter_estimate": "Ch 15-16",
        "purpose": "Deepening relationship — stolen joy before complications escalate"
      },
      {
        "chapter_estimate": "Ch 17-18",
        "purpose": "Midpoint intimacy — transcendent moment before the fall"
      },
      {
        "chapter_estimate": "Ch 24",
        "purpose": "False calm before storm — one last peaceful moment together"
      },
      {
        "chapter_estimate": "Ch 35",
        "purpose": "Resolution — earned peace, open horizon"
      }
    ]
  },
  "coherence_check": {
    "timespan_honored": "Phase 1 timespan: 8 months spring-autumn. Beat sheet begins March (Ch 1), ends October (Ch 35). Seasonal markers throughout (spring storms, summer heat, autumn festival). Timing matches.",
    "deadline_placed": "Phase 2 deadline: October harvest festival engagement announcement. Falls at Ch 30-32 (grand gesture beat, 85-95%). Deadline creates climax pressure.",
    "supporting_cast_used": "Roi: central to Subplot A (rebellion). Carme: central to Subplot B (buried dreams). Don Xurxo: antagonist pressure throughout, climax confrontation. Sabela: complications escalate beat (Ch 22). Father Anxo: Roi subplot + confession tension. All 5 supporting cast have plot function.",
    "pivotal_moments_placed": "first_meeting: Ch 3-4. first_real_conversation: Ch 8-9. point_of_no_return: Ch 11. first_intimate_moment: Ch 14. intimacy_milestone: Ch 17-18. dark_moment: Ch 27-28. grand_gesture: Ch 32. resolution: Ch 34-35. All Phase 4 moments placed.",
    "conflict_pressured": "Subplot A (Roi's rebellion) creates external pressure + triggers discovery. Subplot B (Carme's dreams) pressures internal conflict — forces Iria to confront her lie. Both subplots tighten the central conflict.",
    "theme_expressed": "Theme: 'Love as rebellion against inherited fate.' Main plot = romantic rebellion. Subplot A = political rebellion (parallel). Subplot B = rebellion Carme didn't make (contrast). Plot structure proves theme through multiple expressions.",
    "arcs_delivered": "Iria's arc (stop shrinking): delivered through Ch 31 (Carme's permission) + Ch 34 (choosing openly). Alberte's arc (take action): delivered through Ch 32 (grand gesture). Plot events ARE the arc completion moments."
  }
}
```

---

## Validation Checks

Before accepting Phase 5 output:

| Check | Requirement |
|-------|-------------|
| Beat sheet complete | All 11 beats present with chapter estimates |
| Timing fits length | Chapter estimates match novella (10-15) or novel (30-40) |
| Two subplots present | Subplot A and B both fully developed |
| Subplots pressure romance | Each subplot beat shows impact on main plot |
| Integration map populated | Key collision points identified |
| Foreshadowing seeds planted | 5-8 seeds with specific plant/payoff chapters |
| Tension curve shaped | Peaks and valleys identified with rationale |
| **Coherence check complete** | All 7 coherence fields filled with specific explanations |

---

## Notes for Claude Code

- Parse response as JSON
- Store in `bible.plot`
- Pass Phase 1-5 to Phase 6 (Chapter Breakdown)
- **Validate coherence_check field exists and all 7 sub-fields are non-empty**
- If coherence_check shows misalignment, regenerate Phase 5
- Beat sheet chapter estimates feed directly into Phase 6
- Foreshadowing seeds must be tracked and included in relevant chapter beats
- If JSON parsing fails, retry once with instruction to fix formatting
