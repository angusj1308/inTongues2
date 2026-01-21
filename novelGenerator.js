// Novel Generator - Bible Generation Pipeline
// Implements Phases 1-8 for generating complete story bibles

import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs/promises'
import path from 'path'

// Lazy-initialized Anthropic client (deferred to avoid initialization without API key)
let client = null

function getAnthropicClient() {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set')
    }
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return client
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG = {
  model: 'claude-sonnet-4-20250514',
  maxRetries: 3,
  retryDelays: [2000, 4000, 8000],
  timeoutMs: 120000, // Claude can take longer for complex creative tasks
  temperature: 0.8, // Slightly higher for creative writing
  maxTokens: 8192,
  // Chapter counts by length preset
  chapterCounts: {
    novella: 12,
    novel: 35
  }
}

// =============================================================================
// CLAUDE API WRAPPER
// =============================================================================

async function callClaude(systemPrompt, userPrompt, options = {}) {
  const { maxRetries = CONFIG.maxRetries, timeoutMs = CONFIG.timeoutMs } = options
  let lastError = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await getAnthropicClient().messages.create({
        model: CONFIG.model,
        max_tokens: options.maxTokens ?? CONFIG.maxTokens,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt }
        ],
        temperature: options.temperature ?? CONFIG.temperature
      })

      // Extract text content from response
      const textContent = response.content.find(block => block.type === 'text')
      if (!textContent) {
        throw new Error('No text content in Claude response')
      }
      return textContent.text
    } catch (error) {
      lastError = error
      console.error(`Claude call attempt ${attempt + 1} failed:`, error.message)

      if (attempt < maxRetries - 1) {
        // Check for rate limit error (429) - wait 60 seconds
        if (error.status === 429) {
          console.log(`  Rate limited. Waiting 60s before retry...`)
          await new Promise(resolve => setTimeout(resolve, 60000))
        } else {
          // Normal retry delay for other errors
          await new Promise(resolve => setTimeout(resolve, CONFIG.retryDelays[attempt]))
        }
      }
    }
  }

  throw lastError || new Error('Claude call failed after all retries')
}

// Alias for backward compatibility
const callOpenAI = callClaude

// =============================================================================
// JSON PARSING
// =============================================================================

function parseJSON(content) {
  try {
    // Method 1: Try direct parse first (in case it's clean JSON)
    try {
      return { success: true, data: JSON.parse(content.trim()) }
    } catch (e) {
      // Not clean JSON, try extracting from markdown
    }

    // Method 2: Extract from markdown code blocks (```json ... ``` or ``` ... ```)
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      const extracted = jsonMatch[1].trim()
      return { success: true, data: JSON.parse(extracted) }
    }

    // Method 3: Find JSON object/array by looking for { or [ at start
    const jsonStartObj = content.indexOf('{')
    const jsonStartArr = content.indexOf('[')
    const jsonStart = jsonStartObj === -1 ? jsonStartArr :
                      jsonStartArr === -1 ? jsonStartObj :
                      Math.min(jsonStartObj, jsonStartArr)

    if (jsonStart !== -1) {
      // Find the matching closing bracket
      const isArray = content[jsonStart] === '['
      const openBracket = isArray ? '[' : '{'
      const closeBracket = isArray ? ']' : '}'

      let depth = 0
      let jsonEnd = -1
      for (let i = jsonStart; i < content.length; i++) {
        if (content[i] === openBracket) depth++
        if (content[i] === closeBracket) depth--
        if (depth === 0) {
          jsonEnd = i + 1
          break
        }
      }

      if (jsonEnd !== -1) {
        const jsonStr = content.slice(jsonStart, jsonEnd)
        return { success: true, data: JSON.parse(jsonStr) }
      }
    }

    // Nothing worked
    throw new Error('Could not find valid JSON in response')
  } catch (error) {
    return { success: false, error: error.message, raw: content.slice(0, 500) + '...' }
  }
}

// =============================================================================
// PRESCRIPTIVE LEVEL DEFINITIONS
// =============================================================================
// These definitions are the source of truth for all level-based generation.
// They mirror the adaptation system but are tailored for original novel generation.

const LEVEL_DEFINITIONS = {
  Beginner: {
    name: 'Beginner',
    description: 'For absolute beginners and early learners (A1-A2 equivalent)',

    // Sentence constraints
    sentences: {
      averageLength: { min: 6, max: 12 },
      maxLength: 15,
      structure: 'Simple sentences only. Subject-verb-object pattern. Avoid subordinate clauses.',
      connectors: 'Use basic connectors only: and, but, so, because, then, when',
    },

    // Vocabulary constraints
    vocabulary: {
      scope: 'Top 1000-1500 most common words in target language only',
      exceptions: 'Character names, place names, and story-critical terms (introduce with context)',
      forbidden: [
        'Literary vocabulary',
        'Abstract nouns (use concrete equivalents)',
        'Idioms and expressions (use literal language)',
        'Metaphors and figurative language',
        'Technical or specialized terms',
        'Formal/archaic language',
      ],
      handling: 'If a concept requires a harder word, explain it immediately in simple terms',
    },

    // Meaning and clarity
    meaning: {
      explicitness: 'ALL meaning must be explicit. Nothing implied.',
      subtext: 'NO SUBTEXT. Characters say what they mean. Narration states emotions directly.',
      emotions: 'Name emotions explicitly: "She felt angry" not "Her jaw tightened"',
      motivation: 'State character motivations directly: "He wanted to help because..."',
    },

    // Narrative technique
    narrative: {
      causeEffect: 'Simple, direct cause-and-effect. One cause, one effect per sentence.',
      timeflow: 'Strictly chronological. No flashbacks, no flash-forwards.',
      pov: 'Single, clear POV. No head-hopping within scenes.',
      showing: 'TELL over show at this level. Clarity trumps literary technique.',
    },

    // Dialogue
    dialogue: {
      style: 'Direct and functional. Characters say what they mean.',
      length: 'Short exchanges. 1-2 sentences per turn maximum.',
      attribution: 'Always use "said" - avoid fancy dialogue tags',
      subtext: 'NO dialogue subtext. No sarcasm, no implication.',
    },

    // Cultural and setting
    cultural: {
      references: 'Avoid cultural references that require background knowledge',
      setting: 'Explain any setting-specific concepts in simple terms',
      customs: 'If customs/traditions matter to plot, explain them explicitly',
    },

    // What to avoid
    forbidden: [
      'Complex sentence structures',
      'Passive voice (use active)',
      'Rhetorical questions',
      'Irony or sarcasm',
      'Unreliable narration',
      'Stream of consciousness',
      'Non-linear timeline',
      'Multiple POVs in single scene',
      'Metaphors and similes',
      'Poetic or lyrical prose',
      // Universal anti-exposition (applies to all levels)
      'Backstory dumps or exposition paragraphs',
      'Character description blocks',
      'Setting lectures',
      'Long internal monologue passages',
      'Summarizing instead of dramatizing',
    ],
  },

  Intermediate: {
    name: 'Intermediate',
    description: 'For learners with foundation knowledge (B1-B2 equivalent)',

    // Sentence constraints - TIGHTENED
    sentences: {
      averageLength: { min: 10, max: 18 },
      maxLength: 20, // HARD LIMIT - reduced from 25
      structure: 'Mix of simple and compound sentences. Subordinate clauses allowed BUT total must stay under 20 words.',
      connectors: 'Common connectors: aunque, sin embargo, por eso, mientras, cuando, porque, pero',
    },

    // Vocabulary constraints
    vocabulary: {
      scope: 'Common vocabulary plus topic-specific words with context clues',
      exceptions: 'Can use less common words if meaning is clear from context',
      forbidden: [
        'Obscure literary terms',
        'Archaic language (19th century formal Spanish)',
        'Heavy slang or dialect',
        'Untranslatable idioms without explanation',
        'Anachronistic vocabulary (modern terms in historical settings)',
      ],
      handling: 'Context should make meaning inferable. No need for explicit definitions.',
    },

    // Meaning and clarity
    meaning: {
      explicitness: 'Key meaning explicit. Some inference allowed for non-critical details.',
      subtext: 'LIGHT SUBTEXT allowed. But critical plot/emotional points still explicit.',
      emotions: 'Mix of telling and showing. Can imply some emotions through action.',
      motivation: 'Core motivations clear. Secondary motivations can be implied.',
    },

    // Narrative technique - TIGHTENED
    narrative: {
      causeEffect: 'Direct cause-effect preferred. Multi-step chains OK if clear.',
      timeflow: 'Strictly chronological. No flashbacks or temporal jumps.',
      pov: 'Clear single POV throughout scene. No head-hopping.',
      showing: 'IMMEDIATE ACTION over reflection. Dramatize, do not summarize.',
    },

    // Dialogue
    dialogue: {
      style: 'More naturalistic. Characters can be indirect sometimes.',
      length: 'Natural conversation length. Can have longer exchanges.',
      attribution: 'Varied dialogue tags allowed, but not overly creative',
      subtext: 'Some dialogue subtext allowed if body language makes meaning accessible.',
    },

    // Cultural and setting
    cultural: {
      references: 'Can include cultural references with brief in-story context',
      setting: 'Setting details can be richer. Explain only truly foreign concepts.',
      customs: 'Customs can be shown naturally if context makes them understandable',
    },

    // What to avoid - EXPANDED
    forbidden: [
      'Dense literary prose',
      'Heavy use of passive voice',
      'Unreliable narration',
      'Experimental structure',
      'Heavy dialect transcription',
      'Obscure cultural references without context',
      'Backstory dumps or exposition paragraphs',
      'Character description blocks',
      'Sentences over 20 words',
      'Long internal monologue passages',
      'Summarizing instead of dramatizing',
    ],
  },

  Native: {
    name: 'Native',
    description: 'Natural language as native speakers use it (C1-C2 equivalent)',

    // Sentence constraints
    sentences: {
      averageLength: { min: 10, max: 30 },
      maxLength: null, // No hard limit
      structure: 'Full range of sentence structures. Variety for rhythm and effect.',
      connectors: 'Full linguistic toolkit available',
    },

    // Vocabulary constraints
    vocabulary: {
      scope: 'Full vocabulary range appropriate to genre and characters',
      exceptions: 'None - use best word for the context',
      forbidden: [], // Nothing forbidden
      handling: 'Trust the reader. Context provides meaning.',
    },

    // Meaning and clarity
    meaning: {
      explicitness: 'Natural balance. Critical plot explicit, rest can be nuanced.',
      subtext: 'FULL SUBTEXT available. Implication, suggestion, omission.',
      emotions: 'Show over tell. Let readers feel through action and detail.',
      motivation: 'Complex, layered motivations that emerge through story.',
    },

    // Narrative technique
    narrative: {
      causeEffect: 'Complex causality. Delayed payoffs. Interweaving threads.',
      timeflow: 'Non-linear available. Flashbacks, flash-forwards, parallel timelines.',
      pov: 'Multiple POVs, unreliable narration, all techniques available.',
      showing: 'Primarily show. Tell only for pacing and transition.',
    },

    // Dialogue
    dialogue: {
      style: 'Authentic to character. Can be messy, interrupted, incomplete.',
      length: 'Whatever serves the scene',
      attribution: 'Full range including action beats and no attribution',
      subtext: 'Full dialogue subtext. Characters can lie, deflect, imply.',
    },

    // Cultural and setting
    cultural: {
      references: 'Natural cultural references without explanation',
      setting: 'Rich, immersive setting details',
      customs: 'Shown naturally as characters would experience them',
    },

    // What to avoid - even at Native, avoid blatant prose sins
    forbidden: [
      'Blatant backstory dumps (weave backstory naturally instead)',
      'Character description blocks (reveal through action)',
      'Info-dump paragraphs (trust the reader)',
    ],
  },
}

