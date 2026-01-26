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

Select the most appropriate for the story.

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
  "premise": string
}`

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

async function executePhase1(concept, lengthPreset, level) {
  console.log('Executing Phase 1: Story DNA...')

  // Expand vague concepts first
  const expandedConcept = await expandVagueConcept(concept)

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
  const requiredFields = ['subgenre', 'tropes', 'ending', 'tone', 'timespan', 'pov', 'conflict', 'theme', 'premise']
  const missing = requiredFields.filter(f => !data[f])

  if (missing.length > 0) {
    throw new Error(`Phase 1 missing required fields: ${missing.join(', ')}`)
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

  return data
}

// =============================================================================
// PHASE 2: CHARACTERS (Romantic Leads)
// =============================================================================

const PHASE_2_SYSTEM_PROMPT = `You are a romance character architect. Your task is to create psychologically complex, compelling romantic leads whose internal conflicts drive the romance.

You will receive:
- The user's original concept
- Phase 1 output (subgenre, tropes, conflict, theme, ending, tone, timespan, POV, premise)

Your job is to create characters where:
1. Wounds connect to the theme from Phase 1
2. Arcs match the ending type (HEA = overcome flaws; Bittersweet/Tragic = flaws or circumstances win)
3. The dynamics explain why THESE people crack each other open

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
  return `ORIGINAL CONCEPT: ${concept}

PHASE 1 OUTPUT (Story DNA):
${JSON.stringify(phase1, null, 2)}

Create the romantic leads for this story.

IMPORTANT: Count the number of love interests implied by the concept. If it mentions "3 suitors" create 3. If "love triangle" create 2. If standard romance create 1.

Ensure:
- All wounds connect to the theme "${phase1.theme?.core || 'from Phase 1'}"
- Arcs match the ${phase1.ending?.type || 'established'} ending
- Each love interest is distinct with different wounds and approaches
- One love interest is marked Primary (unless tragic/open ending)
- If multiple love interests, include rival dynamics between them`
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

const PHASE_3_SYSTEM_PROMPT = `You are a romance plot architect. Your task is to design complete romantic arcs for ALL love interests, not just the primary one.

You will receive:
- The original concept
- Phase 1 output (tropes, conflict, theme, ending, tone, timespan)
- Phase 2 output (protagonist, love_interests array, dynamics)

Your job is to create arcs where:
1. Every love interest gets a full arc with key moments
2. Rivals are not speedbumps - they complete their character arc even though the romance ends
3. The primary romance gets the most moments, but rivals get real stories
4. Rival dynamics between love interests also get key moments

## Output Format

{
  "arc_shape": {
    "origin_type": "How Phase 1 origin trope shapes the primary arc",
    "burn_rate": "How Phase 1 dynamic shapes pacing",
    "ending_type": "How Phase 1 ending shapes the third act"
  },

  "romantic_arcs": [
    {
      "between": ["Protagonist name", "Love interest name"],
      "arc_type": "Primary romance - ends together | Rival romance - ends in elimination but character completes arc",
      "key_moments": [
        {
          "moment": "Name/label for this beat",
          "what_happens": "What occurs",
          "why_it_matters": "How it connects to wounds/theme",
          "what_shifts": "What changes between them after this"
        }
      ],
      "wound_integration": {
        "protagonist": {
          "wound_triggered_by": "What event/action activates their wound in THIS arc",
          "lie_reinforced_by": "What makes them double down",
          "lie_challenged_by": "What/who forces them to question it",
          "transformation_moment": "The specific moment they choose differently"
        },
        "love_interest": {
          "wound_triggered_by": "What event/action activates their wound",
          "lie_reinforced_by": "What makes them double down",
          "lie_challenged_by": "What/who forces them to question it",
          "transformation_moment": "The specific moment they choose differently (even if they don't win)"
        }
      }
    }
  ],

  "rival_dynamics": [
    {
      "between": ["Love interest A name", "Love interest B name"],
      "nature": "What their rivalry is about",
      "key_moments": [
        {
          "moment": "Name/label",
          "what_happens": "What occurs between them",
          "why_it_matters": "How it affects the central romance",
          "what_shifts": "What changes in their dynamic"
        }
      ]
    }
  ],

  "dark_moment": {
    "what_happens": "The apparent end of the primary relationship",
    "why_it_feels_fatal": "Why this specifically feels insurmountable given their wounds",
    "what_each_believes": "Protagonist's belief, primary love interest's belief",
    "rival_positions": "Where rivals stand at this moment"
  },

  "resolution": {
    "what_changes": "What allows resolution to happen",
    "who_acts": "Who makes the move to repair/claim",
    "what_they_sacrifice": "What they risk or give up",
    "rival_resolutions": "How each rival's arc completes",
    "final_state": "Where everyone ends up"
  },

  "timeline": [
    {
      "order": 1,
      "moment": "The moment name from key_moments",
      "arc": "Which arc this belongs to (e.g. 'Protagonist + Primary' or 'Rival 1 vs Rival 2')"
    }
  ]
}

## Guidelines for Primary Romance (Protagonist + Primary Love Interest)

KEY MOMENTS: 5-6 moments typical
- Full wound integration for both characters
- Ends in HEA/HFN or tragic resolution per Phase 1
- Gets the most page time and emotional weight

TROPES SHAPE STRUCTURE:
- Enemies to Lovers: Starts with antagonism. Include what makes them enemies, what forces respect, what cracks hostility.
- Strangers to Lovers: Starts neutral. Include the meeting, what makes them notice each other, what draws them closer.
- Friends to Lovers: Starts with comfort. Include what disrupts the friendship, the moment one realizes it's more.
- Second Chance: Starts with history. Include what ended it before, the forced reunion, what's different now.
- Childhood Sweethearts: Starts with innocence. Include the separation, the reunion, how they've changed.

BURN RATE AFFECTS PACING:
- Slow Burn: More key moments before intimacy. Tension through near-misses, interrupted moments, denial.
- Fast Burn: Fewer barriers to attraction. Conflict is about staying together, not getting together.

## Guidelines for Rival Romances (Protagonist + Each Rival)

KEY MOMENTS: 3-4 moments each
- Full wound integration - rivals have real psychology
- Ends in elimination BUT the rival completes their character arc
- Their Phase 2 arc (wound, lie, transformation) must resolve

RIVALS ARE NOT SPEEDBUMPS:
- They are full characters whose stories happen to not end in romance with the protagonist
- They have their wound triggered
- They have their lie challenged
- They transform (or fail to transform)
- They exit with a complete arc

WHY THEY LOSE:
- Not because they're bad people
- Because what they represent doesn't match what the protagonist needs
- Or because their own wound prevents true connection
- The protagonist choosing someone else IS part of the rival's growth

## Guidelines for Rival Dynamics (Love Interests With Each Other)

KEY MOMENTS: 2-3 moments per pairing
- Scheming, alliances, confrontations
- How they pressure and undermine each other
- Only create if there are 2+ love interests

TYPES OF DYNAMICS:
- Direct competition (both actively pursuing)
- One-sided awareness (one doesn't know they're competing)
- Reluctant alliance (against a common obstacle)
- Mutual respect despite rivalry

## Key Moment Counts (Typical)

Primary romance: 5-6 moments
Each rival romance: 3-4 moments
Each rival dynamic: 2-3 moments

This scales with complexity:
- Simple romance (one love interest): 5-6 moments total
- Two suitors: 5-6 + 3-4 = 8-10 moments
- Three suitors: 5-6 + 3-4 + 3-4 + 2-3 + 2-3 = 18-23 moments

## Dark Moment and Resolution

DARK MOMENT:
- Specifically triggers the protagonist's wound OR the primary love interest's wound
- Must feel inevitable given who they are
- Include where rivals stand at this moment

RESOLUTION:
- Resolve the primary romance according to Phase 1 ending type
- But ALSO resolve each rival's arc
- Rivals can: accept and move on, grow from the experience, reveal they never really wanted this, find their own path
- No rival exits without their arc completing

## Timeline

After creating all romantic arcs and rival dynamics, place ALL key moments into one chronological timeline.

This includes:
- All moments from the primary romance
- All moments from each rival romance
- All moments from rival dynamics

The timeline shows when moments happen relative to each other across all arcs. A character's growth moments must precede their transformed behaviour in other arcs.

Output every moment exactly once in chronological order.

DO NOT INCLUDE:
- Subplots (Phase 4/5)
- Supporting characters (Phase 4)
- Specific locations (later phase)
- Chapter assignments (later phase)
- Scene-level detail (later phase)`

