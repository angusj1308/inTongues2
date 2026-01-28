// Novel Generator - Bible Generation Pipeline
// Implements Phases 1-8 for generating complete story bibles

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
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

// Lazy-initialized OpenAI client
let openaiClient = null

function getOpenAIClient() {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is not set')
    }
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return openaiClient
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG = {
  model: 'claude-sonnet-4-20250514',
  maxRetries: 3,
  retryDelays: [2000, 4000, 8000],
  timeoutMs: 120000, // Claude can take longer for complex creative tasks
  temperature: 1.0, // Higher for creative writing
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
  const { maxRetries = CONFIG.maxRetries, timeoutMs = CONFIG.timeoutMs, model = CONFIG.model } = options
  let lastError = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await getAnthropicClient().messages.create({
        model: model,
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

// Actual OpenAI ChatGPT API call
async function callChatGPT(systemPrompt, userPrompt, options = {}) {
  const { maxRetries = CONFIG.maxRetries, model = 'gpt-5', temperature = 1.0, noMaxTokens = false } = options
  let lastError = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const requestParams = {
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: temperature
      }

      // Only add max_completion_tokens if not explicitly omitted
      if (!noMaxTokens) {
        requestParams.max_completion_tokens = options.maxTokens ?? 16384
      }

      const response = await getOpenAIClient().chat.completions.create(requestParams)

      // Debug: log the full response structure
      console.log('  DEBUG response.choices[0]:', JSON.stringify(response.choices[0], null, 2))

      const message = response.choices[0].message
      const content = message.content

      // Check if there's a refusal
      if (message.refusal) {
        console.warn(`ChatGPT refused on attempt ${attempt + 1}: ${message.refusal}`)
      }

      // Check for empty response and retry
      if (!content || content.trim() === '') {
        console.warn(`ChatGPT returned empty response on attempt ${attempt + 1}, retrying...`)
        console.warn('  finish_reason:', response.choices[0].finish_reason)
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, CONFIG.retryDelays[attempt]))
          continue
        }
        throw new Error('ChatGPT returned empty response after all retries')
      }

      return content
    } catch (error) {
      lastError = error
      console.error(`ChatGPT call attempt ${attempt + 1} failed:`, error.message)

      if (attempt < maxRetries - 1) {
        if (error.status === 429) {
          console.log(`  Rate limited. Waiting 60s before retry...`)
          await new Promise(resolve => setTimeout(resolve, 60000))
        } else {
          await new Promise(resolve => setTimeout(resolve, CONFIG.retryDelays[attempt]))
        }
      }
    }
  }

  throw lastError || new Error('ChatGPT call failed after all retries')
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
// PHASE 1: STORY DNA
// =============================================================================

const PHASE_1_SYSTEM_PROMPT = `Analyze the user's concept and establish the story's DNA. Be creative and original. If the user's concept is vague or generic, select tropes randomly rather than defaulting to the most common choices.

The user may not name tropes. Infer from their concept.

## Decisions

TROPES
- Origin (pick one): Enemies to Lovers, Friends to Lovers, Strangers to Lovers, Second Chance, Childhood Sweethearts
- Situation: What external circumstances shape the romance?
  - What forces them together?
  - What keeps them apart?
  - What arrangement binds them?
  - If none — straightforward romance with no external pressure
- Dynamic (pick one or two): Slow Burn, Fast Burn, Opposites Attract, Grumpy/Sunshine
- Complication (optional): Love Triangle

LOVE TRIANGLE (only if complication is Love Triangle or concept implies multiple love interests)

If there are multiple love interests, identify the triangle type:

Types (can combine):
- starts_with_rival: Protagonist is attached to rival when primary appears (engaged, married, dating)
- better_option: Rival appears when primary seems impossible (primary unavailable, rival offers solution)
- simultaneous: Both court protagonist at same time (unattached, two suitors pursue)
- represents_lie: Rival embodies what protagonist's lie says she needs (false belief makes rival seem right)

For each love interest, define:
- Their genuine appeal (what draws protagonist to them - must be real, not just convenience)
- Their limitation (why they're ultimately not the choice - must be about fit, not character defect)
- What they represent thematically

Define the tension source: Why is this choice difficult? What makes the rival a genuine option?
Define "almost chooses rival because": What nearly makes the rival win?

For three or more love interests, each rival gets their own type.

SUBGENRE
Historical, Contemporary, Paranormal, Fantasy, Sci-Fi, Romantic Suspense, etc.

TIMESPAN
How long does the story cover? Days, weeks, months, years?

POV STRUCTURE
First Person:
- Single: One narrator throughout
- Dual-Alternating: Two narrators, alternating chapters
- Multiple: Three or more narrators

Third Person:
- Single: One character's perspective
- Dual-Alternating: Two perspectives, alternating chapters
- Multiple: Three or more perspectives
- Omniscient: Narrator sees all

DEFAULT: Use Multiple POV (Third Person, Multiple perspectives) unless the user concept explicitly requests a single POV or first person. Romance benefits from seeing both sides of the relationship. Only deviate if the concept specifically asks for single POV or first person narration.

ENDING
- HEA: Together permanently
- HFN: Together, future uncertain
- Bittersweet: Apart but transformed
- Tragic: Loss or permanent separation

If the concept implies an ending, use it. Otherwise, choose what fits.

TONE
- Lightness: 0-10 (0 = heavy drama, 10 = light comedy)
- Sensuality: 0-10 (0 = closed door, 10 = explicit)
- Fade to black: true/false
- Mood: hopeful, bittersweet, intense, playful, dark

CONFLICT
- External: What circumstance keeps them apart?
- Internal: What psychological barrier keeps them apart?

THEME
- Core: What the story is really about (one word or short phrase)
- Question: The thematic question the story asks
- Explored through: How the romance embodies this theme
The theme should emerge from what's already in the concept, not be imposed.

EXTERNAL PLOT
Every romance rides on an external wave - something happening in the world independent of the characters falling in love. This creates pressure, deadlines, and structure.

Step 1: Identify the external container. Ask: What is happening in this world that creates the conditions for this romance?

Container types:
- historical_event: War, revolution, invasion, coronation, political upheaval
- professional_situation: Case, deal, project, campaign, harvest, production
- social_structure: Season, wedding, reunion, inheritance dispute, family obligation
- time_bounded: Holiday visit, summer, voyage, festival, countdown
- competition: Tournament, contest, election, audition, race
- journey: Pilgrimage, migration, escape, expedition, road trip
- crisis: Epidemic, siege, scandal, investigation, natural disaster

Step 2: Define 5-8 beats for this container. These are WORLD events, not character events.
- What is the inciting event?
- What are the escalating stages?
- What is the climax of the external situation?
- What is the resolution?

Step 3: Identify pressure points.
- Which beats create deadlines for the characters?
- Which beats force characters together?
- Which beats force characters apart?
- Which beats create danger or stakes?
- The romantic dark moment should align with the external climax.

## Output

{
  "subgenre": string,
  "tropes": {
    "origin": string,
    "situation": {
      "forces_together": string or null,
      "keeps_apart": string or null,
      "arrangement": string or null
    },
    "dynamic": [],
    "complication": string or null
  },
  "ending": {
    "type": "HEA | HFN | Bittersweet | Tragic",
    "reason": string
  },
  "tone": {
    "lightness": number,
    "sensuality": number,
    "fade_to_black": boolean,
    "mood": string
  },
  "timespan": {
    "duration": string,
    "rationale": string
  },
  "pov": {
    "person": "First | Third",
    "structure": "Single | Dual-Alternating | Multiple | Omniscient",
    "rationale": string
  },
  "conflict": {
    "external": string,
    "internal": string
  },
  "theme": {
    "core": "What the story is really about (one word or short phrase)",
    "question": "The thematic question the story asks",
    "explored_through": "How the romance embodies this theme"
  },
  "external_plot": {
    "container_type": "historical_event | professional_situation | social_structure | time_bounded | competition | journey | crisis",
    "container_summary": "One sentence describing the external situation",
    "beats": [
      {
        "order": 1,
        "beat": "Name of this beat",
        "what_happens": "What occurs in the world",
        "world_state": "Pressure, danger, or opportunity at this point",
        "timing": "When in the story timespan this occurs"
      }
    ],
    "climax_beat": number,
    "alignment_note": "How the romantic dark moment should align with the external plot climax"
  },
  "love_triangle": {
    "type": "starts_with_rival | better_option | simultaneous | represents_lie (or combination)",
    "why_this_type": "How the concept maps to this triangle type",
    "love_interests": [
      {
        "name": "Character name",
        "role": "primary | rival",
        "appeal": "What genuinely draws protagonist to them",
        "limitation": "Why they're ultimately not the easy/right choice",
        "represents": "What they mean thematically"
      }
    ],
    "tension_source": "Why the choice between them is genuinely difficult",
    "almost_chooses_rival_because": "What nearly makes the rival win"
  },
  "premise": string
}

NOTE: "love_triangle" should be null if there is no love triangle (single love interest). Only include it when complication is Love Triangle or the concept implies multiple love interests.`

function buildPhase1UserPrompt(concept, lengthPreset, level) {
  return `CONCEPT: ${concept}

LENGTH: ${lengthPreset}
LEVEL: ${level}

Analyze this concept and establish the story's DNA.`
}

// =============================================
// Slot-Based Concept Expansion
// =============================================

// Default values for unfilled slots
const SLOT_DEFAULTS = {
  location: 'anywhere in the Spanish-speaking world',
  timePeriod: 'any time period'
}

// Prompt templates with slot placeholders (50/50 random selection)
const PROMPT_TEMPLATES = {
  // For blank/from-scratch generation
  regency: `Generate an original idea for a romance novel in the style of classic Regency romance. Set in {location}, in {time_period}, with a compelling social conflict as to why the lovers cannot simply be together. A traditional Austen or Quinn style love story, not modernist feminist professional stakes. Output 2-3 sentences only. Do not include any preamble.`,

  literary: `Generate an original idea for a literary romance novel. Set in {location}, in {time_period}, with a compelling conflict as to why the lovers cannot simply be together. A traditional Brontë or Hemingway style story, not modernist feminist professional stakes. Output 2-3 sentences only. Do not include any preamble.`,

  // For expanding user concepts (keeps what they said, fills in missing details)
  regencyExpand: `Expand this into a romance novel concept in the style of classic Regency romance: "{user_concept}". Set in {location}, in {time_period}, with a compelling social conflict as to why the lovers cannot simply be together. A traditional Austen or Quinn style love story, not modernist feminist professional stakes. Keep everything the user specified. Output 2-3 sentences only. Do not include any preamble.`,

  literaryExpand: `Expand this into a literary romance novel concept: "{user_concept}". Set in {location}, in {time_period}, with a compelling conflict as to why the lovers cannot simply be together. A traditional Brontë or Hemingway style story, not modernist feminist professional stakes. Keep everything the user specified. Output 2-3 sentences only. Do not include any preamble.`,

  // For neutral expansion (vague but specific - preserve user's style)
  neutral: `Expand this into a complete romance novel concept. Keep everything the user specified. Add character names, specific setting details, and a clear obstacle to their relationship. Output 2-3 sentences only. Do not include any preamble.

User's concept: "{user_concept}"
Set in: {location}, {time_period}`
}

// Location patterns for Spanish-speaking world
const LOCATION_PATTERNS = {
  countries: [
    'argentina', 'mexico', 'spain', 'colombia', 'peru', 'chile', 'cuba',
    'venezuela', 'ecuador', 'guatemala', 'bolivia', 'dominican republic',
    'honduras', 'paraguay', 'el salvador', 'nicaragua', 'costa rica',
    'panama', 'uruguay', 'puerto rico'
  ],
  cities: [
    'buenos aires', 'mexico city', 'madrid', 'barcelona', 'lima', 'bogotá',
    'bogota', 'havana', 'santiago', 'caracas', 'quito', 'medellín', 'medellin',
    'guadalajara', 'monterrey', 'seville', 'sevilla', 'valencia', 'cartagena',
    'córdoba', 'cordoba', 'rosario', 'mendoza', 'cusco', 'cuzco', 'arequipa',
    'san juan', 'montevideo', 'asunción', 'asuncion', 'la paz', 'santa cruz'
  ],
  regions: [
    'patagonia', 'andalusia', 'andalucía', 'yucatan', 'yucatán', 'galicia',
    'catalonia', 'cataluña', 'basque country', 'castile', 'la mancha',
    'pampas', 'tierra del fuego', 'andes', 'amazon', 'oaxaca', 'chiapas'
  ]
}

// Time period patterns
const TIME_PATTERNS = {
  decades: /\b(18[0-9]0s|19[0-9]0s|20[0-2]0s|the\s+(twenties|thirties|forties|fifties|sixties|seventies|eighties|nineties))\b/i,
  centuries: /\b(1[6-9]th|20th|21st)\s+century\b/i,
  eras: /\b(colonial|victorian|edwardian|post-war|postwar|pre-war|prewar|golden age|belle époque|belle epoque|prohibition|revolution|civil war)\b/i,
  contemporary: /\b(contemporary|modern|present-day|present day|current|today|now|21st century|2000s|2010s|2020s)\b/i
}

// Extract slots from user concept
function extractConceptSlots(userConcept) {
  const concept = userConcept.toLowerCase()
  const result = {
    location: null,
    timePeriod: null
  }

  // Extract location - check cities first (more specific), then countries, then regions
  for (const city of LOCATION_PATTERNS.cities) {
    if (concept.includes(city)) {
      result.location = city.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      break
    }
  }
  if (!result.location) {
    for (const country of LOCATION_PATTERNS.countries) {
      if (concept.includes(country)) {
        result.location = country.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
        break
      }
    }
  }
  if (!result.location) {
    for (const region of LOCATION_PATTERNS.regions) {
      if (concept.includes(region)) {
        result.location = region.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
        break
      }
    }
  }

  // Extract time period - check all patterns
  const contemporaryMatch = userConcept.match(TIME_PATTERNS.contemporary)
  if (contemporaryMatch) {
    result.timePeriod = contemporaryMatch[0].toLowerCase()
  }
  if (!result.timePeriod) {
    const decadeMatch = userConcept.match(TIME_PATTERNS.decades)
    if (decadeMatch) {
      result.timePeriod = 'the ' + decadeMatch[0].toLowerCase().replace('the ', '')
    }
  }
  if (!result.timePeriod) {
    const centuryMatch = userConcept.match(TIME_PATTERNS.centuries)
    if (centuryMatch) {
      result.timePeriod = 'the ' + centuryMatch[0].toLowerCase()
    }
  }
  if (!result.timePeriod) {
    const eraMatch = userConcept.match(TIME_PATTERNS.eras)
    if (eraMatch) {
      result.timePeriod = 'the ' + eraMatch[0].toLowerCase() + ' era'
    }
  }

  console.log(`[Slot Extraction] Input: "${userConcept}"`)
  console.log(`[Slot Extraction] Extracted: location="${result.location}", timePeriod="${result.timePeriod}"`)

  return result
}

// Check if concept is effectively blank (needs full generation)
function isBlankConcept(concept) {
  if (!concept) return true
  const normalized = concept.toLowerCase().trim()
  const blankPatterns = [
    'from-scratch',
    'from scratch',
    'romance',
    'love story',
    'a romance',
    'a love story',
    'romance novel',
    'a romance novel'
  ]
  return blankPatterns.includes(normalized) || normalized.split(/\s+/).length < 3
}

