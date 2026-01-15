# Phase 4: Chemistry Architecture

## Purpose
Define why these two specific people belong together AND why it's difficult. Chemistry isn't just attraction — it's the specific way two people's wounds, needs, and strengths interlock. This phase ensures the romance feels inevitable and earned.

---

## System Prompt

```
You are a romance architect specializing in relationship dynamics. Your task is to define the specific chemistry between the protagonist and love interest — what draws them together, what creates friction, and how their relationship will evolve.

You will receive:
- The original story concept
- Phase 1 Core Foundation (conflict, theme, stakes, tone, heat level)
- Phase 2 World/Setting (social rules, constraints, locations)
- Phase 3 Characters (protagonist, love interest, supporting cast with full psychology)

Your job is to architect the relationship itself:
1. Why these two people are magnetic to each other (not generic attraction)
2. Why being together is genuinely difficult (not manufactured drama)
3. How the relationship changes both of them
4. The specific beats of their romantic arc

CRITICAL: Your output must cohere with Phases 1-3. Before finalizing, verify:
1. Magnetic pull connects to Phase 3 character psychology (their needs/wounds)
2. Friction sources match Phase 1 external AND internal conflicts
3. Relationship arc serves Phase 1 theme
4. Key moments can occur in Phase 2 locations
5. Heat level progression matches Phase 1 heat level setting
6. Chemistry challenges each character's Phase 3 fatal flaw
7. Relationship arc aligns with both characters' Phase 3 individual arcs

If any element doesn't cohere, adjust your output until it does.

## Output Format

Respond with a JSON object containing exactly these fields:

{
  "magnetic_pull": {
    "why_they_fit": "The deep reason they belong together — how their specific wounds/needs complement",
    "what_she_sees_in_him": "What specifically attracts protagonist to love interest (beyond surface)",
    "what_he_sees_in_her": "What specifically attracts love interest to protagonist (beyond surface)",
    "shared_recognition": "The moment/quality where they see themselves in each other",
    "what_others_miss": "What each sees in the other that everyone else overlooks"
  },
  "friction": {
    "surface_incompatibility": "The obvious reasons they shouldn't work",
    "deep_incompatibility": "The real psychological barrier — how their flaws clash",
    "external_barriers": "Phase 2 world constraints keeping them apart",
    "internal_barriers": "Phase 3 psychology keeping them apart",
    "the_core_tension": "The single sentence that captures their central relationship conflict"
  },
  "relationship_arc": {
    "starting_point": "strangers | enemies | acquaintances | former_lovers | other",
    "starting_dynamic": "How they relate to each other in first interactions",
    "stages": [
      {
        "stage_name": "Name of this relationship phase",
        "description": "What characterizes this stage",
        "key_shift": "What changes to move to next stage",
        "approximate_timing": "Where in story this occurs (early/mid/late + percentage)"
      }
    ],
    "ending_dynamic": "How they relate to each other by the end",
    "what_changes": "The fundamental shift in how they see each other/themselves"
  },
  "pivotal_moments": {
    "first_meeting": {
      "circumstances": "How/where they meet",
      "first_impression_clash": "Initial misread or conflict",
      "spark": "The moment something shifts"
    },
    "first_real_conversation": {
      "what_breaks_the_ice": "What allows them to actually talk",
      "what_they_discover": "The first glimpse beneath the surface"
    },
    "point_of_no_return": {
      "what_happens": "The moment neither can walk away unchanged",
      "why_it_matters": "What this moment costs or risks"
    },
    "first_intimate_moment": {
      "type": "emotional | physical | both",
      "circumstances": "What allows vulnerability",
      "what_it_reveals": "What they learn about each other/themselves"
    },
    "dark_moment": {
      "what_goes_wrong": "The crisis that seems to end everything",
      "why_it_hurts": "What makes this specific breakage devastating",
      "what_it_forces": "What realization or growth this demands"
    },
    "grand_gesture": {
      "who_acts": "Who makes the move to repair",
      "what_they_do": "The action that proves change",
      "why_it_works": "Why this specific action addresses the core tension"
    },
    "resolution": {
      "how_they_reunite": "The circumstances of coming back together",
      "what_has_changed": "Why it works now when it couldn't before",
      "final_image": "The visual/emotional note to end on"
    }
  },
  "heat_progression": {
    "level": "closed-door | warm | steamy | explicit (from Phase 1)",
    "tension_building": [
      {
        "moment_type": "glance | touch | almost | confession",
        "description": "Specific beat that builds tension",
        "approximate_timing": "When in story"
      }
    ],
    "first_kiss": {
      "circumstances": "What leads to it",
      "what_stops_them": "The interruption or restraint (if any)",
      "aftermath": "How it changes things"
    },
    "intimacy_milestone": {
      "what_happens": "Appropriate to heat level — emotional intimacy, fade-to-black, or explicit",
      "what_it_means": "The emotional significance",
      "complications": "What problems it creates or solves"
    }
  },
  "dialogue_dynamics": {
    "verbal_sparring_style": "How they argue or banter",
    "what_they_joke_about": "Shared humor or running jokes",
    "what_they_cant_say": "Topics that create tension when approached",
    "how_they_say_i_love_you": "Without saying the words — their unique expressions"
  },
  "symbolic_elements": {
    "their_place": "A location that becomes 'theirs'",
    "recurring_object": "Something that gains meaning through the story",
    "their_gesture": "A touch or action that becomes their shorthand",
    "their_phrase": "Words that carry private meaning"
  },
  "coherence_check": {
    "magnetic_pull_from_psychology": "How attraction connects to Phase 3 wounds/needs",
    "friction_matches_conflicts": "How friction embodies Phase 1 external and internal conflicts",
    "arc_serves_theme": "How relationship arc expresses Phase 1 theme",
    "moments_use_locations": "Which pivotal moments occur in which Phase 2 locations",
    "heat_level_consistent": "How progression matches Phase 1 heat level",
    "flaws_challenged": "How relationship challenges each character's Phase 3 fatal flaw",
    "individual_arcs_aligned": "How relationship arc supports both Phase 3 character arcs"
  }
}

## Guidelines

MAGNETIC PULL:
- Must connect to Phase 3 psychology — attraction isn't random
- "What she sees in him" should address something in HER wound/need
- "What he sees in her" should address something in HIS wound/need
- Shared recognition: the moment they realize they're alike in some essential way
- Avoid generic attraction ("he's handsome") — be specific to THESE characters

FRICTION:
- Surface incompatibility: what anyone would see (class, circumstance, personality clash)
- Deep incompatibility: how their specific flaws make connection dangerous
- External barriers: pull directly from Phase 2 conflict_constraints
- Internal barriers: pull directly from Phase 3 fatal_flaw and lie_they_believe
- Core tension: one sentence that captures the central romantic conflict

RELATIONSHIP ARC:
- Define 4-6 distinct stages
- Each stage needs a clear shift to move to the next
- Timing should distribute across the story (not all changes in final third)
- Arc must parallel/support both characters' individual arcs from Phase 3

PIVOTAL MOMENTS:
- First meeting: should create immediate tension or intrigue
- Point of no return: the moment the relationship becomes undeniable
- First intimate moment: appropriate to heat level
- Dark moment: must connect to their specific flaws and fears
- Grand gesture: must address the REAL problem, not a surface fix
- Resolution: must feel earned by what's come before

HEAT PROGRESSION:
- Match Phase 1 heat level exactly
- Closed-door: tension through glances, almost-touches, emotional intimacy
- Warm: tension builds to kiss(es), fade-to-black at intimacy, emotional focus
- Steamy: explicit attraction, on-page intimacy without graphic detail
- Explicit: graphic intimate scenes integral to emotional arc

DIALOGUE DYNAMICS:
- How do they talk when they're fighting?
- What's their banter style?
- What topics are landmines?
- How do they express love without the word?

SYMBOLIC ELEMENTS:
- Their place: probably from Phase 2 key_locations
- Object, gesture, phrase: will be planted early, pay off later
- These create emotional resonance and callbacks
```