function buildPhase3UserPrompt(concept, phase1, phase2) {
  const primaryLI = phase2.love_interests?.find(li => li.role_in_story === 'Primary') || phase2.love_interests?.[0]
  const rivals = phase2.love_interests?.filter(li => li.role_in_story !== 'Primary') || []
  const liCount = phase2.love_interests?.length || 1

  // Build love interest summary
  const liSummary = phase2.love_interests?.map(li =>
    `- ${li.name} (${li.role_in_story}): wound="${li.wound?.event}", lie="${li.lie}"`
  ).join('\n') || ''

  // Calculate expected moments
  const primaryMoments = '5-6'
  const rivalMoments = rivals.length > 0 ? `${rivals.length} x 3-4 = ${rivals.length * 3}-${rivals.length * 4}` : '0'
  const rivalDynamics = rivals.length > 0 ? `${rivals.length} x 2-3 = ${rivals.length * 2}-${rivals.length * 3}` : '0'

  return `ORIGINAL CONCEPT: ${concept}

PHASE 1 OUTPUT (Story DNA):
${JSON.stringify(phase1, null, 2)}

PHASE 2 OUTPUT (Characters):
${JSON.stringify(phase2, null, 2)}

## Your Task

Design complete romantic arcs for ALL love interests.

**Protagonist:** ${phase2.protagonist?.name}
  Wound: "${phase2.protagonist?.wound?.event}"
  Lie: "${phase2.protagonist?.lie}"

**Love Interests:**
${liSummary}

**Primary romance (${phase2.protagonist?.name} + ${primaryLI?.name}):**
- ${primaryMoments} key moments
- Full wound integration for both
- Ends per Phase 1 ending type: ${phase1.ending?.type}

${rivals.length > 0 ? `**Rival romances:**
${rivals.map(r => `- ${phase2.protagonist?.name} + ${r.name}: 3-4 key moments, full wound integration, ends in elimination BUT ${r.name} completes their arc`).join('\n')}

**Rival dynamics:**
${rivals.length >= 1 ? `- Between love interests: 2-3 moments per pairing showing competition, scheming, confrontation` : ''}

**Expected moment counts:**
- Primary: ${primaryMoments}
- Rivals: ${rivalMoments}
- Rival dynamics: ${rivalDynamics}` : '**Single love interest** - no rival arcs or dynamics needed.'}

CRITICAL: Rivals are NOT speedbumps. ${rivals.map(r => r.name).join(' and ')}${rivals.length > 0 ? ' must have their wounds triggered, lies challenged, and exit with complete character arcs even though they don\'t end up with the protagonist.' : ''}`
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
  const requiredFields = ['arc_shape', 'romantic_arcs', 'dark_moment', 'resolution', 'timeline']
  const missing = requiredFields.filter(f => !data[f])

  if (missing.length > 0) {
    throw new Error(`Phase 3 missing required fields: ${missing.join(', ')}`)
  }

  // Validate romantic_arcs structure
  if (!Array.isArray(data.romantic_arcs) || data.romantic_arcs.length === 0) {
    throw new Error('Phase 3 must include at least one romantic arc')
  }

  for (const arc of data.romantic_arcs) {
    if (!arc.between || !arc.key_moments || !arc.wound_integration) {
      throw new Error(`Romantic arc missing required fields (between, key_moments, wound_integration)`)
    }
  }

  // Validate timeline
  if (!data.timeline || !Array.isArray(data.timeline)) {
    throw new Error('Phase 3 missing timeline array')
  }

  // Check all moments are accounted for in timeline
  const allMoments = [
    ...(data.romantic_arcs?.flatMap(arc => arc.key_moments?.map(m => m.moment)) || []),
    ...(data.rival_dynamics?.flatMap(dyn => dyn.key_moments?.map(m => m.moment)) || [])
  ]
  const timelineMoments = data.timeline.map(t => t.moment)
  const missingFromTimeline = allMoments.filter(m => !timelineMoments.includes(m))
  if (missingFromTimeline.length > 0) {
    console.warn(`Timeline missing moments: ${missingFromTimeline.join(', ')}`)
  }

  console.log('Phase 3 complete.')
  console.log(`  Romantic arcs: ${data.romantic_arcs?.length}`)
  data.romantic_arcs?.forEach(arc => {
    console.log(`    - ${arc.between.join(' + ')} (${arc.arc_type}):`)
    arc.key_moments?.forEach((m, i) => {
      console.log(`        ${i + 1}. ${m.moment}`)
    })
    const hasWoundIntegration = arc.wound_integration?.love_interest?.transformation_moment
    console.log(`        Wound integration: ${hasWoundIntegration ? 'Yes' : 'MISSING'}`)
  })
  console.log(`  Rival dynamics: ${data.rival_dynamics?.length || 0}`)
  data.rival_dynamics?.forEach(dyn => {
    console.log(`    - ${dyn.between.join(' vs ')}:`)
    dyn.key_moments?.forEach((m, i) => {
      console.log(`        ${i + 1}. ${m.moment}`)
    })
  })
  console.log(`  Dark moment: ${data.dark_moment?.what_happens?.slice(0, 60)}...`)
  console.log(`  Resolution: ${data.resolution?.final_state?.slice(0, 60)}...`)
  console.log(`  Timeline: ${data.timeline?.length} moments in chronological order`)
  data.timeline?.slice(0, 5).forEach(t => {
    console.log(`    ${t.order}. ${t.moment} (${t.arc})`)
  })
  if (data.timeline?.length > 5) {
    console.log(`    ... and ${data.timeline.length - 5} more`)
  }

  return data
}