// Expand vague concepts before Phase 1 using slot-based library-aware generation
async function expandVagueConcept(concept, librarySummaries = []) {
  const wordCount = concept.trim().split(/\s+/).length
  console.log(`[Expansion Check] Concept: "${concept}" (${wordCount} words)`)

  // Path 3: Detailed enough (20+ words) - pass through unchanged
  if (wordCount >= 20) {
    console.log('[Expansion Check] Skipping - concept is detailed enough')
    return concept
  }

  // Extract slots for location and time period
  const slots = extractConceptSlots(concept)
  const location = slots.location || SLOT_DEFAULTS.location
  const timePeriod = slots.timePeriod || SLOT_DEFAULTS.timePeriod

  console.log(`[Expansion Check] Library has ${librarySummaries.length} existing books`)

  let systemPrompt
  let userPrompt
  let trackName

  // Path 1: Blank concept - use Regency/Literary 50/50 tracks
  if (isBlankConcept(concept)) {
    console.log('[Expansion Check] Blank concept - using Regency/Literary tracks')

    const useRegency = Math.random() < 0.5
    trackName = useRegency ? 'Regency' : 'Literary'
    systemPrompt = 'You are a classic romance novelist.'

    // Use base templates for from-scratch, expand templates if there's any user input
    const hasUserInput = concept && concept.toLowerCase().trim() !== 'from-scratch' && concept.toLowerCase().trim() !== 'from scratch'
    let promptTemplate
    if (hasUserInput) {
      promptTemplate = useRegency ? PROMPT_TEMPLATES.regencyExpand : PROMPT_TEMPLATES.literaryExpand
    } else {
      promptTemplate = useRegency ? PROMPT_TEMPLATES.regency : PROMPT_TEMPLATES.literary
    }

    userPrompt = promptTemplate
      .replace('{user_concept}', concept)
      .replace('{location}', location)
      .replace('{time_period}', timePeriod)

  // Path 2: Vague but specific (3-19 words) - use neutral expansion
  } else {
    console.log('[Expansion Check] Vague but specific - using neutral expansion')

    trackName = 'Neutral'
    systemPrompt = 'You are a romance novelist.'

    userPrompt = PROMPT_TEMPLATES.neutral
      .replace('{user_concept}', concept)
      .replace('{location}', location)
      .replace('{time_period}', timePeriod)
  }

  // Add library avoidance if available
  if (librarySummaries.length > 0) {
    const summaryList = librarySummaries.map((s, i) => `${i + 1}. ${s}`).join('\n')
    userPrompt += `

Do not generate a concept that duplicates any of these existing books:
${summaryList}`
  }

  console.log('\n[Expansion]')
  console.log('  Track:', trackName)
  console.log('  Location:', location)
  console.log('  Time Period:', timePeriod)
  console.log('  SYSTEM:', systemPrompt)
  console.log('  USER:', userPrompt)

  const response = await callChatGPT(systemPrompt, userPrompt, { noMaxTokens: true })
  console.log('  RESPONSE:', response)

  return response
}

// Generate a different concept from existing one using slot-based library-aware generation
async function generateDifferentConcept(existingConcept, librarySummaries = []) {
  console.log(`[Different Concept] Generating concept different from existing...`)
  console.log(`[Different Concept] Library has ${librarySummaries.length} existing books`)

  // Use defaults for location and time period (generating fresh concept)
  const location = SLOT_DEFAULTS.location
  const timePeriod = SLOT_DEFAULTS.timePeriod

  // Select track (50/50 between Regency and Literary)
  const useRegency = Math.random() < 0.5
  const promptTemplate = useRegency ? PROMPT_TEMPLATES.regency : PROMPT_TEMPLATES.literary

  // Fill slots in template
  let userPrompt = promptTemplate
    .replace('{location}', location)
    .replace('{time_period}', timePeriod)

  // Build avoidance list: current concept + library summaries
  const avoidList = [`Current: ${existingConcept}`]
  librarySummaries.forEach((s, i) => {
    avoidList.push(`${i + 1}. ${s}`)
  })

  userPrompt += `

Generate something different from all of these:
${avoidList.join('\n')}`

  const systemPrompt = `You are a classic romance novelist.`

  console.log('\n[Different Concept]')
  console.log('  Track:', useRegency ? 'Regency Historical' : 'Literary')
  console.log('  SYSTEM:', systemPrompt)
  console.log('  USER:', userPrompt)

  const response = await callChatGPT(systemPrompt, userPrompt, { noMaxTokens: true })
  console.log('  RESPONSE:', response)

  return response
}

async function executePhase1(concept, lengthPreset, level, librarySummaries = []) {
  console.log('Executing Phase 1: Story DNA...')

  // Expand vague concepts first (with library awareness)
  const expandedConcept = await expandVagueConcept(concept, librarySummaries)

  const userPrompt = buildPhase1UserPrompt(expandedConcept, lengthPreset, level)
  const response = await callClaude(PHASE_1_SYSTEM_PROMPT, userPrompt, {
    model: 'claude-opus-4-20250514'
  })
  const parsed = parseJSON(response)

  if (!parsed.success) {
    throw new Error(`Phase 1 JSON parse failed: ${parsed.error}`)
  }

  const data = parsed.data

  // Validate required fields
  const requiredFields = ['subgenre', 'tropes', 'ending', 'tone', 'timespan', 'pov', 'conflict', 'theme', 'premise', 'external_plot']
  const missing = requiredFields.filter(f => !data[f])

  if (missing.length > 0) {
    throw new Error(`Phase 1 missing required fields: ${missing.join(', ')}`)
  }

  // Validate external plot structure
  const ep = data.external_plot
  if (!ep.container_type || !ep.container_summary || !ep.beats || !Array.isArray(ep.beats)) {
    throw new Error('Phase 1 external_plot missing required fields (container_type, container_summary, beats)')
  }
  if (ep.beats.length < 3) {
    console.warn(`Phase 1 WARNING: external_plot has only ${ep.beats.length} beats (expected 5-8)`)
  }
  for (const beat of ep.beats) {
    if (!beat.order || !beat.beat || !beat.what_happens) {
      throw new Error('External plot beat missing required fields (order, beat, what_happens)')
    }
  }

  console.log('Phase 1 complete.')
  console.log(`  Subgenre: ${data.subgenre}`)
  console.log(`  Origin: ${data.tropes.origin}`)
  const situation = data.tropes.situation
  const situationParts = [
    situation?.forces_together && `Together: ${situation.forces_together}`,
    situation?.keeps_apart && `Apart: ${situation.keeps_apart}`,
    situation?.arrangement && `Arrangement: ${situation.arrangement}`
  ].filter(Boolean)
  console.log(`  Situation: ${situationParts.length ? situationParts.join(', ') : 'None'}`)
  console.log(`  POV: ${data.pov.person} Person, ${data.pov.structure}`)
  console.log(`  Timespan: ${data.timespan.duration}`)
  console.log(`  Ending: ${data.ending.type}`)
  console.log(`  Theme: ${data.theme.core} — "${data.theme.question}"`)
  console.log(`    Explored through: ${data.theme.explored_through}`)
  console.log(`  External Plot: ${ep.container_type} — "${ep.container_summary}"`)
  console.log(`    Beats: ${ep.beats.length}`)
  ep.beats.forEach(b => {
    console.log(`      ${b.order}. ${b.beat}: ${b.what_happens.slice(0, 60)}...`)
  })
  console.log(`    Climax beat: ${ep.climax_beat}`)
  console.log(`    Alignment: ${ep.alignment_note}`)

  // Validate love triangle if present
  const lt = data.love_triangle
  if (lt && lt !== null) {
    if (!lt.type || !lt.love_interests || !Array.isArray(lt.love_interests)) {
      console.warn('Phase 1 WARNING: love_triangle present but missing type or love_interests')
    } else {
      console.log(`  Love Triangle: ${lt.type}`)
      console.log(`    Tension: ${lt.tension_source}`)
      lt.love_interests.forEach(li => {
        console.log(`    - ${li.name} (${li.role}): appeal="${li.appeal?.slice(0, 50)}"`)
      })
      console.log(`    Almost chooses rival because: ${lt.almost_chooses_rival_because}`)
    }
  } else {
    console.log(`  Love Triangle: None`)
  }

  return data
}

// =============================================================================
// PHASE 2: CHARACTERS (Romantic Leads)
// =============================================================================

const PHASE_2_SYSTEM_PROMPT = `You are a romance character architect. Your task is to create psychologically complex, compelling characters whose internal conflicts drive the romance.

You will receive:
- The user's original concept
- Phase 1 output (subgenre, tropes, conflict, theme, ending, tone, timespan, POV, premise)

Phase 1 defines a POV structure (Single, Dual-Alternating, Multiple). Every character who will be a POV character MUST receive full psychology here. In a Multiple POV story, that means the protagonist AND each love interest all need complete builds.

Your job is to create characters where:
1. Every POV character gets full psychology: wound, lie, coping_mechanism, want, need, arc, voice
2. Wounds connect to the theme from Phase 1
3. Arcs match the ending type (HEA = overcome flaws; Bittersweet/Tragic = flaws or circumstances win)
4. The dynamics explain why THESE people crack each other open

## Output Format

{
  "protagonist": {
    "name": "Full name",
    "age": number,
    "role": "Their position in this world",
    "wound": {
      "event": "What specifically happened to them",
      "who_caused_it": "Person responsible (name them), or null if circumstance",
      "age": "When it happened (age or 'childhood' or 'recently')"
    },
    "lie": "The false belief formed BECAUSE of the wound",
    "want": "What they're consciously pursuing",
    "need": "What they actually need (often unconscious)",
    "coping_mechanism": {
      "behaviour": "What they learned to do to survive the wound",
      "as_flaw": "How this behaviour sabotages them",
      "as_virtue": "How this same behaviour serves them"
    },
    "arc": {
      "starts": "Who they are at the beginning",
      "ends": "Who they become"
    },
    "voice": {
      "register": "Formal/casual, educated/simple, warm/guarded",
      "patterns": "How they talk - terse, verbose, deflecting, direct",
      "tells": "What speech habits reveal their emotional state"
    }
  },

  "love_interests": [
    {
      "name": "Full name",
      "age": number,
      "role": "Their position in this world",
      "role_in_story": "Primary | Rival | Secondary",
      "wound": {
        "event": "What specifically happened to them",
        "who_caused_it": "Person responsible (name them), or null if circumstance",
        "age": "When it happened"
      },
      "lie": "The false belief formed BECAUSE of the wound",
      "want": "What they're consciously pursuing",
      "need": "What they actually need (often unconscious)",
      "coping_mechanism": {
        "behaviour": "What they learned to do to survive the wound",
        "as_flaw": "How this behaviour sabotages them",
        "as_virtue": "How this same behaviour serves them"
      },
      "arc": {
        "starts": "Who they are at the beginning",
        "ends": "Who they become"
      },
      "voice": {
        "register": "Formal/casual, educated/simple, warm/guarded",
        "patterns": "How they talk - terse, verbose, deflecting, direct",
        "tells": "What speech habits reveal their emotional state"
      }
    }
  ],

  "dynamics": {
    "romantic": [
      {
        "between": ["Protagonist name", "Love interest name"],
        "attraction": "What draws them together",
        "friction": "What makes them clash",
        "challenge": "How each forces the other to confront their lie",
        "balance": "What each provides that the other lacks"
      }
    ],
    "rivals": [
      {
        "between": ["Love interest A", "Love interest B"],
        "conflict_type": "How they oppose each other",
        "methods": "How they compete or scheme",
        "dynamic": "Respect, hatred, grudging admiration, etc."
      }
    ]
  }
}

## Guidelines

COUNTING LOVE INTERESTS:
- Read the concept carefully for number of romantic interests
- "3 suitors" = 3 love interests
- "Love triangle" = 2 love interests
- Standard romance = 1 love interest
- Create exactly as many as the concept implies

ROLE IN STORY:
- Primary: The one protagonist ends up with (for HEA/HFN endings)
- Rival: Competing for protagonist's heart
- Secondary: Part of ensemble romance
- One should be marked Primary unless ending is tragic or explicitly open

NAMES:
- If the concept names characters, use those exact names
- Otherwise, choose names appropriate to the setting, era, and social class

## The Causal Wound Chain

Every character's psychology follows a causal chain: wound → lie → coping mechanism

THE WOUND CREATES THE LIE:
- The wound is a specific event or circumstance
- Ask: "What false belief would naturally form from this experience?"
- "Father sent me away for being soft" → "Softness is weakness that gets you abandoned"

THE LIE CREATES THE COPING MECHANISM:
- Ask: "If someone believed this, how would they learn to protect themselves?"
- "Softness is weakness" → "Proves strength constantly, never shows vulnerability"

THE COPING MECHANISM IS BOTH FLAW AND VIRTUE:
- Same trait, two expressions
- Hypervigilance → Flaw: can't trust anyone / Virtue: perceptive, catches threats
- People-pleasing → Flaw: loses authentic self / Virtue: attentive, adaptive
- Aggression → Flaw: pushes people away / Virtue: brave, protective
- Control → Flaw: suffocating / Virtue: reliable, organised
- Withdrawal → Flaw: emotionally unavailable / Virtue: self-sufficient, calm

THE BEHAVIOUR IS WHAT OTHERS OBSERVE:
- Not internal psychology but external manifestation
- How does this person ACT in the world because of their wound?

## Guidelines for Wound Source

NAME THE PERSON WHO CAUSED IT:
- If a person caused the wound, name them: "Father, Lord Ashworth", "Former fiancée, Catherine"
- This seeds Phase 4 supporting cast - the person may appear
- If the wound was caused by circumstance (war, illness, accident), use null
- Consider: even if circumstance, was there someone who FAILED to protect them?

WOUND TIMING:
- "age 7", "childhood", "at 16", "three years ago", "recently"
- Earlier wounds run deeper but are more calcified
- Recent wounds are rawer but more accessible

WOUNDS CONNECT TO THEME:
- All characters' wounds should relate to the Phase 1 theme
- If theme is "duty vs desire", wounds involve choosing one at cost of other
- This creates thematic resonance across the cast

WANT VS NEED:
- Want is conscious: what they're actively pursuing
- Need is unconscious: what they actually require to be whole
- The story moves them from pursuing want to discovering need
- This is the engine of their arc

ARCS AND ENDINGS:
- HEA: Characters overcome their lies and coping mechanisms
- HFN: Characters grow but external circumstances remain uncertain
- Bittersweet: Characters transform, but cannot be together
- Tragic: Coping mechanisms or circumstances prove insurmountable

VOICE:
- Voice reflects role, class, education, and personality
- Each character should sound distinct
- Register, vocabulary, sentence length should all differ
- Tells reveal emotion through speech patterns, not explicit statements

ROMANTIC DYNAMICS:
- Create one romantic dynamic for protagonist + each love interest
- Attraction is not just physical — what do they see that others miss?
- Friction is not just external — what challenges their worldview?
- Challenge explains why THIS person forces growth
- Balance shows complementarity

RIVAL DYNAMICS:
- If multiple love interests, explain how they interact with EACH OTHER
- Not just how each relates to protagonist
- What's their history? How do they compete? What do they think of each other?
- Only include if 2+ love interests exist

DISTINCT CHARACTERS:
- Each love interest must be meaningfully different
- Different wounds, different lies, different coping mechanisms
- Don't collapse similar characters — find what makes each unique`

function buildPhase2UserPrompt(concept, phase1) {
  const povStructure = phase1.pov?.structure || 'Multiple'
  const povPerson = phase1.pov?.person || 'Third'

  return `ORIGINAL CONCEPT: ${concept}

PHASE 1 OUTPUT (Story DNA):
${JSON.stringify(phase1, null, 2)}

Create the characters for this story.

**POV Structure: ${povPerson} Person, ${povStructure}**
${povStructure === 'Multiple' || povStructure === 'Dual-Alternating'
    ? 'This is a multi-POV story. The protagonist AND each love interest will be POV characters. Every POV character needs full psychology (wound, lie, coping_mechanism, want, need, arc, voice) because we will write chapters from their perspective.'
    : 'This is a single POV story. The protagonist is the POV character and needs full psychology. Love interests still need full psychology for internal consistency.'}

IMPORTANT: Count the number of love interests implied by the concept. If it mentions "3 suitors" create 3. If "love triangle" create 2. If standard romance create 1.

Ensure:
- All wounds connect to the theme "${phase1.theme?.core || 'from Phase 1'}"
- Arcs match the ${phase1.ending?.type || 'established'} ending
- Each love interest is distinct with different wounds and approaches
- One love interest is marked Primary (unless tragic/open ending)
- If multiple love interests, include rival dynamics between them
- Every character who will be a POV character has complete voice definition (register, patterns, tells) - these drive chapter voice`
}

