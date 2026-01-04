# Phase 2: World/Setting Generation

## Purpose
Build the world before the characters. Setting determines who can exist, what's possible, and what constraints create conflict. This phase establishes the container the story lives in.

---

## System Prompt

```
You are a world-builder for romance novels. Your task is to construct a vivid, historically/culturally accurate setting that will shape every aspect of the story.

You will receive:
- The original story concept
- Phase 1 Core Foundation (conflict, theme, stakes, tone, timespan, etc.)

Your job is to build the world these characters will inhabit. Every detail should either enable romance, obstruct it, or create texture that makes the story feel real.

CRITICAL: Your output must cohere with Phase 1. Before finalizing, verify:
1. Your conflict_constraints directly create/enforce the external conflict from Phase 1
2. Your time_pressure deadline falls within the timespan from Phase 1
3. Your sensory_palette matches the tone from Phase 1 (dark tone ≠ bright cheerful palette)
4. Your social_rules make the emotional stakes from Phase 1 concrete and real
5. Your key_locations enable every genre hook from Phase 1 (secret relationship needs secret place)
6. Your romance_opportunities include appropriate private spaces for the heat level from Phase 1
7. Your cultural_context creates conditions where the theme from Phase 1 can emerge

If any element doesn't cohere, adjust your output until it does.

## Output Format

Respond with a JSON object containing exactly these fields:

{
  "social_rules": {
    "class_structure": "How society is stratified — who has power, who doesn't",
    "gender_expectations": "What's expected of men and women in this setting",
    "marriage_norms": "How relationships/marriages typically work here",
    "scandal_consequences": "What happens to those who break social rules"
  },
  "key_locations": [
    {
      "name": "Specific name for this place",
      "type": "What kind of space (home, workplace, public, secret)",
      "significance": "Why this location matters to the romance",
      "sensory_details": "What you see, hear, smell, feel here"
    }
  ],
  "cultural_context": {
    "religion": "Role of religion in daily life and relationships",
    "politics": "Political situation and how it affects ordinary people",
    "economy": "How people make money, class mobility potential",
    "community": "How tight-knit or anonymous is society here"
  },
  "conflict_constraints": [
    "Specific rules, laws, or customs that obstruct the romance"
  ],
  "sensory_palette": {
    "visual": "Dominant colors, light quality, landscapes",
    "auditory": "Common sounds of this world",
    "olfactory": "Characteristic smells",
    "tactile": "Textures, temperatures, physical sensations",
    "seasonal": "How the setting changes across the story's timespan"
  },
  "time_pressure": {
    "deadline": "What external event creates urgency",
    "countdown": "When does this deadline hit relative to story timeline"
  },
  "naming_conventions": {
    "male_names": ["5-7 era/culture-appropriate names"],
    "female_names": ["5-7 era/culture-appropriate names"],
    "surnames": ["5-7 era/culture-appropriate family names"],
    "naming_notes": "Any relevant customs (patronymics, nicknames, titles)"
  },
  "available_roles": {
    "male_occupations": ["Jobs/roles available to men in this setting"],
    "female_occupations": ["Jobs/roles available to women in this setting"],
    "class_indicators": "What occupation/dress/speech signals class"
  },
  "romance_opportunities": {
    "where_they_meet": ["Plausible locations for cross-class/forbidden encounters"],
    "how_they_communicate": ["How secret lovers could exchange messages"],
    "private_spaces": ["Where they could be alone without discovery"]
  },
  "coherence_check": {
    "external_conflict_supported": "How conflict_constraints enforce Phase 1 external conflict",
    "timespan_aligned": "How time_pressure fits within Phase 1 timespan",
    "tone_matched": "How sensory_palette reflects Phase 1 tone",
    "stakes_grounded": "How social_rules make Phase 1 stakes real",
    "hooks_enabled": "Which key_locations enable which Phase 1 genre hooks",
    "heat_level_possible": "How romance_opportunities support Phase 1 heat level",
    "theme_emergent": "How cultural_context allows Phase 1 theme to emerge"
  }
}

## Guidelines

SOCIAL RULES:
- Research-accurate for the era and culture
- Focus on rules that directly impact romance
- Scandal consequences must be concrete, not vague
- Include both formal rules (laws) and informal ones (gossip, ostracism)

KEY LOCATIONS (provide 4-6):
- At least one location for each character's "world"
- At least one neutral/crossing-point location where they can meet
- At least one secret/private location
- Each location should be specific, not generic ("the old lighthouse at Punta Faxilda" not "a lighthouse")
- Sensory details should evoke mood appropriate to that space

CULTURAL CONTEXT:
- Be specific to the exact time and place
- Note tensions or changes happening in society (these create story opportunities)
- Religion's role in controlling relationships is often crucial in historical settings
- Economic realities shape what characters can and cannot do

CONFLICT CONSTRAINTS:
- List 4-6 specific obstacles the setting creates
- These should feel insurmountable without being cartoonish
- Mix legal/formal constraints with social/informal ones
- At least one constraint should threaten something beyond the romance (livelihood, family, safety)

SENSORY PALETTE:
- Ground the setting in physical reality
- Seasonal changes should track with the timespan from Phase 1
- Sensory details will be used in chapter generation for consistency

TIME PRESSURE:
- Derive from the setting naturally (harvest, war, arranged marriage, inheritance deadline)
- Should create urgency without feeling contrived
- Countdown should hit in final third of the story
- MUST fall within the timespan established in Phase 1

NAMING CONVENTIONS:
- Must be historically/culturally accurate
- Include variety (not all names from same origin if setting is diverse)
- Note any naming customs that affect dialogue or narration

AVAILABLE ROLES:
- What occupations actually existed for each gender/class
- How occupation signals social standing
- This constrains character creation in Phase 3

ROMANCE OPPORTUNITIES:
- Where could forbidden lovers plausibly meet?
- How would they communicate secretly given the technology/customs?
- Where could they be physically intimate without discovery?
- These must be realistic for the setting — no anachronistic solutions
```