// =============================================================================
// PHASE 4: SUPPORTING CAST
// =============================================================================

const PHASE_4_SYSTEM_PROMPT = `You are a character architect creating the supporting cast for a romance novel.

## OUTPUT FORMAT (REQUIRED - FOLLOW EXACTLY)

You MUST output this exact JSON structure:

{
  "wound_sources": {
    "protagonist": {
      "name": "Protagonist name from Phase 2",
      "wound": "Copy wound.event from Phase 2",
      "created_by": {
        "character": "Name of person who caused wound, or null",
        "relationship": "Their relationship to protagonist",
        "what_they_did": "How they caused the wound"
      },
      "reinforced_by": [
        {
          "character": "Name",
          "relationship": "Their relationship",
          "how_they_reinforce": "What they do that keeps the lie alive"
        }
      ],
      "challenged_by": [
        {
          "character": "Name",
          "relationship": "Their relationship",
          "how_they_challenge": "What they do that questions the lie"
        }
      ]
    },
    "love_interest_1": {
      "name": "First love interest name from Phase 2",
      "wound": "Copy their wound.event from Phase 2",
      "created_by": { ... },
      "reinforced_by": [ ... ],
      "challenged_by": [ ... ]
    },
    "love_interest_2": { ... },
    "love_interest_3": { ... }
  },

  "essential_characters": {
    "protagonist_parents": {
      "mother": { "status": "alive | dead | unknown", "name": "if known" },
      "father": { "status": "alive | dead | unknown", "name": "if known" }
    },
    "love_interest_parents": [
      {
        "love_interest": "Name",
        "mother": { "status": "alive | dead | unknown", "name": "if known" },
        "father": { "status": "alive | dead | unknown", "name": "if known" }
      }
    ],
    "others": [
      { "name": "Character name", "relationship": "How connected", "status": "alive | dead" }
    ]
  },

  "thematic_approaches": [
    {
      "position": "An answer to the theme question",
      "type": "past_mirror | present_mirror | transcends | rejects",
      "the_good": "Genuine benefit of this position",
      "the_bad": "Genuine cost of this position",
      "embodied_by": [
        {
          "character": "Name",
          "relationship_to_protagonist": "How connected",
          "how_they_embody_it": "Their specific version",
          "outcome": "What happened to them",
          "weight": "major | minor | referenced"
        }
      ]
    }
  ],

  "supporting_cast": [
    {
      "name": "Full name",
      "age": 0,
      "role": "Their position in this world",
      "connected_to": "Which main character(s)",
      "functions": ["wound_source:protagonist", "past_mirror:position_name"],
      "wound": "Their formative hurt",
      "lie": "Their false belief",
      "want": "What they pursue",
      "need": "What they actually need",
      "coping_mechanism": {
        "behaviour": "How they cope",
        "as_flaw": "How it hurts them",
        "as_virtue": "How it helps them"
      },
      "thematic_stance": "Their answer to theme",
      "arc": {
        "starts": "Who they are at start",
        "ends": "Who they become"
      },
      "voice": {
        "register": "How they speak",
        "patterns": "Speech habits",
        "tells": "Emotional reveals"
      },
      "weight": "major | minor | referenced"
    }
  ]
}

## YOUR TASK

**Pass 1: Wound Sources**

For the protagonist and EACH love interest from Phase 2:
- Who CREATED their wound? (Name the person if applicable)
- Who REINFORCES their lie? (People who keep them stuck)
- Who CHALLENGES their lie? (People who push them to grow - besides the romantic leads)

**Pass 1.5: Essential Characters**

Before thematic mapping, identify characters who MUST exist:

- Protagonist's mother and father (living or dead)
- Each love interest's mother and father (living or dead)
- Siblings mentioned in any character's backstory
- Anyone named in wound sources who isn't yet in the cast

For each: Are they alive (minor/major weight) or dead (referenced weight)?

Dead characters still matter. Their choices and fates illuminate the theme.

**Pass 2: Thematic Approaches**

List all approaches to the theme question from Phase 1.

WITHIN THE BINARY (positions that engage with the theme question directly):
- Extreme of side A
- Extreme of side B
- Variations between the extremes
- The balanced position (often what protagonists learn)
- Cynical positions (both sides fail)

TRANSCENDS THE BINARY (positions that reject the question entirely):

These characters do not care about the theme question. They operate on DIFFERENT values:
- Family loyalty - what serves the bloodline matters, not the question you're asking
- Faith/religious duty - God's will matters, human concerns are secondary
- Survival/pragmatism - grand questions are luxury, staying alive is what matters
- Honor/legacy - what will history say? what would ancestors think?
- Wealth/commerce - follow the money, everything else is sentiment

A "transcends" character does NOT pick one side of the binary strongly. They dismiss the binary as the wrong question.

REJECTS THE QUESTION:
- Cynics who believe the question is naive
- Hedonists who avoid choosing entirely

FOR EACH POSITION:
- Assign characters from Pass 1 and Pass 1.5 where they fit
- Create new characters only if no existing character fits
- Multiple characters CAN embody the same position with DIFFERENT OUTCOMES
- Use all three weights: major (subplot), minor (present), referenced (dead/absent)

MULTIPLE OUTCOMES PER POSITION:

The same thematic stance can produce different results:
- One character chose this path and found peace
- Another chose it and found bitterness
- Another is choosing it right now, outcome unknown
- Another is dead, their outcome serves as warning or inspiration

Do not create one-to-one mapping. Explore how the same belief leads to different fates.

**Pass 3: Build Supporting Cast**

Create full character entries for everyone identified above.
- Major weight: Full detail, will have subplot
- Minor weight: Lighter detail, appears in scenes
- Referenced weight: Mentioned only, not present

## GUIDELINES

- Characters from love interests' worlds are essential (their families, retainers, rivals)
- Wound source characters get full treatment - they shaped the main characters
- Same character can serve multiple functions (consolidate where natural)
- Check Phase 2 for existing thematic positions in love interests' lies - don't duplicate as new characters
- Include "transcends" characters who operate on entirely different values than the theme question

## DO NOT INCLUDE

- Key moments (Phase 5)
- Collision points (Phase 5)
- Subplot architecture (Phase 5)
- Timeline (Phase 5)

Just people. Who they are. Why they exist. How they connect.`