async function executePhase2(concept, phase1) {
  console.log('Executing Phase 2: Characters...')

  const userPrompt = buildPhase2UserPrompt(concept, phase1)
  const response = await callOpenAI(PHASE_2_SYSTEM_PROMPT, userPrompt)
  const parsed = parseJSON(response)

  if (!parsed.success) {
    throw new Error(`Phase 2 JSON parse failed: ${parsed.error}`)
  }

  const data = parsed.data

  // Validate required fields
  if (!data.protagonist) {
    throw new Error('Phase 2 missing protagonist')
  }
  if (!data.love_interests || !Array.isArray(data.love_interests) || data.love_interests.length === 0) {
    throw new Error('Phase 2 must include at least one love interest')
  }
  if (!data.dynamics) {
    throw new Error('Phase 2 missing dynamics')
  }

  // Validate protagonist wound and coping_mechanism structure
  if (!data.protagonist.wound || typeof data.protagonist.wound !== 'object') {
    throw new Error('Phase 2 protagonist wound must be an object with event, who_caused_it, age')
  }
  if (!data.protagonist.coping_mechanism || typeof data.protagonist.coping_mechanism !== 'object') {
    throw new Error('Phase 2 protagonist must have coping_mechanism object with behaviour, as_flaw, as_virtue')
  }

  // Validate love interests wound and coping_mechanism structure
  for (const li of data.love_interests) {
    if (!li.wound || typeof li.wound !== 'object') {
      throw new Error(`Love interest "${li.name}" wound must be an object with event, who_caused_it, age`)
    }
    if (!li.coping_mechanism || typeof li.coping_mechanism !== 'object') {
      throw new Error(`Love interest "${li.name}" must have coping_mechanism object with behaviour, as_flaw, as_virtue`)
    }
  }

  console.log('Phase 2 complete.')
  console.log(`  Protagonist: ${data.protagonist?.name}`)
  console.log(`    Wound caused by: ${data.protagonist?.wound?.who_caused_it || 'circumstance'}`)
  console.log(`    Coping mechanism: ${data.protagonist?.coping_mechanism?.behaviour}`)
  console.log(`  Love interests: ${data.love_interests?.length}`)
  data.love_interests?.forEach((li, i) => {
    console.log(`    ${i + 1}. ${li.name} (${li.role_in_story})`)
    console.log(`       Wound caused by: ${li.wound?.who_caused_it || 'circumstance'}`)
  })
  console.log(`  Rival dynamics: ${data.dynamics?.rivals?.length || 0}`)

  return data
}

// =============================================================================
// PHASE 3: CENTRAL PLOT
// =============================================================================

const PHASE_3_SYSTEM_PROMPT = `You are a romance plot architect. Your task is to produce an integrated story timeline where every moment carries POV assignment, and weaves romance beats with psychological beats.

You will receive:
- The original concept
- Phase 1 output (tropes, conflict, theme, ending, tone settings including sensuality and fade_to_black, POV structure, external_plot with world beats)
- Phase 2 output (protagonist, love_interests array with full psychology, dynamics)

## CRITICAL PRINCIPLES

1. This is ROMANCE. Every moment must serve the romantic arc, the psychological arc, or both.
2. Romance beats and psychological beats are woven together, not separate tracks.
3. Every moment has a POV character assigned - whose head are we in?
4. Physical/romantic tension progresses through the story alongside character growth.
5. Rivals are not speedbumps - they have genuine attraction AND complete arcs.
6. The external plot from Phase 1 provides the SPINE. Character moments happen relative to external beats - the world creates pressure, deadlines, and forced proximity/separation.

## Output Format

{
  "arc_shape": {
    "origin_type": "How Phase 1 origin trope shapes the primary arc",
    "burn_rate": "How Phase 1 dynamic shapes pacing",
    "ending_type": "How Phase 1 ending shapes the third act"
  },

  "timeline": [
    {
      "order": 1,
      "pov": "Character name - whose perspective we experience this through",
      "moment": "Name/label for this beat",
      "what_happens": "What occurs in this moment",
      "arcs_in_play": ["Character A", "Character B"],
      "romance_beat": "What romantic element is present - attraction, tension, touch, kiss, etc. Null if purely psychological." | null,
      "intimacy_stage": "awareness | attraction | tension | touch | kiss | escalation | consummation" | null,
      "psychological_beat": "What psychological shift occurs - wound triggered, lie reinforced, lie challenged, transformation. Null if purely romantic." | null,
      "external_beat": "Which Phase 1 external_plot beat this moment occurs during or responds to. Null if not directly tied to an external beat." | null
    }
  ],

  "character_arcs": {
    "Character Name": {
      "wound_triggered": "Moment name where their wound is activated",
      "lie_reinforced": "Moment name where their lie seems confirmed",
      "lie_challenged": "Moment name where their lie is questioned",
      "transformation": "Moment name where they choose differently"
    }
  },

  "rival_arcs": [
    {
      "rival": "Rival name",
      "type": "Triangle type from Phase 1 (starts_with_rival | better_option | simultaneous | represents_lie)",
      "beats": [
        {
          "order": "Timeline position (matches timeline order)",
          "beat": "Beat name from the type-specific list",
          "moment": "Moment name in the timeline",
          "what_happens": "Description",
          "romantic_element": "Physical/emotional charge if present (or null)"
        }
      ],
      "almost_chooses_moment": "Which moment name is the 'almost chooses rival' beat",
      "resolution": "How the rival arc ends",
      "cost_to_protagonist": "What she loses or gives up by not choosing rival"
    }
  ],

  "dark_moment": {
    "what_happens": "The apparent end of the primary relationship",
    "why_it_feels_fatal": "Why this specifically feels insurmountable given their wounds",
    "what_each_believes": "Protagonist's belief, primary love interest's belief"
  },

  "resolution": {
    "what_changes": "What allows resolution to happen",
    "who_acts": "Who makes the move to repair/claim",
    "what_they_sacrifice": "What they risk or give up",
    "rival_resolutions": "How each rival's arc completes (if applicable)",
    "final_state": "Where everyone ends up"
  }
}

## Timeline Construction

Build ONE chronological timeline containing ALL moments from ALL arcs:
- Primary romance moments
- Rival romance moments (if multiple love interests)
- Rival-vs-rival dynamics (if multiple love interests)
- Dark moment
- Resolution

Each moment gets a POV character. In a multi-POV story, distribute POV across characters so we experience key moments from different perspectives. Critical romantic moments should alternate between protagonist and love interest POV so we feel both sides.

## External Plot Integration

Phase 1 provides an external_plot with world beats. Use these as the SPINE of the timeline:

1. **Place character moments relative to external beats.** Each timeline moment should reference which external beat it occurs during (via external_beat field).
2. **External beats create pressure.** Use them to force characters together, apart, or into decisions.
3. **External escalation drives romantic escalation.** As the world heats up, so does the romance.
4. **Align the romantic dark moment with the external climax.** The world crisis and the relationship crisis should peak together (see Phase 1 alignment_note).
5. **External resolution enables or complicates romantic resolution.** The world settling creates space for the romance to resolve.

Not every moment needs an external_beat reference, but most should. The external plot is the wave the romance rides on.

## Mandatory Romance Beats (must appear in timeline)

These MUST appear as moments in the timeline for the primary romance:

1. **First Awareness** - They notice each other. Something physical sparks. Not strategic or political - visceral.
2. **Attraction Builds** - Glances, proximity, wanting without acting. Heightened awareness of their body.
3. **Tension/Denial** - They want but can't or won't. Barriers present. The air charges between them.
4. **First Kiss** - The barrier breaks. Point of no return.
5. **Dark Moment** - Something tears them apart. All seems lost.
6. **Resolution** - HEA, HFN, Bittersweet, or Tragic per Phase 1 ending.

## Conditional Romance Beats

**Burn Rate: Slow Burn**
- **The Almost** (REQUIRED): Near kiss or confession, interrupted. Must appear BEFORE first kiss.
- Extended tension: Multiple tension/denial beats before first kiss.
- Attraction builds over more moments. The anticipation IS the pleasure.

**Burn Rate: Fast Burn**
- The Almost: Optional, may skip straight to kiss.
- Fewer barriers between attraction and action.
- Tension comes from staying together, not getting together.

**Sensuality 1-3:**
- First Touch: Subtle, may be implied.
- Consummation: Off-page or absent.
- Physical progression minimal. Kisses are significant events.

**Sensuality 4-6:**
- **First Touch**: Deliberate, meaningful moment in timeline.
- **Deepening Intimacy**: Emotional and physical vulnerability.
- Consummation: On page if fade_to_black is false. Implied if true.

**Sensuality 7-10:**
- **First Touch**: Charged, detailed.
- Physical progression explicit throughout multiple moments.
- **Consummation**: Explicit. Possibly multiple intimate scenes.

**Ending: HEA** - Resolution is unambiguous. Together, future clear.
**Ending: HFN** - Resolution is hopeful but open.
**Ending: Bittersweet** - Together but at cost, or apart but transformed.
**Ending: Tragic** - Loss or permanent separation.

## Psychological Arc Requirements

For EVERY POV character, the timeline must include moments that serve:
- **Wound triggered**: Something activates their core wound
- **Lie reinforced**: A moment where their lie seems true, they double down
- **Lie challenged**: A moment where their lie is questioned
- **Transformation**: A moment where they choose differently

These OVERLAP with romance beats. "The Almost" might be where her lie screams to pull back. Same moment serves both arcs. Mark both in the output.

## Tropes Shape Romantic Structure

- **Enemies to Lovers**: Early attraction is unwanted, fought against. The kiss often comes from anger or desperation.
- **Strangers to Lovers**: Clean slate. Physical awareness grows with emotional connection.
- **Friends to Lovers**: Sudden awareness of familiar body in new way.
- **Second Chance**: Old physical memory + new tension.
- **Forbidden**: Every touch is transgressive. The wrongness adds to the charge.

## Rival Arc Beats (if Phase 1 includes love_triangle)

If Phase 1 defines a love_triangle, each rival gets TYPE-SPECIFIC beats in the timeline. The type determines which beats are required.

**Type: starts_with_rival**
Required beats in timeline:
1. Established attachment - Show existing relationship with rival, what works
2. Cracks appear - Something feels missing or wrong
3. Primary disrupts - New person makes her question everything
4. Comparison deepens - She notices what rival lacks vs primary
5. Rival's flaw exposed - Truth about rival or relationship revealed
6. Attachment breaks - Emotional or formal end to rival relationship
7. Cost acknowledged - She recognizes what she's losing/leaving

**Type: better_option**
Required beats in timeline:
1. Primary impossible - Barriers make primary unavailable/wrong
2. Rival appears - Offers solution without complications
3. Genuine attraction - Real pull toward rival, not just settling
4. Rival courtship - Connection deepens, feels real
5. Almost commits - She nearly chooses rival
6. Primary shift - Something changes, primary becomes possible
7. Difficult release - Letting go of easier path costs something

**Type: simultaneous**
Required beats in timeline:
1. Both pursue - Two suitors actively court her
2. Different appeals - Each offers something genuine and different
3. Attraction to both - She feels real desire for each
4. Tests reveal character - Moments show who each truly is
5. Almost chooses rival - She nearly commits to rival
6. Clarity moment - Something shows why primary is right
7. Costly choice - She chooses knowing rival was real option

**Type: represents_lie**
Required beats in timeline:
1. Lie active - She believes something false about what she needs
2. Rival embodies lie - Rival offers exactly what lie says she wants
3. Primary challenges - Primary offers what she actually needs (uncomfortable)
4. Lie reinforced - Events seem to prove rival is right
5. Almost chooses rival - Her lie nearly wins
6. Lie cracked - Truth breaks through
7. Transformation choice - Choosing primary means breaking lie

**Integration rules:**
- Rival romance beats INTERWEAVE with primary romance beats chronologically
- Each rival must have at least one genuine romantic moment (touch, charged conversation, near kiss)
- "Almost chooses rival" must be a REAL moment in the timeline, not implied
- Rival's arc ending costs the protagonist something emotionally
- Rivals lose because of fit, not because they lack chemistry

Track each rival's arc in the output's rival_arcs array.

## Character Arc Tracking

After building the timeline, fill in character_arcs mapping for EVERY POV character. Each field references a moment name from the timeline. This is the verification that every character has a complete arc.

## Moment Count Guidelines

- Primary romance: 5-8 moments
- Each rival romance: 3-4 moments
- Rival dynamics: 2-3 moments per pairing
- Total timeline: typically 10-25 moments depending on complexity

## DO NOT INCLUDE
- Supporting characters (Phase 4)
- Subplots (Phase 4/5)
- Specific locations (later phase)
- Chapter assignments (later phase)
- Scene-level prose (later phase)`

function buildPhase3UserPrompt(concept, phase1, phase2) {
  const primaryLI = phase2.love_interests?.find(li => li.role_in_story === 'Primary') || phase2.love_interests?.[0]
  const rivals = phase2.love_interests?.filter(li => li.role_in_story !== 'Primary') || []

  // Extract tone settings
  const sensuality = phase1.tone?.sensuality ?? 5
  const fadeToBlack = phase1.tone?.fade_to_black ?? true
  const mood = phase1.tone?.mood || 'romantic'
  const burnRate = phase1.dynamic || 'slow_burn'

  // Build POV characters list
  const povCharacters = [phase2.protagonist?.name]
  phase2.love_interests?.forEach(li => povCharacters.push(li.name))

  // Build character summaries
  const characterSummaries = [
    `**Protagonist:** ${phase2.protagonist?.name}`,
    `  Wound: "${phase2.protagonist?.wound?.event}"`,
    `  Lie: "${phase2.protagonist?.lie}"`,
    '',
    ...phase2.love_interests?.map(li =>
      `**${li.role_in_story} Love Interest:** ${li.name}\n  Wound: "${li.wound?.event}"\n  Lie: "${li.lie}"`
    ) || []
  ].join('\n')

  return `ORIGINAL CONCEPT: ${concept}

PHASE 1 OUTPUT (Story DNA):
${JSON.stringify(phase1, null, 2)}

PHASE 2 OUTPUT (Characters):
${JSON.stringify(phase2, null, 2)}

## Your Task

Build ONE integrated timeline that weaves romance and psychology together for every POV character. Each moment gets a POV assignment.

## POV Characters (from Phase 1/2)

${povCharacters.map(name => `- ${name}`).join('\n')}

Distribute POV across these characters. Critical romantic moments should alternate between protagonist and love interest POV so we feel both sides.

## TONE SETTINGS (from Phase 1) - CRITICAL FOR CALIBRATION

**Sensuality: ${sensuality}/10** ${sensuality <= 3 ? '(Low - focus on emotional intimacy, kisses are the peak)' : sensuality <= 6 ? '(Moderate - include physical tension and some sensual moments)' : '(High - explicit attraction, detailed physical tension throughout)'}
**Fade to Black: ${fadeToBlack}** ${fadeToBlack ? '(Consummation implied but not shown on page)' : '(Consummation can be shown on page if sensuality warrants)'}
**Burn Rate: ${burnRate}** ${burnRate === 'slow_burn' ? '(Many moments before first kiss - tension through denial and near-misses)' : '(Quick to physical intimacy - conflict is staying together, not getting together)'}
**Mood: ${mood}**

## External Plot Beats (from Phase 1) - THE SPINE

${phase1.external_plot ? `**Container:** ${phase1.external_plot.container_type} — ${phase1.external_plot.container_summary}

${phase1.external_plot.beats?.map(b => `${b.order}. **${b.beat}**: ${b.what_happens} [${b.world_state}]`).join('\n')}

**External climax:** Beat ${phase1.external_plot.climax_beat}
**Alignment:** ${phase1.external_plot.alignment_note}

Place character moments RELATIVE to these external beats. Each timeline moment should reference which external beat it occurs during (via external_beat field). The world creates pressure, deadlines, and forced proximity/separation. The romantic dark moment should align with the external climax.` : 'No external plot defined.'}

${phase1.love_triangle ? `## Love Triangle (from Phase 1) - RIVAL ARC REQUIRED

**Triangle type:** ${phase1.love_triangle.type}
**Why:** ${phase1.love_triangle.why_this_type}
**Tension source:** ${phase1.love_triangle.tension_source}
**Almost chooses rival because:** ${phase1.love_triangle.almost_chooses_rival_because}

${phase1.love_triangle.love_interests?.map(li => `**${li.name} (${li.role}):** appeal="${li.appeal}", limitation="${li.limitation}", represents="${li.represents}"`).join('\n')}

You MUST include rival_arcs in your output. Each rival needs type-specific beats from the system prompt. The "almost chooses rival" moment must be a REAL timeline moment, not implied. Rival romance beats must interweave chronologically with primary romance beats.` : ''}

## Characters

${characterSummaries}

## Timeline Requirements

**Primary romance (${phase2.protagonist?.name} + ${primaryLI?.name}):**
- 5-8 moments with BOTH romance_beat AND psychological_beat woven together
- Intimacy progression: awareness → attraction → tension → touch → kiss → ${sensuality >= 5 && !fadeToBlack ? 'escalation → consummation' : 'resolution'}
- Ends per Phase 1 ending type: ${phase1.ending?.type}

${rivals.length > 0 ? `**Rival romances:**
${rivals.map(r => `- ${phase2.protagonist?.name} + ${r.name}: 3-4 moments with genuine romantic charge. At least one moment of real physical/romantic tension. ${r.name} completes their psychological arc even though they lose.`).join('\n')}

**Rival dynamics:**
- 2-3 moments per pairing showing competition, confrontation, jealousy between love interests` : '**Single love interest** - no rival arcs or dynamics needed.'}

## Character Arc Tracking

After building the timeline, fill in the character_arcs object mapping EVERY POV character to the timeline moments that serve their psychological arc:
- wound_triggered → lie_reinforced → lie_challenged → transformation

These moments OVERLAP with romance beats. Same moment can serve both arcs.

## CRITICAL REMINDERS

1. **Every moment must have a POV character** - whose head are we in?
2. **romance_beat and psychological_beat are woven together** - a moment can have both, or just one
3. **This is ROMANCE** - include physical awareness, charged silences, almost-touches, the first kiss and why the barrier breaks
${sensuality >= 5 ? `4. **Sensuality ${sensuality}** - include physical escalation calibrated to this level` : ''}
${sensuality >= 5 && !fadeToBlack ? '5. **Consummation on page** - fade_to_black is false, show it' : ''}
${rivals.length > 0 ? `${sensuality >= 5 && !fadeToBlack ? '6' : sensuality >= 5 ? '5' : '4'}. **Rivals have genuine charge** - reader must see why protagonist might choose them` : ''}`
}

