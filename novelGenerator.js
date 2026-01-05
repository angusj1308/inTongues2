// Novel Generator - Bible Generation Pipeline
// Implements Phases 1-8 for generating complete story bibles

import OpenAI from 'openai'
import fs from 'fs/promises'
import path from 'path'

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG = {
  model: 'gpt-4o',
  maxRetries: 3,
  retryDelays: [2000, 4000, 8000],
  timeoutMs: 90000,
  temperature: 0.7,
  // Chapter counts by length preset
  chapterCounts: {
    novella: 12,
    novel: 35
  }
}

// =============================================================================
// OPENAI WRAPPER
// =============================================================================

async function callOpenAI(systemPrompt, userPrompt, options = {}) {
  const { maxRetries = CONFIG.maxRetries, timeoutMs = CONFIG.timeoutMs } = options
  let lastError = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

      try {
        const response = await client.chat.completions.create({
          model: CONFIG.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: options.temperature ?? CONFIG.temperature,
          response_format: { type: 'json_object' }
        })
        clearTimeout(timeoutId)
        return response.choices[0].message.content
      } finally {
        clearTimeout(timeoutId)
      }
    } catch (error) {
      lastError = error
      console.error(`OpenAI call attempt ${attempt + 1} failed:`, error.message)

      if (error.name === 'AbortError') {
        throw new Error(`OpenAI call timed out after ${timeoutMs}ms`)
      }

      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, CONFIG.retryDelays[attempt]))
      }
    }
  }

  throw lastError || new Error('OpenAI call failed after all retries')
}

// =============================================================================
// JSON PARSING
// =============================================================================

function parseJSON(content) {
  try {
    // Try to extract JSON from markdown code blocks if present
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim()
    return { success: true, data: JSON.parse(jsonStr) }
  } catch (error) {
    return { success: false, error: error.message, raw: content }
  }
}

// =============================================================================
// COHERENCE VALIDATION
// =============================================================================

function validateCoherence(coherenceCheck, requiredFields) {
  if (!coherenceCheck) {
    return { valid: false, missing: requiredFields, message: 'coherence_check missing from output' }
  }

  const missing = requiredFields.filter(field => {
    const value = coherenceCheck[field]
    return !value || (typeof value === 'string' && value.trim() === '')
  })

  return {
    valid: missing.length === 0,
    missing,
    message: missing.length > 0 ? `Missing coherence fields: ${missing.join(', ')}` : 'All coherence checks passed'
  }
}

// =============================================================================
// PHASE 1: CORE FOUNDATION
// =============================================================================

const PHASE_1_SYSTEM_PROMPT = `You are a romance novel architect. Your task is to establish the core foundation of a romance story from a user's concept.

You will receive:
- A story concept (1-3 sentences from the user)
- Length preset (novella: 12 chapters, novel: 35 chapters)
- Target reading level (Beginner, Intermediate, Native)

Your job is to define the fundamental elements that every other phase will build upon. Think of this as the story's DNA.

IMPORTANT: Level affects PROSE STYLE only, not plot complexity. A Beginner-level story has the same emotional depth and plot sophistication as Native — only the vocabulary and sentence structure differ during chapter generation.

## Output Format

Respond with a JSON object:

{
  "genre": "Romance",
  "subgenre": "The specific romance subgenre (e.g., Contemporary, Historical, Paranormal)",
  "central_conflict": {
    "external": "The external obstacle keeping them apart (society, circumstances, enemies)",
    "internal": "The internal psychological barriers (fears, wounds, beliefs)",
    "synthesis": "One sentence combining both: 'They must overcome [external] while battling [internal]'"
  },
  "theme": "The thematic statement this story explores (e.g., 'Love requires vulnerability')",
  "emotional_stakes": {
    "if_together": "What they gain emotionally/spiritually if they end up together",
    "if_apart": "What they lose emotionally/spiritually if they don't"
  },
  "tone": {
    "lightness": "0-10 scale (0 = heavy drama, 10 = light comedy)",
    "humor": "Type of humor if any (witty banter, physical comedy, dry wit, none)",
    "sensuality": "0-10 scale (0 = closed door, 10 = explicit)",
    "mood": "Primary emotional atmosphere (hopeful, bittersweet, intense, playful)"
  },
  "genre_hooks": {
    "trope_primary": "The main romance trope (enemies-to-lovers, forbidden love, second chance, etc.)",
    "trope_secondary": "A secondary trope that adds dimension",
    "unique_twist": "What makes THIS story's take on the trope fresh"
  },
  "timespan": {
    "duration": "How long the story covers (days, weeks, months, years)",
    "pacing_rationale": "Why this timespan works for the emotional arc"
  },
  "heat_level": {
    "level": "Sweet | Warm | Hot | Explicit",
    "description": "What this means for this specific story",
    "fade_to_black": true | false
  },
  "pov_structure": {
    "type": "Single | Dual-Alternating | Multiple",
    "primary_pov": "Whose perspective anchors the story",
    "rationale": "Why this POV structure serves the story"
  }
}

## Guidelines

CONFLICT:
- External conflict should create real obstacles, not just misunderstandings
- Internal conflict should connect to character psychology (wounds, fears, lies they believe)
- The two should interlock — external pressures should trigger internal fears

THEME:
- Should emerge naturally from the conflict
- Not a message to preach, but a question to explore
- Should resonate through both character arcs

TONE:
- Be specific. "Romantic" is not enough. Is it swoony? Angsty? Playful? Intense?
- Tone should match the concept. A war-time romance has different tone than a beach read.

TROPES:
- Identify the trope honestly — readers expect trope delivery
- The twist should subvert expectations without betraying the trope's appeal

HEAT LEVEL:
- Default to "Warm" (fade-to-black) unless concept suggests otherwise
- Heat level affects scene selection in later phases`

function buildPhase1UserPrompt(concept, lengthPreset, level) {
  return `STORY CONCEPT: ${concept}

LENGTH: ${lengthPreset} (${CONFIG.chapterCounts[lengthPreset]} chapters)

TARGET LEVEL: ${level}

Generate the core foundation for this romance story. Remember: level affects prose style only, not plot complexity or emotional depth.`
}

async function executePhase1(concept, lengthPreset, level) {
  console.log('Executing Phase 1: Core Foundation...')

  const userPrompt = buildPhase1UserPrompt(concept, lengthPreset, level)
  const response = await callOpenAI(PHASE_1_SYSTEM_PROMPT, userPrompt)
  const parsed = parseJSON(response)

  if (!parsed.success) {
    throw new Error(`Phase 1 JSON parse failed: ${parsed.error}`)
  }

  // Validate required fields
  const data = parsed.data
  const requiredFields = ['genre', 'central_conflict', 'theme', 'emotional_stakes', 'tone', 'genre_hooks', 'timespan', 'heat_level', 'pov_structure']
  const missing = requiredFields.filter(f => !data[f])

  if (missing.length > 0) {
    throw new Error(`Phase 1 missing required fields: ${missing.join(', ')}`)
  }

  console.log('Phase 1 complete.')
  return data
}

// =============================================================================
// PHASE 2: WORLD/SETTING
// =============================================================================

const PHASE_2_SYSTEM_PROMPT = `You are a romance novel world-builder. Your task is to create the setting and social world that will pressure the central relationship.

You will receive:
- The user's original concept
- Phase 1 output (core foundation)

Your job is to build a world that:
1. Creates natural obstacles for the romance
2. Provides rich sensory backdrop
3. Establishes social rules that constrain the characters
4. Offers meaningful locations for key scenes

## Output Format

Respond with a JSON object:

{
  "setting": {
    "time_period": "When (era, year, season)",
    "location": "Where (country, region, city/town)",
    "social_context": "The social world they inhabit (class, profession, community)",
    "atmosphere": "The sensory/emotional feel of this world"
  },
  "social_rules": {
    "explicit_rules": ["Formal rules/laws that affect the relationship"],
    "implicit_rules": ["Unspoken social expectations that create pressure"],
    "consequences": "What happens if rules are broken"
  },
  "key_locations": [
    {
      "name": "Location name",
      "type": "public | private | liminal | symbolic",
      "significance": "Why this location matters to the romance",
      "sensory_palette": {
        "visual": "What they see",
        "auditory": "What they hear",
        "tactile": "What they feel",
        "olfactory": "What they smell"
      }
    }
  ],
  "cultural_context": {
    "values": ["What this society values"],
    "taboos": ["What is forbidden or frowned upon"],
    "rituals": ["Social rituals relevant to the story (festivals, customs, ceremonies)"]
  },
  "conflict_constraints": [
    {
      "constraint": "Specific worldbuilding element that creates obstacle",
      "how_it_pressures": "How it affects the central relationship",
      "potential_resolution": "How it might be overcome or navigated"
    }
  ],
  "time_pressure": {
    "deadline": "If any external deadline exists (season end, departure, event)",
    "urgency_source": "What creates time pressure for the relationship"
  },
  "naming_conventions": {
    "character_names": "Naming style appropriate to setting (cultural, era-appropriate)",
    "place_names": "How locations are named",
    "terms_of_address": "How characters address each other (formal/informal, titles)"
  },
  "available_roles": [
    "Occupations/positions characters could hold in this world"
  ],
  "romance_opportunities": {
    "where_they_meet": "Plausible meeting circumstances",
    "where_they_connect": "Places for intimate conversations",
    "where_they_hide": "Secret or private spaces"
  },
  "coherence_check": {
    "conflict_supported": "How setting enables the central conflict from Phase 1",
    "timespan_aligned": "How setting accommodates the story's timespan",
    "tone_matched": "How setting supports the established tone",
    "stakes_grounded": "How setting makes the emotional stakes tangible",
    "hooks_enabled": "How setting facilitates the genre hooks/tropes",
    "heat_level_possible": "How setting allows for the heat level (privacy, social mores)",
    "theme_emergent": "How setting naturally raises the thematic question"
  }
}

## Guidelines

LOCATIONS:
- Include 4-6 key locations minimum
- Mix public (where they must perform) and private (where they can be real)
- One location should be "theirs" — a space that becomes symbolic of the relationship

CONSTRAINTS:
- World should create 4-6 specific obstacles
- Constraints should feel organic, not contrived
- Each constraint should have a plausible (if difficult) path through

SENSORY DETAIL:
- Be specific. "A beach" is less useful than "A rocky cove where fishing boats shelter from storms, smelling of salt and diesel and the morning's catch"

COHERENCE:
- Every worldbuilding choice should serve the romance
- If a detail doesn't pressure, enable, or illuminate the relationship, reconsider it`