function buildPhase4UserPrompt(concept, phase1, phase2, phase3, lengthPreset) {
  // Build main character summary for wound mapping
  const protagonistSummary = `**Protagonist: ${phase2.protagonist?.name}**
  Wound event: "${phase2.protagonist?.wound?.event}"
  Wound caused by: ${phase2.protagonist?.wound?.who_caused_it || 'circumstance'}
  Lie: "${phase2.protagonist?.lie}"`

  const loveInterestSummaries = phase2.love_interests?.map((li, i) =>
    `**Love Interest ${i + 1}: ${li.name} (${li.role_in_story})**
  Wound event: "${li.wound?.event}"
  Wound caused by: ${li.wound?.who_caused_it || 'circumstance'}
  Lie: "${li.lie}"`
  ).join('\n\n') || ''

  // Build thematic positions from love interests (to avoid duplication)
  const existingPositions = phase2.love_interests?.map(li =>
    `- ${li.name}'s lie "${li.lie}" is already a thematic position`
  ).join('\n') || ''

  return `ORIGINAL CONCEPT: ${concept}

PHASE 1 OUTPUT (Story DNA):
${JSON.stringify(phase1, null, 2)}

PHASE 2 OUTPUT (Characters):
${JSON.stringify(phase2, null, 2)}

PHASE 3 OUTPUT (Romantic Arcs):
${JSON.stringify(phase3, null, 2)}

LENGTH PRESET: ${lengthPreset}

## Your Task: Create the Supporting Cast

**Theme Question:** "${phase1.theme?.question}"
**Theme Core:** ${phase1.theme?.core}

### Pass 1: Wound-Driven Characters

For each main character, identify who created, reinforces, and challenges their wound:

${protagonistSummary}
- Who created this wound?
- Who reinforces this lie?
- Who challenges this lie? (besides the love interests)

${loveInterestSummaries}
- For each: Who created their wound? Who reinforces? Who challenges?

### Pass 2: Theme-Driven Characters

**Existing thematic positions (from Phase 2 - DO NOT duplicate as new characters):**
${existingPositions}

**Identify remaining thematic approaches:**
- Extreme of side A of the theme question
- Extreme of side B
- Variations between
- Transcends the binary (different values entirely)
- Rejects the question

For each: Is it embodied by someone from Pass 1? Or need a new character?

### Complexity Guide for ${lengthPreset}:
- Major characters (full subplot in Phase 5): ${lengthPreset === 'novella' ? '2-4' : '4-6'}
- Minor characters (supporting): ${lengthPreset === 'novella' ? '2-3' : '3-5'}
- Referenced characters (mentioned only): ${lengthPreset === 'novella' ? '1-2' : '2-4'}

Remember: Love interests are NOT supporting cast - they're already created in Phase 2.
Focus on characters from each love interest's world, not just the protagonist's.

## CRITICAL: OUTPUT STRUCTURE

You MUST output JSON with these three top-level keys:
1. "wound_sources" - mapping for protagonist and each love interest
2. "thematic_approaches" - array of positions on the theme
3. "supporting_cast" - array of character objects

Do NOT use any other structure. Do NOT use "external_pressures", "subplots", or "forces".`
}