async function executePhase3(concept, phase1, phase2) {
  console.log('Executing Phase 3: Central Plot...')

  const userPrompt = buildPhase3UserPrompt(concept, phase1, phase2)
  const response = await callOpenAI(PHASE_3_SYSTEM_PROMPT, userPrompt)
  const parsed = parseJSON(response)

  if (!parsed.success) {
    throw new Error(`Phase 3 JSON parse failed: ${parsed.error}`)
  }

  const data = parsed.data

  // Validate required fields
  const requiredFields = ['arc_shape', 'timeline', 'character_arcs', 'dark_moment', 'resolution']
  const missing = requiredFields.filter(f => !data[f])

  if (missing.length > 0) {
    throw new Error(`Phase 3 missing required fields: ${missing.join(', ')}`)
  }

  // Validate timeline structure
  if (!Array.isArray(data.timeline) || data.timeline.length === 0) {
    throw new Error('Phase 3 must include a non-empty timeline array')
  }

  // Validate each timeline entry has required fields
  for (const entry of data.timeline) {
    if (!entry.order || !entry.pov || !entry.moment || !entry.what_happens) {
      throw new Error(`Timeline entry missing required fields (order, pov, moment, what_happens)`)
    }
  }

  // Validate character_arcs has at least protagonist
  const arcCharacters = Object.keys(data.character_arcs || {})
  if (arcCharacters.length === 0) {
    throw new Error('Phase 3 character_arcs must include at least one character')
  }

  // Check romance beats exist in timeline
  const romanceBeats = data.timeline.filter(t => t.romance_beat)
  const psychBeats = data.timeline.filter(t => t.psychological_beat)
  if (romanceBeats.length === 0) {
    console.warn('WARNING: No romance beats found in timeline')
  }
  if (psychBeats.length === 0) {
    console.warn('WARNING: No psychological beats found in timeline')
  }

  // Log summary
  console.log('Phase 3 complete.')
  console.log(`  Timeline: ${data.timeline.length} moments`)
  console.log(`  Romance beats: ${romanceBeats.length}`)
  console.log(`  Psychological beats: ${psychBeats.length}`)
  console.log(`  Character arcs tracked: ${arcCharacters.join(', ')}`)
  data.timeline.forEach(t => {
    const tags = []
    if (t.romance_beat) tags.push(`R:${t.intimacy_stage || '?'}`)
    if (t.psychological_beat) tags.push('P')
    console.log(`    ${t.order}. [${t.pov}] ${t.moment} ${tags.length > 0 ? `(${tags.join(', ')})` : ''}`)
  })
  console.log(`  Dark moment: ${data.dark_moment?.what_happens?.slice(0, 60)}...`)
  console.log(`  Resolution: ${data.resolution?.final_state?.slice(0, 60)}...`)

  // Validate rival arcs if love triangle exists
  if (phase1.love_triangle && phase1.love_triangle !== null) {
    const rivals = phase1.love_triangle.love_interests?.filter(li => li.role === 'rival') || []
    if (rivals.length > 0) {
      if (!data.rival_arcs || !Array.isArray(data.rival_arcs) || data.rival_arcs.length === 0) {
        console.warn('Phase 3 WARNING: Love triangle defined but no rival_arcs in output')
      } else {
        console.log(`  Rival arcs: ${data.rival_arcs.length}`)
        data.rival_arcs.forEach(ra => {
          console.log(`    - ${ra.rival} (${ra.type}): ${ra.beats?.length || 0} beats`)
          console.log(`      Almost chooses moment: ${ra.almost_chooses_moment}`)
          console.log(`      Resolution: ${ra.resolution}`)
          console.log(`      Cost: ${ra.cost_to_protagonist}`)
          const romanticBeats = ra.beats?.filter(b => b.romantic_element) || []
          if (romanticBeats.length === 0) {
            console.warn(`      WARNING: No romantic elements in ${ra.rival}'s beats`)
          }
        })
      }
    }
  }

  return data
}

// =============================================================================
// PHASE 4: SUPPORTING CAST
// =============================================================================

const PHASE_4_SYSTEM_PROMPT = `You are a story architect who creates supporting characters from story needs, not in a vacuum.

You will receive Phase 1 (concept/theme/setting), Phase 2 (POV character psychology), and Phase 3 (integrated POV timeline with all decisive moments).

Your job: Look at the story situation and ask "Who else needs to exist?" Then create characters to fill those functions, with appropriate psychology based on their importance.

## PROCESS (Follow this order)

### Step 1: List the Interests

Look at the situation from Phase 1 and the timeline from Phase 3. Ask:
- Who benefits from the status quo?
- Who is threatened by the protagonists' choices?
- Who has history with the POV characters?
- Who represents institutions or groups relevant to the setting?
- Who has power over the POV characters?
- Who is affected by the events of the story?

List each interest as a force/pressure/stake - NOT as a character yet.

### Step 2: Which Interests Need Faces?

Some interests stay faceless (collective pressure, unnamed groups, societal norms).

An interest needs a face if:
- It makes decisions that affect the plot
- It interacts directly with POV characters
- It represents a thematic position that needs embodiment
- Phase 3 timeline already implied someone exists (e.g. "family pressure" implies a family member)

For each interest: Face or faceless?

### Step 3: For Each Face - Personal Angle

The interest gives them their stake. But what do they personally want beyond their function?

Ask:
- What do they want for themselves?
- What history do they have with POV characters?
- What makes their pursuit personal, not just functional?

### Step 4: Assign Archetype

What kind of person serves this interest with this personal angle? The archetype shapes how they pursue their want.

### Step 5: Determine Psychology Level

**Full psychology** (wound, lie, want, need, coping, arc, voice):
- Characters who get POV scenes
- Characters who transform
- Characters whose arc carries thematic weight

**Partial psychology** (want, stake, method, outcome):
- Multiple appearances
- Make plot-affecting choices
- Represent an interest with a personal angle
- No transformation required

**Minimal** (name, role, function, appearance_context):
- Single appearance
- Pure function (messenger, obstacle, mirror)
- No personal want beyond the scene

### Step 6: Key Moments for Each Face

Every character with full or partial psychology gets their own decisive moments.

Ask:
- What actions do they take to get what they want?
- Where do they collide with POV characters?
- What happens off-screen that affects the plot?
- What is the outcome of their arc?

These moments should:
- Connect to the Phase 3 timeline (reference specific Phase 3 moments where possible)
- Include on-screen moments (in POV character presence)
- Include off-screen moments where relevant (with mechanism for how reader learns about them)
- Have a clear outcome

Phase 5 will weave these moments into the master timeline. You just define WHAT happens and WHERE it connects.

## OUTPUT FORMAT (JSON)

{
  "interests": [
    {
      "interest": "Description of the force/pressure/stake",
      "has_face": true,
      "why_face": "Why this needs a character (or null if faceless)"
    }
  ],

  "stakeholder_characters": [
    {
      "name": "Full name",
      "interest": "Which interest they represent",
      "personal_want": "What they want for themselves",
      "archetype": "Their archetype",
      "psychology_level": "full | partial | minimal",
      "connected_to": "Which POV character(s)",

      // Full psychology only:
      "wound": "Their formative hurt (full only)",
      "lie": "Their false belief (full only)",
      "want": "What they pursue (full only)",
      "need": "What they actually need (full only)",
      "coping_mechanism": {
        "behaviour": "How they cope",
        "as_flaw": "How it hurts them",
        "as_virtue": "How it helps them"
      },
      "arc": {
        "starts": "Who they are at start",
        "ends": "Who they become"
      },
      "voice": {
        "register": "How they speak",
        "patterns": "Speech habits",
        "tells": "Emotional reveals"
      },

      // Partial psychology only:
      "stake": "What they stand to gain/lose (partial only)",
      "method": "How they pursue their want (partial only)",

      // All levels:
      "outcome": "How their arc resolves",

      // Minimal only:
      "function": "Their single story function (minimal only)",
      "appearance_context": "When/where they appear (minimal only)"
    }
  ],

  "character_moments": [
    {
      "character": "Character name",
      "order": 1,
      "moment": "Moment name",
      "what_happens": "What occurs",
      "on_screen": true,
      "if_offscreen_how_surfaced": "How reader learns about it (null if on-screen)",
      "connects_to_phase3_moment": "Name of Phase 3 moment this relates to (or null)"
    }
  ],

  "arc_outcomes": [
    {
      "character": "Character name",
      "outcome": "How their story resolves"
    }
  ],

  "faceless_pressures": [
    {
      "interest": "The faceless force",
      "how_manifests": "How it shows up in the story without a character"
    }
  ]
}

## CRITICAL RULES

1. Characters emerge from story needs (interests), not from abstract psychology.
2. Psychology level matches function: don't give full wound/lie/arc to a messenger.
3. Every character with full/partial psychology must have character_moments.
4. Off-screen moments must have a clear mechanism for surfacing to the reader.
5. Consolidate where natural - one character can serve multiple interests.
6. Phase 5 builds the master timeline - you define characters and their moments only.

## DO NOT INCLUDE

- "Wound challenger/reinforcer" labels
- "Major/minor/referenced" weight categories (use psychology_level instead)
- Full psychology for single-appearance characters
- Characters without clear story function
- A master timeline (Phase 5 handles this)`

function buildPhase4UserPrompt(concept, phase1, phase2, phase3, lengthPreset) {
  // Build POV character summaries
  const povCharacters = [
    `**${phase2.protagonist?.name} (Protagonist):** wound="${phase2.protagonist?.wound?.event}", lie="${phase2.protagonist?.lie}"`,
    ...(phase2.love_interests?.map(li =>
      `**${li.name} (${li.role_in_story} Love Interest):** wound="${li.wound?.event}", lie="${li.lie}"`
    ) || [])
  ].join('\n')

  // Build timeline summary for context
  const timelineSummary = phase3.timeline?.map(t =>
    `${t.order}. [${t.pov}] ${t.moment}: ${t.what_happens?.slice(0, 80)}...`
  ).join('\n') || 'No timeline available'

  // Complexity guide
  const fullCount = lengthPreset === 'novella' ? '1-3' : '2-4'
  const partialCount = lengthPreset === 'novella' ? '2-4' : '3-6'
  const minimalCount = lengthPreset === 'novella' ? '1-3' : '2-4'

  return `ORIGINAL CONCEPT: ${concept}

PHASE 1 OUTPUT (Story DNA):
${JSON.stringify(phase1, null, 2)}

PHASE 2 OUTPUT (POV Characters):
${JSON.stringify(phase2, null, 2)}

PHASE 3 OUTPUT (Integrated Timeline):
${JSON.stringify(phase3, null, 2)}

LENGTH PRESET: ${lengthPreset}

## Your Task: Create Stakeholder Characters From Story Needs

### POV Characters (already created - do NOT recreate)

${povCharacters}

### Phase 3 Timeline (the story so far)

${timelineSummary}

### Setting & Theme Context

**Setting:** ${phase1.setting?.world || 'Not specified'}
**Theme Question:** "${phase1.theme?.question}"
**Theme Core:** ${phase1.theme?.core}

### Step 1: What Interests Exist?

Look at the setting, concept, and timeline. What forces, groups, and pressures exist in this story world? List them all - not characters, just stakes.

### Step 2: Face or Faceless?

For each interest: does it need a character to embody it, or does it work as unnamed/collective pressure?

### Step 3-5: Build Characters

For each face, determine:
- Personal want (beyond their function)
- Archetype
- Psychology level (full/partial/minimal)
- Full psychology details if warranted

### Step 6: Key Moments

Every character with full or partial psychology needs decisive moments. Reference Phase 3 moments where they connect. Phase 5 will weave these into the master timeline.

### Complexity Guide for ${lengthPreset}

- Full psychology characters: ${fullCount}
- Partial psychology characters: ${partialCount}
- Minimal characters: ${minimalCount}

Remember: Love interests are NOT secondary characters - they're already in Phase 2.
Do NOT produce a master timeline - Phase 5 handles timeline assembly.

## CRITICAL: OUTPUT STRUCTURE

Your output MUST be valid JSON with these top-level keys:
1. "interests" - array of interests identified
2. "stakeholder_characters" - array of character objects
3. "character_moments" - array of key moments for each character
4. "arc_outcomes" - array of character outcomes
5. "faceless_pressures" - array of unnamed forces

Do NOT include a "master_timeline" - that is Phase 5's job.`
}

async function executePhase4(concept, phase1, phase2, phase3, lengthPreset) {
  console.log('Executing Phase 4: Stakeholder Characters...')

  const userPrompt = buildPhase4UserPrompt(concept, phase1, phase2, phase3, lengthPreset)
  const response = await callOpenAI(PHASE_4_SYSTEM_PROMPT, userPrompt, { maxTokens: 16384 })
  const parsed = parseJSON(response)

  if (!parsed.success) {
    throw new Error(`Phase 4 JSON parse failed: ${parsed.error}`)
  }

  const data = parsed.data

  // Debug: show what we received
  console.log('Phase 4 received keys:', Object.keys(data))

  // Validate required fields
  if (!data.interests || !Array.isArray(data.interests)) {
    console.error('Phase 4 output (first 500 chars):', JSON.stringify(data, null, 2).slice(0, 500))
    throw new Error('Phase 4 missing interests array. Received keys: ' + Object.keys(data).join(', '))
  }
  if (!data.stakeholder_characters || !Array.isArray(data.stakeholder_characters)) {
    throw new Error('Phase 4 missing stakeholder_characters array. Received keys: ' + Object.keys(data).join(', '))
  }

  // Validate stakeholder characters have required fields
  for (const char of data.stakeholder_characters) {
    if (!char.name || !char.psychology_level) {
      throw new Error(`Stakeholder character missing required fields (name, psychology_level): ${JSON.stringify(char).slice(0, 100)}`)
    }
  }

  // Check that characters with full/partial psychology have moments
  const charsNeedingMoments = data.stakeholder_characters.filter(c => c.psychology_level !== 'minimal')
  const momentCharacters = new Set((data.character_moments || []).map(m => m.character))
  const missingMoments = charsNeedingMoments.filter(c => !momentCharacters.has(c.name))
  if (missingMoments.length > 0) {
    console.warn(`Phase 4 WARNING: Characters without moments: ${missingMoments.map(c => c.name).join(', ')}`)
  }

  // Count by psychology level
  const fullChars = data.stakeholder_characters.filter(c => c.psychology_level === 'full')
  const partialChars = data.stakeholder_characters.filter(c => c.psychology_level === 'partial')
  const minimalChars = data.stakeholder_characters.filter(c => c.psychology_level === 'minimal')

  // Console logging
  console.log('Phase 4 complete.')
  console.log(`  Interests identified: ${data.interests.length}`)
  const faced = data.interests.filter(i => i.has_face).length
  const faceless = data.interests.filter(i => !i.has_face).length
  console.log(`    Faced: ${faced}, Faceless: ${faceless}`)

  console.log(`  Stakeholder characters: ${data.stakeholder_characters.length}`)
  console.log(`    Full psychology: ${fullChars.length}`)
  fullChars.forEach(c => {
    console.log(`      - ${c.name}: interest="${c.interest}", want="${c.personal_want}"`)
  })
  console.log(`    Partial psychology: ${partialChars.length}`)
  partialChars.forEach(c => {
    console.log(`      - ${c.name}: interest="${c.interest}"`)
  })
  console.log(`    Minimal: ${minimalChars.length}`)
  minimalChars.forEach(c => {
    console.log(`      - ${c.name}: ${c.function || c.interest}`)
  })

  console.log(`  Character moments: ${data.character_moments?.length || 0}`)
  const onScreen = data.character_moments?.filter(m => m.on_screen).length || 0
  const offScreen = data.character_moments?.filter(m => !m.on_screen).length || 0
  console.log(`    On-screen: ${onScreen}, Off-screen: ${offScreen}`)

  console.log(`  Arc outcomes: ${data.arc_outcomes?.length || 0}`)
  console.log(`  Faceless pressures: ${data.faceless_pressures?.length || 0}`)

  if (missingMoments.length > 0) {
    console.log(`  WARNING: ${missingMoments.length} characters without moments`)
  }

  return data
}