function buildPhase2UserPrompt(concept, phase1) {
  return `ORIGINAL CONCEPT: ${concept}

PHASE 1 OUTPUT (Core Foundation):
${JSON.stringify(phase1, null, 2)}

Build the world and setting that will pressure this romance. Ensure all elements support the central conflict, theme, and tone established in Phase 1.`
}

const PHASE_2_COHERENCE_FIELDS = [
  'conflict_supported',
  'timespan_aligned',
  'tone_matched',
  'stakes_grounded',
  'hooks_enabled',
  'heat_level_possible',
  'theme_emergent'
]

async function executePhase2(concept, phase1) {
  console.log('Executing Phase 2: World/Setting...')

  const userPrompt = buildPhase2UserPrompt(concept, phase1)
  const response = await callOpenAI(PHASE_2_SYSTEM_PROMPT, userPrompt)
  const parsed = parseJSON(response)

  if (!parsed.success) {
    throw new Error(`Phase 2 JSON parse failed: ${parsed.error}`)
  }

  const data = parsed.data

  // Validate coherence check
  const coherenceResult = validateCoherence(data.coherence_check, PHASE_2_COHERENCE_FIELDS)
  if (!coherenceResult.valid) {
    console.warn(`Phase 2 coherence warning: ${coherenceResult.message}`)
    // Could trigger regeneration here, but for now we continue with warning
  }

  console.log('Phase 2 complete.')
  return data
}

// =============================================================================
// PHASE 3: CHARACTERS
// =============================================================================

const PHASE_3_SYSTEM_PROMPT = `You are a romance character architect. Your task is to create psychologically complex, compelling characters whose internal conflicts drive the romance.

You will receive:
- The user's original concept
- Phase 1 output (core foundation)
- Phase 2 output (world/setting)

Your job is to create:
1. A protagonist with a deep wound that affects their ability to love
2. A love interest whose wound complements/challenges the protagonist's
3. Supporting characters who pressure, mirror, or illuminate the central relationship

## Output Format

Respond with a JSON object:

{
  "protagonist": {
    "name": "Full name",
    "age": number,
    "occupation": "From available roles in Phase 2",
    "physical_presence": "How they carry themselves, distinctive features",
    "first_impression": "How others perceive them initially",
    "psychology": {
      "wound": "The formative hurt that shapes them",
      "lie_they_believe": "The false belief born from the wound",
      "fear": "What they're afraid will happen if they're vulnerable",
      "coping_mechanism": "How they protect themselves",
      "external_want": "What they're pursuing (conscious goal)",
      "internal_need": "What they actually need (often unconscious)",
      "fatal_flaw": "The character trait that could doom the relationship"
    },
    "arc": {
      "starts_as": "Who they are at chapter 1",
      "catalyst": "What the love interest triggers in them",
      "transformation": "Who they become by the end",
      "proof_of_change": "The action that demonstrates transformation"
    },
    "voice": {
      "speech_patterns": "How they talk (terse, verbose, formal, casual)",
      "verbal_tics": "Repeated phrases, filler words, patterns",
      "vocabulary_level": "Educated, street-smart, technical, poetic",
      "humor_style": "How they're funny (if at all)",
      "emotional_expression": "How they show (or hide) feelings",
      "topics_avoided": "What they won't talk about"
    },
    "relationship_patterns": {
      "attachment_style": "Secure, anxious, avoidant, disorganized",
      "how_they_love": "Their love language, how they show care",
      "how_they_sabotage": "How they undermine their own relationships",
      "what_they_need_to_learn": "The relationship lesson for their arc"
    }
  },
  "love_interest": {
    "name": "Full name",
    "age": number,
    "occupation": "From available roles in Phase 2",
    "physical_presence": "How they carry themselves, distinctive features",
    "first_impression": "How others perceive them initially",
    "psychology": {
      "wound": "The formative hurt that shapes them",
      "lie_they_believe": "The false belief born from the wound",
      "fear": "What they're afraid will happen if they're vulnerable",
      "coping_mechanism": "How they protect themselves",
      "external_want": "What they're pursuing (conscious goal)",
      "internal_need": "What they actually need (often unconscious)",
      "fatal_flaw": "The character trait that could doom the relationship"
    },
    "arc": {
      "starts_as": "Who they are at chapter 1",
      "catalyst": "What the protagonist triggers in them",
      "transformation": "Who they become by the end",
      "proof_of_change": "The action that demonstrates transformation"
    },
    "voice": {
      "speech_patterns": "How they talk",
      "verbal_tics": "Repeated phrases, patterns",
      "vocabulary_level": "Educational/social level reflected in speech",
      "humor_style": "How they're funny (if at all)",
      "emotional_expression": "How they show (or hide) feelings",
      "topics_avoided": "What they won't talk about"
    },
    "relationship_patterns": {
      "attachment_style": "Secure, anxious, avoidant, disorganized",
      "how_they_love": "Their love language, how they show care",
      "how_they_sabotage": "How they undermine their own relationships",
      "what_they_need_to_learn": "The relationship lesson for their arc"
    }
  },
  "why_these_two": {
    "magnetic_pull": "What draws them together despite obstacles",
    "complementary_wounds": "How their wounds fit together (not identically, but meaningfully)",
    "growth_catalyst": "Why each is the person who can help the other grow",
    "friction_source": "Why they'll clash (beyond external obstacles)"
  },
  "supporting_cast": [
    {
      "name": "Full name",
      "role": "Their narrative function (mentor, antagonist, confidant, mirror, etc.)",
      "relationship_to_protagonist": "How they know/relate to protagonist",
      "relationship_to_love_interest": "How they know/relate to love interest",
      "pressure_point": "How they create pressure on the central relationship",
      "arc_contribution": "What role they play in the character arcs",
      "voice_brief": "Key speech characteristics (2-3 traits)",
      "secret_or_complexity": "What makes them more than a function"
    }
  ],
  "character_dynamics": {
    "power_balance": "Who has power in different contexts",
    "communication_patterns": "How they typically interact (banter, tension, avoidance)",
    "conflict_style": "How they fight (if they fight)",
    "intimacy_barriers": "What prevents easy intimacy",
    "trust_journey": "What trust needs to be built and how"
  },
  "coherence_check": {
    "internal_conflict_embodied": "How protagonist embodies the internal conflict from Phase 1",
    "theme_served": "How both arcs explore the thematic question",
    "stakes_real": "How character wounds make emotional stakes personal",
    "names_sourced": "Confirmation names follow Phase 2 naming conventions",
    "occupations_valid": "Confirmation occupations come from Phase 2 available roles",
    "class_markers_present": "How speech/behavior reflects Phase 2 social context",
    "constraints_enforced": "How Phase 2 constraints affect these specific characters",
    "pov_supported": "How characters support the POV structure from Phase 1"
  }
}

## Guidelines

WOUNDS:
- Wounds should be specific, not generic ("abandoned by mother at 7" not "trust issues")
- The wound should logically produce the lie, fear, and coping mechanism
- Protagonist and love interest wounds should create interesting friction

ARCS:
- Transformation must be earned through story events
- The "proof of change" should be a concrete action, not just a feeling
- Love interest needs a full arc too — they're not just a prize

VOICE:
- Each character should sound distinct
- Voice should reflect background, education, region, personality
- Include specific phrases or patterns readers will recognize

SUPPORTING CAST:
- 3-5 supporting characters for novella, 5-8 for novel
- Each must serve a clear narrative function
- Avoid purely functional characters — give each a secret or complexity`

function buildPhase3UserPrompt(concept, phase1, phase2) {
  return `ORIGINAL CONCEPT: ${concept}

PHASE 1 OUTPUT (Core Foundation):
${JSON.stringify(phase1, null, 2)}

PHASE 2 OUTPUT (World/Setting):
${JSON.stringify(phase2, null, 2)}

Create the characters for this romance. Ensure protagonist embodies the internal conflict, both characters have wounds that create meaningful friction, and all names/occupations come from the established world.`
}

const PHASE_3_COHERENCE_FIELDS = [
  'internal_conflict_embodied',
  'theme_served',
  'stakes_real',
  'names_sourced',
  'occupations_valid',
  'class_markers_present',
  'constraints_enforced',
  'pov_supported'
]

async function executePhase3(concept, phase1, phase2) {
  console.log('Executing Phase 3: Characters...')

  const userPrompt = buildPhase3UserPrompt(concept, phase1, phase2)
  const response = await callOpenAI(PHASE_3_SYSTEM_PROMPT, userPrompt)
  const parsed = parseJSON(response)

  if (!parsed.success) {
    throw new Error(`Phase 3 JSON parse failed: ${parsed.error}`)
  }

  const data = parsed.data

  // Validate coherence check
  const coherenceResult = validateCoherence(data.coherence_check, PHASE_3_COHERENCE_FIELDS)
  if (!coherenceResult.valid) {
    console.warn(`Phase 3 coherence warning: ${coherenceResult.message}`)
  }

  console.log('Phase 3 complete.')
  return data
}

// =============================================================================
// PHASE 4: CHEMISTRY
// =============================================================================