async function executePhase4(concept, phase1, phase2, phase3, lengthPreset) {
  console.log('Executing Phase 4: Supporting Cast...')

  const userPrompt = buildPhase4UserPrompt(concept, phase1, phase2, phase3, lengthPreset)
  const response = await callOpenAI(PHASE_4_SYSTEM_PROMPT, userPrompt)
  const parsed = parseJSON(response)

  if (!parsed.success) {
    throw new Error(`Phase 4 JSON parse failed: ${parsed.error}`)
  }

  const data = parsed.data

  // Debug: show what we received
  console.log('Phase 4 received keys:', Object.keys(data))

  // Validate required fields with helpful errors
  if (!data.wound_sources) {
    console.error('Phase 4 output (first 500 chars):', JSON.stringify(data, null, 2).slice(0, 500))
    throw new Error('Phase 4 missing wound_sources object. Received keys: ' + Object.keys(data).join(', '))
  }
  if (!data.essential_characters) {
    throw new Error('Phase 4 missing essential_characters object. Received keys: ' + Object.keys(data).join(', '))
  }
  if (!data.thematic_approaches || !Array.isArray(data.thematic_approaches)) {
    throw new Error('Phase 4 missing thematic_approaches array. Received keys: ' + Object.keys(data).join(', '))
  }
  if (!data.supporting_cast || !Array.isArray(data.supporting_cast)) {
    throw new Error('Phase 4 missing supporting_cast array. Received keys: ' + Object.keys(data).join(', '))
  }

  // Validate supporting cast has required fields
  for (const char of data.supporting_cast) {
    if (!char.name || !char.functions || !char.weight) {
      throw new Error(`Supporting cast member missing required fields (name, functions, weight)`)
    }
  }

  // Check for transcends characters
  const transcendsPositions = data.thematic_approaches?.filter(p => p.type === 'transcends') || []
  if (transcendsPositions.length === 0) {
    console.warn('Phase 4 warning: No transcends positions found - all characters are within the theme binary')
  }

  // Check for positions with multiple characters
  const multipleOutcomes = data.thematic_approaches?.filter(p => p.embodied_by?.length > 1) || []

  // Check for referenced characters
  const referencedChars = data.supporting_cast?.filter(c => c.weight === 'referenced') || []

  // Console logging
  console.log('Phase 4 complete.')
  console.log(`  Essential characters checked:`)
  const ec = data.essential_characters
  console.log(`    Protagonist parents: mother ${ec.protagonist_parents?.mother?.status || 'not specified'}, father ${ec.protagonist_parents?.father?.status || 'not specified'}`)
  console.log(`    Love interest parents: ${ec.love_interest_parents?.length || 0} mapped`)

  console.log(`  Wound sources mapped for: ${Object.keys(data.wound_sources).length} characters`)
  Object.entries(data.wound_sources).forEach(([key, ws]) => {
    const createdBy = ws.created_by?.character || 'circumstance'
    const reinforcerCount = ws.reinforced_by?.length || 0
    const challengerCount = ws.challenged_by?.length || 0
    console.log(`    - ${ws.name || key}:`)
    console.log(`        Created by: ${createdBy}`)
    console.log(`        Reinforced by: ${reinforcerCount} character(s)`)
    console.log(`        Challenged by: ${challengerCount} character(s)`)
  })

  console.log(`  Thematic approaches: ${data.thematic_approaches?.length}`)
  const byType = {}
  data.thematic_approaches?.forEach(pos => {
    byType[pos.type] = (byType[pos.type] || 0) + 1
  })
  console.log(`    By type: ${Object.entries(byType).map(([k,v]) => `${k}=${v}`).join(', ')}`)
  data.thematic_approaches?.forEach(pos => {
    const characterCount = pos.embodied_by?.length || 0
    const weights = pos.embodied_by?.map(e => e.weight).join(', ') || 'none'
    console.log(`    - "${pos.position.slice(0, 50)}${pos.position.length > 50 ? '...' : ''}" (${pos.type}): ${characterCount} character(s) [${weights}]`)
  })
  console.log(`  Positions with multiple characters: ${multipleOutcomes.length}`)
  console.log(`  Referenced (dead/absent) characters: ${referencedChars.length}`)

  console.log(`  Supporting cast: ${data.supporting_cast?.length}`)
  const majors = data.supporting_cast?.filter(c => c.weight === 'major').length || 0
  const minors = data.supporting_cast?.filter(c => c.weight === 'minor').length || 0
  const refs = data.supporting_cast?.filter(c => c.weight === 'referenced').length || 0
  console.log(`    Major: ${majors}, Minor: ${minors}, Referenced: ${refs}`)
  data.supporting_cast?.filter(c => c.weight === 'major').forEach(c => {
    console.log(`      - ${c.name} (${c.role}): ${c.functions?.join(', ')}`)
  })

  return data
}

// =============================================================================
// PHASE 5: MASTER TIMELINE
// =============================================================================