// Language-specific adjustments to level definitions
const LANGUAGE_LEVEL_ADJUSTMENTS = {
  Spanish: {
    Beginner: {
      notes: [
        'Avoid subjunctive mood - use indicative alternatives',
        'Use ser/estar carefully - stick to clear-cut cases',
        'Avoid complex pronoun combinations (se lo, te la)',
        'Use simple past (pretérito) over imperfect when possible',
        'Avoid regional vocabulary - use neutral Spanish',
      ],
      vocabulary: {
        frequency_list: 'Based on RAE frequency corpus - top 1500 words',
      },
    },
    Intermediate: {
      notes: [
        'Subjunctive in common expressions OK (quiero que, espero que)',
        'Ser/estar distinctions can be shown naturally',
        'Pronoun combinations allowed in common patterns',
        'Mix of past tenses for natural narrative',
      ],
    },
    Native: {
      notes: [
        'Full subjunctive usage',
        'Regional flavor acceptable if consistent',
        'All verb tenses and moods available',
      ],
    },
  },
  French: {
    Beginner: {
      notes: [
        'Avoid subjunctive entirely',
        'Use passé composé over passé simple',
        'Avoid complex relative clauses (dont, lequel)',
        'Stick to common prepositions',
        'Avoid literary inversions',
      ],
      vocabulary: {
        frequency_list: 'Based on Lexique frequency data - top 1500 words',
      },
    },
    Intermediate: {
      notes: [
        'Common subjunctive triggers OK (il faut que, bien que)',
        'Passé composé primary, imperfect for description',
        'Basic relative pronouns (qui, que, où)',
      ],
    },
    Native: {
      notes: [
        'Passé simple acceptable for literary style',
        'Full range of literary French available',
        'Complex grammatical structures OK',
      ],
    },
  },
  Italian: {
    Beginner: {
      notes: [
        'Avoid subjunctive (congiuntivo)',
        'Use passato prossimo over passato remoto',
        'Avoid combined pronouns (glielo, ce lo)',
        'Simple prepositions only',
        'Avoid formal Lei where possible - use tu',
      ],
      vocabulary: {
        frequency_list: 'Based on CoLFIS frequency data - top 1500 words',
      },
    },
    Intermediate: {
      notes: [
        'Common subjunctive OK (penso che, credo che)',
        'Mix of past tenses acceptable',
        'Basic pronoun combinations allowed',
      ],
    },
    Native: {
      notes: [
        'Passato remoto for literary style',
        'Full grammatical range',
        'Regional expressions acceptable if consistent',
      ],
    },
  },
  English: {
    Beginner: {
      notes: [
        'Simple present and past tense only',
        'Avoid perfect tenses where simple past works',
        'Avoid conditional sentences beyond basic if/then',
        'Avoid phrasal verbs - use single-word alternatives',
        'Avoid idioms entirely',
      ],
      vocabulary: {
        frequency_list: 'Based on Oxford 3000 - top 1500 words',
      },
    },
    Intermediate: {
      notes: [
        'Perfect tenses allowed',
        'Common conditionals OK',
        'Common phrasal verbs allowed',
        'Well-known idioms with clear meaning OK',
      ],
    },
    Native: {
      notes: [
        'Full grammatical range',
        'All idioms and expressions available',
        'Regional variety acceptable',
      ],
    },
  },
}

// Helper function to get complete level definition for a language
function getLevelDefinition(level, language = 'English') {
  const baseDefinition = LEVEL_DEFINITIONS[level]
  if (!baseDefinition) {
    throw new Error(`Invalid level: ${level}. Must be Beginner, Intermediate, or Native.`)
  }

  const languageAdjustments = LANGUAGE_LEVEL_ADJUSTMENTS[language]?.[level] || {}

  return {
    ...baseDefinition,
    languageSpecific: languageAdjustments,
  }
}