const PHASE_4_SYSTEM_PROMPT = `You are a romance chemistry architect. Your task is to design the specific dynamics, moments, and progression of the romantic relationship.

You will receive:
- The user's original concept
- Phases 1-3 output

Your job is to:
1. Define what makes these two people magnetic to each other
2. Design the key relationship moments (beats)
3. Map the emotional/physical progression
4. Create the symbolic elements that will carry meaning

## Output Format

Respond with a JSON object:

{
  "magnetic_pull": {
    "initial_attraction": "What first catches each person's attention",
    "deeper_recognition": "What they see in each other that others miss",
    "complementary_qualities": "How they balance each other",
    "challenge_offered": "How each challenges the other to grow"
  },
  "friction": {
    "surface_incompatibility": "The obvious reasons they shouldn't work",
    "deep_incompatibility": "The wound-level conflicts that will emerge",
    "external_barriers": "World/circumstance obstacles (from Phase 2)",
    "internal_barriers": "Psychological obstacles (from Phase 3)"
  },
  "relationship_arc": {
    "stages": [
      {
        "name": "Stage name (e.g., 'Awareness', 'Resistance', 'Surrender')",
        "description": "What characterizes this stage",
        "duration": "Approximate chapter range",
        "key_dynamic": "The primary push/pull in this stage",
        "ends_when": "What triggers transition to next stage"
      }
    ]
  },
  "pivotal_moments": {
    "first_meeting": {
      "circumstances": "How they meet",
      "first_impressions": "What each thinks of the other",
      "hook": "What makes them remember this moment",
      "foreshadowing": "What this scene plants for later"
    },
    "first_real_conversation": {
      "trigger": "What prompts genuine exchange",
      "vulnerability": "What gets revealed",
      "shift": "How perception changes",
      "chapter_estimate": "Approximate chapter"
    },
    "point_of_no_return": {
      "moment": "When they both know this is real",
      "what_changes": "What's different after",
      "chapter_estimate": "Approximate chapter"
    },
    "first_intimate_moment": {
      "type": "First kiss, first touch, first confession — whatever fits heat level",
      "emotional_context": "What makes this moment charged",
      "consequences": "How it changes things",
      "chapter_estimate": "Approximate chapter"
    },
    "intimacy_milestone": {
      "description": "Major physical/emotional intimacy milestone",
      "emotional_significance": "Why this matters beyond the physical",
      "chapter_estimate": "Approximate chapter"
    },
    "dark_moment": {
      "trigger": "What causes the apparent breakup/separation",
      "misunderstanding_or_real": "Is it based on miscommunication or genuine conflict?",
      "what_each_believes": "What protagonist thinks, what love interest thinks",
      "chapter_estimate": "Approximate chapter"
    },
    "grand_gesture": {
      "who_acts": "Who makes the move to repair",
      "action": "What they do",
      "sacrifice": "What they risk or give up",
      "chapter_estimate": "Approximate chapter"
    },
    "resolution": {
      "how_they_reunite": "The reconciliation moment",
      "proof_of_growth": "How both demonstrate they've changed",
      "new_equilibrium": "What their relationship looks like now",
      "chapter_estimate": "Approximate chapter"
    }
  },
  "heat_progression": {
    "awareness": "When/how physical awareness begins",
    "tension": "How tension builds before first touch",
    "first_touch": "The first meaningful physical contact",
    "escalation": "How physical intimacy progresses",
    "culmination": "The peak physical moment (appropriate to heat level)",
    "after": "How physical relationship settles"
  },
  "dialogue_dynamics": {
    "banter_style": "How they verbally spar",
    "subtext_patterns": "What goes unsaid but understood",
    "communication_evolution": "How their dialogue changes over the story",
    "signature_exchanges": "Recurring dialogue patterns or callbacks"
  },
  "symbolic_elements": {
    "their_place": "A location that becomes theirs (from Phase 2)",
    "recurring_object": "An object that carries meaning",
    "recurring_gesture": "A physical gesture that becomes significant",
    "recurring_phrase": "A phrase that gains meaning through repetition"
  },
  "coherence_check": {
    "magnetic_pull_from_psychology": "How attraction stems from Phase 3 character psychology",
    "friction_matches_conflicts": "How relationship friction connects to Phase 1 conflicts",
    "arc_serves_theme": "How relationship arc explores Phase 1 theme",
    "moments_use_locations": "How pivotal moments use Phase 2 locations",
    "heat_level_consistent": "How progression matches Phase 1 heat level",
    "character_flaws_challenged": "How relationship challenges Phase 3 fatal flaws",
    "arcs_aligned": "How relationship arc aligns with individual character arcs"
  }
}

## Guidelines

PIVOTAL MOMENTS:
- Each moment should be specific and visual
- Moments should flow causally — each triggers the next
- The dark moment should feel earned, not contrived
- Grand gesture should prove character growth, not just grand romantic action

CHEMISTRY:
- Physical chemistry is great, but emotional chemistry is essential
- Show how they communicate differently with each other vs. others
- Tension is as important as connection

SYMBOLISM:
- Choose symbols that emerge naturally from the story world
- Don't force symbols — they should feel organic
- The best symbols gain meaning through story events`

function buildPhase4UserPrompt(concept, phase1, phase2, phase3) {
  return `ORIGINAL CONCEPT: ${concept}

PHASE 1 OUTPUT (Core Foundation):
${JSON.stringify(phase1, null, 2)}

PHASE 2 OUTPUT (World/Setting):
${JSON.stringify(phase2, null, 2)}

PHASE 3 OUTPUT (Characters):
${JSON.stringify(phase3, null, 2)}

Design the romantic chemistry between ${phase3.protagonist?.name || 'the protagonist'} and ${phase3.love_interest?.name || 'the love interest'}. Ensure all moments use established locations, all dynamics stem from established psychology, and progression matches the established heat level.`
}

const PHASE_4_COHERENCE_FIELDS = [
  'magnetic_pull_from_psychology',
  'friction_matches_conflicts',
  'arc_serves_theme',
  'moments_use_locations',
  'heat_level_consistent',
  'character_flaws_challenged',
  'arcs_aligned'
]

async function executePhase4(concept, phase1, phase2, phase3) {
  console.log('Executing Phase 4: Chemistry...')

  const userPrompt = buildPhase4UserPrompt(concept, phase1, phase2, phase3)
  const response = await callOpenAI(PHASE_4_SYSTEM_PROMPT, userPrompt)
  const parsed = parseJSON(response)

  if (!parsed.success) {
    throw new Error(`Phase 4 JSON parse failed: ${parsed.error}`)
  }

  const data = parsed.data

  // Validate coherence check
  const coherenceResult = validateCoherence(data.coherence_check, PHASE_4_COHERENCE_FIELDS)
  if (!coherenceResult.valid) {
    console.warn(`Phase 4 coherence warning: ${coherenceResult.message}`)
  }

  console.log('Phase 4 complete.')
  return data
}

// =============================================================================
// PHASE 5: PLOT ARCHITECTURE
// =============================================================================

const PHASE_5_SYSTEM_PROMPT = `You are a romance plot architect. Your task is to create the structural skeleton of the story — the beat sheet, subplot architecture, and foreshadowing map.

You will receive:
- The user's original concept
- Phases 1-4 output
- Length preset (novella or novel)

Your job is to:
1. Create a beat sheet mapping key story moments to chapter ranges
2. Design subplots that pressure and illuminate the central romance
3. Plan foreshadowing seeds and their payoffs
4. Map the tension curve

## Output Format

Respond with a JSON object:

{
  "beat_sheet": {
    "opening_image": {
      "description": "The story's first impression — establishes tone and protagonist's starting state",
      "chapter_range": "1",
      "purpose": "What this beat accomplishes"
    },
    "setup": {
      "description": "Establish protagonist's world, wound visible in behavior",
      "chapter_range": "1-X",
      "purpose": "What this beat accomplishes"
    },
    "catalyst": {
      "description": "The event that disrupts the status quo (often: meeting the love interest)",
      "chapter_range": "X",
      "purpose": "What this beat accomplishes"
    },
    "debate": {
      "description": "Protagonist resists the change/attraction",
      "chapter_range": "X-X",
      "purpose": "What this beat accomplishes"
    },
    "break_into_two": {
      "description": "Protagonist commits to the new world/relationship",
      "chapter_range": "X",
      "purpose": "What this beat accomplishes"
    },
    "b_story": {
      "description": "Introduction of subplot and supporting characters who will illuminate theme",
      "chapter_range": "X",
      "purpose": "What this beat accomplishes"
    },
    "fun_and_games": {
      "description": "The promise of the premise — romance develops, tension builds",
      "chapter_range": "X-X",
      "purpose": "What this beat accomplishes"
    },
    "midpoint": {
      "description": "False victory or false defeat — stakes raise, point of no return",
      "chapter_range": "X",
      "purpose": "What this beat accomplishes"
    },
    "bad_guys_close_in": {
      "description": "External/internal pressures mount, relationship tested",
      "chapter_range": "X-X",
      "purpose": "What this beat accomplishes"
    },
    "all_is_lost": {
      "description": "The dark moment — relationship seems doomed",
      "chapter_range": "X",
      "purpose": "What this beat accomplishes"
    },
    "dark_night": {
      "description": "Protagonist confronts wound, realizes truth",
      "chapter_range": "X",
      "purpose": "What this beat accomplishes"
    },
    "break_into_three": {
      "description": "Decision to fight for love despite risk",
      "chapter_range": "X",
      "purpose": "What this beat accomplishes"
    },
    "finale": {
      "description": "Grand gesture, confrontation, resolution",
      "chapter_range": "X-X",
      "purpose": "What this beat accomplishes"
    },
    "final_image": {
      "description": "Mirror of opening showing transformation",
      "chapter_range": "X",
      "purpose": "What this beat accomplishes"
    }
  },
  "subplot_a": {
    "name": "External subplot name",
    "type": "External pressure subplot",
    "connection_to_romance": "How it pressures the central relationship",
    "arc": {
      "setup": "How it's introduced (chapter X)",
      "escalation": "How it intensifies (chapters X-X)",
      "crisis": "How it collides with main plot (chapter X)",
      "resolution": "How it resolves (chapter X)"
    },
    "characters_involved": ["Which supporting characters drive this subplot"],
    "theme_connection": "How it explores/contrasts with main theme"
  },
  "subplot_b": {
    "name": "Internal/relational subplot name",
    "type": "Internal or relationship subplot",
    "connection_to_romance": "How it illuminates the central relationship",
    "arc": {
      "setup": "How it's introduced (chapter X)",
      "development": "How it develops (chapters X-X)",
      "revelation": "Key revelation moment (chapter X)",
      "resolution": "How it resolves (chapter X)"
    },
    "characters_involved": ["Which supporting characters drive this subplot"],
    "theme_connection": "How it explores/contrasts with main theme"
  },
  "integration_map": {
    "collision_points": [
      {
        "chapter": "X",
        "what_collides": "Which plot/subplot elements intersect",
        "effect_on_romance": "How this affects the central relationship"
      }
    ]
  },
  "foreshadowing": {
    "seeds": [
      {
        "seed": "What's planted",
        "plant_chapter": "When planted",
        "payoff_chapter": "When paid off",
        "type": "object | dialogue | event | character trait | world detail"
      }
    ]
  },
  "tension_curve": {
    "description": "How tension rises and falls across the story",
    "peaks": ["Chapter X: description", "Chapter X: description"],
    "valleys": ["Chapter X: description — purpose of breathing room"],
    "climax_chapter": "X"
  },
  "coherence_check": {
    "timespan_honored": "How plot fits within Phase 1 timespan",
    "deadline_placed": "How Phase 2 time pressure is incorporated",
    "supporting_cast_used": "How Phase 3 supporting characters drive subplots",
    "pivotal_moments_placed": "How Phase 4 pivotal moments map to beats",
    "conflict_pressured": "How external/internal conflicts from Phase 1 are pressured throughout",
    "theme_expressed": "How theme is expressed through plot events",
    "arcs_delivered": "How Phase 3 character arcs are delivered through plot"
  }
}

## Guidelines

BEAT SHEET:
- For novella (12 chapters): Compress beats, some may share chapters
- For novel (35 chapters): Full expansion, each beat gets room to breathe
- Chapter numbers should be specific ranges, not vague

SUBPLOTS:
- Subplot A: External — creates pressure, raises stakes, provides action
- Subplot B: Internal — illuminates theme, often involves supporting character with parallel/contrast arc
- Both must connect to the romance, not just exist alongside it

FORESHADOWING:
- Plant 5-8 seeds minimum
- Each seed should feel natural when planted, resonant when paid off
- Include variety: objects, phrases, character details, world elements

TENSION:
- Tension should generally rise but include valleys for reader recovery
- Major peaks at midpoint and dark moment
- Climax is highest tension`