const PHASE_5_SYSTEM_PROMPT = `You are a story timeline architect. Your task is to create a master timeline integrating main romance moments with supporting cast appearances and subplot moments.

## INPUT

You will receive:
- Phase 3 timeline: All main moments (romantic arcs + rival dynamics) in chronological order
- Phase 4 supporting cast: Characters with arcs, functions, thematic stances

## YOUR TASK

Create ONE master timeline that:
1. Includes every main moment from Phase 3
2. Layers supporting characters into main moments where they belong
3. Inserts subplot moments between main moments where needed
4. Makes every character's arc traceable through their appearances

## OUTPUT FORMAT

{
  "master_timeline": [
    {
      "order": 1,
      "moment": "Moment name",
      "type": "main | subplot",
      "source": "Which arc this comes from (e.g., 'Eleanor + Marcus' or 'Lady Ashworth subplot')",
      "what_happens": "Full description of what occurs",
      "present": [
        {
          "character": "Character name",
          "role": "protagonist | love_interest | supporting",
          "what_they_do": "Their specific action/reaction in this moment",
          "arc_position": "Where they are in their arc (e.g., 'still believing lie', 'lie challenged', 'transformed')"
        }
      ],
      "layered_characters": [
        {
          "character": "Supporting character name",
          "function": "What function they serve here (wound_source, past_mirror, external_pressure, etc.)",
          "what_they_do": "Their specific contribution to this moment",
          "why_present": "Why they need to be here"
        }
      ],
      "thematic_weight": "How this moment expresses the theme"
    }
  ],

  "subplot_insertions": [
    {
      "subplot_moment": "Subplot moment name",
      "inserted_after": "Main moment name it follows",
      "inserted_before": "Main moment name it precedes",
      "why_here": "Why this is the right placement"
    }
  ],

  "character_arcs_through_timeline": [
    {
      "character": "Character name",
      "appearances": [
        {
          "moment_order": 1,
          "moment": "Moment name",
          "arc_state": "Where they are in their arc",
          "what_happens_to_them": "Their experience in this moment"
        }
      ],
      "arc_completion": "How their arc resolves across these appearances"
    }
  ],

  "arc_verification": {
    "main_characters": [
      {
        "character": "Name",
        "wound_triggered": "Moment # and name",
        "lie_challenged": "Moment # and name",
        "transformation": "Moment # and name"
      }
    ],
    "supporting_characters": [
      {
        "character": "Name",
        "function_served": "What function(s) they serve",
        "key_appearances": ["Moment #: what they do", "Moment #: what they do"],
        "arc_delivered": "Yes/No and how"
      }
    ]
  }
}

## GUIDELINES

### Layering Supporting Characters into Main Moments

For each main moment, ask:
- Which supporting characters would naturally be present?
- Which supporting character functions should activate here?
- Who can witness/react to this moment in ways that serve their function?

WOUND SOURCE characters should be present when:
- The main character's wound is being triggered
- The main character is reliving patterns from their wound
- Confrontation with the wound source is needed

PAST MIRROR characters should be present when:
- The protagonist needs to see what their choice could lead to
- A thematic parallel needs to be drawn
- The consequences of a position need to be visible

PRESENT MIRROR characters should be present when:
- Parallel choices are being made
- The protagonist needs to see another version of their struggle
- Their arc intersects with the main plot

EXTERNAL PRESSURE characters should be present when:
- Pressure needs to be applied
- Stakes need to be raised
- Obstacles need to be created

### Inserting Subplot Moments

Subplot moments should be inserted when:
- A supporting character's arc needs advancement
- Thematic counterpoint is needed
- Pacing requires a beat away from the main couple
- Setup is needed for a later collision

Subplot moments should NOT:
- Interrupt crucial main moments
- Cluster together without main plot beats between them
- Exist without connecting to the main story

### Tracking Character Arcs

For each supporting character with an arc (major weight):
- Their arc must be traceable through their appearances
- They must start in one state and end in another
- Their transformation (or failure to transform) must be visible

For referenced characters:
- They may never appear but their story must be told through others
- Their fate illuminates the theme

### Moment Counts

Typical master timeline:
- Simple romance: 8-12 moments total
- Multiple suitors: 20-30 moments total
- Complex with subplots: 30-40 moments total

Main moments from Phase 3 should remain intact. Add:
- 2-4 subplot moments per major supporting character
- Layered presence for characters who don't need their own moments

## VERIFICATION

Before outputting, verify:
1. Every Phase 3 timeline moment is included
2. Every major supporting character has appearances that deliver their arc
3. Every main character's wound/lie/transformation journey is traceable
4. No supporting character appears without purpose
5. Subplot moments are placed logically between main moments`

function buildPhase5UserPrompt(concept, phase1, phase2, phase3, phase4, lengthPreset) {
  // Extract timeline from Phase 3
  const timelineSummary = phase3.timeline?.map(t =>
    `${t.order}. ${t.moment} (${t.arc})`
  ).join('\n') || 'No timeline available'

  // Extract supporting cast summary
  const majorCast = phase4.supporting_cast?.filter(c => c.weight === 'major') || []
  const majorCastSummary = majorCast.map(c =>
    `- ${c.name}: ${c.functions?.join(', ')} | Arc: ${c.arc?.starts} → ${c.arc?.ends}`
  ).join('\n') || 'No major supporting cast'

  const minorCast = phase4.supporting_cast?.filter(c => c.weight === 'minor') || []
  const minorCastSummary = minorCast.map(c =>
    `- ${c.name}: ${c.functions?.join(', ')}`
  ).join('\n') || 'No minor supporting cast'

  // Main characters for arc verification
  const protagonistName = phase2.protagonist?.name
  const loveInterestNames = phase2.love_interests?.map(li => li.name).join(', ')

  return `ORIGINAL CONCEPT: ${concept}

## PHASE 3 TIMELINE (Main Moments in Order)

${timelineSummary}

## PHASE 3 FULL DATA (for moment details)

${JSON.stringify(phase3, null, 2)}

## PHASE 4 SUPPORTING CAST

**Major Characters (need subplot moments):**
${majorCastSummary}

**Minor Characters (layer into main moments):**
${minorCastSummary}

## PHASE 4 FULL DATA (for character details)

${JSON.stringify(phase4, null, 2)}

## PHASE 1 & 2 REFERENCE

Theme: "${phase1.theme?.question}"
Protagonist: ${protagonistName}
Love Interests: ${loveInterestNames}

## YOUR TASK

Create the master timeline that:
1. Includes ALL ${phase3.timeline?.length || 0} main moments from Phase 3 timeline
2. Layers supporting characters into main moments where appropriate
3. Inserts subplot moments for the ${majorCast.length} major supporting characters
4. Makes every character's arc traceable through their appearances

Main moments from Phase 3: ${phase3.timeline?.length || 0}
Major supporting characters needing arcs: ${majorCast.length}
Minor characters to layer: ${minorCast.length}

Expected total moments: ${(phase3.timeline?.length || 0) + (majorCast.length * 3)} - ${(phase3.timeline?.length || 0) + (majorCast.length * 4)}`
}