// =============================================================================
// PHASE 5: MASTER TIMELINE (Iterative Character-by-Character Approach)
// =============================================================================

// Step A: Presence Mapping - Which existing moments would this character be present at?
const PHASE_5_PRESENCE_PROMPT = `You are mapping a character's presence across a story timeline.

Given the current timeline and a character's details, determine which existing moments this character would naturally be present at.

## OUTPUT FORMAT (JSON)

{
  "character_name": "The character's name",
  "presence": [
    {
      "moment": "Moment name from timeline",
      "action": "What they specifically do or observe in this moment",
      "why_present": "Why they would logically be here",
      "arc_state": "Where they are in their arc (believing lie | lie challenged | transforming | transformed)"
    }
  ]
}

## GUIDELINES

Consider the character's:
- Interest they represent and personal want
- Relationships to POV characters
- Physical proximity in the story world
- Thematic relevance to each moment

A character should be present when:
- Their interest or personal want connects to the moment
- They would logically be in that location
- Their presence adds meaning to the moment
- They need to witness something for their own arc

Do NOT force presence. If a character has no business being somewhere, don't include that moment.`

// Step B: Subplot Generation - What new moments does this character need for their arc?
const PHASE_5_SUBPLOT_PROMPT = `You are generating subplot moments for a supporting character.

Given:
- This character's full details (wound, lie, arc)
- Where they currently appear in the timeline
- The full cast list

Determine what additional moments are needed for this character's arc to complete.

## OUTPUT FORMAT (JSON)

{
  "character_name": "The character's name",
  "arc_analysis": {
    "current_appearances": "Summary of where they appear now",
    "arc_gap": "What's missing for their arc to complete",
    "needs_moments": true | false
  },
  "new_moments": [
    {
      "moment": "New moment name",
      "what_happens": "What occurs in this moment",
      "insert_after": "Name of existing moment this should follow",
      "characters_present": [
        {
          "name": "Character name",
          "role": "protagonist | love_interest | supporting",
          "action": "What they do in this moment"
        }
      ],
      "arc_purpose": "How this advances the character's arc",
      "arc_state": "The character's arc state after this moment"
    }
  ]
}

## GUIDELINES

Only create moments that are NECESSARY for arc completion. Ask:
- Does this character's arc require visible transformation?
- Is there a gap between their current appearances and arc resolution?
- What's the MINIMUM needed?

Each new moment should:
- Advance the character's arc (wound triggered → lie challenged → transformation)
- Include other characters who would logically be present
- Connect to the main plot or theme
- Have a clear purpose

CRITICAL: Every new moment MUST be a separate, standalone timeline entry. Do NOT merge new moments into existing main plot moments. Place them at the correct point in the timeline using insert_after, but keep them as distinct entries. A later phase will decide if any grouping is creatively appropriate.

Major characters typically need 2-4 subplot moments.
If arc can complete through existing presence, return empty new_moments array.`

// Final Verification - Check for gaps
const PHASE_5_VERIFICATION_PROMPT = `You are verifying a master timeline for completeness.

Given the complete timeline and full cast, identify any gaps or issues.

## OUTPUT FORMAT (JSON)

{
  "verification_passed": true | false,
  "main_moments_preserved": {
    "expected": number,
    "found": number,
    "missing": ["any missing main moment names"]
  },
  "character_arc_status": [
    {
      "character": "Name",
      "role": "protagonist | love_interest | stakeholder_full | stakeholder_partial",
      "appearances": number,
      "arc_complete": true | false,
      "arc_notes": "How their arc resolves, or what's missing"
    }
  ],
  "gaps_found": [
    {
      "issue": "Description of the gap",
      "severity": "critical | warning",
      "suggestion": "How to fix"
    }
  ]
}

## VERIFICATION CHECKS

1. All Phase 3 main moments are present
2. Every major supporting character has enough appearances for their arc
3. No character appears without purpose
4. Arc progression makes sense chronologically
5. Main characters' wound/lie/transformation journey is traceable`

// Build compressed timeline for context
function buildTimelineSummary(timeline) {
  return timeline.map((m, i) =>
    `${i + 1}. ${m.moment} [${m.source}]: ${m.what_happens?.slice(0, 80)}...`
  ).join('\n')
}

// Build cast list for subplot generation
function buildCastList(phase2, phase4) {
  const cast = []

  // Main characters
  cast.push({
    name: phase2.protagonist?.name,
    role: 'protagonist',
    brief: phase2.protagonist?.role
  })

  phase2.love_interests?.forEach(li => {
    cast.push({
      name: li.name,
      role: 'love_interest',
      brief: li.role
    })
  })

  // Stakeholder characters
  phase4.stakeholder_characters?.forEach(c => {
    cast.push({
      name: c.name,
      role: `stakeholder_${c.psychology_level}`,
      brief: c.interest || c.personal_want || c.function
    })
  })

  return cast
}

// Initialize timeline from Phase 3
function initializeTimeline(phase3) {
  const timeline = []

  // New integrated structure: Phase 3 timeline entries already have full details
  phase3.timeline?.forEach((t, i) => {
    timeline.push({
      order: i + 1,
      moment: t.moment,
      pov: t.pov || null,
      source: t.arcs_in_play?.join(' + ') || t.pov || 'main',
      type: 'main',
      what_happens: t.what_happens || '',
      romance_beat: t.romance_beat || null,
      intimacy_stage: t.intimacy_stage || null,
      psychological_beat: t.psychological_beat || null,
      external_beat: t.external_beat || null,
      characters_present: [] // Will be filled as we process
    })
  })

  return timeline
}

// Process a single character's presence
async function processCharacterPresence(character, timeline, castList) {
  const timelineSummary = buildTimelineSummary(timeline)

  const userPrompt = `## CHARACTER TO PROCESS

Name: ${character.name}
Interest: ${character.interest || 'none specified'}
Personal want: ${character.personal_want || 'none specified'}
Archetype: ${character.archetype || 'none specified'}
Connected to: ${character.connected_to || 'unspecified'}
Psychology level: ${character.psychology_level}
${character.psychology_level === 'full' ? `Wound: ${character.wound || 'none'}
Lie: ${character.lie || 'none'}
Arc: ${character.arc?.starts || '?'} → ${character.arc?.ends || '?'}` : `Stake: ${character.stake || 'none'}
Method: ${character.method || 'none'}`}

## CURRENT TIMELINE

${timelineSummary}

## FULL CAST (for reference)

${castList.map(c => `- ${c.name} (${c.role})`).join('\n')}

Determine which moments ${character.name} would naturally be present at.`

  const response = await callOpenAI(PHASE_5_PRESENCE_PROMPT, userPrompt)
  const parsed = parseJSON(response)

  if (!parsed.success) {
    console.warn(`Presence mapping failed for ${character.name}: ${parsed.error}`)
    return { character_name: character.name, presence: [] }
  }

  return parsed.data
}

// Process a single character's subplot needs
async function processCharacterSubplot(character, timeline, castList, presenceData) {
  const timelineSummary = buildTimelineSummary(timeline)

  const currentAppearances = presenceData.presence?.map(p => p.moment).join(', ') || 'none yet'

  const userPrompt = `## CHARACTER TO PROCESS

Name: ${character.name}
Interest: ${character.interest || 'none specified'}
Personal want: ${character.personal_want || 'none specified'}
Archetype: ${character.archetype || 'none specified'}
Connected to: ${character.connected_to || 'unspecified'}
Psychology level: ${character.psychology_level}
${character.psychology_level === 'full' ? `Wound: ${character.wound || 'none'}
Lie: ${character.lie || 'none'}
Arc: ${character.arc?.starts || '?'} → ${character.arc?.ends || '?'}` : `Stake: ${character.stake || 'none'}
Method: ${character.method || 'none'}`}
Outcome: ${character.outcome || 'unspecified'}

## CURRENT APPEARANCES

${character.name} currently appears in: ${currentAppearances}

Current arc states in those appearances:
${presenceData.presence?.map(p => `- ${p.moment}: ${p.arc_state}`).join('\n') || 'none'}

## CURRENT TIMELINE

${timelineSummary}

## FULL CAST (for casting new moments)

${castList.map(c => `- ${c.name} (${c.role}): ${c.brief}`).join('\n')}

Analyze if ${character.name} needs additional subplot moments for their arc to complete.
If they have psychology_level "partial", they likely don't need their own moments - just presence.
If they have psychology_level "full", they likely need 2-4 moments of their own.`

  const response = await callOpenAI(PHASE_5_SUBPLOT_PROMPT, userPrompt)
  const parsed = parseJSON(response)

  if (!parsed.success) {
    console.warn(`Subplot generation failed for ${character.name}: ${parsed.error}`)
    return { character_name: character.name, arc_analysis: { needs_moments: false }, new_moments: [] }
  }

  return parsed.data
}

// Insert new moments into timeline
function insertMomentsIntoTimeline(timeline, newMoments, characterName) {
  if (!newMoments || newMoments.length === 0) return timeline

  const updatedTimeline = [...timeline]

  for (const newMoment of newMoments) {
    // Find insertion point
    const insertAfterIndex = updatedTimeline.findIndex(m => m.moment === newMoment.insert_after)

    const momentToInsert = {
      order: 0, // Will be recalculated
      moment: newMoment.moment,
      source: `${characterName} subplot`,
      type: 'subplot',
      what_happens: newMoment.what_happens,
      characters_present: newMoment.characters_present || []
    }

    if (insertAfterIndex >= 0) {
      updatedTimeline.splice(insertAfterIndex + 1, 0, momentToInsert)
    } else {
      // If we can't find the insertion point, add to end
      updatedTimeline.push(momentToInsert)
    }
  }

  // Recalculate order numbers
  updatedTimeline.forEach((m, i) => {
    m.order = i + 1
  })

  return updatedTimeline
}

// Add character presence to timeline moments
function addPresenceToTimeline(timeline, presenceData) {
  if (!presenceData.presence) return timeline

  for (const presence of presenceData.presence) {
    const moment = timeline.find(m => m.moment === presence.moment)
    if (moment) {
      if (!moment.characters_present) {
        moment.characters_present = []
      }
      moment.characters_present.push({
        name: presenceData.character_name,
        role: 'supporting',
        action: presence.action,
        arc_state: presence.arc_state
      })
    }
  }

  return timeline
}

// Place Phase 4 stakeholder moments that are missing from the timeline as separate entries
// This runs BEFORE verification to ensure all decisive moments are represented (Fix 3+4)
function placeStakeholderMoments(timeline, phase4) {
  const characterMoments = phase4.character_moments || []
  if (characterMoments.length === 0) return timeline

  let updatedTimeline = [...timeline]
  let placed = 0
  let alreadyPresent = 0

  for (const cm of characterMoments) {
    // Check if this moment already exists in the timeline (exact name match, case-insensitive)
    const exists = updatedTimeline.some(m =>
      m.moment.toLowerCase() === cm.moment.toLowerCase()
    )

    if (exists) {
      alreadyPresent++
      // Ensure the character is listed in characters_present for their own moment
      const existingMoment = updatedTimeline.find(m =>
        m.moment.toLowerCase() === cm.moment.toLowerCase()
      )
      if (existingMoment && !existingMoment.characters_present?.some(p => p.name === cm.character)) {
        if (!existingMoment.characters_present) existingMoment.characters_present = []
        existingMoment.characters_present.push({
          name: cm.character,
          role: 'supporting',
          action: cm.what_happens,
          arc_state: 'active'
        })
      }
      continue
    }

    // Find insertion point using connects_to_phase3_moment
    let insertAfterIndex = -1
    if (cm.connects_to_phase3_moment) {
      insertAfterIndex = updatedTimeline.findIndex(m =>
        m.moment.toLowerCase() === cm.connects_to_phase3_moment.toLowerCase()
      )
    }

    // Build the new moment entry - always a separate entry, never merged
    const momentToInsert = {
      order: 0, // Will be recalculated
      moment: cm.moment,
      source: `${cm.character} stakeholder moment`,
      type: 'subplot',
      what_happens: cm.what_happens,
      on_screen: cm.on_screen !== false,
      if_offscreen_how_surfaced: cm.if_offscreen_how_surfaced || null,
      characters_present: [
        {
          name: cm.character,
          role: 'supporting',
          action: cm.what_happens,
          arc_state: 'active'
        }
      ]
    }

    if (insertAfterIndex >= 0) {
      updatedTimeline.splice(insertAfterIndex + 1, 0, momentToInsert)
    } else {
      // If no connection point found, add to end
      updatedTimeline.push(momentToInsert)
    }

    placed++
  }

  // Recalculate order numbers
  updatedTimeline.forEach((m, i) => {
    m.order = i + 1
  })

  console.log(`    ${placed} new moments placed, ${alreadyPresent} already present (${characterMoments.length} total from Phase 4)`)

  return updatedTimeline
}

// Run final verification
async function runVerification(timeline, phase2, phase3, phase4, characterArcs) {
  const timelineSummary = buildTimelineSummary(timeline)

  const userPrompt = `## COMPLETE TIMELINE

${timelineSummary}

## EXPECTED MAIN MOMENTS (from Phase 3)

${phase3.timeline?.map(t => t.moment).join('\n') || 'none'}

Total expected: ${phase3.timeline?.length || 0}

## FULL CAST

Protagonist: ${phase2.protagonist?.name}
Love Interests: ${phase2.love_interests?.map(li => li.name).join(', ')}

Stakeholder Characters:
${phase4.stakeholder_characters?.map(c => `- ${c.name} (${c.psychology_level}): ${c.interest}`).join('\n')}

## CHARACTER APPEARANCES IN TIMELINE (counted from timeline data - single source of truth)

${characterArcs.map(a =>
  `- ${a.character} (${a.role}): ${a.appearances.length} appearances${a.appearances.length === 0 ? ' [NO APPEARANCES]' : ''}`
).join('\n')}

Verify this timeline is complete and all arcs are deliverable.
Use the appearance counts above as ground truth - do NOT recount.`

  const response = await callOpenAI(PHASE_5_VERIFICATION_PROMPT, userPrompt)
  const parsed = parseJSON(response)

  if (!parsed.success) {
    console.warn(`Verification failed to parse: ${parsed.error}`)
    return { verification_passed: false, gaps_found: [{ issue: 'Verification parse failed', severity: 'warning' }] }
  }

  return parsed.data
}