function buildPhase5UserPrompt(concept, phase1, phase2, phase3, phase4, lengthPreset) {
  return `ORIGINAL CONCEPT: ${concept}

LENGTH: ${lengthPreset} (${CONFIG.chapterCounts[lengthPreset]} chapters)

PHASE 1 OUTPUT (Core Foundation):
${JSON.stringify(phase1, null, 2)}

PHASE 2 OUTPUT (World/Setting):
${JSON.stringify(phase2, null, 2)}

PHASE 3 OUTPUT (Characters):
${JSON.stringify(phase3, null, 2)}

PHASE 4 OUTPUT (Chemistry):
${JSON.stringify(phase4, null, 2)}

Create the plot architecture for this ${lengthPreset}. Map all beats to specific chapter ranges, design subplots that use the supporting cast, and plan foreshadowing that will pay off satisfyingly.`
}

const PHASE_5_COHERENCE_FIELDS = [
  'timespan_honored',
  'deadline_placed',
  'supporting_cast_used',
  'pivotal_moments_placed',
  'conflict_pressured',
  'theme_expressed',
  'arcs_delivered'
]

async function executePhase5(concept, phase1, phase2, phase3, phase4, lengthPreset) {
  console.log('Executing Phase 5: Plot Architecture...')

  const userPrompt = buildPhase5UserPrompt(concept, phase1, phase2, phase3, phase4, lengthPreset)
  const response = await callOpenAI(PHASE_5_SYSTEM_PROMPT, userPrompt)
  const parsed = parseJSON(response)

  if (!parsed.success) {
    throw new Error(`Phase 5 JSON parse failed: ${parsed.error}`)
  }

  const data = parsed.data

  // Validate coherence check
  const coherenceResult = validateCoherence(data.coherence_check, PHASE_5_COHERENCE_FIELDS)
  if (!coherenceResult.valid) {
    console.warn(`Phase 5 coherence warning: ${coherenceResult.message}`)
  }

  console.log('Phase 5 complete.')
  return data
}

// =============================================================================
// PHASE 6: CHAPTER BREAKDOWN
// =============================================================================

const PHASE_6_SYSTEM_PROMPT = `You are a romance chapter architect. Your task is to create a detailed breakdown of every chapter — the beats, POV, location, emotional arc, and hooks that will guide actual prose generation.

You will receive:
- The user's original concept
- Phases 1-5 output
- Length preset (novella or novel)

Your job is to:
1. Break down every chapter with specific beats
2. Assign POV per Phase 1 structure
3. Map locations from Phase 2
4. Track emotional arcs from Phase 3
5. Place all Phase 4 moments and Phase 5 plot points
6. Create compelling chapter hooks

## Output Format

Respond with a JSON object:

{
  "chapters": [
    {
      "number": 1,
      "title": "Chapter title",
      "pov": "POV character name",
      "location_primary": "Main location (from Phase 2)",
      "location_secondary": "Secondary location if any",
      "story_time": "When in the story timeline",
      "plot_threads": {
        "main": "What main plot beat this chapter serves",
        "subplot_a": "Subplot A development if any",
        "subplot_b": "Subplot B development if any"
      },
      "beats": [
        "Specific scene beat 1 (what happens)",
        "Specific scene beat 2 (what happens)",
        "Specific scene beat 3 (what happens)"
      ],
      "phase_4_moment": "If this chapter contains a Phase 4 pivotal moment, name it",
      "foreshadowing": {
        "plants": ["Seeds planted this chapter"],
        "payoffs": ["Seeds paid off this chapter"]
      },
      "emotional_arc": {
        "opens": "POV character's emotional state at chapter start",
        "closes": "POV character's emotional state at chapter end"
      },
      "tension_rating": "1-10 scale",
      "hook": {
        "type": "cliffhanger | question | revelation | emotional | decision",
        "description": "What specifically hooks the reader"
      },
      "key_dialogue": "If any crucial dialogue exchange, describe it",
      "sensory_focus": "Primary sensory details to emphasize"
    }
  ],
  "pov_distribution": {
    "protagonist_chapters": [1, 3, 5, ...],
    "love_interest_chapters": [2, 4, 6, ...],
    "balance_check": "Percentage or ratio"
  },
  "timeline": {
    "total_story_time": "How much time passes from Ch 1 to final chapter",
    "time_jumps": [
      {"between_chapters": "X-Y", "duration": "How much time passes"}
    ]
  },
  "coherence_check": {
    "pov_structure_honored": "Confirmation POV follows Phase 1 structure",
    "all_beats_placed": "Confirmation all Phase 5 beats appear in chapters",
    "all_seeds_planted": "Confirmation all Phase 5 foreshadowing seeds are placed",
    "all_pivotal_moments_placed": "Confirmation all Phase 4 moments appear",
    "locations_valid": "Confirmation all locations come from Phase 2",
    "tension_curve_matched": "Confirmation tension ratings match Phase 5 curve",
    "chapter_count_correct": "Confirmation chapter count matches length preset",
    "timespan_honored": "Confirmation timeline matches Phase 1 timespan"
  }
}

## Guidelines

CHAPTER BREAKDOWN:
- For novella (12 chapters): 3-5 beats per chapter
- For novel (35 chapters): 3-7 beats per chapter
- Beats should be specific actions/events, not vague descriptions

POV:
- Follow Phase 1 POV structure (single, dual-alternating, etc.)
- For dual-alternating: Critical scenes should use the POV of whoever has most at stake
- No more than 3 consecutive chapters from same POV

HOOKS:
- Vary hook types — not all cliffhangers
- Each hook should create genuine forward momentum
- Final chapter hook should provide closure, not cliff

EMOTIONAL ARC:
- Each chapter should show emotional movement
- Emotional states should flow logically from previous chapter
- Track the wound/lie/fear from Phase 3 as they're challenged

FORESHADOWING:
- Every seed from Phase 5 must appear in a chapter
- Every payoff must have been planted earlier
- Track carefully — orphan seeds or payoffs break the story`

function buildPhase6UserPrompt(concept, phase1, phase2, phase3, phase4, phase5, lengthPreset) {
  return `ORIGINAL CONCEPT: ${concept}

LENGTH: ${lengthPreset} (${CONFIG.chapterCounts[lengthPreset]} chapters)

PHASE 1 OUTPUT (Core Foundation):
${JSON.stringify(phase1, null, 2)}

PHASE 2 OUTPUT (World/Setting):
${JSON.stringify(phase2, null, 2)}

PHASE 3 OUTPUT (Characters):
${JSON.stringify(phase3, null, 2)}

PHASE 4 OUTPUT (Chemistry):
${JSON.stringify(phase4, null, 2)}

PHASE 5 OUTPUT (Plot Architecture):
${JSON.stringify(phase5, null, 2)}

Create a complete chapter-by-chapter breakdown for all ${CONFIG.chapterCounts[lengthPreset]} chapters. Every beat from Phase 5 must be placed, every Phase 4 pivotal moment must have a chapter, and all foreshadowing seeds must be tracked.`
}