---

## User Prompt Template

```
STORY CONCEPT: {{concept}}

PHASE 1 - CORE FOUNDATION:
{{phase_1_output}}

PHASE 2 - WORLD/SETTING:
{{phase_2_output}}

PHASE 3 - CHARACTERS:
{{phase_3_output}}

Architect the chemistry between these two characters. Define what draws them together, what keeps them apart, and how their relationship evolves. Every element must be specific to THESE two people in THIS world.

Remember to verify coherence with Phases 1-3 before finalizing your output.
```

---

## Example Output

```json
{
  "magnetic_pull": {
    "why_they_fit": "She's learned to want nothing; he's learned that wanting doesn't matter. She needs permission to desire; he needs proof that action matters. Together, they give each other what they lack — she shows him change is possible through small rebellions, he shows her that wanting isn't just for other people.",
    "what_she_sees_in_him": "He asks her what she thinks. Not what she's selling, not what her family needs — what SHE thinks. No one has asked her that since her father died. His attention feels like being seen after years of invisibility.",
    "what_he_sees_in_her": "She belongs somewhere. She moves through her world — harsh as it is — with certainty. He has everything and belongs nowhere. Her rootedness looks like freedom to him.",
    "shared_recognition": "The moment he admits he's trapped by his life, and she realizes he's as caged as she is. Different cages, same bars.",
    "what_others_miss": "She sees his restlessness isn't laziness — it's suffocation. He sees her practicality isn't coldness — it's armor."
  },
  "friction": {
    "surface_incompatibility": "Fidalgo and mariñeiro. He wears linen; she smells of fish. He speaks Castilian; she speaks Galician. Every visible marker screams mismatch.",
    "deep_incompatibility": "She pre-emptively denies herself things to avoid the pain of losing them. He passively resents his life but won't risk changing it. She runs from wanting; he waits for permission. Neither can make the first real move.",
    "external_barriers": "His father controls her family's livelihood. His engagement is being negotiated. She cannot enter his world as anything but a servant. Discovery destroys her family.",
    "internal_barriers": "She believes wanting him will be punished — easier to never want. He believes action is futile — easier to never try. Her self-denial meets his passivity in a stalemate.",
    "the_core_tension": "She won't reach for him because she's learned wanting is dangerous; he won't reach for her because he's learned reaching is futile."
  },
  "relationship_arc": {
    "starting_point": "strangers",
    "starting_dynamic": "Wary distance. She assumes he's another useless fidalgo. He's intrigued but afraid to approach.",
    "stages": [
      {
        "stage_name": "Curiosity",
        "description": "Stolen glances, accidental encounters. Each finds excuses to be where the other might be.",
        "key_shift": "First real conversation — she says something that surprises him, he responds honestly instead of performing.",
        "approximate_timing": "Early (5-15%)"
      },
      {
        "stage_name": "Tentative Connection",
        "description": "They begin meeting intentionally, but maintain plausible deniability. Talk about everything except what's happening.",
        "key_shift": "He does something that costs him something — small, but real. She sees he's not just playing.",
        "approximate_timing": "Early-mid (15-30%)"
      },
      {
        "stage_name": "Acknowledged Attraction",
        "description": "They admit the pull, at least to themselves. Meetings become charged. Still haven't crossed physical lines.",
        "key_shift": "First kiss. No more pretending this is friendship.",
        "approximate_timing": "Mid (30-45%)"
      },
      {
        "stage_name": "Secret Relationship",
        "description": "Together in stolen moments, apart in all visible life. Joy mixed with constant fear. Living in borrowed time.",
        "key_shift": "First intimacy (emotional or physical per heat level). Now there's no going back to before.",
        "approximate_timing": "Mid (45-60%)"
      },
      {
        "stage_name": "Escalating Stakes",
        "description": "Near-discoveries, jealousy, the engagement looming. Each close call raises the price of continuing.",
        "key_shift": "Someone finds out. The secret isn't fully secret anymore.",
        "approximate_timing": "Mid-late (60-75%)"
      },
      {
        "stage_name": "Crisis",
        "description": "Everything falls apart. His father acts. Her family is threatened. They're forced apart by circumstances and their own flaws.",
        "key_shift": "Dark moment — they separate, seemingly for good.",
        "approximate_timing": "Late (75-85%)"
      },
      {
        "stage_name": "Resolution",
        "description": "Separately, they each confront their flaw. Then one reaches for the other. Grand gesture. Reunion.",
        "key_shift": "Choosing each other despite everything.",
        "approximate_timing": "Late (85-100%)"
      }
    ],
    "ending_dynamic": "Equals choosing each other openly. Whatever they've lost, they've gained themselves and each other.",
    "what_changes": "She learns she's allowed to want. He learns he's capable of action. They've each become what the other needed them to be."
  },
  "pivotal_moments": {
    "first_meeting": {
      "circumstances": "Thursday market. He's wandering, avoiding estate duties. She's selling fish. He asks a stupid question about the catch — something no local would need to ask.",
      "first_impression_clash": "She thinks: soft hands, soft head. Dismisses him. He thinks: she looked at me like I was nothing. Why does that sting?",
      "spark": "She makes a dry joke at his expense. He laughs — genuinely, not politely. She didn't expect that."
    },
    "first_real_conversation": {
      "what_breaks_the_ice": "He finds her alone at the cliffs, gathering mussels. Far from anyone's eyes. She can't walk away without being rude.",
      "what_they_discover": "He asks about her father (a question no one asks). She tells him more than she meant to. He tells her about university, about feeling trapped. They recognize each other's cages."
    },
    "point_of_no_return": {
      "what_happens": "She's accused of shortchanging a customer (false). He steps in, publicly, risking being seen defending her. Small thing, but everyone notices.",
      "why_it_matters": "He acted. She saw him act. Now she knows he's not just words. Now he knows he can do something."
    },
    "first_intimate_moment": {
      "type": "both",
      "circumstances": "The ruins at Punta da Vela. Night. Both risked everything to be there.",
      "what_it_reveals": "She admits she's afraid of wanting this. He admits he's afraid of failing her. First kiss follows — desperate, terrified, undeniable."
    },
    "dark_moment": {
      "what_goes_wrong": "Roi's political activities draw authorities. In the chaos, Alberte's father discovers letters (she's learned to write a little — for him). He moves to revoke fishing rights. Alberte tries to intervene but folds under his father's pressure. Iria tells him to go — she was stupid to want this.",
      "why_it_hurts": "His passivity confirmed her lie — see, wanting IS punished. Her rejection confirmed his lie — see, action IS futile. They've re-wounded each other in the exact places they're weakest.",
      "what_it_forces": "She must decide if her lie is true. He must decide if his is. Separately."
    },
    "grand_gesture": {
      "who_acts": "Alberte — he has more to prove. But Iria must make a choice too.",
      "what_they_do": "He publicly refuses the engagement. Not in private, not hedging — at the harvest festival, where the announcement was meant to be. He renounces his inheritance. He names her. Then goes to her, having lost everything.",
      "why_it_works": "He proved his lie wrong — one person CAN act, change IS possible. His sacrifice makes her choice real: does she still believe wanting is punished? She reaches for him."
    },
    "resolution": {
      "how_they_reunite": "She finds him after the festival chaos. He's lost everything. She has nothing. They're equals now — nothing separates them.",
      "what_has_changed": "She chose to want, openly. He chose to act, publicly. They've each become the person who can be with the other.",
      "final_image": "Together at As Furnas cove — their secret place, now just theirs. No more hiding. The Atlantic stretches ahead, vast and unknown. They face it together."
    }
  },
  "heat_progression": {
    "level": "warm",
    "tension_building": [
      {
        "moment_type": "glance",
        "description": "Market: their eyes meet over the fish stall. Hold too long. She looks away first.",
        "approximate_timing": "5%"
      },
      {
        "moment_type": "almost",
        "description": "Cliffs: he reaches to help her across rocks. Their hands touch. Both freeze.",
        "approximate_timing": "18%"
      },
      {
        "moment_type": "touch",
        "description": "Ruins: she's cold. He puts his jacket around her. His hands linger on her shoulders.",
        "approximate_timing": "30%"
      },
      {
        "moment_type": "confession",
        "description": "He says: 'I think about you. All the time. I can't stop.' She says nothing but doesn't move away.",
        "approximate_timing": "38%"
      }
    ],
    "first_kiss": {
      "circumstances": "Ruins at Punta da Vela, after she admits she's afraid of wanting this.",
      "what_stops_them": "Nothing stops them — but she pulls back after, shaking. Too much. They sit apart, not speaking, until the fear passes.",
      "aftermath": "Everything is different. No more pretending. The next time they meet, there's no preamble — straight to each other."
    },
    "intimacy_milestone": {
      "what_happens": "As Furnas cove, midsummer. Fade-to-black. The walk down the treacherous path together IS the consent — they both know what it means. We leave them at the water's edge.",
      "what_it_means": "She chose this. He chose this. No accident, no excuse. Full commitment to the forbidden.",
      "complications": "Now there's a secret that can destroy them both. The stakes are no longer theoretical."
    }
  },
  "dialogue_dynamics": {
    "verbal_sparring_style": "She undercuts, he over-explains. She says something blunt; he fumbles to interpret it charitably; she tells him he's doing it again; he laughs at himself.",
    "what_they_joke_about": "His uselessness. The absurdity of class rules. His terrible Galician pronunciation. The fish she's always selling.",
    "what_they_cant_say": "The future. The engagement. Her mother's pressure. What happens if they're caught. Every conversation carefully avoids tomorrow.",
    "how_they_say_i_love_you": "She: 'You're not completely useless.' (This is high praise.) He: uses her real name, 'Iria,' not the nickname, when it matters — claiming all of her, not the version everyone knows."
  },
  "symbolic_elements": {
    "their_place": "The ruins at Punta da Vela. Sacred, haunted, theirs. Where they can be only themselves.",
    "recurring_object": "Wild fennel — grows at the ruins. He starts carrying a sprig; she finds one pressed in her mending basket (he snuck it there). Fennel means 'courage' in Victorian flower language. Neither knows this. We do.",
    "their_gesture": "He tucks a strand of that blonde hair behind her ear. First does it unconsciously. Becomes their shorthand for 'I see you, really.'",
    "their_phrase": "'Look—' (her word when cornered). He starts using it too, gently mocking, then tenderly. It becomes theirs."
  },
  "coherence_check": {
    "magnetic_pull_from_psychology": "Iria needs permission to want (Phase 3 need). Alberte GIVES her that by wanting her. Alberte needs proof action matters (Phase 3 need). Iria SHOWS him through her small daily acts of survival. Attraction = mutual need fulfillment.",
    "friction_matches_conflicts": "External barriers pull from Phase 1 external conflict (class/fishing rights) and Phase 2 constraints (6 specific barriers). Internal barriers pull from Phase 3 fatal flaws: her self-denial + his passivity create the core tension.",
    "arc_serves_theme": "Phase 1 theme: 'Love as rebellion against inherited fate.' Relationship arc IS rebellion — two people choosing each other against everything their world says is possible.",
    "moments_use_locations": "First meeting: Thursday market. First real conversation: cliffs. First kiss: Punta da Vela ruins. Intimacy: As Furnas cove. All from Phase 2 key_locations.",
    "heat_level_consistent": "Phase 1 heat level: warm. Heat progression builds through glances/touches to kiss to fade-to-black. No explicit content. Emotional intensity prioritized.",
    "flaws_challenged": "Her flaw (self-denial) challenged when she must CHOOSE to want him. His flaw (passivity) challenged when he must ACT at the festival. Relationship forces growth.",
    "individual_arcs_aligned": "Iria's arc: stops shrinking herself. His arc: takes decisive action. Grand gesture = him acting. Her reaching back = her wanting openly. Relationship arc delivers both character arcs."
  }
}
```

---

## Validation Checks

Before accepting Phase 4 output:

| Check | Requirement |
|-------|-------------|
| Magnetic pull is specific | Not generic attraction — connects to these characters' psychology |
| Friction has layers | Surface + deep + external + internal barriers |
| Core tension is clear | One sentence captures central romantic conflict |
| Stages are distinct | 4-6 stages with clear shifts between them |
| Pivotal moments are concrete | Specific circumstances, not vague descriptions |
| Heat matches Phase 1 | Progression appropriate to established heat level |
| Symbolic elements planted | Place, object, gesture, phrase identified |
| Dialogue dynamics defined | Sparring style, jokes, landmines, love expressions |
| **Coherence check complete** | All 7 coherence fields filled with specific explanations |

---

## Notes for Claude Code

- Parse response as JSON
- Store in `bible.chemistry`
- Pass Phase 1-4 to Phase 5 (Plot Architecture)
- **Validate coherence_check field exists and all 7 sub-fields are non-empty**
- If coherence_check shows misalignment, regenerate Phase 4
- Pivotal moments will be placed into specific chapters in Phase 6
- Symbolic elements must be tracked for foreshadowing/payoff in Phase 5
- If JSON parsing fails, retry once with instruction to fix formatting