// Check if a character is present in a moment via ANY source:
// 1. pov field (whoever has POV is present)
// 2. source field (characters listed e.g. "Itziar Etxeberria + Mikel Garaikoetxea")
// 3. characters_present array (supporting characters)
function isCharacterInMoment(charName, moment) {
  if (!charName) return false

  // Check characters_present array
  const inPresent = moment.characters_present?.find(p => p.name === charName)
  if (inPresent) return { source: 'characters_present', arc_state: inPresent.arc_state || 'present' }

  // Check pov field
  if (moment.pov && moment.pov === charName) {
    return { source: 'pov', arc_state: 'pov' }
  }

  // Check source field (may contain multiple names joined with " + ")
  if (moment.source && typeof moment.source === 'string') {
    const sourceNames = moment.source.split('+').map(s => s.trim())
    if (sourceNames.some(s => s === charName)) {
      return { source: 'source_field', arc_state: 'present' }
    }
  }

  return null
}

// Build character_arcs summary from timeline
function buildCharacterArcs(timeline, phase2, phase4) {
  const arcs = []

  // Track all characters
  const allCharacters = [
    { name: phase2.protagonist?.name, role: 'protagonist' },
    ...(phase2.love_interests?.map(li => ({ name: li.name, role: 'love_interest' })) || []),
    ...(phase4.stakeholder_characters?.map(c => ({ name: c.name, role: `stakeholder_${c.psychology_level}` })) || [])
  ]

  for (const char of allCharacters) {
    const appearances = []

    for (const moment of timeline) {
      // Check all three sources: pov, source field, characters_present
      const found = isCharacterInMoment(char.name, moment)
      if (found) {
        appearances.push({
          moment_order: moment.order,
          moment: moment.moment,
          arc_state: found.arc_state,
          presence_source: found.source
        })
      }
    }

    arcs.push({
      character: char.name,
      role: char.role,
      appearances,
      arc_complete: appearances.length > 0,
      arc_notes: appearances.length > 0
        ? `Appears in ${appearances.length} moments`
        : 'No appearances tracked'
    })
  }

  return arcs
}

async function executePhase5(concept, phase1, phase2, phase3, phase4, lengthPreset) {
  console.log('Executing Phase 5: Master Timeline (Iterative)...')

  // Initialize timeline from Phase 3
  let timeline = initializeTimeline(phase3)
  console.log(`  Initialized with ${timeline.length} main moments from Phase 3`)

  // Build cast list for reference
  const castList = buildCastList(phase2, phase4)
  console.log(`  Full cast: ${castList.length} characters`)

  // Get characters to process (full psychology first, then partial, then minimal)
  const fullCast = phase4.stakeholder_characters?.filter(c => c.psychology_level === 'full') || []
  const partialCast = phase4.stakeholder_characters?.filter(c => c.psychology_level === 'partial') || []
  const minimalCast = phase4.stakeholder_characters?.filter(c => c.psychology_level === 'minimal') || []

  console.log(`  Processing ${fullCast.length} full + ${partialCast.length} partial + ${minimalCast.length} minimal characters...`)

  // Store all presence data for arc tracking
  const allPresenceData = []

  // Process full psychology characters (need subplot moments)
  for (const character of fullCast) {
    console.log(`    Processing ${character.name} (full)...`)

    // Step A: Presence mapping
    const presenceData = await processCharacterPresence(character, timeline, castList)
    allPresenceData.push(presenceData)
    console.log(`      - Found ${presenceData.presence?.length || 0} presence points`)

    // Add presence to timeline
    timeline = addPresenceToTimeline(timeline, presenceData)

    // Step B: Subplot generation
    const subplotData = await processCharacterSubplot(character, timeline, castList, presenceData)

    if (subplotData.new_moments?.length > 0) {
      console.log(`      - Generated ${subplotData.new_moments.length} new subplot moments`)
      timeline = insertMomentsIntoTimeline(timeline, subplotData.new_moments, character.name)
    } else {
      console.log(`      - No new moments needed`)
    }
  }

  // Process partial psychology characters (presence only, no new moments)
  for (const character of partialCast) {
    console.log(`    Processing ${character.name} (partial)...`)

    // Step A only: Presence mapping
    const presenceData = await processCharacterPresence(character, timeline, castList)
    allPresenceData.push(presenceData)
    console.log(`      - Found ${presenceData.presence?.length || 0} presence points`)

    // Add presence to timeline
    timeline = addPresenceToTimeline(timeline, presenceData)
  }

  // Process minimal psychology characters (presence only - they still have decisive moments)
  for (const character of minimalCast) {
    console.log(`    Processing ${character.name} (minimal)...`)

    // Presence mapping - minimal characters may appear at moments relevant to their function
    const presenceData = await processCharacterPresence(character, timeline, castList)
    allPresenceData.push(presenceData)
    console.log(`      - Found ${presenceData.presence?.length || 0} presence points`)

    // Add presence to timeline
    timeline = addPresenceToTimeline(timeline, presenceData)
  }

  // Place any Phase 4 stakeholder moments not yet on the timeline as separate entries
  console.log(`  Placing missing stakeholder moments from Phase 4...`)
  timeline = placeStakeholderMoments(timeline, phase4)

  // Build character arcs summary FIRST (single source of truth for appearance counts)
  const characterArcs = buildCharacterArcs(timeline, phase2, phase4)

  // Run verification using character arcs data as ground truth
  console.log(`  Running verification...`)
  const verification = await runVerification(timeline, phase2, phase3, phase4, characterArcs)

  // Check for critical gaps - do NOT deliver broken output
  let finalVerification = verification
  let finalCharacterArcs = characterArcs
  const criticalGaps = verification.gaps_found?.filter(g => g.severity === 'critical') || []
  if (criticalGaps.length > 0) {
    console.error(`  CRITICAL GAPS FOUND (${criticalGaps.length}):`)
    criticalGaps.forEach(g => console.error(`    - ${g.issue}`))

    // Attempt one recount/reprocess pass
    console.log(`  Attempting recount/reprocess pass...`)
    finalCharacterArcs = buildCharacterArcs(timeline, phase2, phase4)

    // Re-run verification with recounted data
    console.log(`  Re-running verification after reprocess...`)
    finalVerification = await runVerification(timeline, phase2, phase3, phase4, finalCharacterArcs)

    const retriedCriticalGaps = finalVerification.gaps_found?.filter(g => g.severity === 'critical') || []
    if (retriedCriticalGaps.length > 0) {
      const issues = retriedCriticalGaps.map(g => g.issue).join('; ')
      throw new Error(
        `Phase 5 failed: ${retriedCriticalGaps.length} critical gap(s) remain after reprocess. ` +
        `Issues: ${issues}`
      )
    }

    console.log(`  Reprocess resolved critical gaps. Proceeding with output.`)
  }

  // Final output
  const result = {
    master_timeline: timeline,
    character_arcs: finalCharacterArcs,
    verification: finalVerification
  }

  // Console summary
  const mainMoments = timeline.filter(m => m.type === 'main').length
  const subplotMoments = timeline.filter(m => m.type === 'subplot').length

  console.log('Phase 5 complete.')
  console.log(`  Master timeline: ${timeline.length} total moments`)
  console.log(`    Main moments: ${mainMoments}`)
  console.log(`    Subplot moments: ${subplotMoments}`)

  // Timeline preview
  console.log(`  Timeline preview:`)
  timeline.slice(0, 5).forEach(m => {
    // Count characters from all three sources: characters_present, pov, and source field
    const povNames = m.pov ? [m.pov] : []
    const sourceNames = (m.source && typeof m.source === 'string')
      ? m.source.split('+').map(s => s.trim()).filter(s => s && s !== 'main')
      : []
    // Deduplicate: pov/source characters may also be in characters_present
    const allNames = new Set([
      ...povNames,
      ...sourceNames,
      ...(m.characters_present?.map(p => p.name) || [])
    ])
    console.log(`    ${m.order}. ${m.moment} (${m.type}) - ${allNames.size} characters`)
  })
  if (timeline.length > 5) {
    console.log(`    ... and ${timeline.length - 5} more`)
  }

  // Character arc summary
  console.log(`  Character arcs: ${finalCharacterArcs.length} tracked`)
  const withAppearances = finalCharacterArcs.filter(a => a.appearances.length > 0).length
  console.log(`    With appearances: ${withAppearances}`)

  // Verification summary
  if (finalVerification.verification_passed) {
    console.log(`  Verification: PASSED`)
  } else {
    console.log(`  Verification: ISSUES FOUND`)
    finalVerification.gaps_found?.forEach(g => {
      console.log(`    - [${g.severity}] ${g.issue}`)
    })
  }

  return result
}

// =============================================================================
// PHASE 6: MAJOR EVENTS & LOCATIONS
// =============================================================================

const PHASE_6_SYSTEM_PROMPT = `You organize a story's decisive moments into the spatial and social reality of the story world.

You receive a master timeline of decisive moments and the story's external plot structure. Your job:

1. IDENTIFY CLUSTERS: Group moments that would naturally occur at the same occasion (a festival, a church service, a family dinner, a battle, a ceremony). Base this on:
   - External plot beat (moments tied to the same world event)
   - Timing (moments occurring at the same point in the story)
   - Logic (characters who would be in the same physical space)
   Moments that are private, intimate, or require isolation remain separate as lone moments.

2. ASSIGN LOCATIONS: For each cluster (Major Event) and each standalone moment (Lone Moment), assign a specific location appropriate to the setting and era. Define the atmosphere and timing.

3. DETERMINE WHO IS PRESENT: For each Major Event and Lone Moment:
   - List which existing named characters are present
   - Identify minimal unnamed characters the location demands (servants, workers, congregants, onlookers). These have no psychology and no arc. They exist because the setting requires their presence.

IMPORTANT GUIDELINES:
- Not every moment needs to cluster. Private scenes between two characters often stand alone.
- Major events typically contain 2-6 moments. More than that suggests over-clustering.
- Locations must be specific to the story's setting and era, not generic.
- Every moment from the master timeline must appear exactly once: either inside a major_event's moments_contained or as a lone_moment.
- Minimal characters are functional roles (the person who opens the door, the crowd that watches), not developed characters.

Return ONLY valid JSON in this exact format:

{
  "major_events": [
    {
      "name": "string - name for this occasion",
      "external_beat": "string - which Phase 1 beat this relates to, or null",
      "moments_contained": [array of moment order numbers from the master timeline],
      "location": "string - specific location",
      "atmosphere": "string - sensory and emotional tone",
      "timing": "string - when in the story this occurs",
      "characters_present": [array of existing character names],
      "minimal_characters": [array of unnamed roles that the location requires]
    }
  ],
  "lone_moments": [
    {
      "moment_order": number,
      "moment_name": "string - from master timeline",
      "location": "string - specific location",
      "atmosphere": "string - sensory and emotional tone",
      "timing": "string - when in the story this occurs",
      "characters_present": [array of existing character names],
      "minimal_characters": [array of unnamed roles if any]
    }
  ],
  "location_inventory": [
    {
      "location": "string - location name",
      "description": "string - what this place is",
      "appears_in": [array of major event names and/or lone moment names]
    }
  ]
}`

function buildPhase6UserPrompt(concept, phase1, phase2, phase4, phase5) {
  // Build cast list from Phase 2 + Phase 4
  const castNames = []
  if (phase2.protagonist?.name) {
    castNames.push(`${phase2.protagonist.name} (protagonist)`)
  }
  if (phase2.love_interests) {
    phase2.love_interests.forEach(li => castNames.push(`${li.name} (love interest)`))
  }
  if (phase4.stakeholder_characters) {
    phase4.stakeholder_characters.forEach(c => castNames.push(`${c.name} (${c.psychology_level})`))
  }

  // Build timeline summary from Phase 5
  // Extract characters from all three sources: pov, source, and characters_present
  const timeline = phase5.master_timeline || []
  const timelineSummary = timeline.map(m => {
    const povNames = m.pov ? [m.pov] : []
    const sourceNames = (m.source && typeof m.source === 'string')
      ? m.source.split('+').map(s => s.trim()).filter(s => s && s !== 'main')
      : []
    const presentNames = m.characters_present?.map(c => c.name) || []
    const allNames = [...new Set([...povNames, ...sourceNames, ...presentNames])]
    const chars = allNames.length > 0 ? allNames.join(', ') : 'unspecified'
    return `  ${m.order}. [${m.type}] "${m.moment}" - Characters: ${chars}`
  }).join('\n')

  // Extract external plot beats from Phase 1
  const externalBeats = phase1.external_plot?.beats?.map(b =>
    `  ${b.order}. ${b.beat}: ${b.what_happens}`
  ).join('\n') || '  (none specified)'

  return `CONCEPT: ${concept}

## SETTING & TIMESPAN

Setting: ${phase1.subgenre || 'not specified'}
Timespan: ${phase1.timespan?.duration || 'not specified'}
External plot type: ${phase1.external_plot?.container_type || 'not specified'}
External plot summary: ${phase1.external_plot?.container_summary || 'not specified'}

## EXTERNAL PLOT BEATS (from Phase 1)

${externalBeats}

## FULL CAST (from Phase 2 + Phase 4)

${castNames.join('\n')}

## MASTER TIMELINE (from Phase 5) - ${timeline.length} moments

${timelineSummary}

## YOUR TASK

Organize these ${timeline.length} moments into the spatial and social reality of the story world.

1. Group moments that would naturally occur at the same occasion into Major Events
2. Keep private/intimate moments as Lone Moments
3. Assign specific locations appropriate to the setting
4. For each event/moment, list which named characters are present and what minimal unnamed characters the location demands

Every moment order number must appear exactly once across major_events and lone_moments.`
}

async function executePhase6(concept, phase1, phase2, phase4, phase5) {
  console.log('Executing Phase 6: Major Events & Locations...')

  const timeline = phase5.master_timeline || []
  const totalMoments = timeline.length
  console.log(`  Input: ${totalMoments} moments from Phase 5`)

  // Build a lookup from moment order to moment name
  const momentNameByOrder = {}
  for (const m of timeline) {
    momentNameByOrder[m.order] = m.moment
  }

  // Single LLM call to cluster, locate, and populate
  const userPrompt = buildPhase6UserPrompt(concept, phase1, phase2, phase4, phase5)
  const response = await callOpenAI(PHASE_6_SYSTEM_PROMPT, userPrompt, { maxTokens: 16384 })
  const parsed = parseJSON(response)

  if (!parsed.success) {
    throw new Error(`Phase 6 parse failed: ${parsed.error}`)
  }

  const result = parsed.data

  // --- Step 1 logging: Grouping moments ---
  console.log('')
  console.log(`  Step 1: Grouping moments...`)
  const majorEvents = result.major_events || []
  const loneResults = result.lone_moments || []

  for (const event of majorEvents) {
    const orders = event.moments_contained || []
    console.log(`    Cluster found: moments [${orders.join(', ')}] → "${event.name}"`)
  }
  for (const lone of loneResults) {
    const name = lone.moment_name || momentNameByOrder[lone.moment_order] || '?'
    console.log(`    Standalone: moment ${lone.moment_order} "${name}"`)
  }

  // --- Step 2 logging: Assigning locations ---
  console.log('')
  console.log(`  Step 2: Assigning locations...`)
  for (const event of majorEvents) {
    console.log(`    "${event.name}" → ${event.location}`)
  }
  for (const lone of loneResults) {
    const name = lone.moment_name || momentNameByOrder[lone.moment_order] || `Moment ${lone.moment_order}`
    console.log(`    "${name}" → ${lone.location}`)
  }

  // --- Step 3 logging: Determining presence ---
  console.log('')
  console.log(`  Step 3: Determining presence...`)
  for (const event of majorEvents) {
    const existing = event.characters_present?.join(', ') || 'none'
    const minimal = event.minimal_characters?.join(', ') || 'none'
    console.log(`    "${event.name}":`)
    console.log(`      Existing: ${existing}`)
    console.log(`      Minimal: ${minimal}`)
  }
  for (const lone of loneResults) {
    const name = lone.moment_name || momentNameByOrder[lone.moment_order] || `Moment ${lone.moment_order}`
    const existing = lone.characters_present?.join(', ') || 'none'
    const minimal = lone.minimal_characters?.join(', ') || 'none'
    console.log(`    "${name}":`)
    console.log(`      Existing: ${existing}`)
    console.log(`      Minimal: ${minimal}`)
  }

  // Validate: every moment must appear exactly once
  const majorEventMoments = majorEvents.flatMap(e => e.moments_contained || [])
  const loneMoments = loneResults.map(m => m.moment_order)
  const allPlacedMoments = [...majorEventMoments, ...loneMoments].sort((a, b) => a - b)
  const expectedMoments = timeline.map(m => m.order).sort((a, b) => a - b)

  const missingMoments = expectedMoments.filter(o => !allPlacedMoments.includes(o))
  const duplicateMoments = allPlacedMoments.filter((o, i) => allPlacedMoments.indexOf(o) !== i)

  if (missingMoments.length > 0 || duplicateMoments.length > 0) {
    console.warn(`  Phase 6 moment coverage issues:`)
    if (missingMoments.length > 0) {
      console.warn(`    Missing moments: ${missingMoments.join(', ')}`)
    }
    if (duplicateMoments.length > 0) {
      console.warn(`    Duplicate moments: ${duplicateMoments.join(', ')}`)
    }
  }

  // Final summary
  console.log('')
  console.log('Phase 6 complete.')
  console.log(`  Major events: ${majorEvents.length} (containing ${majorEventMoments.length} moments)`)
  console.log(`  Lone moments: ${loneResults.length}`)
  console.log(`  Locations: ${result.location_inventory?.length || 0}`)
  console.log(`  Moment coverage: ${allPlacedMoments.length}/${totalMoments}`)

  return result
}