const PHASE_6_COHERENCE_FIELDS = [
  'pov_structure_honored',
  'all_beats_placed',
  'all_seeds_planted',
  'all_pivotal_moments_placed',
  'locations_valid',
  'tension_curve_matched',
  'chapter_count_correct',
  'timespan_honored'
]

async function executePhase6(concept, phase1, phase2, phase3, phase4, phase5, lengthPreset) {
  console.log('Executing Phase 6: Chapter Breakdown...')

  const userPrompt = buildPhase6UserPrompt(concept, phase1, phase2, phase3, phase4, phase5, lengthPreset)
  const response = await callOpenAI(PHASE_6_SYSTEM_PROMPT, userPrompt)
  const parsed = parseJSON(response)

  if (!parsed.success) {
    throw new Error(`Phase 6 JSON parse failed: ${parsed.error}`)
  }

  const data = parsed.data

  // Validate coherence check
  const coherenceResult = validateCoherence(data.coherence_check, PHASE_6_COHERENCE_FIELDS)
  if (!coherenceResult.valid) {
    console.warn(`Phase 6 coherence warning: ${coherenceResult.message}`)
  }

  // Validate chapter count
  const expectedCount = CONFIG.chapterCounts[lengthPreset]
  if (data.chapters?.length !== expectedCount) {
    console.warn(`Phase 6 chapter count mismatch: expected ${expectedCount}, got ${data.chapters?.length}`)
  }

  console.log('Phase 6 complete.')
  return data
}

// =============================================================================
// PHASE 7: LEVEL CHECK
// =============================================================================

const PHASE_7_SYSTEM_PROMPT = `You are a language learning content specialist. Your task is to review a complete story bible and chapter outline to verify it will work at the target reading level.

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
      "chapter": 1,
      "note": "Specific guidance for this chapter at target level"
    }
  ],
  "ready_for_generation": true,
  "blocking_issues": []
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
- Emotional stakes (same stakes, different words)`

function buildPhase7UserPrompt(level, phases1to6) {
  return `TARGET LEVEL: ${level}

COMPLETE BIBLE:
${JSON.stringify(phases1to6, null, 2)}

Review this bible for the target reading level. Flag any elements that need special handling in generation, provide prose guidance, and confirm readiness.`
}

async function executePhase7(level, phases1to6) {
  console.log('Executing Phase 7: Level Check...')

  const userPrompt = buildPhase7UserPrompt(level, phases1to6)
  const response = await callOpenAI(PHASE_7_SYSTEM_PROMPT, userPrompt)
  const parsed = parseJSON(response)

  if (!parsed.success) {
    throw new Error(`Phase 7 JSON parse failed: ${parsed.error}`)
  }

  const data = parsed.data

  if (!data.ready_for_generation) {
    console.warn('Phase 7: Bible flagged as not ready for generation')
    console.warn('Blocking issues:', data.blocking_issues)
  }

  console.log('Phase 7 complete.')
  return data
}

// =============================================================================
// PHASE 8: VALIDATION
// =============================================================================

const PHASE_8_SYSTEM_PROMPT = `You are a story validation specialist. Your task is to perform a comprehensive audit of a complete story bible, checking for coherence, completeness, and internal consistency.

You will receive:
- The complete bible (Phases 1-7 output)

Your job is to:
1. Validate every element against every other element
2. Identify any gaps, contradictions, or missing pieces
3. Flag issues with specific locations and severity
4. Recommend recovery paths for any failures
5. Approve for generation OR specify what needs fixing

This is the final gate. Be thorough. A problem caught here saves many chapters of broken story.

## Validation Categories

You must check ALL of the following:

1. CHARACTER ARCS - Every arc has setup, transformation, payoff
2. SUBPLOT RESOLUTION - Both subplots have complete arcs
3. CAUSE AND EFFECT - Events chain logically
4. FORESHADOWING INTEGRITY - All seeds planted and paid off
5. TENSION CURVE - Rises appropriately with valleys for breathing
6. CHAPTER HOOKS - Every chapter ends with a hook
7. VOICE DISTINCTION - Characters sound different
8. CHEMISTRY ARCHITECTURE - All pivotal moments placed correctly
9. TIMELINE CONSISTENCY - Time flows logically
10. POV BALANCE - POV distribution matches structure
11. THEME EXPRESSION - Theme expressed through character choices
12. LOCATION USAGE - All key locations used
13. CONSTRAINT ENFORCEMENT - Phase 2 constraints create real obstacles
14. LEVEL READINESS - Phase 7 flags are addressable

## Output Format

Respond with a JSON object:

{
  "validation_status": "PASS | FAIL | CONDITIONAL_PASS",
  "summary": "One paragraph overall assessment",
  "checks": {
    "character_arcs": {
      "status": "pass | fail | warning",
      "details": "Specific findings",
      "issues": []
    },
    "subplot_resolution": { "status": "pass | fail | warning", "details": "", "issues": [] },
    "cause_and_effect": { "status": "pass | fail | warning", "details": "", "issues": [] },
    "foreshadowing_integrity": { "status": "pass | fail | warning", "details": "", "issues": [] },
    "tension_curve": { "status": "pass | fail | warning", "details": "", "issues": [] },
    "chapter_hooks": { "status": "pass | fail | warning", "details": "", "issues": [] },
    "voice_distinction": { "status": "pass | fail | warning", "details": "", "issues": [] },
    "chemistry_architecture": { "status": "pass | fail | warning", "details": "", "issues": [] },
    "timeline_consistency": { "status": "pass | fail | warning", "details": "", "issues": [] },
    "pov_balance": { "status": "pass | fail | warning", "details": "", "issues": [] },
    "theme_expression": { "status": "pass | fail | warning", "details": "", "issues": [] },
    "location_usage": { "status": "pass | fail | warning", "details": "", "issues": [] },
    "constraint_enforcement": { "status": "pass | fail | warning", "details": "", "issues": [] },
    "level_readiness": { "status": "pass | fail | warning", "details": "", "issues": [] }
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
    "required_regenerations": [],
    "regeneration_order": "Which phase to regenerate first",
    "specific_instructions": "What to fix in regeneration"
  },
  "generation_ready": true,
  "approval_notes": "Final notes for chapter generation if approved"
}

## Severity Levels

PASS: Check fully satisfied. No issues.
WARNING: Minor issue that won't break the story. Generation can proceed.
FAIL: Issue that will cause problems. Must be fixed before generation.

## Validation Status

PASS: All checks pass. Ready for generation.
CONDITIONAL_PASS: Some warnings but no failures. Can proceed with noted cautions.
FAIL: One or more critical failures. Must regenerate specified phases.`

function buildPhase8UserPrompt(completeBible) {
  return `COMPLETE BIBLE:

PHASE 1 - CORE FOUNDATION:
${JSON.stringify(completeBible.coreFoundation, null, 2)}

PHASE 2 - WORLD/SETTING:
${JSON.stringify(completeBible.world, null, 2)}

PHASE 3 - CHARACTERS:
${JSON.stringify(completeBible.characters, null, 2)}

PHASE 4 - CHEMISTRY:
${JSON.stringify(completeBible.chemistry, null, 2)}

PHASE 5 - PLOT ARCHITECTURE:
${JSON.stringify(completeBible.plot, null, 2)}

PHASE 6 - CHAPTER BREAKDOWN:
${JSON.stringify(completeBible.chapters, null, 2)}

PHASE 7 - LEVEL CHECK:
${JSON.stringify(completeBible.levelCheck, null, 2)}

Perform comprehensive validation of this bible. Check all 14 categories. Identify any issues and specify recovery paths. Approve for generation only if the bible is complete and internally consistent.`
}

async function executePhase8(completeBible) {
  console.log('Executing Phase 8: Validation...')

  const userPrompt = buildPhase8UserPrompt(completeBible)
  const response = await callOpenAI(PHASE_8_SYSTEM_PROMPT, userPrompt)
  const parsed = parseJSON(response)

  if (!parsed.success) {
    throw new Error(`Phase 8 JSON parse failed: ${parsed.error}`)
  }

  const data = parsed.data

  console.log(`Phase 8 complete. Status: ${data.validation_status}`)

  if (data.validation_status === 'FAIL') {
    console.warn('Validation failed. Critical issues:', data.critical_issues)
  }

  return data
}

// =============================================================================
// REGENERATION
// =============================================================================

async function regenerateFromPhase(phaseNumber, completeBible, concept, level, lengthPreset, specificInstructions) {
  console.log(`Regenerating from Phase ${phaseNumber}...`)
  console.log(`Instructions: ${specificInstructions}`)

  // Re-run phases from the specified phase forward
  let updatedBible = { ...completeBible }

  switch (phaseNumber) {
    case 1:
      updatedBible.coreFoundation = await executePhase1(concept, lengthPreset, level)
      // Fall through to regenerate subsequent phases
    case 2:
      if (phaseNumber <= 2) {
        updatedBible.world = await executePhase2(concept, updatedBible.coreFoundation)
      }
    case 3:
      if (phaseNumber <= 3) {
        updatedBible.characters = await executePhase3(concept, updatedBible.coreFoundation, updatedBible.world)
      }
    case 4:
      if (phaseNumber <= 4) {
        updatedBible.chemistry = await executePhase4(concept, updatedBible.coreFoundation, updatedBible.world, updatedBible.characters)
      }
    case 5:
      if (phaseNumber <= 5) {
        updatedBible.plot = await executePhase5(concept, updatedBible.coreFoundation, updatedBible.world, updatedBible.characters, updatedBible.chemistry, lengthPreset)
      }
    case 6:
      if (phaseNumber <= 6) {
        updatedBible.chapters = await executePhase6(concept, updatedBible.coreFoundation, updatedBible.world, updatedBible.characters, updatedBible.chemistry, updatedBible.plot, lengthPreset)
      }
    case 7:
      if (phaseNumber <= 7) {
        const phases1to6 = {
          coreFoundation: updatedBible.coreFoundation,
          world: updatedBible.world,
          characters: updatedBible.characters,
          chemistry: updatedBible.chemistry,
          plot: updatedBible.plot,
          chapters: updatedBible.chapters
        }
        updatedBible.levelCheck = await executePhase7(level, phases1to6)
      }
      break
  }

  return updatedBible
}

