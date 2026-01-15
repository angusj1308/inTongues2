# Phase 3: Character Generation

## Purpose
Create the principal characters (protagonist and love interest) and supporting cast. Characters are shaped by the world built in Phase 2 — their names, occupations, constraints, and possibilities all flow from the setting.

---

## System Prompt

```
You are a character architect for romance novels. Your task is to create compelling, three-dimensional characters whose flaws, desires, and growth arcs will drive an emotionally resonant romance.

You will receive:
- The original story concept
- Phase 1 Core Foundation (conflict, theme, stakes, tone)
- Phase 2 World/Setting (social rules, locations, naming conventions, available roles)

Your job is to create characters who:
1. Could only exist in THIS specific world
2. Embody the central conflict in their very beings
3. Have internal obstacles that mirror the external ones
4. Will grow in ways that serve the theme

CRITICAL: Your output must cohere with Phase 1 and Phase 2. Before finalizing, verify:
1. Character psychology (flaw/wound/lie) embodies Phase 1 internal conflict
2. Character arcs serve Phase 1 theme
3. Characters have real stakes matching Phase 1 emotional stakes
4. All names come from Phase 2 naming conventions
5. All occupations come from Phase 2 available roles
6. Physical descriptions include Phase 2 class indicators
7. Supporting cast can enforce Phase 2 conflict constraints
8. Character depth supports Phase 1 POV structure

If any element doesn't cohere, adjust your output until it does.

## Character Hierarchy

PRINCIPAL CHARACTERS (create 2):
- Protagonist: Primary POV, most screen time, largest arc
- Love Interest: Secondary POV, equal emotional depth, complementary arc

SUPPORTING CHARACTERS (create 3-5):
- Each serves a specific narrative function
- Each has a mini-arc that pressures the main romance
- Each has a distinct voice

Do NOT create incidental characters (shopkeepers, servants, etc.) — those are generated as needed during chapter writing.

## Output Format

Respond with a JSON object containing exactly these fields:

{
  "protagonist": {
    "name": "Full name as used in narration",
    "nickname": "What intimates call them (if different)",
    "age": number,
    "occupation": "Their role/work in this world",
    "class": "Their social position",
    "physical": {
      "appearance": "Key visual details that matter to the story",
      "distinguishing_features": "What people notice first",
      "how_they_move": "Body language, carriage, physical habits",
      "class_markers": "Physical signs of their class (hands, teeth, clothing, etc.)"
    },
    "background": {
      "family": "Parents, siblings, family situation",
      "history": "Key events that shaped them before story begins",
      "current_situation": "Where they are in life as story opens"
    },
    "psychology": {
      "external_want": "The conscious goal they're pursuing",
      "internal_need": "What they actually need but don't know yet",
      "fatal_flaw": "The trait that holds them back",
      "backstory_wound": "The specific past event that created the flaw",
      "fear": "What they're most afraid of",
      "lie_they_believe": "The false belief driving their behavior"
    },
    "arc": {
      "starting_state": "Who they are at chapter 1",
      "midpoint_shift": "How they've changed by middle of story",
      "ending_state": "Who they become by the end",
      "key_growth_moment": "The scene where real change happens",
      "how_arc_serves_theme": "How this transformation expresses the story's theme"
    },
    "voice": {
      "speech_patterns": "How they talk — formal/casual, verbose/terse, direct/indirect",
      "verbal_tics": "Repeated phrases, habits of speech",
      "vocabulary_level": "Education/class reflected in word choice",
      "emotional_expression": "How they show feelings — internal/external, controlled/explosive",
      "topics_they_avoid": "What they won't talk about and why",
      "humor_style": "How they use humor (if at all)"
    },
    "relationship_to_love_interest": {
      "first_impression": "What they think when they first meet",
      "initial_attraction": "What draws them despite obstacles",
      "initial_resistance": "Why they fight the attraction"
    }
  },
  "love_interest": {
    // Same structure as protagonist
  },
  "supporting_cast": [
    {
      "name": "Full name",
      "role": "Their relationship to protagonist/love interest",
      "narrative_function": "Why they exist in the story (antagonist/mentor/mirror/confidant/comic relief)",
      "constraint_they_enforce": "Which Phase 2 conflict constraint they embody or enforce",
      "age": number,
      "occupation": "Their role in this world",
      "personality": "Core traits in 2-3 sentences",
      "mini_arc": "How they change or what they learn",
      "pressure_point": "How they complicate or pressure the romance",
      "voice": {
        "speech_patterns": "Brief description of how they talk",
        "distinguishing_trait": "One memorable verbal habit"
      }
    }
  ],
  "relationship_dynamics": {
    "protagonist_to_cast": {
      "character_name": "Nature of relationship and any tension"
    },
    "love_interest_to_cast": {
      "character_name": "Nature of relationship and any tension"
    },
    "cast_to_cast": {
      "relationship_pair": "Any significant relationships within supporting cast"
    }
  },
  "coherence_check": {
    "internal_conflict_embodied": "How protagonist and love interest psychology embodies Phase 1 internal conflict",
    "theme_served": "How character arcs express Phase 1 theme",
    "stakes_real": "What each principal character stands to lose (matching Phase 1 stakes)",
    "names_sourced": "Confirmation all names come from Phase 2 naming conventions",
    "occupations_valid": "Confirmation all occupations come from Phase 2 available roles",
    "class_markers_present": "How physical descriptions reflect Phase 2 class indicators",
    "constraints_enforced": "Which supporting characters enforce which Phase 2 conflict constraints",
    "pov_supported": "How character depth supports Phase 1 POV structure"
  }
}

## Guidelines

NAMES:
- Use naming conventions from Phase 2 — do not invent names outside those lists
- Names should fit character's class and culture
- Ensure names are easily distinguishable (don't start multiple names with same letter)

PHYSICAL DESCRIPTIONS:
- Focus on details that matter to the story or reveal character
- MUST include class markers identified in Phase 2 (hands, teeth, clothing, etc.)
- "How they move" reveals psychology — confident, wary, graceful, awkward

PSYCHOLOGY — THE FLAW/WOUND/LIE CHAIN:
This is the engine of character arc. It must be airtight:
1. BACKSTORY WOUND: A specific event (not vague trauma) that happened before the story
2. LIE THEY BELIEVE: A false conclusion they drew from that wound
3. FATAL FLAW: The behavior pattern that results from believing the lie
4. FEAR: What they're avoiding by maintaining the flaw
5. INTERNAL NEED: The truth that will heal them (opposite of the lie)

The flaw/wound/lie chain MUST connect to Phase 1's internal conflict. If Phase 1 says "she believes she's not worthy," her wound/lie must create that belief.

Example chain:
- Wound: Father abandoned family when she was 12
- Lie: "People leave when things get hard"
- Flaw: Pushes people away before they can leave her
- Fear: Being abandoned again
- Need: To trust that some people stay

The love interest should challenge this chain — their presence forces the protagonist to confront the lie.

ARCS:
- Starting state should be stable (not already in crisis)
- Midpoint shift is usually "trying new behavior but not yet transformed"
- Ending state must feel earned, not sudden
- Key growth moment is ONE specific scene — identify it now, write it later
- Arc must express the theme from Phase 1 — transformation is thematic proof

VOICE:
- Voice must be distinct enough that dialogue needs no tags
- Class and education affect vocabulary — reference Phase 2 class indicators
- Emotional expression style affects how internal monologue reads
- Topics they avoid create tension when those topics arise

SUPPORTING CAST:
- Each character needs ONE clear narrative function
- Each character must enforce or embody at least one constraint from Phase 2
- Antagonist: actively opposes the romance
- Mentor: offers wisdom (often flawed)
- Mirror: reflects protagonist's flaw or potential
- Confidant: someone to voice thoughts to
- Comic relief: lightens tone (but should still serve plot)

Supporting characters should NOT be:
- Purely evil (give antagonists understandable motivations)
- Purely supportive (even allies create friction)
- Interchangeable (each must be distinct)

PRESSURE POINTS:
Every supporting character must pressure the romance somehow:
- The mother who wants her daughter to marry safe
- The friend who accidentally reveals the secret
- The rival who offers an easier path
- The mentor whose advice is wrong

RELATIONSHIP DYNAMICS:
- Map how everyone connects
- Identify tensions that can be exploited for plot
- Note alliances and oppositions
```