// =============================================================================
// PHASE 7: EVENT DEVELOPMENT (BACK TO FRONT)
// =============================================================================

const PHASE_7_EVENT_SYSTEM_PROMPT = `You develop a single story event into a complete scene specification.

You receive:
- Event details (name, location, atmosphere, characters present, decisive moments)
- Character psychology (wounds, lies, wants, needs)
- Theme and external plot context
- Setup requirements accumulated from events that come LATER in the story (which you developed first)

Your job is to develop this event fully, then identify what earlier events must establish for this one to land.

IMPORTANT: You are working BACKWARDS through the story. The events you develop later in this session happen EARLIER in the narrative. So "setup requirements" means things that need to happen BEFORE this event.

Return ONLY valid JSON in this exact format:

{
  "event_name": "Name of this event",
  "type": "major_event | lone_moment",
  "timeline_position": "opening | early | mid | late | climax | resolution",

  "character_objectives": [
    {
      "character": "Name",
      "want_in_scene": "What they want here",
      "action": "What they do to get it",
      "arc_state_entering": "believing_lie | lie_challenged | transforming | transformed",
      "arc_state_exiting": "believing_lie | lie_challenged | transforming | transformed",
      "key_moment": "Their most important action or line"
    }
  ],

  "moment_breakdown": [
    {
      "moment_number": 1,
      "moment_name": "Name from timeline",
      "what_happens": "Specific action that occurs",
      "who_initiates": "Character name",
      "who_reacts": "Character name(s)",
      "what_changes": "What is different after"
    }
  ],

  "romance_beat": {
    "stage": "awareness | attraction | tension | touch | kiss | consummation | null",
    "physical": "What happens physically (or null)",
    "emotional": "What happens emotionally",
    "barrier": "What prevents progress or what barrier breaks"
  },

  "psychological_beats": {
    "lies_reinforced": [
      { "character": "Name", "how": "What reinforces their lie" }
    ],
    "lies_challenged": [
      { "character": "Name", "how": "What challenges their lie" }
    ],
    "transformations": [
      { "character": "Name", "trigger": "What causes it", "from": "Old state", "to": "New state" }
    ]
  },

  "external_pressure": {
    "beat": "Phase 1 external beat name or null",
    "how_it_manifests": "How the world/situation creates pressure",
    "deadline_or_constraint": "What's forcing action"
  },

  "outcome": {
    "relationship_change": "What's different between characters",
    "situation_change": "What's different in the world",
    "knowledge_change": "What characters now know",
    "stakes_change": "How stakes have shifted"
  },

  "setup_requirements": [
    {
      "requirement": "What must be established earlier in the story",
      "why_needed": "Why this event needs it to land",
      "function": "seed | setup | escalation | context",
      "latest_placement": "early | mid | just_before"
    }
  ]
}

GUIDELINES:

Character objectives:
- Every character present must have a want and action, even minimal characters
- Wants can conflict - that creates drama
- Arc states can only progress forward (believing_lie → lie_challenged → transforming → transformed)
- A character can stay in the same state, but cannot go backwards

Moment breakdown:
- Each decisive moment from Phase 5 that occurs in this event gets a breakdown
- Be specific about who does what
- Show cause and effect

Romance beat:
- Track the physical and emotional intimacy progression
- Stages are: awareness → attraction → tension → touch → kiss → consummation
- Not every event has a romance beat (use null for stage if not applicable)

Psychological beats:
- Track how character lies are reinforced or challenged
- Transformations are rare - usually one per character per story
- Most events either reinforce or challenge, not transform

Setup requirements:
- Be specific about what earlier scenes must establish
- seed = plant information/object that pays off later
- setup = establish relationship/situation directly
- escalation = build tension that this scene releases
- context = reader understanding needed
- latest_placement indicates how early this needs to appear`

function buildPhase7EventPrompt(event, eventType, phase1, phase2, phase4, phase5, accumulatedSetupRequirements, previouslyDevelopedEvents) {
  // Build character psychology summary
  const characterPsychology = []

  if (phase2.protagonist) {
    characterPsychology.push(`PROTAGONIST: ${phase2.protagonist.name}
  Wound: ${phase2.protagonist.wound || 'not specified'}
  Lie: ${phase2.protagonist.lie || 'not specified'}
  Want: ${phase2.protagonist.want || 'not specified'}
  Need: ${phase2.protagonist.need || 'not specified'}`)
  }

  if (phase2.love_interests) {
    phase2.love_interests.forEach(li => {
      characterPsychology.push(`LOVE INTEREST: ${li.name}
  Wound: ${li.wound || 'not specified'}
  Lie: ${li.lie || 'not specified'}
  Want: ${li.want || 'not specified'}
  Need: ${li.need || 'not specified'}`)
    })
  }

  if (phase4.stakeholder_characters) {
    phase4.stakeholder_characters.filter(c => c.psychology_level === 'full').forEach(c => {
      characterPsychology.push(`STAKEHOLDER (${c.name}):
  Interest: ${c.interest || 'not specified'}
  Psychology: ${c.psychology || 'not specified'}`)
    })
  }

  // Get moment details from Phase 5 timeline
  const timeline = phase5.master_timeline || []
  const momentDetails = []
  const momentNumbers = eventType === 'major_event' ? (event.moments_contained || []) : [event.moment_order]

  for (const num of momentNumbers) {
    const moment = timeline.find(m => m.order === num)
    if (moment) {
      momentDetails.push(`  ${moment.order}. "${moment.moment}" [${moment.type}]
    What happens: ${moment.what_happens || 'not specified'}
    POV: ${moment.pov || 'not specified'}
    Source: ${moment.source || 'not specified'}`)
    }
  }

  // Build setup requirements context from later events
  let setupContext = ''
  if (accumulatedSetupRequirements.length > 0) {
    setupContext = `
## SETUP REQUIREMENTS FROM LATER EVENTS

These are things that LATER events need. Since you're developing EARLIER events, consider whether this event should provide any of these:

${accumulatedSetupRequirements.map(r => `- ${r.requirement} (needed by: ${r.serves_event}, function: ${r.function})`).join('\n')}
`
  }

  // Build context from previously developed events
  let previousContext = ''
  if (previouslyDevelopedEvents.length > 0) {
    previousContext = `
## PREVIOUSLY DEVELOPED EVENTS (happen LATER in story)

${previouslyDevelopedEvents.slice(0, 3).map(e => `"${e.event_name}" (${e.timeline_position}):
  - Key outcome: ${e.outcome?.relationship_change || 'not specified'}
  - Characters transformed: ${e.psychological_beats?.transformations?.map(t => t.character).join(', ') || 'none'}`).join('\n\n')}
${previouslyDevelopedEvents.length > 3 ? `\n... and ${previouslyDevelopedEvents.length - 3} more developed events` : ''}
`
  }

  return `## EVENT TO DEVELOP

Name: ${event.name || event.moment_name || 'Unnamed'}
Type: ${eventType}
Location: ${event.location}
Atmosphere: ${event.atmosphere}
Timing: ${event.timing}
Characters Present: ${event.characters_present?.join(', ') || 'not specified'}
Minimal Characters: ${event.minimal_characters?.join(', ') || 'none'}

## DECISIVE MOMENTS IN THIS EVENT

${momentDetails.join('\n\n')}

## CHARACTER PSYCHOLOGY

${characterPsychology.join('\n\n')}

## THEME & EXTERNAL PLOT

Theme: ${phase1.theme?.core || 'not specified'} - ${phase1.theme?.question || ''}
External Plot: ${phase1.external_plot?.container_type || 'not specified'}
External Beats:
${phase1.external_plot?.beats?.map(b => `  ${b.order}. ${b.beat}: ${b.what_happens}`).join('\n') || '  (none)'}
${setupContext}
${previousContext}

## YOUR TASK

Develop this event fully. For each character present, specify their objective and arc state. Break down each decisive moment. Identify romance and psychological beats. Specify what must be established earlier in the story for this event to land.`
}

async function executePhase7(concept, phase1, phase2, phase4, phase5, phase6) {
  console.log('Executing Phase 7: Event Development (Back to Front)...')

  // Step 1: Gather all events and sort by timeline position
  const majorEvents = (phase6.major_events || []).map(e => ({ ...e, eventType: 'major_event' }))
  const loneEvents = (phase6.lone_moments || []).map(e => ({ ...e, eventType: 'lone_moment', name: e.moment_name }))
  const allEvents = [...majorEvents, ...loneEvents]

  // Sort by moment numbers (use first moment for major events, moment_order for lone)
  allEvents.sort((a, b) => {
    const aOrder = a.eventType === 'major_event' ? Math.min(...(a.moments_contained || [999])) : a.moment_order
    const bOrder = b.eventType === 'major_event' ? Math.min(...(b.moments_contained || [999])) : b.moment_order
    return aOrder - bOrder
  })

  // Reverse for back-to-front processing
  const developmentOrder = [...allEvents].reverse()

  console.log(`  Input: ${allEvents.length} events (${majorEvents.length} major, ${loneEvents.length} lone)`)
  console.log('')
  console.log('  Step 1: Development order (back to front)...')
  developmentOrder.forEach((e, i) => {
    const moments = e.eventType === 'major_event' ? `moments [${e.moments_contained?.join(', ')}]` : `moment ${e.moment_order}`
    console.log(`    ${i + 1}. "${e.name}" (${e.eventType}) - ${moments}`)
  })

  // Step 2: Process each event back-to-front
  console.log('')
  console.log('  Step 2: Developing events...')

  const developedEvents = []
  const allSetupRequirements = []

  for (let i = 0; i < developmentOrder.length; i++) {
    const event = developmentOrder[i]
    const eventName = event.name || `Event ${i + 1}`
    const position = i === 0 ? 'resolution/climax' : i < developmentOrder.length / 3 ? 'late' : i < 2 * developmentOrder.length / 3 ? 'mid' : 'early/opening'

    console.log(`    [${i + 1}/${developmentOrder.length}] Developing "${eventName}" (${position})...`)

    const userPrompt = buildPhase7EventPrompt(
      event,
      event.eventType,
      phase1,
      phase2,
      phase4,
      phase5,
      allSetupRequirements,
      developedEvents
    )

    const response = await callOpenAI(PHASE_7_EVENT_SYSTEM_PROMPT, userPrompt, { maxTokens: 8192 })
    const parsed = parseJSON(response)

    if (!parsed.success) {
      console.warn(`      ⚠ Parse failed for "${eventName}": ${parsed.error}`)
      // Log the raw response to help debug JSON issues
      console.warn(`      Raw response (first 3000 chars):`)
      console.warn(response.slice(0, 3000))
      if (response.length > 3000) {
        console.warn(`      ... (${response.length - 3000} more chars)`)
      }
      // Create a minimal fallback entry
      developedEvents.push({
        event_name: eventName,
        type: event.eventType,
        timeline_position: position,
        location: event.location,
        atmosphere: event.atmosphere,
        moments_contained: event.eventType === 'major_event' ? event.moments_contained : [event.moment_order],
        character_objectives: [],
        moment_breakdown: [],
        romance_beat: { stage: null },
        psychological_beats: { lies_reinforced: [], lies_challenged: [], transformations: [] },
        external_pressure: { beat: null },
        outcome: {},
        setup_requirements: [],
        _parse_error: true
      })
      continue
    }

    const developed = parsed.data

    // Add metadata
    developed.location = event.location
    developed.atmosphere = event.atmosphere
    developed.moments_contained = event.eventType === 'major_event' ? event.moments_contained : [event.moment_order]
    developed.characters_present = event.characters_present
    developed.minimal_characters = event.minimal_characters

    developedEvents.push(developed)

    // Accumulate setup requirements
    if (developed.setup_requirements?.length > 0) {
      for (const req of developed.setup_requirements) {
        allSetupRequirements.push({
          ...req,
          serves_event: eventName
        })
      }
    }

    // Log summary
    const charCount = developed.character_objectives?.length || 0
    const momentCount = developed.moment_breakdown?.length || 0
    const setupCount = developed.setup_requirements?.length || 0
    const romanceStage = developed.romance_beat?.stage || 'none'
    console.log(`      ✓ ${charCount} character objectives, ${momentCount} moment breakdowns, romance: ${romanceStage}, ${setupCount} setup requirements`)
  }

  // Step 3: Log detailed breakdown
  console.log('')
  console.log('  Step 3: Development summary...')

  for (const dev of developedEvents) {
    console.log(`    "${dev.event_name}" (${dev.type}, ${dev.timeline_position}):`)

    // Character objectives
    if (dev.character_objectives?.length > 0) {
      console.log(`      Characters:`)
      for (const obj of dev.character_objectives) {
        console.log(`        - ${obj.character}: wants "${obj.want_in_scene?.slice(0, 50)}..." (${obj.arc_state_entering} → ${obj.arc_state_exiting})`)
      }
    }

    // Moment breakdown
    if (dev.moment_breakdown?.length > 0) {
      console.log(`      Moments:`)
      for (const m of dev.moment_breakdown) {
        console.log(`        - ${m.moment_number}. ${m.moment_name}: ${m.who_initiates} initiates → ${m.what_changes?.slice(0, 40)}...`)
      }
    }

    // Romance beat
    if (dev.romance_beat?.stage && dev.romance_beat.stage !== 'null') {
      console.log(`      Romance: ${dev.romance_beat.stage} - ${dev.romance_beat.emotional?.slice(0, 50)}...`)
    }

    // Psychological beats
    const transformations = dev.psychological_beats?.transformations || []
    if (transformations.length > 0) {
      console.log(`      Transformations:`)
      for (const t of transformations) {
        console.log(`        - ${t.character}: ${t.from} → ${t.to}`)
      }
    }

    // Setup requirements
    if (dev.setup_requirements?.length > 0) {
      console.log(`      Setup needed:`)
      for (const s of dev.setup_requirements) {
        console.log(`        - [${s.function}] ${s.requirement?.slice(0, 60)}...`)
      }
    }
  }

  // Build final result
  const result = {
    development_order: developmentOrder.map(e => e.name),
    developed_events: developedEvents,
    all_setup_requirements: allSetupRequirements
  }

  // Final summary
  console.log('')
  console.log('Phase 7 complete.')
  console.log(`  Events developed: ${developedEvents.length}`)
  console.log(`  Total setup requirements: ${allSetupRequirements.length}`)

  const parseErrors = developedEvents.filter(e => e._parse_error).length
  if (parseErrors > 0) {
    console.warn(`  ⚠ Parse errors: ${parseErrors} events had fallback data`)
  }

  // Breakdown by function
  const byFunction = {}
  for (const req of allSetupRequirements) {
    byFunction[req.function] = (byFunction[req.function] || 0) + 1
  }
  if (Object.keys(byFunction).length > 0) {
    console.log(`  Setup requirements by function:`)
    for (const [fn, count] of Object.entries(byFunction)) {
      console.log(`    - ${fn}: ${count}`)
    }
  }

  return result
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
      // Note: regeneration doesn't use library summaries (concept already exists)
      updatedBible.coreFoundation = await executePhase1(concept, lengthPreset, level, [])
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
        updatedBible.eventsAndLocations = await executePhase6(concept, updatedBible.coreFoundation, updatedBible.characters, updatedBible.subplots, updatedBible.masterTimeline)
      }
    case 7:
      if (phaseNumber <= 7) {
        updatedBible.eventDevelopment = await executePhase7(
          concept,
          updatedBible.coreFoundation,
          updatedBible.characters,
          updatedBible.subplots,
          updatedBible.masterTimeline,
          updatedBible.eventsAndLocations
        )
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
  6: { name: 'Major Events & Locations', description: 'Organizing moments into events, assigning locations and presence' },
  7: { name: 'Event Development', description: 'Developing events back-to-front with character objectives and setup requirements' },
}