// =============================================================================
// MAIN PIPELINE
// =============================================================================

export async function generateBible(concept, level, lengthPreset, language, maxValidationAttempts = 2) {
  console.log('='.repeat(60))
  console.log('STARTING BIBLE GENERATION PIPELINE')
  console.log(`Concept: ${concept}`)
  console.log(`Level: ${level}, Length: ${lengthPreset}, Language: ${language}`)
  console.log('='.repeat(60))

  let bible = {}
  let validationAttempts = 0

  try {
    // Phase 1: Core Foundation
    bible.coreFoundation = await executePhase1(concept, lengthPreset, level)

    // Phase 2: World/Setting
    bible.world = await executePhase2(concept, bible.coreFoundation)

    // Phase 3: Characters
    bible.characters = await executePhase3(concept, bible.coreFoundation, bible.world)

    // Phase 4: Chemistry
    bible.chemistry = await executePhase4(concept, bible.coreFoundation, bible.world, bible.characters)

    // Phase 5: Plot Architecture
    bible.plot = await executePhase5(concept, bible.coreFoundation, bible.world, bible.characters, bible.chemistry, lengthPreset)

    // Phase 6: Chapter Breakdown
    bible.chapters = await executePhase6(concept, bible.coreFoundation, bible.world, bible.characters, bible.chemistry, bible.plot, lengthPreset)

    // Phase 7: Level Check
    const phases1to6 = {
      coreFoundation: bible.coreFoundation,
      world: bible.world,
      characters: bible.characters,
      chemistry: bible.chemistry,
      plot: bible.plot,
      chapters: bible.chapters
    }
    bible.levelCheck = await executePhase7(level, phases1to6)

    // Phase 8: Validation (with potential regeneration)
    while (validationAttempts < maxValidationAttempts) {
      validationAttempts++
      console.log(`Validation attempt ${validationAttempts}/${maxValidationAttempts}`)

      bible.validation = await executePhase8(bible)

      if (bible.validation.validation_status === 'PASS' || bible.validation.validation_status === 'CONDITIONAL_PASS') {
        console.log('Bible validation passed!')
        break
      }

      if (validationAttempts < maxValidationAttempts && bible.validation.recovery_plan?.required_regenerations?.length > 0) {
        // Get the earliest phase to regenerate from
        const phasesToRegenerate = bible.validation.recovery_plan.required_regenerations
        const phaseNumbers = phasesToRegenerate.map(p => parseInt(p.replace('Phase ', '')))
        const earliestPhase = Math.min(...phaseNumbers)

        console.log(`Regenerating from Phase ${earliestPhase}...`)
        bible = await regenerateFromPhase(
          earliestPhase,
          bible,
          concept,
          level,
          lengthPreset,
          bible.validation.recovery_plan.specific_instructions
        )
      }
    }

    console.log('='.repeat(60))
    console.log('BIBLE GENERATION COMPLETE')
    console.log(`Final validation status: ${bible.validation?.validation_status || 'NOT_VALIDATED'}`)
    console.log('='.repeat(60))

    return {
      success: true,
      bible,
      validationStatus: bible.validation?.validation_status || 'NOT_VALIDATED',
      validationAttempts
    }

  } catch (error) {
    console.error('Bible generation failed:', error)
    return {
      success: false,
      error: error.message,
      partialBible: bible,
      validationAttempts
    }
  }
}

// =============================================================================
// CHAPTER GENERATION
// =============================================================================

const CHAPTER_SYSTEM_PROMPT = `You are a romance novelist writing in {{target_language}}. Your task is to write a single chapter that executes the provided beats while maintaining voice consistency, continuity, and reading level.

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
- You are writing from the POV character's perspective
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
    "title": "Chapter title",
    "content": "The full chapter prose in {{target_language}}..."
  },
  "summary": {
    "events": ["Brief description of event 1", "Brief description of event 2"],
    "characterStates": {
      "protagonist_name": "Emotional/situational state at chapter end",
      "love_interest_name": "Emotional/situational state at chapter end"
    },
    "relationshipState": "Where the romantic relationship stands now",
    "reveals": ["Any new information revealed this chapter"],
    "seedsPlanted": ["Any foreshadowing seeds planted"],
    "seedsPaid": ["Any foreshadowing seeds that paid off"],
    "locationEnd": "Where POV character is at chapter end",
    "timeElapsed": "How much story time this chapter covered"
  },
  "metadata": {
    "wordCount": number,
    "beatsCovered": ["Beat 1", "Beat 2"],
    "hookDelivered": "Description of how chapter ends",
    "hookType": "cliffhanger | question | revelation | emotional | decision"
  }
}

IMPORTANT: The "content" field must contain the complete chapter prose in {{target_language}}. This is the actual story text readers will see. Write it as a proper chapter — not an outline, not a summary, but full narrative prose with scenes, dialogue, and interiority.`

// Word count targets by tension rating
const WORD_COUNT_BY_TENSION = {
  low: { min: 1800, max: 2200 },    // Tension 3-4
  medium: { min: 2200, max: 2800 }, // Tension 5-7
  high: { min: 2800, max: 3500 }    // Tension 8-10
}

function getWordCountTarget(tensionRating) {
  if (tensionRating <= 4) return WORD_COUNT_BY_TENSION.low
  if (tensionRating <= 7) return WORD_COUNT_BY_TENSION.medium
  return WORD_COUNT_BY_TENSION.high
}

function buildChapterUserPrompt(bible, chapterIndex, previousSummaries, language) {
  const chapter = bible.chapters.chapters[chapterIndex - 1]
  if (!chapter) throw new Error(`Chapter ${chapterIndex} not found in bible`)

  const protagonist = bible.characters.protagonist
  const loveInterest = bible.characters.love_interest
  const isPovProtagonist = chapter.pov === protagonist?.name
  const povCharacter = isPovProtagonist ? protagonist : loveInterest
  const otherCharacter = isPovProtagonist ? loveInterest : protagonist

  const wordCountTarget = getWordCountTarget(chapter.tension_rating || 5)

  // Build previous summaries section
  let previousContext = ''
  if (previousSummaries && previousSummaries.length > 0) {
    previousContext = previousSummaries.map(s => {
      if (s.type === 'full') {
        return `Chapter ${s.number} (${s.pov}):
Events: ${s.summary.events?.join(', ') || 'N/A'}
Relationship: ${s.summary.relationshipState || 'N/A'}
Emotional state: ${JSON.stringify(s.summary.characterStates || {})}`
      } else if (s.type === 'compressed') {
        return `Ch ${s.number} (${s.pov}): ${s.compressedSummary}`
      } else {
        return `Ch ${s.number}: ${s.ultraSummary}`
      }
    }).join('\n\n')
  } else {
    previousContext = 'This is Chapter 1. No previous context.'
  }

  // Get prose guidance from levelCheck
  const proseGuidance = bible.levelCheck?.prose_guidance || {}
  const proseGuidanceText = Object.entries(proseGuidance)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join('\n')

  return `STORY BIBLE:

Genre: ${bible.coreFoundation.genre}
Theme: ${bible.coreFoundation.theme}
Tone: ${JSON.stringify(bible.coreFoundation.tone)}
Heat Level: ${bible.coreFoundation.heat_level?.level || 'Warm'}

Setting: ${bible.world.setting?.location}, ${bible.world.setting?.time_period}
Key Location This Chapter: ${chapter.location_primary}
${chapter.location_secondary ? `Secondary Location: ${chapter.location_secondary}` : ''}

CENTRAL CONFLICT:
External: ${bible.coreFoundation.central_conflict?.external}
Internal: ${bible.coreFoundation.central_conflict?.internal}

---

POV CHARACTER THIS CHAPTER: ${chapter.pov}

Psychology:
- Want: ${povCharacter?.psychology?.external_want || 'N/A'}
- Need: ${povCharacter?.psychology?.internal_need || 'N/A'}
- Flaw: ${povCharacter?.psychology?.fatal_flaw || 'N/A'}
- Fear: ${povCharacter?.psychology?.fear || 'N/A'}
- Lie they believe: ${povCharacter?.psychology?.lie_they_believe || 'N/A'}

Voice Profile:
- Speech patterns: ${povCharacter?.voice?.speech_patterns || 'N/A'}
- Verbal tics: ${povCharacter?.voice?.verbal_tics || 'N/A'}
- Vocabulary level: ${povCharacter?.voice?.vocabulary_level || 'N/A'}
- Emotional expression: ${povCharacter?.voice?.emotional_expression || 'N/A'}
- Topics they avoid: ${povCharacter?.voice?.topics_avoided || 'N/A'}
- Humor style: ${povCharacter?.voice?.humor_style || 'N/A'}

---

OTHER MAIN CHARACTER: ${otherCharacter?.name}
- Voice: ${otherCharacter?.voice?.speech_patterns || 'N/A'}
- Verbal tics: ${otherCharacter?.voice?.verbal_tics || 'N/A'}

---

CHAPTER ${chapter.number}: ${chapter.title}

Story Time: ${chapter.story_time}

Plot Threads Active:
- Main: ${chapter.plot_threads?.main || 'N/A'}
${chapter.plot_threads?.subplot_a ? `- Subplot A: ${chapter.plot_threads.subplot_a}` : ''}
${chapter.plot_threads?.subplot_b ? `- Subplot B: ${chapter.plot_threads.subplot_b}` : ''}

BEATS TO HIT (in order):
${chapter.beats?.map((beat, i) => `${i + 1}. ${beat}`).join('\n') || 'N/A'}

Emotional Arc:
- Opens: ${chapter.emotional_arc?.opens || 'N/A'}
- Closes: ${chapter.emotional_arc?.closes || 'N/A'}

${chapter.phase_4_moment ? `KEY MOMENT: This chapter contains "${chapter.phase_4_moment}" — a pivotal relationship moment. Give it weight.` : ''}

FORESHADOWING:
${chapter.foreshadowing?.plants?.length > 0 ? `Plant these seeds (weave naturally):\n${chapter.foreshadowing.plants.map(s => `- ${s}`).join('\n')}` : ''}
${chapter.foreshadowing?.payoffs?.length > 0 ? `Pay off these seeds (callback to earlier):\n${chapter.foreshadowing.payoffs.map(s => `- ${s}`).join('\n')}` : ''}

CHAPTER ENDING:
Hook Type: ${chapter.hook?.type || 'emotional'}
Hook Description: ${chapter.hook?.description || 'End with emotional resonance'}

Tension Rating: ${chapter.tension_rating || 5}/10
Target Word Count: ${wordCountTarget.min}-${wordCountTarget.max} words

---

PREVIOUS CONTEXT:

${previousContext}

---

LEVEL: ${bible.levelCheck?.target_level || 'Intermediate'}

PROSE GUIDANCE:
${proseGuidanceText || 'Follow standard prose conventions.'}

---

Write Chapter ${chapter.number} now. Full prose in ${language}. Hit every beat. End with the ${chapter.hook?.type || 'emotional'} hook. Stay within ${wordCountTarget.min}-${wordCountTarget.max} words.`
}