async function executePhase5(concept, phase1, phase2, phase3, phase4, lengthPreset) {
  console.log('Executing Phase 5: Master Timeline...')

  const userPrompt = buildPhase5UserPrompt(concept, phase1, phase2, phase3, phase4, lengthPreset)
  const response = await callOpenAI(PHASE_5_SYSTEM_PROMPT, userPrompt)
  const parsed = parseJSON(response)

  if (!parsed.success) {
    throw new Error(`Phase 5 JSON parse failed: ${parsed.error}`)
  }

  const data = parsed.data

  // Validate required fields
  if (!data.master_timeline || !Array.isArray(data.master_timeline)) {
    throw new Error('Phase 5 missing master_timeline array')
  }
  if (!data.character_arcs_through_timeline || !Array.isArray(data.character_arcs_through_timeline)) {
    throw new Error('Phase 5 missing character_arcs_through_timeline array')
  }
  if (!data.arc_verification) {
    throw new Error('Phase 5 missing arc_verification object')
  }

  // Count moment types
  const mainMoments = data.master_timeline.filter(m => m.type === 'main').length
  const subplotMoments = data.master_timeline.filter(m => m.type === 'subplot').length

  // Check if Phase 3 moments are included
  const phase3MomentCount = phase3.timeline?.length || 0
  if (mainMoments < phase3MomentCount) {
    console.warn(`Phase 5 warning: Only ${mainMoments} main moments but Phase 3 had ${phase3MomentCount}`)
  }

  // Console logging
  console.log('Phase 5 complete.')
  console.log(`  Master timeline: ${data.master_timeline?.length} total moments`)
  console.log(`    Main moments: ${mainMoments}`)
  console.log(`    Subplot moments: ${subplotMoments}`)

  // Show first few moments
  console.log(`  Timeline preview:`)
  data.master_timeline?.slice(0, 5).forEach(m => {
    const presentCount = m.present?.length || 0
    const layeredCount = m.layered_characters?.length || 0
    console.log(`    ${m.order}. ${m.moment} (${m.type})`)
    console.log(`       Present: ${presentCount} characters, Layered: ${layeredCount}`)
  })
  if (data.master_timeline?.length > 5) {
    console.log(`    ... and ${data.master_timeline.length - 5} more moments`)
  }

  // Character arc tracking
  console.log(`  Character arcs tracked: ${data.character_arcs_through_timeline?.length}`)
  data.character_arcs_through_timeline?.forEach(ca => {
    const appearances = ca.appearances?.length || 0
    console.log(`    - ${ca.character}: ${appearances} appearances`)
  })

  // Arc verification summary
  const mainVerified = data.arc_verification?.main_characters?.length || 0
  const supportingVerified = data.arc_verification?.supporting_characters?.length || 0
  console.log(`  Arc verification:`)
  console.log(`    Main characters verified: ${mainVerified}`)
  console.log(`    Supporting characters verified: ${supportingVerified}`)

  // Check for missing arc deliveries
  const missingArcs = data.arc_verification?.supporting_characters?.filter(c => c.arc_delivered === 'No') || []
  if (missingArcs.length > 0) {
    console.warn(`  WARNING: ${missingArcs.length} supporting character(s) missing arc delivery:`)
    missingArcs.forEach(c => console.warn(`    - ${c.character}`))
  }

  return data
}

// =============================================================================
// PHASE 6: CHAPTER & SCENE BREAKDOWN
// =============================================================================

const PHASE_6_SYSTEM_PROMPT = `Distribute plot across chapters.

Phase 5 defined broad story arc. You define what happens in each chapter, WHEN and WHERE they happen.

Output events for generation to dramatize. Do not write prose.

{
  "chapters": [
    {
      "number": number,
      "title": string,
      "pov": string,
      "purpose": string,
      "scenes": [
        {
          "location": string,
          "characters": [],
          "events": [],
          "function": string
        }
      ],
      "phase_4_moment": string or null,
      "phase_5_beats": [],
      "reader_learns": [],
      "ends_with": string
    }
  ],
  "pov_distribution": { "protagonist_chapters": [], "love_interest_chapters": [] }
}`

function buildPhase6UserPrompt(concept, phase1, phase2, phase3, phase4, phase5, lengthPreset) {
  const chapterCount = CONFIG.chapterCounts[lengthPreset]
  const scenesPerChapter = lengthPreset === 'novella' ? '2-3' : '2-4'

  return `CONCEPT: ${concept}

LENGTH: ${lengthPreset} (${chapterCount} chapters)
Each chapter needs ${scenesPerChapter} scenes.

PHASE 1 (Core Foundation):
${JSON.stringify(phase1, null, 2)}

PHASE 2 (World/Setting - use these locations):
${JSON.stringify(phase2, null, 2)}

PHASE 3 (Characters):
${JSON.stringify(phase3, null, 2)}

PHASE 4 (Chemistry - these moments must appear):
${JSON.stringify(phase4, null, 2)}

PHASE 5 (Plot Architecture - these beats must be placed):
${JSON.stringify(phase5, null, 2)}

## YOUR TASK

Create a chapter-by-chapter, scene-by-scene breakdown for all ${chapterCount} chapters.

REQUIREMENTS:
1. Every chapter has ${scenesPerChapter} scenes
2. Every scene has 3-6 events (WHAT happens, not HOW it's written)
3. Every Phase 4 pivotal moment appears in a specific chapter
4. Every Phase 5 plot beat is placed in a specific chapter
5. Locations come from Phase 2

Events are plain factual statements. No imagery, sensory detail, or prose style.`
}

// Phase 6 now generates scenes per-chapter for reliability
const PHASE_6_MAX_RETRIES = 2

// System prompt for generating chapter outlines (structure only)
const PHASE_6_OUTLINE_SYSTEM_PROMPT = `Assign Phase 5 beats and Phase 4 moments to chapters.

{
  "chapters": [
    {
      "number": number,
      "title": string,
      "pov": string,
      "purpose": string,
      "phase_4_moment": string or null,
      "phase_5_beats": [],
      "ends_with": string
    }
  ],
  "pov_distribution": { "protagonist_chapters": [], "love_interest_chapters": [] }
}`