---

## User Prompt Template

```
STORY CONCEPT: {{concept}}

PHASE 1 - CORE FOUNDATION:
{{phase_1_output}}

Build the world for this romance. Every detail should serve the story's conflict, enable the romance, or create authentic texture.

Remember to verify coherence with Phase 1 before finalizing your output.
```

---

## Example Input

```
STORY CONCEPT: Forbidden love between a fisherman's daughter and a landowner's son in 1920s coastal Galicia

PHASE 1 - CORE FOUNDATION:
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

## Example Output

```json
{
  "social_rules": {
    "class_structure": "Three tiers: landed families (fidalgos) who own property and control fishing rights; merchant/artisan middle class in the port town; fishing families (mariñeiros) who own nothing but their labor. Fidalgos and mariñeiros do not socialize. A fidalgo son seen with a fisherman's daughter would be gossip for months.",
    "gender_expectations": "Women manage homes; unmarried women are chaperoned. A fisherman's daughter has more freedom (necessity — she works) but less respectability. A fidalgo's son is expected to marry advantageously and manage estates. Women's reputation is the family's honor.",
    "marriage_norms": "Arranged by families for property/alliance. Love matches happen but are considered foolish. Dowry expected from bride's family. A fisherman's daughter has no dowry — marriage to a fidalgo is unthinkable, not merely difficult.",
    "scandal_consequences": "For her: family shunned, brothers lose fishing access, she becomes unmarriageable, possibly sent away. For him: disinheritance, social exile, but wealth means survival. The asymmetry is brutal — she risks everything, he risks comfort."
  },
  "key_locations": [
    {
      "name": "The Mareña docks",
      "type": "Public/workplace",
      "significance": "Her world — where she works mending nets, selling catch. He has no legitimate reason to be here. Their first meeting must be accidental or concealed.",
      "sensory_details": "Salt spray, fish guts, shouting men, wet rope, tar-black hulls, gulls screaming. Dawn light turning silver on the water. Cold hands, rough nets."
    },
    {
      "name": "Pazo de Soutelo",
      "type": "Private estate",
      "significance": "His family's manor house. She cannot enter as anything but a servant. Represents everything that separates them.",
      "sensory_details": "Stone walls softened by hydrangeas, cool dark interiors, beeswax polish, ticking clocks. Silence and order. The smell of old paper and wood smoke."
    },
    {
      "name": "The Thursday market at Ribeira square",
      "type": "Public/neutral",
      "significance": "Only place classes legitimately mix. She sells fish; he might plausibly browse. They can speak briefly without immediate scandal.",
      "sensory_details": "Chaos of voices in Galician, chickens in cages, bright peppers, muddy cobblestones. Crowds provide cover. Church bells marking the hours."
    },
    {
      "name": "The ruins at Punta da Vela",
      "type": "Secret/private",
      "significance": "Abandoned chapel on the headland. Locals avoid it (haunted, they say). Their secret meeting place.",
      "sensory_details": "Crumbling stone, wild fennel growing through cracks, wind always blowing, the Atlantic roaring below. Cold and exposed but completely private. Stars visible through the broken roof."
    },
    {
      "name": "The Ultramarinos Campos",
      "type": "Semi-public/transitional",
      "significance": "General store where both classes shop (separately). Owned by a widow who notices everything. Gossip central.",
      "sensory_details": "Dim interior, wooden shelves, smell of dried cod and coffee and soap. The widow's eyes following every customer."
    },
    {
      "name": "The cove at As Furnas",
      "type": "Secret/intimate",
      "significance": "Hidden beach accessible only by a difficult path. Where they can be truly alone — and truly themselves.",
      "sensory_details": "White sand, water so clear you see the bottom, sheltered from wind. Warm in summer. The path down is treacherous — commitment required to reach it."
    }
  ],
  "cultural_context": {
    "religion": "Deeply Catholic. Church attendance mandatory for respectability. Priest has social power — his disapproval can ruin families. Sin is real and hell is believed in. The confessional is both refuge and surveillance.",
    "politics": "Primo de Rivera's dictatorship (1923-1930). Political gatherings suppressed. Some young men drawn to anarchist or socialist ideas filtering from the cities. Tension between tradition and modernity. Her brothers might have dangerous political sympathies.",
    "economy": "Fishing rights controlled by landowners who take a percentage of every catch. Bad seasons mean hunger. No social mobility — you die in the class you're born into. Emigration to Argentina or Cuba is the only escape for the poor.",
    "community": "Everyone knows everyone. Nothing is private. Servants talk to servants. A stranger on the road is noticed. Secret-keeping requires constant vigilance."
  },
  "conflict_constraints": [
    "His father holds her family's fishing rights — any scandal means her family loses their livelihood",
    "She cannot read or write (common for her class) — written communication is impossible",
    "Chaperoning norms mean she is rarely alone; her movements are noted",
    "His engagement to a suitable woman is already being negotiated by families",
    "The priest, Father Anxo, is his family's ally and hears her confessions",
    "Her older brother is politically active — association with her brings scrutiny to the family"
  ],
  "sensory_palette": {
    "visual": "Silver-gray Atlantic, green hills, white-washed houses with orange tiles, black fishing boats, blue hydrangeas. Morning fog, afternoon gold, evening purple. His world: dark wood, white linen, candlelight. Her world: bright fish scales, patched cloth, open sky.",
    "auditory": "Galician language (not Castilian) in her world; he speaks Castilian at home. Seabirds, church bells, accordion music at festivals, her mother singing while mending nets, his mother's silence.",
    "olfactory": "Salt always, everywhere. Fish and woodsmoke in her world. Lavender and beeswax in his. The wild fennel at their meeting place becomes their scent.",
    "tactile": "Her hands are rough and strong. His are soft. The chill of Atlantic water. Wool and homespun vs. linen and silk. Stone walls cold even in summer.",
    "seasonal": "Spring: storms, hungry gap before good fishing, raw hope. Summer: long days, abundant catch, golden heat, reckless happiness. Autumn: harvest festival, his engagement announcement, storms returning, everything ending."
  },
  "time_pressure": {
    "deadline": "His formal engagement announcement at the autumn harvest festival — after which he cannot break it off without destroying both families' honor",
    "countdown": "Festival falls in late October. Story begins in March. They have 7 months before the trap closes."
  },
  "naming_conventions": {
    "male_names": ["Anxo", "Breogán", "Roi", "Xurxo", "Alberte", "Uxío", "Lois"],
    "female_names": ["Iria", "Sabela", "Uxía", "Carme", "Rosalía", "Margarida", "Elvira"],
    "surnames": ["Soutelo", "Pazos", "Vilar", "Mariño", "Doval", "Feijóo", "Otero"],
    "naming_notes": "Galician names preferred over Castilian equivalents in this setting. Fishermen often use nicknames (apodos) based on appearance or trade. Fidalgos use full formal names. She might be 'Iria a Loura' (blonde Iria) to her community."
  },
  "available_roles": {
    "male_occupations": ["Fisherman, net-maker, boat-builder, farmer, day laborer, sailor (lower class)", "Merchant, shopkeeper, innkeeper (middle)", "Landowner, estate manager, priest, notary, doctor (upper)"],
    "female_occupations": ["Fish-seller, net-mender, domestic servant, laundress, seamstress (lower)", "Shopkeeper's wife, teacher (rare), midwife (middle)", "Lady of the house, nun (upper) — upper-class women don't work"],
    "class_indicators": "Hands tell everything — rough vs. soft. Language — Galician marks lower class, Castilian marks education. Clothing — patched homespun vs. tailored cloth. Teeth — the poor lose theirs young."
  },
  "romance_opportunities": {
    "where_they_meet": ["Thursday market (legitimate but brief)", "Church (all classes attend but sit separately)", "Cliffs while she gathers mussels (he could be walking 'for health')", "Festival days (crowds provide anonymity)"],
    "how_they_communicate": ["He learns her routines — appears where she'll be", "They establish a signal (a cloth hung from her window, a stone placed on a wall)", "Through a trusted intermediary (risky — who can be trusted?)", "Verbal only — she cannot read"],
    "private_spaces": ["Punta da Vela ruins (primary)", "As Furnas cove (summer only)", "The old granary on the edge of his estate (abandoned)", "Her family's boat at night (extremely risky but possible)"]
  },
  "coherence_check": {
    "external_conflict_supported": "Conflict_constraints #1 (fishing rights) and #4 (engagement negotiation) directly enforce class barrier. Social_rules make cross-class relationship impossible without catastrophic consequences for her family.",
    "timespan_aligned": "Phase 1 specifies 8 months spring-autumn. Time_pressure deadline (October harvest festival) falls at end of that window. 7-month countdown matches.",
    "tone_matched": "Sensory_palette balances beauty with hardship — silver-gray Atlantic, not bright tropical colors. Bittersweet mood reflected in seasonal progression from hope to ending.",
    "stakes_grounded": "Social_rules.scandal_consequences make stakes concrete: she loses family livelihood, becomes unmarriageable. He loses inheritance but survives. Asymmetry matches Phase 1 stakes.",
    "hooks_enabled": "Secret relationship → Punta da Vela ruins + As Furnas cove. Small town pressure → community 'everyone knows everyone.' Class divide → three-tier class_structure + class_indicators. Family loyalty → fishing rights leverage.",
    "heat_level_possible": "Warm heat level requires private spaces for intimate moments. Romance_opportunities.private_spaces provides 4 options. As Furnas cove sensory details (warm, sheltered) support fade-to-black intimacy.",
    "theme_emergent": "Theme 'love as rebellion against inherited fate' enabled by: rigid class_structure with no mobility, economy where 'you die in the class you're born into,' cultural_context tension between tradition and modernity. Rebellion is meaningful because system is total."
  }
}
```

---

## Validation Checks

Before accepting Phase 2 output:

| Check | Requirement |
|-------|-------------|
| Historical accuracy | Social rules, names, occupations fit the era |
| Locations are specific | Named places, not generic ("a beach") |
| Sensory palette is rich | All five senses plus seasonal variation |
| Constraints are concrete | At least 4 specific obstacles |
| Romance opportunities exist | The story must be possible, not just forbidden |
| Time pressure is natural | Deadline emerges from setting, not imposed |
| Naming fits culture | Names match the specific time/place/class |
| **Coherence check complete** | All 7 coherence fields filled with specific explanations |

---

## Notes for Claude Code

- Parse response as JSON
- Store in `bible.world`
- Pass Phase 1 + Phase 2 to Phase 3
- **Validate coherence_check field exists and all 7 sub-fields are non-empty**
- If coherence_check shows misalignment, regenerate Phase 2
- Key locations will be referenced during chapter generation
- Naming conventions feed directly into Phase 3 character names
- If JSON parsing fails, retry once with instruction to fix formatting