/**
 * Generate a complete story bible through the 7-phase pipeline
 * @param {string} concept - Story concept/description
 * @param {string} level - Reading level (Beginner, Intermediate, Native)
 * @param {string} lengthPreset - 'novella' (12 chapters) or 'novel' (35 chapters)
 * @param {string} language - Target language
 * @param {number} maxValidationAttempts - Max validation retry attempts (default 2)
 * @param {Function} onProgress - Optional callback for progress updates: (phase, totalPhases, phaseName, description, status) => void
 * @param {Array} librarySummaries - Existing book summaries for diversity (default [])
 * @returns {Promise<Object>} Generated bible result
 */
export async function generateBible(concept, level, lengthPreset, language, maxValidationAttempts = 2, onProgress = null, librarySummaries = []) {
  console.log('='.repeat(60))
  console.log('STARTING BIBLE GENERATION PIPELINE')
  console.log(`Concept: ${concept}`)
  console.log(`Level: ${level}, Length: ${lengthPreset}, Language: ${language}`)
  console.log('='.repeat(60))

  let bible = {}
  let validationAttempts = 0
  const totalPhases = 7

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
    // Phase 1: Story DNA
    reportProgress(1, 'starting')
    bible.coreFoundation = await executePhase1(concept, lengthPreset, level, librarySummaries)
    reportProgress(1, 'complete', {
      subgenre: bible.coreFoundation.subgenre,
      origin: bible.coreFoundation.tropes?.origin,
      theme: bible.coreFoundation.theme,
      externalPlot: bible.coreFoundation.external_plot?.container_type,
      externalBeats: bible.coreFoundation.external_plot?.beats?.length
    })

    // Phase 2: Characters
    reportProgress(2, 'starting')
    bible.characters = await executePhase2(concept, bible.coreFoundation)
    reportProgress(2, 'complete', {
      protagonist: bible.characters.protagonist?.name,
      loveInterests: bible.characters.love_interests?.length
    })

    // Phase 3: Central Plot
    reportProgress(3, 'starting')
    bible.plot = await executePhase3(concept, bible.coreFoundation, bible.characters)
    reportProgress(3, 'complete', {
      keyMoments: bible.plot.key_moments?.length,
      darkMoment: bible.plot.dark_moment?.what_happens?.slice(0, 30)
    })

    // Phase 4: Subplots & Supporting Cast
    reportProgress(4, 'starting')
    bible.subplots = await executePhase4(concept, bible.coreFoundation, bible.characters, bible.plot, lengthPreset)
    reportProgress(4, 'complete', {
      interests: bible.subplots.interests?.length,
      stakeholderCharacters: bible.subplots.stakeholder_characters?.length,
      characterMoments: bible.subplots.character_moments?.length
    })

    // Phase 5: Master Timeline
    reportProgress(5, 'starting')
    bible.masterTimeline = await executePhase5(concept, bible.coreFoundation, bible.characters, bible.plot, bible.subplots, lengthPreset)
    reportProgress(5, 'complete', {
      totalMoments: bible.masterTimeline.master_timeline?.length,
      mainMoments: bible.masterTimeline.master_timeline?.filter(m => m.type === 'main').length,
      subplotMoments: bible.masterTimeline.master_timeline?.filter(m => m.type === 'subplot').length
    })

    // Phase 6: Major Events & Locations
    reportProgress(6, 'starting')
    bible.eventsAndLocations = await executePhase6(concept, bible.coreFoundation, bible.characters, bible.subplots, bible.masterTimeline)
    reportProgress(6, 'complete', {
      majorEvents: bible.eventsAndLocations.major_events?.length || 0,
      loneMoments: bible.eventsAndLocations.lone_moments?.length || 0,
      locations: bible.eventsAndLocations.location_inventory?.length || 0
    })

    // Phase 7: Event Development (Back to Front)
    reportProgress(7, 'starting')
    bible.eventDevelopment = await executePhase7(concept, bible.coreFoundation, bible.characters, bible.subplots, bible.masterTimeline, bible.eventsAndLocations)
    reportProgress(7, 'complete', {
      eventsDeveloped: bible.eventDevelopment.developed_events?.length || 0,
      setupRequirements: bible.eventDevelopment.all_setup_requirements?.length || 0
    })

    // TESTING: Stop after Phase 7 to validate Event Development output
    console.log('='.repeat(60))
    console.log('TEST MODE - Stopping after Phase 7')
    console.log('Phase 1 Output:', JSON.stringify(bible.coreFoundation, null, 2))
    console.log('Phase 2 Output:', JSON.stringify(bible.characters, null, 2))
    console.log('Phase 3 Output:', JSON.stringify(bible.plot, null, 2))
    console.log('Phase 4 Output:', JSON.stringify(bible.subplots, null, 2))
    console.log('Phase 5 Output:', JSON.stringify(bible.masterTimeline, null, 2))
    console.log('Phase 6 Output:', JSON.stringify(bible.eventsAndLocations, null, 2))
    console.log('Phase 7 Output:', JSON.stringify(bible.eventDevelopment, null, 2))
    console.log('='.repeat(60))

    return {
      success: true,
      bible,
      validationStatus: 'PHASE_7_TEST',
      validationAttempts: 0
    }

    // Store level and language on bible for chapter generation
    bible.level = level
    bible.language = language

    // Phase 7: Validation (with potential regeneration)
    reportProgress(7, 'starting')
    while (validationAttempts < maxValidationAttempts) {
      validationAttempts++
      console.log(`Validation attempt ${validationAttempts}/${maxValidationAttempts}`)

      bible.validation = await executePhase7(bible)

      if (bible.validation.validation_status === 'PASS' || bible.validation.validation_status === 'CONDITIONAL_PASS') {
        console.log('Bible validation passed!')
        reportProgress(7, 'complete', {
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

        reportProgress(7, 'regenerating', {
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
      reportProgress(7, 'complete_with_issues', {
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
    "eventsCovered": ["Event 1", "Event 2"],
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
function getSceneWordCountTarget(eventCount = 4) {
  // Each event should expand to ~150-200 words of prose
  // Scenes typically have 3-6 events, so 600-1200 words is reasonable
  const minWords = Math.max(500, eventCount * 120)
  const maxWords = Math.min(1500, eventCount * 250)
  return { min: minWords, max: maxWords }
}

const SCENE_SYSTEM_PROMPT = `You are a novelist. Write this scene in {{target_language}}.

Your prose should be immersive, vivid, and emotionally resonant. Dramatize the events through action, dialogue, and interiority. Trust the reader — show, don't tell.

## Output Format (JSON)

{
  "scene": {
    "content": "The complete scene prose in {{target_language}}...",
    "word_count": number,
    "events_dramatized": ["Event 1", "Event 2", ...],
    "exit_state": "Where the scene ends (physical and emotional)"
  }
}`

// Build prompt for a single scene
function buildSceneUserPrompt(bible, chapter, scene, sceneIndex, previousSceneExit, language) {
  const protagonist = bible.characters.protagonist
  const loveInterest = bible.characters.love_interest
  const isPovProtagonist = chapter.pov === protagonist?.name
  const povCharacter = isPovProtagonist ? protagonist : loveInterest
  const otherCharacter = isPovProtagonist ? loveInterest : protagonist

  // Get events (new structure) or beats (legacy)
  const events = scene.events || scene.beats || []
  const eventCount = events.length || 4
  const wordTarget = getSceneWordCountTarget(eventCount)

  // Get level constraints
  const targetLevel = bible.level || 'Intermediate'
  const levelDef = LEVEL_DEFINITIONS[targetLevel] || LEVEL_DEFINITIONS.Intermediate

  // Previous context
  const previousContext = previousSceneExit
    ? `Previous scene ended: ${previousSceneExit}`
    : sceneIndex === 0
      ? `This is the first scene of Chapter ${chapter.number}.`
      : ''

  // Characters present
  const charactersPresent = scene.characters || scene.characters_present || [chapter.pov]

  return `STORY: ${bible.coreFoundation?.logline || 'A romance story'}
SETTING: ${bible.world?.setting?.location}, ${bible.world?.setting?.time_period}

CHAPTER ${chapter.number}: ${chapter.title}
POV: ${chapter.pov}
Emotional arc: ${chapter.emotional_arc?.starts || 'N/A'} → ${chapter.emotional_arc?.ends || 'N/A'}

---

SCENE ${sceneIndex + 1}
Location: ${scene.location}
Characters: ${charactersPresent.join(', ')}
${scene.function ? `Purpose: ${scene.function}` : ''}

WHAT HAPPENS:
${events.map((event, i) => `${i + 1}. ${event}`).join('\n')}

${previousContext}

---

LANGUAGE: ${language}
TARGET: ${wordTarget.min}-${wordTarget.max} words
LEVEL: ${targetLevel} (max ${levelDef.sentences.maxLength || 'no limit'} words per sentence)

Dramatize this scene. Make it vivid and immersive.`
}

// Generate a single scene
async function generateScene(bible, chapter, scene, sceneIndex, previousSceneExit, language) {
  const events = scene.events || scene.beats || []
  const eventCount = events.length || 4
  console.log(`  Generating Scene ${sceneIndex + 1}: "${scene.location || 'Scene'}" (${eventCount} events)...`)

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
  const wordTarget = getSceneWordCountTarget(eventCount)

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
  const allEventsDramatized = generatedScenes.flatMap(s => s.events_dramatized || s.beats_dramatized || [])

  console.log(`  Chapter ${chapterIndex} complete: ${totalWordCount} total words from ${generatedScenes.length} scenes`)

  // Get level from bible for validation
  const level = bible.level || 'Intermediate'
  const wordCountTarget = getWordCountTarget(chapter.tension_rating || 5)

  // Collect all expected events (with fallback for legacy beats)
  const allExpectedEvents = chapter.scenes.flatMap(scene => scene.events || scene.beats || [])

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
      eventsCovered: allEventsDramatized,
      hookDelivered: chapter.ends_with || chapter.hook?.description || 'Chapter concluded',
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
    allExpectedEvents,
    chapter.chapter_hook?.type || chapter.hook?.type,
    wordCountTarget,
    level,
    null
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

  // Get level constraints directly from LEVEL_DEFINITIONS
  const targetLevel = bible.level || 'Intermediate'
  const levelDef = LEVEL_DEFINITIONS[targetLevel] || LEVEL_DEFINITIONS.Intermediate
  const forbiddenTechniques = levelDef.forbidden || []

  const proseGuidanceText = `
### SENTENCE CONSTRAINTS (MANDATORY):
- Average length: ${levelDef.sentences.averageLength.min}-${levelDef.sentences.averageLength.max} words per sentence
- Maximum length: ${levelDef.sentences.maxLength || 'no hard limit'} words
- Structure: ${levelDef.sentences.structure}
- Allowed connectors: ${levelDef.sentences.connectors}

### VOCABULARY CONSTRAINTS (MANDATORY):
- Scope: ${levelDef.vocabulary.scope}
- Handling difficult concepts: ${levelDef.vocabulary.handling}
${levelDef.vocabulary.forbidden?.length > 0 ? `- FORBIDDEN vocabulary types:\n${levelDef.vocabulary.forbidden.map(f => `  * ${f}`).join('\n')}` : ''}

### MEANING & SUBTEXT (MANDATORY):
- Explicitness: ${levelDef.meaning.explicitness}
- Subtext rule: ${levelDef.meaning.subtext}
- Emotion expression: ${levelDef.meaning.emotions}
- Motivation clarity: ${levelDef.meaning.motivation}

### DIALOGUE CONSTRAINTS (MANDATORY):
- Style: ${levelDef.dialogue.style}
- Length: ${levelDef.dialogue.length}
- Attribution: ${levelDef.dialogue.attribution}
- Subtext: ${levelDef.dialogue.subtext}

### NARRATIVE TECHNIQUE (MANDATORY):
- Cause/Effect: ${levelDef.narrative.causeEffect}
- Timeline: ${levelDef.narrative.timeflow}
- POV handling: ${levelDef.narrative.pov}
- Show vs Tell: ${levelDef.narrative.showing}

${forbiddenTechniques.length > 0 ? `### FORBIDDEN AT THIS LEVEL (DO NOT USE):\n${forbiddenTechniques.map(f => `- ${f}`).join('\n')}` : ''}`

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

=== SCENES ===

${chapter.scenes?.map((scene, sceneIdx) => {
  const events = scene.events || scene.beats || []
  const characters = scene.characters || scene.characters_present || []
  return `
--- SCENE ${sceneIdx + 1} ---
Location: ${scene.location || 'N/A'}
Characters: ${characters.join(', ') || 'N/A'}
${scene.function ? `Purpose: ${scene.function}` : ''}

WHAT HAPPENS:
${events.map((event, idx) => `  ${idx + 1}. ${event}`).join('\n') || 'N/A'}
`
}).join('\n') || 'N/A'}

=== END SCENES ===

${chapter.phase_4_moment ? `KEY MOMENT: This chapter contains "${chapter.phase_4_moment}" — a pivotal relationship moment. Give it weight.` : ''}

CHAPTER ENDING: ${chapter.ends_with || chapter.hook?.description || 'End with emotional resonance'}

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

  // Check events covered (with fallback for legacy beats)
  const eventsCovered = chapterData?.metadata?.eventsCovered || chapterData?.metadata?.beatsCovered || []
  if (expectedBeats && expectedBeats.length > 0 && eventsCovered.length < expectedBeats.length * 0.5) {
    warnings.push({ type: 'missing_events', message: `Only ${eventsCovered.length} of ${expectedBeats.length} events explicitly covered` })
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
    eventsCovered: eventsCovered.length,
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

  // Get level from bible
  const level = bible.level || 'Intermediate'

  // Collect all events from all scenes (with fallback for legacy beats)
  const allEvents = chapter.scenes
    ? chapter.scenes.flatMap(scene => scene.events || scene.beats || [])
    : (chapter.events || chapter.beats || [])

  // Validate output including level compliance
  const validation = validateChapterOutput(
    chapterData,
    allEvents,
    chapter.chapter_hook?.type || chapter.hook?.type,
    wordCountTarget,
    level,
    null
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

  // Get level from bible
  const level = bible.level || 'Intermediate'

  // Collect all events from all scenes (with fallback for legacy beats)
  const allEvents = chapter.scenes
    ? chapter.scenes.flatMap(scene => scene.events || scene.beats || [])
    : (chapter.events || chapter.beats || [])

  const validation = validateChapterOutput(
    chapterData,
    allEvents,
    chapter.chapter_hook?.type || chapter.hook?.type,
    wordCountTarget,
    level,
    null
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
    "eventsCovered": ${JSON.stringify(previousOutput.metadata?.eventsCovered || previousOutput.metadata?.beatsCovered || [])},
    "hookDelivered": "${previousOutput.metadata?.hookDelivered || ''}",
    "hookType": "${previousOutput.metadata?.hookType || chapter.hook?.type || 'emotional'}"
  }
}`

  const response = await callOpenAI(systemPrompt, userPrompt)
  const parsed = parseJSON(response)

  if (!parsed.success) {
    throw new Error('Chapter expansion failed to parse')
  }

  // Get level from bible
  const level = bible.level || 'Intermediate'

  // Collect all events from all scenes (with fallback for legacy beats)
  const allEvents = chapter.scenes
    ? chapter.scenes.flatMap(scene => scene.events || scene.beats || [])
    : (chapter.events || chapter.beats || [])

  const validation = validateChapterOutput(
    parsed.data,
    allEvents,
    chapter.chapter_hook?.type || chapter.hook?.type,
    wordCountTarget,
    level,
    null
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
  callClaude,
  expandVagueConcept,
  generateDifferentConcept,
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
  executePhase4,
  executePhase5,
  executePhase6,
  executePhase7,
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
  CONFIG,
  LEVEL_DEFINITIONS,
  LANGUAGE_LEVEL_ADJUSTMENTS,
  PHASE_DESCRIPTIONS
}