// Validate chapter output
function validateChapterOutput(chapterData, expectedBeats, expectedHookType, wordCountTarget) {
  const issues = []

  // Check content exists and has reasonable length
  const content = chapterData?.chapter?.content
  if (!content || content.length < 1000) {
    issues.push({ type: 'content_missing', message: 'Chapter content is missing or too short' })
  }

  // Count words (rough estimate)
  const wordCount = content ? content.split(/\s+/).length : 0
  if (wordCount < wordCountTarget.min * 0.8) {
    issues.push({ type: 'too_short', message: `Word count ${wordCount} is below minimum ${wordCountTarget.min}`, wordCount })
  }
  if (wordCount > wordCountTarget.max * 1.3) {
    issues.push({ type: 'too_long', message: `Word count ${wordCount} exceeds maximum ${wordCountTarget.max}`, wordCount })
  }

  // Check hook type matches
  const hookType = chapterData?.metadata?.hookType
  if (hookType && expectedHookType && hookType !== expectedHookType) {
    issues.push({ type: 'wrong_hook', message: `Hook type ${hookType} doesn't match expected ${expectedHookType}`, expected: expectedHookType, actual: hookType })
  }

  // Check beats covered
  const beatsCovered = chapterData?.metadata?.beatsCovered || []
  if (expectedBeats && beatsCovered.length < expectedBeats.length * 0.7) {
    issues.push({ type: 'missing_beats', message: `Only ${beatsCovered.length} of ${expectedBeats.length} beats covered`, expected: expectedBeats.length, actual: beatsCovered.length })
  }

  // Check summary exists
  if (!chapterData?.summary) {
    issues.push({ type: 'missing_summary', message: 'Chapter summary is missing' })
  }

  return {
    valid: issues.length === 0,
    issues,
    wordCount,
    beatsCovered: beatsCovered.length
  }
}

// Generate a single chapter
async function generateChapter(bible, chapterIndex, previousSummaries, language) {
  console.log(`Generating Chapter ${chapterIndex}...`)

  const chapter = bible.chapters.chapters[chapterIndex - 1]
  if (!chapter) throw new Error(`Chapter ${chapterIndex} not found in bible`)

  const wordCountTarget = getWordCountTarget(chapter.tension_rating || 5)

  // Build the system prompt with language substitution
  const systemPrompt = CHAPTER_SYSTEM_PROMPT.replace(/\{\{target_language\}\}/g, language)

  // Build user prompt
  const userPrompt = buildChapterUserPrompt(bible, chapterIndex, previousSummaries, language)

  // Call OpenAI
  const response = await callOpenAI(systemPrompt, userPrompt, { temperature: 0.8 })
  const parsed = parseJSON(response)

  if (!parsed.success) {
    throw new Error(`Chapter ${chapterIndex} JSON parse failed: ${parsed.error}`)
  }

  const chapterData = parsed.data

  // Validate output
  const validation = validateChapterOutput(
    chapterData,
    chapter.beats,
    chapter.hook?.type,
    wordCountTarget
  )

  if (!validation.valid) {
    console.warn(`Chapter ${chapterIndex} validation issues:`, validation.issues)
  }

  console.log(`Chapter ${chapterIndex} generated. Word count: ${validation.wordCount}`)

  return {
    ...chapterData,
    validation,
    generatedAt: new Date().toISOString()
  }
}

// =============================================================================
// SUMMARY COMPRESSION
// =============================================================================

const COMPRESSION_SYSTEM_PROMPT = `You are a continuity editor. Your task is to compress chapter summaries while preserving all information essential for story continuity.

Preserve:
- Key plot events (what happened)
- Character emotional states (how they feel now)
- Relationship state (where the romance stands)
- Important reveals (information characters now know)
- Foreshadowing planted (seeds that need future payoff)
- Time and location (when/where chapter ended)

Discard:
- Detailed scene descriptions
- Minor character interactions
- Atmospheric details
- Specific dialogue (unless crucial)
- Redundant information

## Output Format

For COMPRESSED level:
{
  "compressed_summaries": [
    {
      "chapter": 1,
      "pov": "Character name",
      "summary": "2-3 sentences covering events, emotional state, relationship state, any reveals or seeds."
    }
  ]
}

For ULTRA level:
{
  "ultra_summaries": [
    {
      "chapter": 1,
      "summary": "One sentence. Bare facts."
    }
  ]
}`

async function compressSummaries(summaries, level) {
  console.log(`Compressing ${summaries.length} summaries to ${level} level...`)

  const summariesText = summaries.map(s => `---
CHAPTER ${s.number} (POV: ${s.pov})

Events:
${s.summary.events?.map(e => `- ${e}`).join('\n') || 'N/A'}

Character States:
${Object.entries(s.summary.characterStates || {}).map(([k, v]) => `- ${k}: ${v}`).join('\n') || 'N/A'}

Relationship State: ${s.summary.relationshipState || 'N/A'}

Reveals:
${s.summary.reveals?.map(r => `- ${r}`).join('\n') || 'None'}

Seeds Planted:
${s.summary.seedsPlanted?.map(s => `- ${s}`).join('\n') || 'None'}

Location at End: ${s.summary.locationEnd || 'N/A'}
---`).join('\n\n')

  const userPrompt = `COMPRESSION LEVEL: ${level}

FULL SUMMARIES TO COMPRESS:

${summariesText}

Compress these summaries to ${level} level. Preserve continuity-critical information.`

  const response = await callOpenAI(COMPRESSION_SYSTEM_PROMPT, userPrompt)
  const parsed = parseJSON(response)

  if (!parsed.success) {
    throw new Error(`Summary compression failed: ${parsed.error}`)
  }

  return parsed.data
}

// Determine which summaries need compression based on current chapter
function getSummaryCompressionStrategy(chapterIndex, allSummaries) {
  // Chapters 1-5: All full summaries
  // Chapters 6-15: Last 5 full, Ch 1-5 compressed
  // Chapters 16-30: Last 5 full, Ch 6-10 compressed, Ch 1-5 ultra
  // Chapters 31+: Last 5 full, Ch 11-25 compressed, Ch 1-10 ultra

  const result = {
    full: [],
    needsCompression: [],
    needsUltra: []
  }

  const currentIndex = chapterIndex - 1 // 0-indexed

  if (chapterIndex <= 5) {
    // All full
    result.full = allSummaries.slice(0, currentIndex)
  } else if (chapterIndex <= 15) {
    // Last 5 full, 1-5 compressed
    result.full = allSummaries.slice(Math.max(0, currentIndex - 5), currentIndex)
    result.needsCompression = allSummaries.slice(0, Math.min(5, currentIndex - 5))
  } else if (chapterIndex <= 30) {
    // Last 5 full, 6-10 compressed, 1-5 ultra
    result.full = allSummaries.slice(Math.max(0, currentIndex - 5), currentIndex)
    result.needsCompression = allSummaries.slice(5, Math.min(10, currentIndex - 5))
    result.needsUltra = allSummaries.slice(0, 5)
  } else {
    // Last 5 full, 11-25 compressed, 1-10 ultra
    result.full = allSummaries.slice(Math.max(0, currentIndex - 5), currentIndex)
    result.needsCompression = allSummaries.slice(10, Math.min(25, currentIndex - 5))
    result.needsUltra = allSummaries.slice(0, 10)
  }

  return result
}