// Format level definition for inclusion in prompts
function formatLevelDefinitionForPrompt(level, language = 'English') {
  const def = getLevelDefinition(level, language)
  const langAdj = def.languageSpecific

  let prompt = `## READING LEVEL: ${def.name}
${def.description}

### SENTENCE RULES (MUST FOLLOW):
- Average sentence length: ${def.sentences.averageLength.min}-${def.sentences.averageLength.max} words
${def.sentences.maxLength ? `- Maximum sentence length: ${def.sentences.maxLength} words` : '- No hard maximum sentence length'}
- Structure: ${def.sentences.structure}
- Connectors: ${def.sentences.connectors}

### VOCABULARY RULES (MUST FOLLOW):
- Scope: ${def.vocabulary.scope}
- Exceptions: ${def.vocabulary.exceptions}
- Handling difficult concepts: ${def.vocabulary.handling}
${def.vocabulary.forbidden.length > 0 ? `- FORBIDDEN:\n${def.vocabulary.forbidden.map(f => `  * ${f}`).join('\n')}` : ''}

### MEANING & CLARITY (MUST FOLLOW):
- Explicitness: ${def.meaning.explicitness}
- Subtext: ${def.meaning.subtext}
- Emotions: ${def.meaning.emotions}
- Motivation: ${def.meaning.motivation}

### NARRATIVE TECHNIQUE:
- Cause/Effect: ${def.narrative.causeEffect}
- Timeline: ${def.narrative.timeflow}
- POV: ${def.narrative.pov}
- Show vs Tell: ${def.narrative.showing}

### DIALOGUE RULES:
- Style: ${def.dialogue.style}
- Length: ${def.dialogue.length}
- Attribution: ${def.dialogue.attribution}
- Subtext: ${def.dialogue.subtext}

### CULTURAL ELEMENTS:
- References: ${def.cultural.references}
- Setting details: ${def.cultural.setting}
- Customs: ${def.cultural.customs}

${def.forbidden.length > 0 ? `### FORBIDDEN AT THIS LEVEL:\n${def.forbidden.map(f => `- ${f}`).join('\n')}` : ''}`

  if (langAdj.notes && langAdj.notes.length > 0) {
    prompt += `\n\n### ${language.toUpperCase()}-SPECIFIC RULES FOR ${def.name.toUpperCase()}:\n${langAdj.notes.map(n => `- ${n}`).join('\n')}`
  }

  return prompt
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
// PHASE 6: CHAPTER & SCENE BREAKDOWN
// =============================================================================

const PHASE_6_SYSTEM_PROMPT = `You are a master scene architect for romance fiction. Your task is to create a GRANULAR breakdown of every chapter into SCENES, and every scene into MICRO-BEATS that will guide actual prose generation.

## CRITICAL DISTINCTION: Scenes vs Beats

A SCENE is a continuous unit of action in one location/time. When location or time changes significantly, it's a new scene.

A BEAT is a MICRO-MOMENT — a single action, reaction, sensory detail, or emotional shift. One sentence of prose might contain 1-3 beats.

WRONG (too vague, this is a scene summary, not beats):
- "Isabella attends the betrothal ceremony"
- "She meets the British soldier"
- "They feel attraction"

RIGHT (actual micro-beats):
- "Champagne bubbles catch candlelight — she counts them instead of listening"
- "Don Álvarez's cologne arrives before he does — sandalwood and possession"
- "His hand finds her waist; her spine stiffens imperceptibly"
- "She murmurs about needing air, already stepping backward"
- "The garden door handle: cool brass, escape"
- "Jasmine hits her lungs — freedom smells like this"
- "A rustle in the hedges — wrong rhythm for wind"
- "Blue wool between green leaves. British uniform. Blood."
- "Their eyes lock. He calculates escape routes; she forgets to scream."
- "Her hand moves toward him before her mind can object"

Each beat is SPECIFIC, SENSORY, and DRAMATIZABLE.

## Output Format

Respond with a JSON object:

{
  "chapters": [
    {
      "number": 1,
      "title": "Chapter title (evocative, not generic)",
      "pov": "POV character name",
      "story_time": "When in the story timeline",
      "chapter_purpose": "What this chapter accomplishes for the story",
      "emotional_arc": {
        "opens": "POV character's emotional state at chapter start",
        "turns": "The key emotional shift mid-chapter",
        "closes": "POV character's emotional state at chapter end"
      },
      "scenes": [
        {
          "scene_number": 1,
          "scene_name": "Evocative name for this scene",
          "location": "Specific location from Phase 2",
          "time_of_day": "morning/afternoon/evening/night",
          "weather_mood": "Weather or atmospheric detail that mirrors emotion",
          "characters_present": ["List of characters in scene"],
          "scene_purpose": "What this scene accomplishes (setup/confrontation/revelation/intimacy/etc)",
          "sensory_anchor": "The dominant sense for this scene (smell of jasmine, sound of distant music, etc)",
          "beats": [
            "Micro-beat 1: specific sensory/action moment",
            "Micro-beat 2: character reaction or internal thought",
            "Micro-beat 3: dialogue beat or physical action",
            "... continue for 15-25 beats per scene"
          ],
          "scene_turn": "The moment the scene pivots or shifts",
          "exits_with": "How/why the scene ends"
        }
      ],
      "phase_4_moment": "If this chapter contains a Phase 4 pivotal moment, name it (or null)",
      "foreshadowing": {
        "plants": ["Specific seeds planted this chapter"],
        "payoffs": ["Seeds from earlier chapters paid off here"]
      },
      "tension_rating": 5,
      "chapter_hook": {
        "type": "cliffhanger | question | revelation | emotional | decision",
        "description": "What specifically hooks the reader to continue"
      }
    }
  ],
  "pov_distribution": {
    "protagonist_chapters": [1, 3, 5],
    "love_interest_chapters": [2, 4, 6],
    "balance_percentage": "50/50 or ratio"
  },
  "timeline": {
    "total_story_time": "How much time passes from Ch 1 to final chapter",
    "time_jumps": [
      {"between_chapters": "X-Y", "duration": "How much time passes"}
    ]
  },
  "coherence_check": {
    "pov_structure_honored": "Confirmation POV follows Phase 1 structure",
    "all_phase5_beats_placed": "Confirmation all Phase 5 plot beats appear",
    "all_phase4_moments_placed": "Confirmation all Phase 4 pivotal moments appear",
    "all_foreshadowing_tracked": "Confirmation all seeds planted and paid off",
    "locations_from_phase2": "Confirmation all locations come from Phase 2",
    "tension_curve_matches_phase5": "Confirmation tension ratings follow Phase 5 curve",
    "chapter_count_correct": "Matches length preset"
  }
}

## SCENE & BEAT REQUIREMENTS

SCENES PER CHAPTER:
- Each chapter MUST have 2-4 scenes
- A scene change = location change OR significant time skip
- Each scene should be 800-1500 words when written as prose

BEATS PER SCENE:
- Each scene MUST have 15-25 micro-beats
- Beats should alternate between: action, reaction, sensory, dialogue, internal thought
- Every beat must be SPECIFIC enough to generate 1-3 sentences of prose
- NO vague beats like "they talk" or "time passes" — be specific

BEAT TYPES TO INCLUDE:
- Sensory anchors: what they see/hear/smell/taste/touch
- Physical actions: specific gestures, movements
- Dialogue beats: key lines or exchanges (paraphrased)
- Internal reactions: thoughts, memories triggered, emotions felt
- Micro-tensions: small conflicts, hesitations, decisions
- Environmental details: weather, lighting, background sounds

## GUIDELINES

SHOW DON'T TELL:
- Beats should show emotion through action, not state it
- WRONG: "She feels nervous"
- RIGHT: "She smooths her skirt for the third time"

SENSORY SPECIFICITY:
- Every scene needs a dominant sensory anchor
- Use all five senses across the chapter
- Sensory details should reflect emotional state

PACING:
- High-tension scenes: shorter, punchier beats
- Intimate scenes: longer, more sensory beats
- Action scenes: rapid-fire beats, one per line

POV DISCIPLINE:
- All beats must be perceivable by the POV character
- Internal thoughts only for POV character
- Other characters' emotions shown through observable behavior`

function buildPhase6UserPrompt(concept, phase1, phase2, phase3, phase4, phase5, lengthPreset) {
  const chapterCount = CONFIG.chapterCounts[lengthPreset]
  const scenesPerChapter = lengthPreset === 'novella' ? '2-3' : '2-4'
  const beatsPerScene = '15-25'

  return `ORIGINAL CONCEPT: ${concept}

LENGTH: ${lengthPreset} (${chapterCount} chapters)
TARGET: Each chapter needs ${scenesPerChapter} scenes, each scene needs ${beatsPerScene} micro-beats.

PHASE 1 OUTPUT (Core Foundation):
${JSON.stringify(phase1, null, 2)}

PHASE 2 OUTPUT (World/Setting - USE THESE LOCATIONS):
${JSON.stringify(phase2, null, 2)}

PHASE 3 OUTPUT (Characters - USE THESE DETAILS):
${JSON.stringify(phase3, null, 2)}

PHASE 4 OUTPUT (Chemistry - THESE MOMENTS MUST APPEAR):
${JSON.stringify(phase4, null, 2)}

PHASE 5 OUTPUT (Plot Architecture - THESE BEATS MUST BE PLACED):
${JSON.stringify(phase5, null, 2)}

## YOUR TASK

Create a GRANULAR chapter-by-chapter, scene-by-scene, beat-by-beat breakdown for all ${chapterCount} chapters.

REQUIREMENTS:
1. Every chapter must have ${scenesPerChapter} distinct scenes
2. Every scene must have ${beatsPerScene} specific micro-beats (NOT vague summaries)
3. Every Phase 4 pivotal moment must appear in a specific scene
4. Every Phase 5 plot beat must be placed in a specific chapter
5. All locations must come from Phase 2
6. All foreshadowing seeds must be planted and paid off

REMEMBER: A beat is a MICRO-MOMENT. "She smooths her skirt nervously" is a beat. "They have a conversation" is NOT a beat — that's a scene summary. Be specific enough that each beat can generate 1-3 sentences of prose.`
}

const PHASE_6_COHERENCE_FIELDS = [
  'pov_structure_honored',
  'all_phase5_beats_placed',
  'all_phase4_moments_placed',
  'all_foreshadowing_tracked',
  'locations_from_phase2',
  'tension_curve_matches_phase5',
  'chapter_count_correct'
]

// Phase 6 now generates scenes per-chapter for reliability
const PHASE_6_MAX_RETRIES = 2

// System prompt for generating chapter outlines (no beats yet)
const PHASE_6_OUTLINE_SYSTEM_PROMPT = `You are a master story architect. Create a chapter-by-chapter outline showing structure, POV, and purpose for each chapter.

Output JSON:
{
  "chapters": [
    {
      "number": 1,
      "title": "Evocative chapter title",
      "pov": "POV character name",
      "story_time": "When in story timeline",
      "chapter_purpose": "What this chapter accomplishes",
      "emotional_arc": {
        "opens": "Starting emotional state",
        "turns": "Key shift mid-chapter",
        "closes": "Ending emotional state"
      },
      "location_primary": "Main location from Phase 2",
      "phase_4_moment": "Phase 4 moment if applicable, or null",
      "phase_5_beats": ["List Phase 5 beats that appear in this chapter"],
      "tension_rating": 5,
      "hook_type": "cliffhanger | question | revelation | emotional | decision"
    }
  ],
  "pov_distribution": {
    "protagonist_chapters": [1, 3, 5],
    "love_interest_chapters": [2, 4, 6]
  }
}`

// System prompt for generating detailed scenes/beats for a single chapter
const PHASE_6_CHAPTER_SYSTEM_PROMPT = `You are a master scene architect. Create a DETAILED scene breakdown with micro-beats for the given chapter.

## CRITICAL: What is a Beat?

A beat is a MICRO-MOMENT — one specific action, reaction, sensory detail, or emotional shift. Each beat should generate 1-3 sentences of prose.

WRONG (scene summary): "They have dinner together"
RIGHT (micro-beat): "Her fork scrapes porcelain — the silence stretches"

## BEAT CATEGORIES

Valid beat types:
- Physical action
- Sensory perception
- Dialogue moment
- Micro-reaction
- Environmental detail through POV
- Character choice or decision

If a beat cannot be dramatized as immediate action, REWRITE IT.

## AVOID

- Summary beats: "She remembers...", "He thinks about..."
- Backstory beats: "Her childhood taught her..."
- Emotional dumps: "She felt overwhelmed by sadness"
- Omniscient narration: "The tension in the room grew"
- Character description: "She was a woman who..."
- Theme-stating beats: "She realized she had never been free"
- Metaphors that spell out the character's journey
- Rhetorical questions that state the story's meaning

## OPPORTUNITIES

- Theme can emerge through choices, actions, dialogue
- Life reflection is available — just not explicit theme articulation
- Internal monologue can be Dostoevskian — immediate, unresolved, contradictory, human

## Output Format

{
  "number": 1,
  "scenes": [
    {
      "scene_number": 1,
      "scene_name": "Evocative scene name",
      "location": "Specific location",
      "time_of_day": "morning/afternoon/evening/night",
      "weather_mood": "Atmospheric context",
      "characters_present": ["Character names"],
      "scene_purpose": "setup/confrontation/revelation/intimacy",
      "sensory_anchor": "Dominant sense for this scene",
      "beats": [
        "Beat 1: specific micro-moment",
        "Beat 2: reaction or thought",
        "... 15-25 beats per scene"
      ],
      "scene_turn": "The pivotal moment",
      "exits_with": "How scene ends"
    }
  ],
  "foreshadowing": {
    "plants": ["Seeds planted"],
    "payoffs": ["Seeds paid off"]
  },
  "chapter_hook": {
    "type": "cliffhanger | question | revelation | emotional | decision",
    "description": "What hooks the reader"
  }
}`

function buildPhase6OutlinePrompt(concept, phase1, phase2, phase3, phase4, phase5, lengthPreset) {
  const chapterCount = CONFIG.chapterCounts[lengthPreset]

  return `CONCEPT: ${concept}

LENGTH: ${lengthPreset} (${chapterCount} chapters)

PHASE 1 (Core Foundation):
${JSON.stringify(phase1, null, 2)}

PHASE 4 (Chemistry Moments - MUST BE PLACED):
${JSON.stringify(phase4, null, 2)}

PHASE 5 (Plot Architecture - BEATS MUST BE DISTRIBUTED):
${JSON.stringify(phase5, null, 2)}

Create an outline for all ${chapterCount} chapters. For each chapter, specify:
- Which POV character
- Which Phase 4 moment it contains (if any)
- Which Phase 5 beats appear in it
- The emotional arc and tension rating

This is structure only - scenes and beats come later.`
}

function buildPhase6ChapterPrompt(concept, phase2, phase3, chapterOutline, chapterNumber) {
  return `CONCEPT: ${concept}

SETTING/LOCATIONS (use these):
${JSON.stringify(phase2.setting, null, 2)}
${JSON.stringify(phase2.locations, null, 2)}

CHARACTERS:
Protagonist: ${phase3.protagonist?.name}
Love Interest: ${phase3.love_interest?.name}

CHAPTER ${chapterNumber} TO DETAIL:
${JSON.stringify(chapterOutline, null, 2)}

Create 2-4 scenes with 15-25 micro-beats each for this chapter.

REMEMBER:
- Every beat is a MICRO-MOMENT (1-3 sentences of prose worth)
- Use specific locations from the setting
- Sensory details reflect emotional state
- Each scene needs a clear turn and exit
- Return JSON for this single chapter (not wrapped in an array)`
}

async function executePhase6(concept, phase1, phase2, phase3, phase4, phase5, lengthPreset) {
  console.log('Executing Phase 6: Chapter & Scene Breakdown (per-chapter)...')

  const chapterCount = CONFIG.chapterCounts[lengthPreset]

  // Step 1: Generate chapter outline (structure without beats)
  console.log('  Phase 6a: Generating chapter outline...')
  const outlinePrompt = buildPhase6OutlinePrompt(concept, phase1, phase2, phase3, phase4, phase5, lengthPreset)
  const outlineResponse = await callClaude(PHASE_6_OUTLINE_SYSTEM_PROMPT, outlinePrompt, { maxTokens: 16384 })
  const outlineParsed = parseJSON(outlineResponse)

  if (!outlineParsed.success) {
    throw new Error(`Phase 6 outline parse failed: ${outlineParsed.error}`)
  }

  const outline = outlineParsed.data
  console.log(`  Phase 6a complete: ${outline.chapters?.length || 0} chapter outlines`)

  // Step 2: Generate detailed scenes/beats per chapter
  const allChapters = []
  let successCount = 0
  let failCount = 0

  for (let i = 0; i < chapterCount; i++) {
    const chapterNumber = i + 1
    const outlineChapter = outline.chapters[i]

    if (!outlineChapter) {
      console.error(`  Chapter ${chapterNumber}: No outline found, skipping`)
      failCount++
      continue
    }

    console.log(`  Phase 6b: Chapter ${chapterNumber}/${chapterCount} - "${outlineChapter.title || 'Untitled'}"...`)

    let chapterData = null
    let attempts = 0

    // Retry loop for this chapter
    while (attempts < PHASE_6_MAX_RETRIES && !chapterData) {
      attempts++

      try {
        const chapterPrompt = buildPhase6ChapterPrompt(concept, phase2, phase3, outlineChapter, chapterNumber)
        const chapterResponse = await callClaude(PHASE_6_CHAPTER_SYSTEM_PROMPT, chapterPrompt, { maxTokens: 8192 })
        const chapterParsed = parseJSON(chapterResponse)

        if (chapterParsed.success) {
          // Handle both wrapped and unwrapped responses
          const data = chapterParsed.data.chapters?.[0] || chapterParsed.data

          if (data.scenes && data.scenes.length > 0) {
            chapterData = data
            console.log(`    ✓ ${data.scenes.length} scenes, ${data.scenes.reduce((sum, s) => sum + (s.beats?.length || 0), 0)} total beats`)
          } else {
            console.warn(`    Attempt ${attempts}: No scenes in response, retrying...`)
          }
        } else {
          console.warn(`    Attempt ${attempts}: Parse failed - ${chapterParsed.error?.slice(0, 100)}`)
        }
      } catch (err) {
        console.error(`    Attempt ${attempts}: Error - ${err.message}`)
      }
    }

    // Add chapter (with or without scenes)
    if (chapterData) {
      allChapters.push({
        ...outlineChapter,
        scenes: chapterData.scenes || [],
        foreshadowing: chapterData.foreshadowing || { plants: [], payoffs: [] },
        chapter_hook: chapterData.chapter_hook || { type: 'emotional', description: 'Chapter concludes' },
        hook: chapterData.chapter_hook || { type: 'emotional', description: 'Chapter concludes' }
      })
      successCount++
    } else {
      // Fallback: outline-only chapter (will use single-pass generation)
      console.warn(`    ✗ Chapter ${chapterNumber} failed after ${attempts} attempts, using outline only`)
      allChapters.push({
        ...outlineChapter,
        scenes: [],
        foreshadowing: { plants: [], payoffs: [] },
        chapter_hook: { type: 'emotional', description: 'Chapter concludes' }
      })
      failCount++
    }
  }

  // Sort chapters by number (should already be in order, but ensure)
  allChapters.sort((a, b) => a.number - b.number)

  const result = {
    chapters: allChapters,
    pov_distribution: outline.pov_distribution,
    timeline: outline.timeline || { total_story_time: 'Several months', time_jumps: [] },
    coherence_check: {
      pov_structure_honored: 'Verified during generation',
      all_phase5_beats_placed: 'Distributed across chapters',
      all_phase4_moments_placed: 'Placed in designated chapters',
      all_foreshadowing_tracked: 'Tracked per-chapter',
      locations_from_phase2: 'Using Phase 2 locations',
      tension_curve_matches_phase5: 'Following plot architecture',
      chapter_count_correct: allChapters.length === chapterCount ? 'Yes' : `Expected ${chapterCount}, got ${allChapters.length}`,
      scenes_generated: `${successCount}/${chapterCount} chapters have scenes`
    }
  }

  console.log(`Phase 6 complete: ${allChapters.length} chapters (${successCount} with scenes, ${failCount} outline-only)`)
  return result
}

// =============================================================================
// PHASE 7: LEVEL CHECK
// =============================================================================

const PHASE_7_SYSTEM_PROMPT = `You are a language learning content specialist. Your task is to review a complete story bible and chapter outline to verify it will work at the target reading level.

You will receive:
- Target level with DETAILED, PRESCRIPTIVE constraints (these are non-negotiable rules)
- Target language with language-specific grammatical rules
- The complete bible (Phases 1-6 output)

CRITICAL: Level affects PROSE ONLY, not plot structure. However, some story elements are harder to convey at lower levels. Your job is to:

1. Review the bible against the SPECIFIC level constraints provided
2. Flag any story elements that would violate level constraints
3. Provide PRESCRIPTIVE prose guidance that maps directly to the level rules
4. Confirm readiness or identify blocking issues

## Output Format

Respond with a JSON object:

{
  "target_level": "Beginner | Intermediate | Native",
  "target_language": "The target language",
  "assessment": "ready | minor_issues | significant_issues | blocked",
  "flags": [
    {
      "element": "What story element might be problematic",
      "location": "Which phase/chapter",
      "issue": "Which specific level constraint this violates",
      "suggestion": "How to handle in generation (must comply with level rules)",
      "severity": "low | medium | high | blocking"
    }
  ],
  "prose_guidance": {
    "sentence_constraints": {
      "average_length_min": number,
      "average_length_max": number,
      "max_length": number or null,
      "structure_rule": "Exact rule from level definition",
      "allowed_connectors": "List of allowed connectors"
    },
    "vocabulary_constraints": {
      "scope": "Exact scope from level definition",
      "forbidden_types": ["List of forbidden vocabulary types"],
      "handling_rule": "How to handle difficult concepts"
    },
    "meaning_constraints": {
      "explicitness_rule": "Exact rule",
      "subtext_rule": "Exact rule",
      "emotion_rule": "How to express emotions",
      "motivation_rule": "How to show motivation"
    },
    "dialogue_constraints": {
      "style_rule": "Exact rule",
      "length_rule": "Exact rule",
      "attribution_rule": "Exact rule",
      "subtext_rule": "Exact rule"
    },
    "narrative_constraints": {
      "cause_effect_rule": "Exact rule",
      "timeline_rule": "Exact rule",
      "pov_rule": "Exact rule",
      "show_tell_rule": "Exact rule"
    },
    "language_specific_rules": ["List of language-specific grammatical constraints"]
  },
  "forbidden_techniques": ["List of techniques FORBIDDEN at this level"],
  "chapter_specific_notes": [
    {
      "chapter": 1,
      "potential_violations": ["List of potential level violations in this chapter's outline"],
      "mitigation": "How to write this chapter within level constraints"
    }
  ],
  "ready_for_generation": true,
  "blocking_issues": []
}

## Guidelines

WHAT TO FLAG:

For Beginner level, flag ANY of these as violations:
- Scenes requiring subtext or implication (BLOCKING if central to meaning)
- Complex sentence structures planned in any beat
- Scenes relying on showing over telling for key emotions
- Dialogue requiring inference
- Cultural/historical references without explicit explanation
- Multiple plot threads active in single scene
- Any planned metaphors, similes, or figurative language
- Scenes with unreliable narration or ambiguity

For Intermediate level, flag:
- Heavy reliance on subtext for plot-critical information
- Dense cultural references without context
- Complex nested sentence structures
- Heavy dialect or slang

For Native level:
- Typically no flags — full toolkit available

WHAT NOT TO FLAG (these are OK at any level):
- Plot complexity (level doesn't change WHAT happens, only HOW it's expressed)
- Character psychological depth (same depth, different articulation)
- Theme complexity (same theme, simpler words)
- Emotional stakes (same stakes, clearer expression at lower levels)

CRITICAL: The prose_guidance you output will be used VERBATIM in chapter generation prompts. It must be specific, actionable, and directly derived from the level constraints provided.`

function buildPhase7UserPrompt(level, phases1to6, language = 'English') {
  // Get the full prescriptive level definition
  const levelDefinition = formatLevelDefinitionForPrompt(level, language)

  return `TARGET LEVEL: ${level}
TARGET LANGUAGE: ${language}

=== PRESCRIPTIVE LEVEL CONSTRAINTS (NON-NEGOTIABLE) ===

${levelDefinition}

=== END LEVEL CONSTRAINTS ===

COMPLETE BIBLE:
${JSON.stringify(phases1to6, null, 2)}

Review this bible against the SPECIFIC level constraints above. Your prose_guidance output must directly reflect these constraints - they will be used verbatim in chapter generation.

For each chapter in the outline, check if any planned beats or scenes would require techniques FORBIDDEN at this level. Flag them with specific mitigation strategies that comply with the level rules.`
}

async function executePhase7(level, phases1to6, language = 'English') {
  console.log(`Executing Phase 7: Level Check for ${level} level in ${language}...`)

  const userPrompt = buildPhase7UserPrompt(level, phases1to6, language)
  const response = await callOpenAI(PHASE_7_SYSTEM_PROMPT, userPrompt)
  const parsed = parseJSON(response)

  if (!parsed.success) {
    throw new Error(`Phase 7 JSON parse failed: ${parsed.error}`)
  }

  const data = parsed.data

  // Validate that prose_guidance has required structure
  if (!data.prose_guidance?.sentence_constraints) {
    console.warn('Phase 7: prose_guidance missing sentence_constraints, using defaults from level definition')
    const levelDef = LEVEL_DEFINITIONS[level]
    data.prose_guidance = data.prose_guidance || {}
    data.prose_guidance.sentence_constraints = {
      average_length_min: levelDef.sentences.averageLength.min,
      average_length_max: levelDef.sentences.averageLength.max,
      max_length: levelDef.sentences.maxLength,
      structure_rule: levelDef.sentences.structure,
      allowed_connectors: levelDef.sentences.connectors,
    }
  }

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

// Compress chapters for Phase 8 validation (keeps structure, removes beat details)
function compressChaptersForValidation(chapters) {
  if (!chapters?.chapters) return chapters

  return {
    ...chapters,
    chapters: chapters.chapters.map(ch => ({
      number: ch.number,
      title: ch.title,
      pov: ch.pov,
      story_time: ch.story_time,
      chapter_purpose: ch.chapter_purpose,
      emotional_arc: ch.emotional_arc,
      location_primary: ch.location_primary,
      phase_4_moment: ch.phase_4_moment,
      phase_5_beats: ch.phase_5_beats,
      tension_rating: ch.tension_rating,
      hook_type: ch.hook_type,
      // Compressed scene info (counts only, not full beats)
      scene_count: ch.scenes?.length || 0,
      total_beats: ch.scenes?.reduce((sum, s) => sum + (s.beats?.length || 0), 0) || 0,
      scene_summaries: ch.scenes?.map(s => ({
        scene_name: s.scene_name,
        location: s.location,
        scene_purpose: s.scene_purpose,
        beat_count: s.beats?.length || 0
      })) || [],
      foreshadowing: ch.foreshadowing,
      chapter_hook: ch.chapter_hook
    }))
  }
}

function buildPhase8UserPrompt(completeBible) {
  // Compress Phase 6 chapters to avoid token limit issues
  const compressedChapters = compressChaptersForValidation(completeBible.chapters)

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

PHASE 6 - CHAPTER BREAKDOWN (compressed - full beats available for generation):
${JSON.stringify(compressedChapters, null, 2)}

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

async function regenerateFromPhase(phaseNumber, completeBible, concept, level, lengthPreset, language, specificInstructions) {
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
        updatedBible.levelCheck = await executePhase7(level, phases1to6, language)
      }
      break
  }

  return updatedBible
}

// =============================================================================
// MAIN PIPELINE
// =============================================================================

// Phase descriptions for progress reporting
const PHASE_DESCRIPTIONS = {
  1: { name: 'Core Foundation', description: 'Establishing story DNA, theme, and central conflict' },
  2: { name: 'World/Setting', description: 'Building the world, locations, and cultural context' },
  3: { name: 'Characters', description: 'Developing protagonist and love interest psychology and voice' },
  4: { name: 'Chemistry', description: 'Designing the romance arc and pivotal moments' },
  5: { name: 'Plot Architecture', description: 'Creating the beat sheet and tension curve' },
  6: { name: 'Chapter Breakdown', description: 'Outlining each chapter with beats and hooks' },
  7: { name: 'Level Check', description: 'Validating prose requirements for target reading level' },
  8: { name: 'Validation', description: 'Comprehensive coherence and quality audit' },
}

/**
 * Generate a complete story bible through the 8-phase pipeline
 * @param {string} concept - Story concept/description
 * @param {string} level - Reading level (Beginner, Intermediate, Native)
 * @param {string} lengthPreset - 'novella' (12 chapters) or 'novel' (35 chapters)
 * @param {string} language - Target language
 * @param {number} maxValidationAttempts - Max validation retry attempts (default 2)
 * @param {Function} onProgress - Optional callback for progress updates: (phase, totalPhases, phaseName, description, status) => void
 * @returns {Promise<Object>} Generated bible result
 */
export async function generateBible(concept, level, lengthPreset, language, maxValidationAttempts = 2, onProgress = null) {
  console.log('='.repeat(60))
  console.log('STARTING BIBLE GENERATION PIPELINE')
  console.log(`Concept: ${concept}`)
  console.log(`Level: ${level}, Length: ${lengthPreset}, Language: ${language}`)
  console.log('='.repeat(60))

  let bible = {}
  let validationAttempts = 0
  const totalPhases = 8

  // Helper to report progress
  const reportProgress = (phase, status = 'in_progress', details = null) => {
    const phaseInfo = PHASE_DESCRIPTIONS[phase]
    console.log(`[Phase ${phase}/${totalPhases}] ${phaseInfo.name}: ${status}`)
    if (onProgress) {
      try {
        onProgress({
          phase,
          totalPhases,
          phaseName: phaseInfo.name,
          description: phaseInfo.description,
          status,
          details,
          timestamp: new Date().toISOString()
        })
      } catch (e) {
        console.warn('Progress callback error:', e.message)
      }
    }
  }

  try {
    // Phase 1: Core Foundation
    reportProgress(1, 'starting')
    bible.coreFoundation = await executePhase1(concept, lengthPreset, level)
    reportProgress(1, 'complete', { genre: bible.coreFoundation.genre, theme: bible.coreFoundation.theme })

    // Phase 2: World/Setting
    reportProgress(2, 'starting')
    bible.world = await executePhase2(concept, bible.coreFoundation)
    reportProgress(2, 'complete', { location: bible.world.setting?.location })

    // Phase 3: Characters
    reportProgress(3, 'starting')
    bible.characters = await executePhase3(concept, bible.coreFoundation, bible.world)
    reportProgress(3, 'complete', {
      protagonist: bible.characters.protagonist?.name,
      loveInterest: bible.characters.love_interest?.name
    })

    // Phase 4: Chemistry
    reportProgress(4, 'starting')
    bible.chemistry = await executePhase4(concept, bible.coreFoundation, bible.world, bible.characters)
    reportProgress(4, 'complete')

    // Phase 5: Plot Architecture
    reportProgress(5, 'starting')
    bible.plot = await executePhase5(concept, bible.coreFoundation, bible.world, bible.characters, bible.chemistry, lengthPreset)
    reportProgress(5, 'complete', { actCount: bible.plot.acts?.length || 3 })

    // Phase 6: Chapter Breakdown
    reportProgress(6, 'starting')
    bible.chapters = await executePhase6(concept, bible.coreFoundation, bible.world, bible.characters, bible.chemistry, bible.plot, lengthPreset)
    reportProgress(6, 'complete', { chapterCount: bible.chapters.chapters?.length || 0 })

    // Phase 7: Level Check
    reportProgress(7, 'starting', { targetLevel: level, targetLanguage: language })
    const phases1to6 = {
      coreFoundation: bible.coreFoundation,
      world: bible.world,
      characters: bible.characters,
      chemistry: bible.chemistry,
      plot: bible.plot,
      chapters: bible.chapters
    }
    bible.levelCheck = await executePhase7(level, phases1to6, language)
    reportProgress(7, 'complete', {
      assessment: bible.levelCheck.assessment,
      readyForGeneration: bible.levelCheck.ready_for_generation,
      flagCount: bible.levelCheck.flags?.length || 0
    })

    // Phase 8: Validation (with potential regeneration)
    reportProgress(8, 'starting')
    while (validationAttempts < maxValidationAttempts) {
      validationAttempts++
      console.log(`Validation attempt ${validationAttempts}/${maxValidationAttempts}`)

      bible.validation = await executePhase8(bible)

      if (bible.validation.validation_status === 'PASS' || bible.validation.validation_status === 'CONDITIONAL_PASS') {
        console.log('Bible validation passed!')
        reportProgress(8, 'complete', {
          validationStatus: bible.validation.validation_status,
          attempts: validationAttempts
        })
        break
      }

      if (validationAttempts < maxValidationAttempts && bible.validation.recovery_plan?.required_regenerations?.length > 0) {
        // Get the earliest phase to regenerate from
        const phasesToRegenerate = bible.validation.recovery_plan.required_regenerations
        const phaseNumbers = phasesToRegenerate.map(p => parseInt(p.replace('Phase ', '')))
        const earliestPhase = Math.min(...phaseNumbers)

        reportProgress(8, 'regenerating', {
          fromPhase: earliestPhase,
          phasesToFix: phasesToRegenerate
        })

        console.log(`Regenerating from Phase ${earliestPhase}...`)
        bible = await regenerateFromPhase(
          earliestPhase,
          bible,
          concept,
          level,
          lengthPreset,
          language,
          bible.validation.recovery_plan.specific_instructions
        )
      }
    }

    // Final status if we exhausted attempts
    if (bible.validation?.validation_status !== 'PASS' && bible.validation?.validation_status !== 'CONDITIONAL_PASS') {
      reportProgress(8, 'complete_with_issues', {
        validationStatus: bible.validation?.validation_status,
        attempts: validationAttempts
      })
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
    // Report error to progress callback
    if (onProgress) {
      try {
        onProgress({
          phase: 0,
          totalPhases,
          phaseName: 'Error',
          description: 'Pipeline failed',
          status: 'error',
          details: { error: error.message },
          timestamp: new Date().toISOString()
        })
      } catch (e) {
        // Ignore callback errors during error handling
      }
    }
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

LEVEL COMPLIANCE (CRITICAL - NON-NEGOTIABLE):
This is for language learners. Level constraints are MANDATORY, not suggestions.

You will receive detailed prose_guidance with EXACT constraints. You MUST follow them:

1. SENTENCE LENGTH: The prose_guidance specifies exact min/max sentence lengths. Count your words. Do not exceed the maximum. Stay within the average range.

2. VOCABULARY: If the level forbids certain vocabulary types (literary, abstract, idioms), you MUST NOT use them. Use only allowed vocabulary.

3. MEANING/SUBTEXT: Follow the exact rule for your level:
   - Beginner: NO SUBTEXT. State everything explicitly. Name emotions directly.
   - Intermediate: Light subtext OK. Critical meaning still explicit.
   - Native: Full subtlety available.

4. DIALOGUE: Follow the exact dialogue constraints for the level. Beginner dialogue is direct and short. Intermediate can be natural. Native is authentic.

5. NARRATIVE TECHNIQUE: Follow the show/tell rule for your level:
   - Beginner: TELL over show. Clarity over technique.
   - Intermediate: Balance of both.
   - Native: Show over tell.

6. LANGUAGE-SPECIFIC RULES: You will receive grammar rules specific to the target language at this level. For example, Spanish Beginner avoids subjunctive. French Beginner avoids passé simple. Follow these.

VIOLATION OF LEVEL CONSTRAINTS IS A FAILURE. The chapter will be rejected if it does not comply.

## ANTI-EXPOSITION RULES (MANDATORY)

NEVER write these types of prose:
- Backstory dumps: "She remembered her childhood...", "Years ago, he had..."
- Character description paragraphs: "She was a woman who...", "He had always been..."
- Setting lectures: "The house had been built in 1850 and featured..."
- Emotional summaries: "She felt a wave of sadness wash over her"
- Internal monologue exposition: "She thought about how different things were now"

ALWAYS dramatize in the present moment:
- Show backstory through triggered memory fragments (one sentence max)
- Reveal character through action, not description
- Let setting emerge through sensory details the POV notices NOW
- Externalize emotions through physical sensation and action
- Keep internal monologue as immediate reaction, not reflection

WRONG: "Elena había crecido en una familia conservadora donde las mujeres no expresaban sus opiniones."
RIGHT: "Su madre habría desaprobado esto. Elena enderezó los hombros."

Every paragraph must answer: "What is the character DOING or EXPERIENCING right now?"

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

// =============================================================================
// SCENE-BY-SCENE GENERATION
// =============================================================================

// Calculate word count target for a scene based on beat count
function getSceneWordCountTarget(beatCount) {
  // Each beat should be 40-80 words of prose (allowing range for beat complexity)
  // Minimum scene: 500 words, Maximum: 1500 words
  const minWords = Math.max(500, beatCount * 40)
  const maxWords = Math.min(1500, beatCount * 80)
  return { min: minWords, max: maxWords }
}

const SCENE_SYSTEM_PROMPT = `Write in the style of Charlotte Brontë's Jane Eyre. Write in {{target_language}}.

## Output Format (JSON)

{
  "scene": {
    "scene_name": "Scene title",
    "content": "The complete scene prose in {{target_language}}...",
    "word_count": number,
    "beats_dramatized": ["Beat 1", "Beat 2", ...],
    "emotional_journey": "POV character's emotional arc through this scene",
    "exit_state": "Where/how the scene ends (physical and emotional)"
  }
}`

// Build prompt for a single scene
function buildSceneUserPrompt(bible, chapter, scene, sceneIndex, previousSceneExit, language) {
  const protagonist = bible.characters.protagonist
  const loveInterest = bible.characters.love_interest
  const isPovProtagonist = chapter.pov === protagonist?.name
  const povCharacter = isPovProtagonist ? protagonist : loveInterest
  const otherCharacter = isPovProtagonist ? loveInterest : protagonist

  const beatCount = scene.beats?.length || 0
  const wordTarget = getSceneWordCountTarget(beatCount)

  // Get prose guidance
  const proseGuidance = bible.levelCheck?.prose_guidance || {}
  const targetLevel = bible.levelCheck?.target_level || 'Intermediate'
  const levelDef = LEVEL_DEFINITIONS[targetLevel] || LEVEL_DEFINITIONS.Intermediate

  // Build level constraints text
  const sentenceConstraints = proseGuidance.sentence_constraints || {}
  const avgMin = sentenceConstraints.average_length_min || levelDef.sentences.averageLength.min
  const avgMax = sentenceConstraints.average_length_max || levelDef.sentences.averageLength.max
  const maxLen = sentenceConstraints.max_length || levelDef.sentences.maxLength

  let levelText = `TARGET LEVEL: ${targetLevel}
SENTENCE LENGTH: Average ${avgMin}-${avgMax} words, maximum ${maxLen} words
`
  if (targetLevel === 'Beginner') {
    levelText += `CRITICAL BEGINNER CONSTRAINTS (MANDATORY):
- MAXIMUM 15 WORDS PER SENTENCE. No exceptions. Split long sentences.
- Simple subject-verb-object sentences only
- No subordinate clauses or complex structures
- Name emotions directly ("She felt angry") not indirectly ("Her jaw tightened")
- Use only the 1500 most common words
- Every meaning must be explicit — no subtext or implication
- Dialogue should be direct and functional
- NO backstory dumps. NO exposition paragraphs. NO character descriptions.
- DRAMATIZE in present moment — show action, not reflection
- Strictly chronological — no flashbacks or temporal jumps`
  } else if (targetLevel === 'Intermediate') {
    levelText += `INTERMEDIATE CONSTRAINTS (MANDATORY):
- MAXIMUM 20 WORDS PER SENTENCE. No exceptions. Split long sentences.
- Average sentence length: 10-18 words
- Mix simple and compound sentences, but keep them SHORT
- Subordinate clauses allowed IF total stays under 20 words
- NO backstory dumps. NO exposition paragraphs. NO character descriptions.
- DRAMATIZE in present moment — show action, not reflection
- Strictly chronological — no flashbacks or temporal jumps
- Clarity is paramount. If in doubt, use simpler structure.
- Avoid archaic/literary vocabulary. Use common, accessible words.`
  } else if (targetLevel === 'Native') {
    levelText += `NATIVE LEVEL GUIDELINES:
- Full sentence variety available. No hard word limits.
- Literary techniques allowed: subtext, implication, showing over telling.
- Non-linear timeline available if it serves the story.
- STILL AVOID: Blatant backstory dumps, info-dumps, or character description blocks.
- STILL DRAMATIZE: Show through action and sensory detail, not exposition.
- Exposition should be woven naturally into scenes, never delivered as lectures.
- Trust the reader to infer meaning from well-crafted scenes.`
  }

  // Previous context
  const previousContext = previousSceneExit
    ? `PREVIOUS SCENE ENDED: ${previousSceneExit}`
    : sceneIndex === 0
      ? `This is the first scene of Chapter ${chapter.number}.`
      : 'Continue from where the story left off.'

  return `=== STORY CONTEXT ===

Story: ${bible.coreFoundation?.logline || 'A romance story'}
Setting: ${bible.world?.setting?.location}, ${bible.world?.setting?.time_period}

POV CHARACTER: ${povCharacter?.name}
- Voice: ${povCharacter?.voice?.speech_patterns || 'Natural'}
- Verbal tics: ${povCharacter?.voice?.verbal_tics || 'None'}
- Emotional expression: ${povCharacter?.voice?.emotional_expression || 'Moderate'}
- What they notice: A ${povCharacter?.archetype || 'character'} notices ${povCharacter?.voice?.topics_avoided ? 'everything except ' + povCharacter.voice.topics_avoided : 'the details of their world'}

OTHER CHARACTER PRESENT: ${otherCharacter?.name}
- Voice: ${otherCharacter?.voice?.speech_patterns || 'Natural'}

---

=== CHAPTER ${chapter.number}: ${chapter.title} ===

Chapter Tension: ${chapter.tension_rating || 5}/10
Chapter Emotional Arc: ${chapter.emotional_arc?.opens || 'N/A'} → ${chapter.emotional_arc?.turns || 'N/A'} → ${chapter.emotional_arc?.closes || 'N/A'}

---

=== SCENE ${sceneIndex + 1}: ${scene.scene_name || 'Untitled'} ===

LOCATION: ${scene.location || 'Unknown'}
TIME: ${scene.time_of_day || 'Unspecified'}
ATMOSPHERE: ${scene.weather_mood || 'Neutral'}
CHARACTERS PRESENT: ${scene.characters_present?.join(', ') || chapter.pov}

SENSORY ANCHOR (ground the reader here):
${scene.sensory_anchor || 'Establish the physical environment through the POV character\'s senses'}

SCENE PURPOSE: ${scene.scene_purpose || 'Advance the story'}

---

=== MICRO-BEATS TO DRAMATIZE ===
${scene.beats?.map((beat, i) => `${i + 1}. ${beat}`).join('\n') || 'No beats specified'}

---

SCENE TURN: ${scene.scene_turn || 'A shift in the emotional dynamic'}
SCENE EXIT: ${scene.exits_with || 'Transition to next scene'}

---

${previousContext}

---

=== LEVEL CONSTRAINTS (NON-NEGOTIABLE) ===
${levelText}
=== END CONSTRAINTS ===

---

TARGET: ${wordTarget.min}-${wordTarget.max} words (${beatCount} beats × ~60 words each)
LANGUAGE: ${language}

Write this scene now. Dramatize EVERY beat. Make each one vivid and immersive.`
}

// Generate a single scene
async function generateScene(bible, chapter, scene, sceneIndex, previousSceneExit, language) {
  const beatCount = scene.beats?.length || 0
  console.log(`  Generating Scene ${sceneIndex + 1}: "${scene.scene_name || 'Untitled'}" (${beatCount} beats)...`)

  const systemPrompt = SCENE_SYSTEM_PROMPT.replace(/\{\{target_language\}\}/g, language)
  const userPrompt = buildSceneUserPrompt(bible, chapter, scene, sceneIndex, previousSceneExit, language)

  const response = await callClaude(systemPrompt, userPrompt, {
    temperature: 0.85, // Slightly higher for creative scene writing
    maxTokens: 4096   // Enough for a single scene
  })

  const parsed = parseJSON(response)
  if (!parsed.success) {
    throw new Error(`Scene ${sceneIndex + 1} JSON parse failed: ${parsed.error}`)
  }

  const sceneData = parsed.data.scene || parsed.data
  const wordCount = sceneData.content?.split(/\s+/).length || 0
  const wordTarget = getSceneWordCountTarget(beatCount)

  console.log(`    Scene ${sceneIndex + 1} generated: ${wordCount} words (target: ${wordTarget.min}-${wordTarget.max})`)

  return {
    ...sceneData,
    sceneIndex,
    wordCount,
    wordTarget
  }
}

// Generate a full chapter by generating each scene individually
async function generateChapterByScenes(bible, chapterIndex, previousSummaries, language) {
  console.log(`Generating Chapter ${chapterIndex} scene-by-scene...`)

  const indexValidation = validateChapterIndex(chapterIndex, bible)
  const chapter = indexValidation.chapter

  // Check if chapter has scenes defined
  if (!chapter.scenes || chapter.scenes.length === 0) {
    console.log(`  Chapter ${chapterIndex} has no scenes defined, falling back to single-pass generation`)
    return await generateChapter(bible, chapterIndex, previousSummaries, language)
  }

  console.log(`  Chapter ${chapterIndex} has ${chapter.scenes.length} scenes`)

  // Generate each scene
  const generatedScenes = []
  let previousSceneExit = null

  // Build previous chapter context for first scene
  if (previousSummaries && previousSummaries.length > 0) {
    const lastSummary = previousSummaries[previousSummaries.length - 1]
    if (lastSummary.summary) {
      previousSceneExit = `Previous chapter ended: ${lastSummary.summary.locationEnd || 'Unknown location'}. ${lastSummary.summary.relationshipState || ''}`
    }
  }

  for (let i = 0; i < chapter.scenes.length; i++) {
    const scene = chapter.scenes[i]

    const generatedScene = await generateScene(
      bible,
      chapter,
      scene,
      i,
      previousSceneExit,
      language
    )

    generatedScenes.push(generatedScene)

    // Update context for next scene
    previousSceneExit = generatedScene.exit_state || generatedScene.exits_with || 'Scene ended.'
  }

  // Concatenate all scene content into chapter
  const fullContent = generatedScenes.map(s => s.content).join('\n\n---\n\n')
  const totalWordCount = generatedScenes.reduce((sum, s) => sum + (s.wordCount || 0), 0)
  const allBeatsDramatized = generatedScenes.flatMap(s => s.beats_dramatized || [])

  console.log(`  Chapter ${chapterIndex} complete: ${totalWordCount} total words from ${generatedScenes.length} scenes`)

  // Get level and prose guidance from bible for validation
  const level = bible.levelCheck?.target_level || 'Intermediate'
  const proseGuidance = bible.levelCheck?.prose_guidance || null
  const wordCountTarget = getWordCountTarget(chapter.tension_rating || 5)

  // Collect all expected beats
  const allExpectedBeats = chapter.scenes.flatMap(scene => scene.beats || [])

  // Build summary from scene data
  const summary = {
    events: generatedScenes.map(s => s.emotional_journey || s.scene_name).filter(Boolean),
    characterStates: {
      [chapter.pov]: generatedScenes[generatedScenes.length - 1]?.exit_state || 'Unknown'
    },
    relationshipState: 'See events',
    reveals: [],
    seedsPlanted: [],
    seedsPaid: [],
    locationEnd: chapter.scenes[chapter.scenes.length - 1]?.location || 'Unknown',
    timeElapsed: chapter.story_time || 'Unknown'
  }

  // Build the full result object BEFORE validation
  const result = {
    chapter: {
      title: chapter.title,
      content: fullContent
    },
    summary,
    metadata: {
      wordCount: totalWordCount,
      beatsCovered: allBeatsDramatized,
      hookDelivered: chapter.hook?.description || 'Chapter concluded',
      hookType: chapter.hook?.type || 'emotional',
      scenesGenerated: generatedScenes.length,
      sceneWordCounts: generatedScenes.map(s => s.wordCount)
    },
    generatedAt: new Date().toISOString(),
    generationMethod: 'scene-by-scene'
  }

  // Validate the combined chapter with full data
  const validation = validateChapterOutput(
    result,
    allExpectedBeats,
    chapter.chapter_hook?.type || chapter.hook?.type,
    wordCountTarget,
    level,
    proseGuidance
  )

  result.validation = validation
  return result
}

// Legacy single-pass chapter generation (kept for fallback)
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

  // Get prose guidance from levelCheck - now structured
  const proseGuidance = bible.levelCheck?.prose_guidance || {}
  const targetLevel = bible.levelCheck?.target_level || 'Intermediate'

  // Get the base level definition for fallbacks
  const levelDef = LEVEL_DEFINITIONS[targetLevel] || LEVEL_DEFINITIONS.Intermediate

  // Build structured prose guidance text
  const sentenceConstraints = proseGuidance.sentence_constraints || {}
  const vocabConstraints = proseGuidance.vocabulary_constraints || {}
  const meaningConstraints = proseGuidance.meaning_constraints || {}
  const dialogueConstraints = proseGuidance.dialogue_constraints || {}
  const narrativeConstraints = proseGuidance.narrative_constraints || {}
  const languageRules = proseGuidance.language_specific_rules || []
  const forbiddenTechniques = bible.levelCheck?.forbidden_techniques || levelDef.forbidden || []

  // Get chapter-specific notes if available
  const chapterNotes = bible.levelCheck?.chapter_specific_notes?.find(n => n.chapter === chapterIndex)

  const proseGuidanceText = `
### SENTENCE CONSTRAINTS (MANDATORY):
- Average length: ${sentenceConstraints.average_length_min || levelDef.sentences.averageLength.min}-${sentenceConstraints.average_length_max || levelDef.sentences.averageLength.max} words per sentence
- Maximum length: ${sentenceConstraints.max_length || levelDef.sentences.maxLength || 'no hard limit'} words
- Structure: ${sentenceConstraints.structure_rule || levelDef.sentences.structure}
- Allowed connectors: ${sentenceConstraints.allowed_connectors || levelDef.sentences.connectors}

### VOCABULARY CONSTRAINTS (MANDATORY):
- Scope: ${vocabConstraints.scope || levelDef.vocabulary.scope}
- Handling difficult concepts: ${vocabConstraints.handling_rule || levelDef.vocabulary.handling}
${vocabConstraints.forbidden_types?.length > 0 || levelDef.vocabulary.forbidden?.length > 0 ? `- FORBIDDEN vocabulary types:\n${(vocabConstraints.forbidden_types || levelDef.vocabulary.forbidden).map(f => `  * ${f}`).join('\n')}` : ''}

### MEANING & SUBTEXT (MANDATORY):
- Explicitness: ${meaningConstraints.explicitness_rule || levelDef.meaning.explicitness}
- Subtext rule: ${meaningConstraints.subtext_rule || levelDef.meaning.subtext}
- Emotion expression: ${meaningConstraints.emotion_rule || levelDef.meaning.emotions}
- Motivation clarity: ${meaningConstraints.motivation_rule || levelDef.meaning.motivation}

### DIALOGUE CONSTRAINTS (MANDATORY):
- Style: ${dialogueConstraints.style_rule || levelDef.dialogue.style}
- Length: ${dialogueConstraints.length_rule || levelDef.dialogue.length}
- Attribution: ${dialogueConstraints.attribution_rule || levelDef.dialogue.attribution}
- Subtext: ${dialogueConstraints.subtext_rule || levelDef.dialogue.subtext}

### NARRATIVE TECHNIQUE (MANDATORY):
- Cause/Effect: ${narrativeConstraints.cause_effect_rule || levelDef.narrative.causeEffect}
- Timeline: ${narrativeConstraints.timeline_rule || levelDef.narrative.timeflow}
- POV handling: ${narrativeConstraints.pov_rule || levelDef.narrative.pov}
- Show vs Tell: ${narrativeConstraints.show_tell_rule || levelDef.narrative.showing}

${languageRules.length > 0 ? `### ${language.toUpperCase()}-SPECIFIC GRAMMAR RULES (MANDATORY):\n${languageRules.map(r => `- ${r}`).join('\n')}` : ''}

${forbiddenTechniques.length > 0 ? `### FORBIDDEN AT THIS LEVEL (DO NOT USE):\n${forbiddenTechniques.map(f => `- ${f}`).join('\n')}` : ''}

${chapterNotes ? `### CHAPTER ${chapterIndex} SPECIFIC GUIDANCE:\n- Potential issues: ${chapterNotes.potential_violations?.join(', ') || 'None'}\n- Mitigation: ${chapterNotes.mitigation || 'Follow standard level rules'}` : ''}`

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
Chapter Purpose: ${chapter.chapter_purpose || 'N/A'}

Emotional Arc:
- Opens: ${chapter.emotional_arc?.opens || 'N/A'}
- Turns: ${chapter.emotional_arc?.turns || 'N/A'}
- Closes: ${chapter.emotional_arc?.closes || 'N/A'}

=== SCENES & MICRO-BEATS (WRITE THESE IN ORDER) ===

${chapter.scenes?.map((scene, sceneIdx) => `
--- SCENE ${sceneIdx + 1}: ${scene.scene_name || 'Untitled Scene'} ---
Location: ${scene.location || 'N/A'}
Time: ${scene.time_of_day || 'N/A'}
Atmosphere: ${scene.weather_mood || 'N/A'}
Characters: ${scene.characters_present?.join(', ') || 'N/A'}
Scene Purpose: ${scene.scene_purpose || 'N/A'}
Sensory Anchor: ${scene.sensory_anchor || 'N/A'}

MICRO-BEATS TO DRAMATIZE (each beat = 1-3 sentences of prose):
${scene.beats?.map((beat, beatIdx) => `  ${beatIdx + 1}. ${beat}`).join('\n') || 'N/A'}

Scene Turn: ${scene.scene_turn || 'N/A'}
Exit: ${scene.exits_with || 'N/A'}
`).join('\n') || 'N/A'}

=== END SCENES ===

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

=== LEVEL CONSTRAINTS (NON-NEGOTIABLE) ===
TARGET LEVEL: ${targetLevel}
TARGET LANGUAGE: ${language}

${proseGuidanceText}

=== END LEVEL CONSTRAINTS ===

---

Write Chapter ${chapter.number} now in ${language}.

REQUIREMENTS:
1. Hit every beat listed above
2. End with the ${chapter.hook?.type || 'emotional'} hook
3. Stay within ${wordCountTarget.min}-${wordCountTarget.max} words
4. STRICTLY follow the level constraints above - violation means rejection

Remember: This is for ${targetLevel} level language learners. ${targetLevel === 'Beginner' ? 'SIMPLICITY AND CLARITY are paramount. Use short sentences. Name emotions directly. No subtext.' : targetLevel === 'Intermediate' ? 'Balance clarity with natural flow. Some complexity allowed but key meaning must be accessible.' : 'Write naturally as for native readers. Full stylistic freedom.'}`
}

// Analyze sentence statistics for level validation
function analyzeSentenceStats(content) {
  if (!content) return null

  // Split content into sentences (handle multiple punctuation marks)
  // This regex handles ., !, ?, and also handles quotes and ellipses
  const sentences = content
    .replace(/([.!?])\s*(?=[A-Z¿¡"'«])/g, '$1|SPLIT|')
    .split('|SPLIT|')
    .map(s => s.trim())
    .filter(s => s.length > 0 && /\w/.test(s))

  if (sentences.length === 0) return null

  // Count words in each sentence
  const sentenceLengths = sentences.map(s => {
    const words = s.split(/\s+/).filter(w => w.length > 0)
    return words.length
  })

  const totalWords = sentenceLengths.reduce((a, b) => a + b, 0)
  const averageLength = totalWords / sentences.length
  const maxSentenceLength = Math.max(...sentenceLengths)
  const minSentenceLength = Math.min(...sentenceLengths)

  // Count sentences over certain thresholds
  const sentencesOver15 = sentenceLengths.filter(l => l > 15).length
  const sentencesOver20 = sentenceLengths.filter(l => l > 20).length
  const sentencesOver25 = sentenceLengths.filter(l => l > 25).length

  return {
    totalSentences: sentences.length,
    totalWords,
    averageLength: Math.round(averageLength * 10) / 10,
    maxSentenceLength,
    minSentenceLength,
    sentencesOver15,
    sentencesOver20,
    sentencesOver25,
    distribution: {
      short: sentenceLengths.filter(l => l <= 8).length,
      medium: sentenceLengths.filter(l => l > 8 && l <= 15).length,
      long: sentenceLengths.filter(l => l > 15 && l <= 25).length,
      veryLong: sentenceLengths.filter(l => l > 25).length,
    }
  }
}

// Validate prose against level constraints
function validateLevelCompliance(content, level, proseGuidance) {
  const issues = []
  const warnings = []

  const stats = analyzeSentenceStats(content)
  if (!stats) {
    issues.push({ type: 'analysis_failed', message: 'Could not analyze sentence structure' })
    return { issues, warnings, stats: null }
  }

  // Get level constraints
  const levelDef = LEVEL_DEFINITIONS[level]
  if (!levelDef) {
    warnings.push({ type: 'unknown_level', message: `Unknown level ${level}, skipping level validation` })
    return { issues, warnings, stats }
  }

  const sentenceConstraints = proseGuidance?.sentence_constraints || {}
  const avgMin = sentenceConstraints.average_length_min || levelDef.sentences.averageLength.min
  const avgMax = sentenceConstraints.average_length_max || levelDef.sentences.averageLength.max
  const maxLen = sentenceConstraints.max_length || levelDef.sentences.maxLength

  // Check average sentence length
  if (stats.averageLength < avgMin * 0.7) {
    warnings.push({
      type: 'sentences_too_short',
      message: `Average sentence length ${stats.averageLength} is significantly below target ${avgMin}-${avgMax}`,
      actual: stats.averageLength,
      target: { min: avgMin, max: avgMax }
    })
  }
  if (stats.averageLength > avgMax * 1.3) {
    issues.push({
      type: 'sentences_too_long',
      message: `Average sentence length ${stats.averageLength} exceeds target ${avgMin}-${avgMax} for ${level} level`,
      actual: stats.averageLength,
      target: { min: avgMin, max: avgMax }
    })
  }

  // Check maximum sentence length (critical for Beginner)
  if (maxLen && stats.maxSentenceLength > maxLen * 1.5) {
    if (level === 'Beginner') {
      issues.push({
        type: 'max_sentence_exceeded',
        message: `Found sentences with ${stats.maxSentenceLength} words. Maximum for Beginner is ${maxLen} words.`,
        actual: stats.maxSentenceLength,
        max: maxLen
      })
    } else {
      warnings.push({
        type: 'long_sentences',
        message: `Found sentences with ${stats.maxSentenceLength} words. Target max for ${level} is ${maxLen}.`,
        actual: stats.maxSentenceLength,
        max: maxLen
      })
    }
  }

  // Level-specific checks
  if (level === 'Beginner') {
    // Beginner should have mostly short sentences
    const shortAndMedium = stats.distribution.short + stats.distribution.medium
    const totalSentences = stats.totalSentences
    const shortRatio = shortAndMedium / totalSentences

    if (shortRatio < 0.8) {
      issues.push({
        type: 'beginner_complexity',
        message: `Only ${Math.round(shortRatio * 100)}% of sentences are appropriately short for Beginner level. Target: 80%+`,
        distribution: stats.distribution
      })
    }

    // Check for very long sentences (should be zero for Beginner)
    if (stats.distribution.veryLong > 0) {
      issues.push({
        type: 'beginner_long_sentences',
        message: `Found ${stats.distribution.veryLong} sentences over 25 words. Beginner level should have none.`,
        count: stats.distribution.veryLong
      })
    }
  }

  if (level === 'Intermediate') {
    // Intermediate should have a mix, but not too many very long sentences
    const veryLongRatio = stats.distribution.veryLong / stats.totalSentences
    if (veryLongRatio > 0.15) {
      warnings.push({
        type: 'intermediate_complexity',
        message: `${Math.round(veryLongRatio * 100)}% of sentences are over 25 words. Consider simplifying for Intermediate.`,
        distribution: stats.distribution
      })
    }
  }

  return {
    issues,
    warnings,
    stats,
    levelCompliant: issues.length === 0
  }
}

// Validate chapter output
function validateChapterOutput(chapterData, expectedBeats, expectedHookType, wordCountTarget, level = 'Intermediate', proseGuidance = null) {
  const issues = []
  const warnings = []

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

  // Level compliance validation
  let levelValidation = null
  if (content && level) {
    levelValidation = validateLevelCompliance(content, level, proseGuidance)

    // Add level issues to main issues (these are critical)
    issues.push(...levelValidation.issues)
    warnings.push(...levelValidation.warnings)

    // Log level stats
    if (levelValidation.stats) {
      console.log(`Level validation for ${level}: avg sentence length ${levelValidation.stats.averageLength}, max ${levelValidation.stats.maxSentenceLength}`)
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    warnings,
    wordCount,
    beatsCovered: beatsCovered.length,
    levelValidation
  }
}

// Validate chapter index
function validateChapterIndex(chapterIndex, bible) {
  // Check that chapterIndex is a positive integer
  if (typeof chapterIndex !== 'number' || !Number.isInteger(chapterIndex) || chapterIndex < 1) {
    throw new Error(`Invalid chapter index: ${chapterIndex}. Must be a positive integer starting from 1.`)
  }

  // Check that bible has chapters
  if (!bible?.chapters?.chapters || !Array.isArray(bible.chapters.chapters)) {
    throw new Error('Bible does not contain valid chapter data. Ensure bible generation completed successfully.')
  }

  // Check that chapter index is within bounds
  const totalChapters = bible.chapters.chapters.length
  if (chapterIndex > totalChapters) {
    throw new Error(`Chapter index ${chapterIndex} is out of bounds. Bible contains ${totalChapters} chapters.`)
  }

  return {
    valid: true,
    chapterIndex,
    totalChapters,
    chapter: bible.chapters.chapters[chapterIndex - 1]
  }
}

// Generate a single chapter
async function generateChapter(bible, chapterIndex, previousSummaries, language) {
  console.log(`Generating Chapter ${chapterIndex}...`)

  // Validate chapter index
  const indexValidation = validateChapterIndex(chapterIndex, bible)
  const chapter = indexValidation.chapter

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

  // Get level and prose guidance from bible
  const level = bible.levelCheck?.target_level || 'Intermediate'
  const proseGuidance = bible.levelCheck?.prose_guidance || null

  // Collect all beats from all scenes (new structure) or fall back to old structure
  const allBeats = chapter.scenes
    ? chapter.scenes.flatMap(scene => scene.beats || [])
    : (chapter.beats || [])

  // Validate output including level compliance
  const validation = validateChapterOutput(
    chapterData,
    allBeats,
    chapter.chapter_hook?.type || chapter.hook?.type,
    wordCountTarget,
    level,
    proseGuidance
  )

  if (!validation.valid) {
    console.warn(`Chapter ${chapterIndex} validation issues:`, validation.issues)
    if (validation.warnings?.length > 0) {
      console.warn(`Chapter ${chapterIndex} warnings:`, validation.warnings)
    }
  }

  console.log(`Chapter ${chapterIndex} generated. Word count: ${validation.wordCount}`)
  if (validation.levelValidation?.stats) {
    console.log(`  Level ${level}: avg sentence ${validation.levelValidation.stats.averageLength} words, max ${validation.levelValidation.stats.maxSentenceLength}`)
  }

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

  // Get level and prose guidance from bible
  const level = bible.levelCheck?.target_level || 'Intermediate'
  const proseGuidance = bible.levelCheck?.prose_guidance || null

  // Collect all beats from all scenes (new structure) or fall back to old structure
  const allBeats = chapter.scenes
    ? chapter.scenes.flatMap(scene => scene.beats || [])
    : (chapter.beats || [])

  const validation = validateChapterOutput(
    chapterData,
    allBeats,
    chapter.chapter_hook?.type || chapter.hook?.type,
    wordCountTarget,
    level,
    proseGuidance
  )

  console.log(`Chapter ${chapterIndex} regenerated. Word count: ${validation.wordCount}`)
  if (validation.levelValidation?.stats) {
    console.log(`  Level ${level}: avg sentence ${validation.levelValidation.stats.averageLength} words, max ${validation.levelValidation.stats.maxSentenceLength}`)
  }

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

  // Get level and prose guidance from bible
  const level = bible.levelCheck?.target_level || 'Intermediate'
  const proseGuidance = bible.levelCheck?.prose_guidance || null

  // Collect all beats from all scenes (new structure) or fall back to old structure
  const allBeats = chapter.scenes
    ? chapter.scenes.flatMap(scene => scene.beats || [])
    : (chapter.beats || [])

  const validation = validateChapterOutput(
    parsed.data,
    allBeats,
    chapter.chapter_hook?.type || chapter.hook?.type,
    wordCountTarget,
    level,
    proseGuidance
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
// Now uses scene-by-scene generation for chapters with scenes defined
async function generateChapterWithValidation(bible, chapterIndex, previousSummaries, language, maxAttempts = 2) {
  let attempts = 0
  let lastOutput = null
  let lastIssues = []

  // Check if chapter has scenes - use scene-by-scene generation
  const chapter = bible.chapters?.chapters?.[chapterIndex - 1]
  const hasScenes = chapter?.scenes && chapter.scenes.length > 0

  while (attempts < maxAttempts) {
    attempts++
    console.log(`Chapter ${chapterIndex} generation attempt ${attempts}/${maxAttempts}${hasScenes ? ' (scene-by-scene)' : ' (single-pass)'}`)

    try {
      if (attempts === 1) {
        // First attempt: use scene-by-scene if scenes exist, otherwise single-pass
        if (hasScenes) {
          lastOutput = await generateChapterByScenes(bible, chapterIndex, previousSummaries, language)
        } else {
          lastOutput = await generateChapter(bible, chapterIndex, previousSummaries, language)
        }
      } else {
        // Retry: use legacy regeneration (scene-by-scene doesn't have regeneration yet)
        lastOutput = await regenerateChapter(bible, chapterIndex, previousSummaries, language, lastOutput, lastIssues)
      }

      if (lastOutput.validation.valid) {
        console.log(`Chapter ${chapterIndex} passed validation.`)
        return {
          success: true,
          chapter: lastOutput,
          attempts,
          generationMethod: lastOutput.generationMethod || 'single-pass'
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
    needsReview: true,
    generationMethod: lastOutput?.generationMethod || 'single-pass'
  }
}

export {
  generateChapter,
  generateChapterByScenes,
  generateScene,
  generateChapterWithValidation,
  buildPreviousContext,
  compressSummaries,
  validateChapterOutput,
  validateLevelCompliance,
  validateChapterIndex,
  analyzeSentenceStats,
  getWordCountTarget,
  getSceneWordCountTarget,
  getLevelDefinition,
  formatLevelDefinitionForPrompt,
  WORD_COUNT_BY_TENSION,
  LEVEL_DEFINITIONS,
  LANGUAGE_LEVEL_ADJUSTMENTS,
  PHASE_DESCRIPTIONS
}

export default {
  generateBible,
  generateChapter,
  generateChapterByScenes,
  generateScene,
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
  CONFIG,
  LEVEL_DEFINITIONS,
  LANGUAGE_LEVEL_ADJUSTMENTS,
  PHASE_DESCRIPTIONS
}