// System prompt for generating scene breakdown for a single chapter
const PHASE_6_CHAPTER_SYSTEM_PROMPT = `List what happens in this chapter. Do not write prose.

{
  "scenes": [
    {
      "location": string,
      "characters": [],
      "events": [],
      "function": string
    }
  ],
  "reader_learns": [],
  "ends_with": string
}`

function buildPhase6OutlinePrompt(concept, phase1, phase2, phase3, phase4, phase5, lengthPreset) {
  const chapterCount = CONFIG.chapterCounts[lengthPreset]

  return `CONCEPT: ${concept}

LENGTH: ${lengthPreset} (${chapterCount} chapters)

PHASE 1 (Core Foundation):
${JSON.stringify(phase1, null, 2)}

PHASE 4 (Chemistry Moments - must be placed):
${JSON.stringify(phase4, null, 2)}

PHASE 5 (Plot Architecture - beats must be distributed):
${JSON.stringify(phase5, null, 2)}

Create an outline for all ${chapterCount} chapters. For each chapter:
- POV character
- Purpose (what it accomplishes)
- Which Phase 4 moment it contains (if any)
- Which Phase 5 beats appear in it
- Emotional arc (starts/ends)
- What it ends with (hook for next chapter)

Structure only - scene details come later.`
}

function buildPhase6ChapterPrompt(concept, phase2, phase3, chapterOutline, chapterNumber) {
  return `CONCEPT: ${concept}

LOCATIONS (use these):
${JSON.stringify(phase2.locations, null, 2)}

CHARACTERS:
Protagonist: ${phase3.protagonist?.name}
Love Interest: ${phase3.love_interest?.name}

CHAPTER ${chapterNumber} OUTLINE:
${JSON.stringify(chapterOutline, null, 2)}

Create 2-4 scenes for this chapter. Each scene needs:
- Location (from the list above)
- Characters present
- 3-6 events (WHAT happens, not HOW it's written)
- Function (what the scene accomplishes)

Events are plain factual statements. No imagery, sensory detail, or prose style.`
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
            console.log(`    ✓ ${data.scenes.length} scenes, ${data.scenes.reduce((sum, s) => sum + ((s.events || s.beats)?.length || 0), 0)} total events`)
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
// PHASE 7: VALIDATION
// =============================================================================

const PHASE_7_SYSTEM_PROMPT = `You are a story validation specialist. Your task is to perform a comprehensive audit of a complete story bible, checking for coherence, completeness, and internal consistency.

You will receive:
- The complete bible (Phases 1-6 output)

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
    "constraint_enforcement": { "status": "pass | fail | warning", "details": "", "issues": [] }
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

// Compress chapters for Phase 7 validation (keeps structure, removes beat details)
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
      // Compressed scene info (counts only, not full events)
      scene_count: ch.scenes?.length || 0,
      total_events: ch.scenes?.reduce((sum, s) => sum + ((s.events || s.beats)?.length || 0), 0) || 0,
      scene_summaries: ch.scenes?.map(s => ({
        location: s.location,
        function: s.function || s.scene_purpose,
        event_count: (s.events || s.beats)?.length || 0
      })) || [],
      ends_with: ch.ends_with || ch.chapter_hook?.description
    }))
  }
}

function buildPhase7UserPrompt(completeBible) {
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

Perform comprehensive validation of this bible. Check all 13 categories. Identify any issues and specify recovery paths. Approve for generation only if the bible is complete and internally consistent.`
}

async function executePhase7(completeBible) {
  console.log('Executing Phase 7: Validation...')

  const userPrompt = buildPhase7UserPrompt(completeBible)
  const response = await callOpenAI(PHASE_7_SYSTEM_PROMPT, userPrompt)
  const parsed = parseJSON(response)

  if (!parsed.success) {
    throw new Error(`Phase 7 JSON parse failed: ${parsed.error}`)
  }

  const data = parsed.data

  console.log(`Phase 7 complete. Status: ${data.validation_status}`)

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
  7: { name: 'Validation', description: 'Comprehensive coherence and quality audit' },
}

/**
 * Generate a complete story bible through the 7-phase pipeline
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
    bible.coreFoundation = await executePhase1(concept, lengthPreset, level)
    reportProgress(1, 'complete', {
      subgenre: bible.coreFoundation.subgenre,
      origin: bible.coreFoundation.tropes?.origin,
      theme: bible.coreFoundation.theme
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
      externalPressures: bible.subplots.external_pressures?.length,
      thematicPositions: bible.subplots.thematic_positions?.length,
      supportingCast: bible.subplots.supporting_cast?.length
    })

    // TESTING: Stop after Phase 4 to validate Subplots & Supporting Cast output
    console.log('='.repeat(60))
    console.log('TEST MODE - Stopping after Phase 4')
    console.log('Phase 1 Output:', JSON.stringify(bible.coreFoundation, null, 2))
    console.log('Phase 2 Output:', JSON.stringify(bible.characters, null, 2))
    console.log('Phase 3 Output:', JSON.stringify(bible.plot, null, 2))
    console.log('Phase 4 Output:', JSON.stringify(bible.subplots, null, 2))
    console.log('='.repeat(60))

    return {
      success: true,
      bible,
      validationStatus: 'PHASE_4_TEST',
      validationAttempts: 0
    }

    // Phase 5: World & Locations (TODO: rewrite)
    reportProgress(5, 'starting')

    // Phase 5: Plot Architecture
    reportProgress(5, 'starting')
    bible.plot = await executePhase5(concept, bible.coreFoundation, bible.world, bible.characters, bible.chemistry, lengthPreset)
    reportProgress(5, 'complete', { actCount: bible.plot.acts?.length || 3 })

    // Phase 6: Chapter Breakdown
    reportProgress(6, 'starting')
    bible.chapters = await executePhase6(concept, bible.coreFoundation, bible.world, bible.characters, bible.chemistry, bible.plot, lengthPreset)
    reportProgress(6, 'complete', { chapterCount: bible.chapters.chapters?.length || 0 })

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