---

## User Prompt Template

```
STORY CONCEPT: {{concept}}

PHASE 1 - CORE FOUNDATION:
{{phase_1_output}}

PHASE 2 - WORLD/SETTING:
{{phase_2_output}}

Create the principal characters and supporting cast for this romance. Every character must be shaped by this specific world and embody aspects of the central conflict.

Remember to verify coherence with Phase 1 and Phase 2 before finalizing your output.
```

---

## Example Output (abbreviated for length)

```json
{
  "protagonist": {
    "name": "Iria Mariño",
    "nickname": "Iria a Loura",
    "age": 19,
    "occupation": "Fish-seller and net-mender",
    "class": "Mariñeiro (fishing class)",
    "physical": {
      "appearance": "Tall for a woman, sun-weathered skin, pale blonde hair (unusual in Galicia, source of her nickname). Strong hands, roughened by nets and salt. Mends her clothes carefully — poor but proud.",
      "distinguishing_features": "Her hair — impossible to hide, impossible to forget. A small scar on her palm from a fishhook.",
      "how_they_move": "Efficient, purposeful. No wasted motion. Scans her surroundings constantly — a habit from working the docks where danger is everywhere.",
      "class_markers": "Rough, calloused hands. Patched homespun clothing. Speaks Galician, not Castilian. Teeth already showing wear at 19."
    },
    "background": {
      "family": "Mother (Carme), two older brothers (Roi and Uxío). Father drowned at sea when she was 14. She became the family's primary earner at the market.",
      "history": "Father's death forced her into adulthood early. She was pulled from the priest's informal school — she was learning to read. That loss still stings. Roi is involved with anarchist organizers, which terrifies her.",
      "current_situation": "Keeps the family fed but sees no future beyond survival. A marriage offer from a fisherman (solid but dull) is being pressed by her mother."
    },
    "psychology": {
      "external_want": "Security for her family — enough money that her mother stops worrying",
      "internal_need": "To believe she deserves more than survival — that wanting things for herself isn't selfish",
      "fatal_flaw": "Self-denial. Sacrifices her desires before anyone asks her to. Preemptively shrinks herself.",
      "backstory_wound": "When her father died, her mother said: 'We can't afford dreams anymore.' Iria stopped dreaming.",
      "fear": "Wanting something and losing it — easier to never want",
      "lie_they_believe": "Desire is dangerous. Wanting more than your station invites punishment."
    },
    "arc": {
      "starting_state": "Accepts her fate. Goes through the motions. Has stopped imagining any other life.",
      "midpoint_shift": "Has tasted another possibility with Alberte. Wants it desperately. Terrified of that want.",
      "ending_state": "Claims her own desires openly. Whether she gets Alberte or not, she will never again shrink herself preemptively.",
      "key_growth_moment": "The scene where she must speak her truth aloud to someone other than Alberte — probably her mother.",
      "how_arc_serves_theme": "Theme is 'love as rebellion against inherited fate.' Her arc IS that rebellion — choosing to want, to reach, to refuse the life assigned to her."
    },
    "voice": {
      "speech_patterns": "Terse, practical. Speaks in short sentences. Rarely asks for things directly — implies, suggests, deflects.",
      "verbal_tics": "Starts sentences with 'Look—' when cornered. Says 'It doesn't matter' about things that clearly matter.",
      "vocabulary_level": "Limited but precise. Knows the words for her world perfectly. Stumbles with abstract concepts.",
      "emotional_expression": "Suppresses externally, storms internally. Readers see her rich inner life; other characters see composure.",
      "topics_they_avoid": "Her father. The future. What she wants.",
      "humor_style": "Dry, observational. Finds absurdity in class differences. Never jokes about herself."
    },
    "relationship_to_love_interest": {
      "first_impression": "Another useless fidalgo. Soft hands, soft life. Why is he even at the docks?",
      "initial_attraction": "He looks at her like she's a person, not a fish-seller. He asks questions and listens to answers.",
      "initial_resistance": "This can only end badly for her. He'll go back to his world. She'll be left with the wreckage."
    }
  },
  "love_interest": {
    "name": "Alberte Soutelo Pazos",
    "nickname": "None — he's never been intimate enough with anyone to earn one",
    "age": 24,
    "occupation": "Estate heir, nominally manages tenant relations",
    "class": "Fidalgo (landed gentry)",
    "physical": {
      "appearance": "Dark hair, his mother's sharp features, father's height. Clothes well-made but worn carelessly. Soft hands — the mark of his class.",
      "distinguishing_features": "An intensity in his gaze that makes people uncomfortable. He looks at things too long, too carefully.",
      "how_they_move": "Restless. Always shifting position, walking when he could stand, standing when he could sit. Energy with no outlet.",
      "class_markers": "Soft, uncalloused hands. Tailored linen clothing. Speaks Castilian at home, Galician only when necessary. Perfect teeth."
    },
    "background": {
      "family": "Father (Don Xurxo) — domineering patriarch. Mother (Dona Elvira) — faded, compliant, disappointed. No siblings (two died young).",
      "history": "Sent to university in Santiago but returned after two years — officially for health, actually after a scandal involving 'radical ideas.' Father views him as a disappointment.",
      "current_situation": "Trapped in a role he didn't choose, awaiting a marriage to a woman he doesn't know, managing an estate he finds morally troubling."
    },
    "psychology": {
      "external_want": "To be seen as his own person, not his father's heir",
      "internal_need": "To take meaningful action instead of passive resistance",
      "fatal_flaw": "Passivity disguised as principle. He disagrees but doesn't act. Judges but doesn't risk.",
      "backstory_wound": "At 16, tried to help a tenant family being evicted. Father crushed the attempt publicly, humiliated him. Learned that resistance is futile.",
      "fear": "Becoming his father. Also: that his father might be right about power.",
      "lie_they_believe": "One person can't change a system. Better to endure than to fight and fail."
    },
    "arc": {
      "starting_state": "Quietly resentful, passively resistant, waiting for something without acting.",
      "midpoint_shift": "Iria shows him that small acts of defiance ARE possible. He begins taking risks.",
      "ending_state": "Takes decisive action regardless of consequences. Chooses his own values over inherited position.",
      "key_growth_moment": "The scene where he openly defies his father — not in private, but where it costs him.",
      "how_arc_serves_theme": "Theme is 'love as rebellion against inherited fate.' His arc proves that even those born to power can reject what they inherit — rebellion isn't only for the powerless."
    },
    "voice": {
      "speech_patterns": "Educated, sometimes overly formal when uncomfortable. Asks many questions. Tends toward abstract discussion.",
      "verbal_tics": "Says 'I wonder—' before observations. Overuses 'perhaps' and 'might' — hedging language.",
      "vocabulary_level": "Extensive, occasionally pretentious. Catches himself using words Iria wouldn't know, then over-explains.",
      "emotional_expression": "Intellectualizes feelings. Names emotions instead of showing them. Until he can't anymore.",
      "topics_they_avoid": "His mother's unhappiness. What happened at university. The engagement.",
      "humor_style": "Sardonic, self-deprecating. Makes jokes at his own class's expense."
    },
    "relationship_to_love_interest": {
      "first_impression": "She moves like she belongs somewhere. He's never felt that. Envy and fascination.",
      "initial_attraction": "Her competence. Her directness. She doesn't perform for him.",
      "initial_resistance": "He knows the math: any relationship would cost her far more than it costs him. Does he have the right?"
    }
  },
  "supporting_cast": [
    {
      "name": "Don Xurxo Soutelo",
      "role": "Alberte's father",
      "narrative_function": "Antagonist",
      "constraint_they_enforce": "Holds fishing rights (constraint #1); controls engagement negotiations (constraint #4)",
      "age": 58,
      "occupation": "Landowner, controls fishing rights",
      "personality": "Not cruel for cruelty's sake — believes absolutely in the social order and his place in it. Loves Alberte but cannot separate love from control. Sees softness as failure.",
      "mini_arc": "Never changes — but is revealed to be more complex than initial villain appearance. A scene shows he once faced a similar choice and chose duty. He is what Alberte could become.",
      "pressure_point": "Holds the fishing rights. Any discovery of the relationship lets him destroy Iria's family without lifting a finger.",
      "voice": {
        "speech_patterns": "Commands, doesn't request. Short declarative sentences. Never explains himself.",
        "distinguishing_trait": "Refers to people by their function, not name: 'the Mariño girl,' 'the fish-seller.'"
      }
    },
    {
      "name": "Carme Mariño",
      "role": "Iria's mother",
      "narrative_function": "Mirror/Obstacle",
      "constraint_they_enforce": "Embodies what happens when dreams are sacrificed; pressures safe marriage (relates to constraint #1 stakes)",
      "age": 44,
      "occupation": "Widow, net-mender",
      "personality": "Once had fire — it's not gone, just banked. Fear of losing more has made her rigid. Wants safety for her daughter above all, even above happiness.",
      "mini_arc": "Reveals she too once wanted 'more' — and the cost of giving it up. Finally supports Iria's right to choose, even if she fears the choice.",
      "pressure_point": "Pushes the safe marriage. Asks questions Iria can't answer. Her fear is contagious.",
      "voice": {
        "speech_patterns": "Speaks in proverbs and warnings. Indirect — circles around topics.",
        "distinguishing_trait": "Begins sentences with 'Your father used to say—'"
      }
    },
    {
      "name": "Roi Mariño",
      "role": "Iria's older brother",
      "narrative_function": "Catalyst/Complication",
      "constraint_they_enforce": "His political activity (constraint #6) brings scrutiny and danger to the family",
      "age": 26,
      "occupation": "Fisherman, secret anarchist organizer",
      "personality": "Angry at the system, impatient for change. Loves his sister but sometimes uses her to gather information. His activities bring danger to the family.",
      "mini_arc": "His political work comes to a head — he must flee or be arrested. This forces Iria to make choices about family loyalty.",
      "pressure_point": "His activities draw attention to the family. Discovery of his politics + discovery of Iria's relationship = catastrophe.",
      "voice": {
        "speech_patterns": "Passionate, speaks in bursts. Political vocabulary creeping into everyday speech.",
        "distinguishing_trait": "Calls the fidalgos 'los señoritos' (little lords) — diminutive as insult."
      }
    },
    {
      "name": "Sabela Doval",
      "role": "Alberte's intended bride",
      "narrative_function": "Complication/Mirror",
      "constraint_they_enforce": "Embodies constraint #4 (engagement negotiations); her presence is the deadline made human",
      "age": 21,
      "occupation": "Daughter of neighboring landowner",
      "personality": "Not a villain. Intelligent, pragmatic, also trapped by expectations. Suspects Alberte loves someone else. Faces her own choiceless future.",
      "mini_arc": "Moves from potential rival to unexpected ally. She too wants to escape her predetermined path.",
      "pressure_point": "Her presence is a constant reminder of the deadline. Any kindness Alberte shows her complicates things.",
      "voice": {
        "speech_patterns": "Polished, careful. Says one thing while meaning another. Trained in social performance.",
        "distinguishing_trait": "Asks pointed questions disguised as innocent curiosity."
      }
    },
    {
      "name": "Father Anxo",
      "role": "Village priest",
      "narrative_function": "Obstacle/Wild card",
      "constraint_they_enforce": "Constraint #5 — allied with Soutelo family, hears Iria's confessions. Surveillance wrapped in pastoral care.",
      "age": 52,
      "occupation": "Parish priest",
      "personality": "Genuinely believes in his role as moral guardian. Allied with the Soutelo family who fund his church. But also hears Iria's confessions — knows more than he should.",
      "mini_arc": "Must choose between institutional loyalty and genuine pastoral care. His choice matters at a crucial moment.",
      "pressure_point": "He knows secrets. Both characters must confess to him. He could expose everything or protect them.",
      "voice": {
        "speech_patterns": "Formal church rhetoric that slips into warmer Galician when moved. Uses scripture as punctuation.",
        "distinguishing_trait": "Sighs before delivering bad news or judgment."
      }
    }
  ],
  "relationship_dynamics": {
    "protagonist_to_cast": {
      "Carme": "Loves her mother but feels suffocated by her fear. Carries guilt for wanting more.",
      "Roi": "Protective of him but terrified by his activities. He's the only one who sees her restlessness.",
      "Don Xurxo": "Fear and resentment. He controls her family's survival without knowing her name.",
      "Father Anxo": "Wary respect. He taught her letters briefly. She confesses the minimum."
    },
    "love_interest_to_cast": {
      "Don Xurxo": "Suffocating resentment masked as compliance. Every interaction is a power struggle neither acknowledges.",
      "Sabela": "Guilt. She doesn't deserve to be a pawn in his resistance. Tentative alliance.",
      "Carme": "Never meets directly until late in story. She represents what's at stake.",
      "Father Anxo": "Childhood confessor. Knows Alberte's doubts. Uncertain ally."
    },
    "cast_to_cast": {
      "Don Xurxo — Carme": "He doesn't know she exists. She knows everything about his family — the invisible knowledge of servants.",
      "Roi — Father Anxo": "Mutual suspicion. The priest suspects Roi's politics. Roi sees the priest as collaborator with power.",
      "Sabela — Don Xurxo": "Performs perfect compliance. Privately plots her own escape. He has no idea."
    }
  },
  "coherence_check": {
    "internal_conflict_embodied": "Phase 1 internal conflict: 'She believes she's not worthy... fears losing identity. He's taught duty supersedes desire.' Iria's lie ('wanting more invites punishment') = unworthiness. Alberte's lie ('one person can't change a system') = duty over desire. Both psychologies directly embody Phase 1.",
    "theme_served": "Phase 1 theme: 'Love as rebellion against inherited fate.' Iria's arc: refuses assigned life. Alberte's arc: rejects inherited position. Both arcs ARE the theme in action.",
    "stakes_real": "Phase 1 stakes: She loses family livelihood, remains trapped. He becomes his father. Iria risks everything per social_rules. Alberte risks becoming hollow like Don Xurxo. Stakes match.",
    "names_sourced": "All names from Phase 2: Iria, Carme, Roi (female/male lists). Alberte, Xurxo, Anxo (male list). Sabela (female list). Mariño, Soutelo, Doval, Pazos (surname list). Confirmed.",
    "occupations_valid": "Iria: fish-seller, net-mender (Phase 2 female lower class). Alberte: landowner/estate manager (Phase 2 male upper). Carme: net-mender (lower). Roi: fisherman (lower). Sabela: daughter of landowner (upper female). Father Anxo: priest (upper). All valid.",
    "class_markers_present": "Iria: rough hands, patched homespun, Galician speech, worn teeth. Alberte: soft hands, tailored linen, Castilian speech, perfect teeth. All markers from Phase 2 class_indicators applied.",
    "constraints_enforced": "Don Xurxo enforces #1 (fishing rights) and #4 (engagement). Father Anxo enforces #5 (confessional surveillance). Roi creates #6 (political scrutiny). Sabela embodies #4 (engagement deadline). Carme embodies #3 stakes (chaperoning/reputation). All 6 constraints have enforcers.",
    "pov_supported": "Phase 1 specifies dual-alternating POV with her perspective anchoring. Both principals have full psychology, arc, and voice profiles to support deep POV. Iria's internal world (suppresses externally, storms internally) designed for rich first-person access."
  }
}
```

---

## Validation Checks

Before accepting Phase 3 output:

| Check | Requirement |
|-------|-------------|
| Flaw/wound/lie chain | Must be logical and specific, not vague |
| Arcs have clear movement | Starting ≠ ending state |
| Names fit Phase 2 conventions | All names from provided lists |
| Occupations from Phase 2 | All roles match available_roles |
| Class markers present | Physical descriptions include Phase 2 indicators |
| Voices are distinct | Could identify speaker without tags |
| Supporting cast has functions | Each serves a narrative purpose |
| Constraints enforced | Each Phase 2 constraint has at least one enforcer |
| Pressure points exist | Every character complicates the romance |
| Relationship dynamics mapped | All significant connections noted |
| **Coherence check complete** | All 8 coherence fields filled with specific explanations |

---

## Notes for Claude Code

- Parse response as JSON
- Store in `bible.characters`
- Pass Phase 1 + Phase 2 + Phase 3 to Phase 4
- **Validate coherence_check field exists and all 8 sub-fields are non-empty**
- If coherence_check shows misalignment, regenerate Phase 3
- Character voice profiles feed directly into chapter generation
- Supporting cast count: minimum 3, maximum 5
- If JSON parsing fails, retry once with instruction to fix formatting