// Build context with appropriate compression
async function buildPreviousContext(chapterIndex, allSummaries) {
  if (chapterIndex === 1 || allSummaries.length === 0) {
    return []
  }

  const strategy = getSummaryCompressionStrategy(chapterIndex, allSummaries)
  const context = []

  // Add ultra-compressed summaries
  if (strategy.needsUltra.length > 0) {
    // Check if we have cached ultra summaries
    const needsUltraCompression = strategy.needsUltra.filter(s => !s.ultraSummary)
    if (needsUltraCompression.length > 0) {
      const compressed = await compressSummaries(needsUltraCompression, 'ultra')
      // Merge back
      compressed.ultra_summaries?.forEach(cs => {
        const original = strategy.needsUltra.find(s => s.number === cs.chapter)
        if (original) original.ultraSummary = cs.summary
      })
    }
    strategy.needsUltra.forEach(s => {
      context.push({ type: 'ultra', number: s.number, ultraSummary: s.ultraSummary })
    })
  }

  // Add compressed summaries
  if (strategy.needsCompression.length > 0) {
    const needsCompression = strategy.needsCompression.filter(s => !s.compressedSummary)
    if (needsCompression.length > 0) {
      const compressed = await compressSummaries(needsCompression, 'compressed')
      compressed.compressed_summaries?.forEach(cs => {
        const original = strategy.needsCompression.find(s => s.number === cs.chapter)
        if (original) {
          original.compressedSummary = cs.summary
          original.compressedPov = cs.pov
        }
      })
    }
    strategy.needsCompression.forEach(s => {
      context.push({ type: 'compressed', number: s.number, pov: s.compressedPov || s.pov, compressedSummary: s.compressedSummary })
    })
  }

  // Add full summaries
  strategy.full.forEach(s => {
    context.push({ type: 'full', number: s.number, pov: s.pov, summary: s.summary })
  })

  // Sort by chapter number
  context.sort((a, b) => a.number - b.number)

  return context
}

// =============================================================================
// CHAPTER REGENERATION
// =============================================================================

const REGENERATION_TYPES = {
  FULL: 'full',
  ENDING_ONLY: 'ending_only',
  EXPANSION: 'expansion',
  PARTIAL: 'partial'
}

async function regenerateChapter(bible, chapterIndex, previousSummaries, language, previousOutput, issues) {
  console.log(`Regenerating Chapter ${chapterIndex}...`)
  console.log('Issues to fix:', issues.map(i => i.type).join(', '))

  // Determine regeneration type based on issues
  const issueTypes = issues.map(i => i.type)

  if (issueTypes.includes('wrong_hook') && !issueTypes.includes('content_missing') && !issueTypes.includes('too_short')) {
    // Just fix the ending
    return await regenerateChapterEnding(bible, chapterIndex, previousOutput, language)
  }

  if (issueTypes.includes('too_short') && !issueTypes.includes('content_missing')) {
    // Expand existing content
    return await expandChapter(bible, chapterIndex, previousOutput, language)
  }

  // Full regeneration with emphasis on issues
  const chapter = bible.chapters.chapters[chapterIndex - 1]
  const wordCountTarget = getWordCountTarget(chapter.tension_rating || 5)

  const systemPrompt = CHAPTER_SYSTEM_PROMPT.replace(/\{\{target_language\}\}/g, language)

  let userPrompt = buildChapterUserPrompt(bible, chapterIndex, previousSummaries, language)

  // Add regeneration instructions
  userPrompt += `

---

REGENERATION INSTRUCTIONS:
This is a regeneration attempt. The previous output had these issues:
${issues.map(i => `- ${i.type}: ${i.message}`).join('\n')}

SPECIFIC FIXES REQUIRED:
${issues.map((i, idx) => `${idx + 1}. ${i.message}`).join('\n')}

Please fix these issues while maintaining story quality.`

  const response = await callOpenAI(systemPrompt, userPrompt, { temperature: 0.8 })
  const parsed = parseJSON(response)

  if (!parsed.success) {
    throw new Error(`Chapter ${chapterIndex} regeneration JSON parse failed: ${parsed.error}`)
  }

  const chapterData = parsed.data

  const validation = validateChapterOutput(
    chapterData,
    chapter.beats,
    chapter.hook?.type,
    wordCountTarget
  )

  console.log(`Chapter ${chapterIndex} regenerated. Word count: ${validation.wordCount}`)

  return {
    ...chapterData,
    validation,
    regenerated: true,
    generatedAt: new Date().toISOString()
  }
}

async function regenerateChapterEnding(bible, chapterIndex, previousOutput, language) {
  console.log(`Regenerating ending for Chapter ${chapterIndex}...`)

  const chapter = bible.chapters.chapters[chapterIndex - 1]
  const existingContent = previousOutput?.chapter?.content || ''

  // Keep all but the last ~400 words
  const words = existingContent.split(/\s+/)
  const cutPoint = Math.max(0, words.length - 400)
  const contentToKeep = words.slice(0, cutPoint).join(' ')

  const systemPrompt = `You are rewriting only the ending of a chapter. The body is good, but the hook doesn't land correctly.

Write ONLY the new ending (200-400 words) that:
1. Flows naturally from the preserved content
2. Delivers the correct hook type
3. Ends the chapter with the right emotional note

Do not rewrite anything before the cut point.

Output format:
{
  "new_ending": "The rewritten ending text...",
  "hookDelivered": "Description of how hook lands",
  "hookType": "${chapter.hook?.type || 'emotional'}"
}`

  const userPrompt = `CHAPTER CONTENT (preserve everything before the cut):

${contentToKeep}

[CUT POINT — rewrite from here]

---

REQUIRED HOOK:
Type: ${chapter.hook?.type || 'emotional'}
Description: ${chapter.hook?.description || 'End with emotional resonance'}

EMOTIONAL STATE AT END:
${chapter.emotional_arc?.closes || 'Transformed from opening state'}

---

Write the new ending (200-400 words) in ${language}. Start exactly where the cut point is. Deliver a ${chapter.hook?.type || 'emotional'} hook.`

  const response = await callOpenAI(systemPrompt, userPrompt)
  const parsed = parseJSON(response)

  if (!parsed.success) {
    throw new Error('Ending regeneration failed to parse')
  }

  // Combine preserved content with new ending
  const newContent = contentToKeep + ' ' + parsed.data.new_ending

  return {
    chapter: {
      ...previousOutput.chapter,
      content: newContent
    },
    summary: previousOutput.summary,
    metadata: {
      ...previousOutput.metadata,
      hookDelivered: parsed.data.hookDelivered,
      hookType: parsed.data.hookType
    },
    validation: { valid: true, issues: [] },
    regenerated: true,
    regenerationType: 'ending_only',
    generatedAt: new Date().toISOString()
  }
}

async function expandChapter(bible, chapterIndex, previousOutput, language) {
  console.log(`Expanding Chapter ${chapterIndex}...`)

  const chapter = bible.chapters.chapters[chapterIndex - 1]
  const wordCountTarget = getWordCountTarget(chapter.tension_rating || 5)

  const systemPrompt = `You are expanding a chapter that is too short. The content is good but thin — scenes need more development.

Your job is to:
1. Keep all existing content
2. Expand thin sections with more detail, interiority, and scene development
3. Reach target word count without padding
4. Maintain voice and tone consistency

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

Output the complete expanded chapter in the same JSON format as original.`

  const userPrompt = `CURRENT CHAPTER:

${previousOutput?.chapter?.content || ''}

Current word count: ${previousOutput?.chapter?.content?.split(/\s+/).length || 0}
Target word count: ${wordCountTarget.min}-${wordCountTarget.max}

---

Expand the chapter to ${wordCountTarget.min}-${wordCountTarget.max} words in ${language}. Output complete expanded chapter in JSON format:

{
  "chapter": {
    "number": ${chapterIndex},
    "title": "${chapter.title}",
    "content": "The expanded chapter prose..."
  },
  "summary": ${JSON.stringify(previousOutput.summary || {})},
  "metadata": {
    "wordCount": number,
    "beatsCovered": ${JSON.stringify(previousOutput.metadata?.beatsCovered || [])},
    "hookDelivered": "${previousOutput.metadata?.hookDelivered || ''}",
    "hookType": "${previousOutput.metadata?.hookType || chapter.hook?.type || 'emotional'}"
  }
}`

  const response = await callOpenAI(systemPrompt, userPrompt)
  const parsed = parseJSON(response)

  if (!parsed.success) {
    throw new Error('Chapter expansion failed to parse')
  }

  const validation = validateChapterOutput(
    parsed.data,
    chapter.beats,
    chapter.hook?.type,
    wordCountTarget
  )

  return {
    ...parsed.data,
    validation,
    regenerated: true,
    regenerationType: 'expansion',
    generatedAt: new Date().toISOString()
  }
}

// Main function to generate chapter with validation and potential regeneration
async function generateChapterWithValidation(bible, chapterIndex, previousSummaries, language, maxAttempts = 2) {
  let attempts = 0
  let lastOutput = null
  let lastIssues = []

  while (attempts < maxAttempts) {
    attempts++
    console.log(`Chapter ${chapterIndex} generation attempt ${attempts}/${maxAttempts}`)

    try {
      if (attempts === 1) {
        lastOutput = await generateChapter(bible, chapterIndex, previousSummaries, language)
      } else {
        lastOutput = await regenerateChapter(bible, chapterIndex, previousSummaries, language, lastOutput, lastIssues)
      }

      if (lastOutput.validation.valid) {
        console.log(`Chapter ${chapterIndex} passed validation.`)
        return {
          success: true,
          chapter: lastOutput,
          attempts
        }
      }

      lastIssues = lastOutput.validation.issues
      console.log(`Chapter ${chapterIndex} validation failed:`, lastIssues.map(i => i.type).join(', '))

    } catch (error) {
      console.error(`Chapter ${chapterIndex} generation error:`, error.message)
      lastIssues = [{ type: 'generation_error', message: error.message }]
    }
  }

  // Max attempts reached, return best effort
  console.warn(`Chapter ${chapterIndex} max attempts reached. Returning best effort.`)
  return {
    success: false,
    chapter: lastOutput,
    attempts,
    issues: lastIssues,
    needsReview: true
  }
}

export {
  generateChapter,
  generateChapterWithValidation,
  buildPreviousContext,
  compressSummaries,
  validateChapterOutput,
  getWordCountTarget,
  WORD_COUNT_BY_TENSION
}

export default {
  generateBible,
  generateChapter,
  generateChapterWithValidation,
  buildPreviousContext,
  compressSummaries,
  executePhase1,
  executePhase2,
  executePhase3,
  executePhase4,
  executePhase5,
  executePhase6,
  executePhase7,
  executePhase8,
  CONFIG
}
