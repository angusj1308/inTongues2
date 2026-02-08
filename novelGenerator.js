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
  const { maxRetries = CONFIG.maxRetries, model = CONFIG.model } = options
  const maxTokens = options.maxTokens ?? CONFIG.maxTokens

  // Use streaming for large token requests (over 16384)
  const useStreaming = maxTokens > 16384

  let lastError = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (useStreaming) {
        // Streaming request for large token counts
        let fullText = ''
        let charCount = 0
        const stream = getAnthropicClient().messages.stream({
          model: model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
          temperature: options.temperature ?? CONFIG.temperature
        })

        process.stdout.write('  Streaming response: ')
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta?.text) {
            fullText += event.delta.text
            charCount += event.delta.text.length
            // Print a dot every 2000 characters
            if (charCount >= 2000) {
              process.stdout.write('.')
              charCount = 0
            }
          }
        }
        console.log(` done (${fullText.length} chars)`)

        if (!fullText) {
          throw new Error('No text content in streaming response')
        }
        return fullText

      } else {
        // Non-streaming request (existing code)
        const response = await getAnthropicClient().messages.create({
          model: model,
          max_tokens: maxTokens,
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
      }
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
      try {
        return { success: true, data: JSON.parse(extracted) }
      } catch (e) {
        // Markdown extraction failed, continue to Method 3
      }
    }

    // Method 3: Find JSON object/array by looking for { or [ at start
    const jsonStartObj = content.indexOf('{')
    const jsonStartArr = content.indexOf('[')
    const jsonStart = jsonStartObj === -1 ? jsonStartArr :
                      jsonStartArr === -1 ? jsonStartObj :
                      Math.min(jsonStartObj, jsonStartArr)

    if (jsonStart !== -1) {
      // Find the matching closing bracket, accounting for strings
      const isArray = content[jsonStart] === '['
      const openBracket = isArray ? '[' : '{'
      const closeBracket = isArray ? ']' : '}'

      let depth = 0
      let inString = false
      let jsonEnd = -1

      for (let i = jsonStart; i < content.length; i++) {
        const char = content[i]
        const prevChar = i > 0 ? content[i - 1] : ''

        // Handle string boundaries (but not escaped quotes)
        if (char === '"' && prevChar !== '\\') {
          inString = !inString
          continue
        }

        // Only count brackets outside of strings
        if (!inString) {
          if (char === openBracket) depth++
          if (char === closeBracket) depth--
          if (depth === 0) {
            jsonEnd = i + 1
            break
          }
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
Pick two values from this list that best represent the protagonist's central conflict — the two things they are torn between:

Accountability, Acceptance, Adventure, Ambition, Authenticity, Charity, Chivalry, Commitment, Community, Compassion, Connection, Courage, Creativity, Curiosity, Devotion, Dignity, Discipline, Duty, Empathy, Equality, Faith, Fairness, Family, Forgiveness, Freedom, Generosity, Grace, Gratitude, Grit, Hard Work, Harmony, Honor, Honesty, Hope, Hospitality, Humility, Independence, Integrity, Justice, Kindness, Legacy, Liberty, Love, Loyalty, Mastery, Mercy, Moderation, Obedience, Passion, Patience, Peace, Perseverance, Power, Protection, Respect, Responsibility, Sacrifice, Safety, Security, Self-Reliance, Service, Simplicity, Stability, Stewardship, Strength, Tradition, Trust, Truth, Unity, Wisdom

- Format: "X vs Y" (e.g., "duty vs love", "loyalty vs justice", "security vs freedom")
- Both values must be genuinely defensible — neither is simply wrong
- The protagonist is torn between these two values — this is the core dilemma they cannot resolve until the climax
- Every major decision in the story tests this tension

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

Step 2: Define a three-act structure with parts within each act. Parts are TIME PERIODS or PHASES of the situation, not specific events.

- Act 1 (Setup): 1-3 parts — establish the world, the situation, and the characters' entry into it
- Act 2 (Confrontation): 2-4 parts — escalation, complications, shifting dynamics
- Act 3 (Resolution): 1-2 parts — climax and aftermath

Parts are containers. Name them after spans of time or phases of the situation. Events happen WITHIN parts — a part is not an event itself. Do not include events in part definitions.

Step 3: Identify pressure points.
- Which parts create deadlines for the characters?
- Which parts force characters together?
- Which parts force characters apart?
- Which parts create danger or stakes?
- The romantic dark moment should align with the external plot climax.

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
    "tension": "X vs Y — two competing values (2-4 words total)",
    "explored_through": "How the romance embodies this tension"
  },
  "external_plot": {
    "container_type": "historical_event | professional_situation | social_structure | time_bounded | competition | journey | crisis",
    "container_summary": "One sentence describing the external situation",
    "acts": [
      {
        "act": 1,
        "name": "Act name",
        "parts": [
          {
            "part": 1,
            "name": "Time period name (NOT an event name)",
            "time_period": "What span of time this covers",
            "world_state": "What conditions exist during this period"
          }
        ]
      }
    ],
    "climax_part": "Act X Part Y",
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
  if (!ep.container_type || !ep.container_summary || !ep.acts || !Array.isArray(ep.acts)) {
    throw new Error('Phase 1 external_plot missing required fields (container_type, container_summary, acts)')
  }
  if (ep.acts.length !== 3) {
    console.warn(`Phase 1 WARNING: external_plot has ${ep.acts.length} acts (expected 3)`)
  }
  let totalParts = 0
  for (const act of ep.acts) {
    if (!act.act || !act.parts || !Array.isArray(act.parts)) {
      throw new Error(`External plot act ${act.act || '?'} missing required fields (act, parts)`)
    }
    for (const part of act.parts) {
      if (!part.part || !part.name) {
        throw new Error(`External plot Act ${act.act} Part ${part.part || '?'} missing required fields (part, name)`)
      }
      totalParts++
    }
  }
  if (totalParts < 5) {
    console.warn(`Phase 1 WARNING: external_plot has only ${totalParts} total parts (expected 5-9)`)
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
  console.log(`  Theme: ${data.theme.tension}`)
  console.log(`    Explored through: ${data.theme.explored_through}`)
  console.log(`  External Plot: ${ep.container_type} — "${ep.container_summary}"`)
  console.log(`    Acts: ${ep.acts.length}, Total parts: ${totalParts}`)
  ep.acts.forEach(act => {
    console.log(`    Act ${act.act}: ${act.name || ''}`)
    act.parts.forEach(p => {
      console.log(`      Part ${p.part}: ${p.name} (${p.time_period || ''})`)
    })
  })
  console.log(`    Climax part: ${ep.climax_part}`)
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

  // Add romance_arc_stages based on ending type (deterministic, not LLM-generated)
  const ROMANCE_ARC_STAGES_BY_ENDING = {
    'HEA': ['awareness', 'attraction', 'tension', 'touch', 'kiss', 'intimacy', 'dark_moment', 'reunion', 'commitment'],
    'HFN': ['awareness', 'attraction', 'tension', 'touch', 'kiss', 'intimacy', 'dark_moment', 'reunion'],
    'Bittersweet': ['awareness', 'attraction', 'tension', 'touch', 'kiss', 'intimacy', 'dark_moment', 'separation', 'transformation'],
    'Tragic': ['awareness', 'attraction', 'tension', 'touch', 'kiss', 'intimacy', 'dark_moment', 'loss']
  }

  const endingType = data.ending?.type || 'HEA'
  data.romance_arc_stages = ROMANCE_ARC_STAGES_BY_ENDING[endingType] || ROMANCE_ARC_STAGES_BY_ENDING['HEA']

  console.log(`  Romance Arc Stages: ${data.romance_arc_stages.join(' → ')}`)

  console.log('')
  console.log('Phase 1 complete output:')
  console.log(JSON.stringify(data, null, 2))

  return data
}

// =============================================================================
// PHASE 2: CHARACTERS (Full Cast)
// =============================================================================

const PHASE_2_SYSTEM_PROMPT = `You are a romance character architect. Your task is to create the COMPLETE cast for this story: protagonist, love interests, AND stakeholder characters.

You will receive:
- The user's original concept
- Phase 1 output (subgenre, tropes, conflict, theme, ending, tone, timespan, POV, premise, external_plot, romance_arc_stages)

## VICE (REQUIRED FOR ALL CHARACTERS)

Every character with psychology (protagonist, love interests, AND stakeholder characters) MUST have a vice — the behavioral flaw that emerges from their lie.

Pick from this list:
Pride, Vanity, Ambition, Greed, Envy, Jealousy, Possessiveness, Controlling, Domineering, Cowardice, Denial, Evasion, Self-Deception, Willful Ignorance, Escapism, Wrath, Bitterness, Resentment, Cruelty, Spite, Vindictiveness, Vengefulness, Gluttony, Lust, Sloth, Hedonism, Recklessness, Impulsiveness, Manipulation, Deception, Betrayal, Disloyalty, Coldness, Indifference, Callousness, Stubbornness, Obstinacy, Judgmentalism, Self-Righteousness, Fanaticism, Intolerance, Self-Pity, Martyrdom, Insecurity, Arrogance, Narcissism, Covetousness, Dishonesty, Hypocrisy, Corruption, Opportunism

The vice must:
- Flow from the character's lie (the lie justifies the vice)
- Shape how they act on their thematic position

## PART 1: ROMANTIC LEADS

Phase 1 defines a POV structure (Single, Dual-Alternating, Multiple). Every POV character needs full psychology.

### Protagonist and Love Interest Format

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
    "vice": "The behavioral flaw that emerges from their lie (from vice list)",
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
      "wound": { ... same as protagonist },
      "lie": "...",
      "want": "...",
      "need": "...",
      "coping_mechanism": { ... },
      "vice": "...",
      "arc": { ... },
      "voice": { ... }
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

## PART 2: STAKEHOLDER CHARACTERS (from World Interests)

Create supporting characters as THEMATIC PARTICIPANTS, not just plot functionaries.

### THE THEMATIC IMPERATIVE

Every faced character must have:
1. A POSITION on the story's central thematic tension (from Phase 1)
2. An ARC TYPE (transformation or hardening)
3. Moments that TEST their belief against the theme
4. Mapping to EXTERNAL PLOT PARTS they embody or drive
5. A plausible MECHANISM to pressure the protagonists
6. An OUTCOME that follows from their thematic choice

Characters who just perform plot functions without thematic engagement are hollow.

### PROCESS (Follow this order)

**Step 1: List the Interests (Protagonist-Facing)**

Start from the protagonists' daily life and work outward. Ask these questions IN ORDER:

1. **Who is in the protagonists' daily physical world?**
   - People they live with, work with, see regularly
   - People in their neighborhood, workplace, social circle
   - People who share their physical spaces

2. **Who has a personal relationship with them?**
   - Family members (by blood or chosen)
   - Friends, rivals, ex-lovers
   - Mentors, protégés, colleagues with personal history

3. **Who will the external plot force into direct contact with them?**
   - People the plot brings to their doorstep
   - People they must seek out to achieve their goals
   - People whose paths will physically cross theirs repeatedly

4. **What larger forces or institutions create pressure but have no single person regularly in the protagonists' space?**
   - Systems, laws, social expectations
   - Organizations too large or distant to personify
   - Threats that work through consequences rather than presence

Questions 1-3 produce candidate FACED characters. Question 4 produces candidate FACELESS forces.

List each interest as a force/pressure/stake - NOT as a character yet. Note which question category it came from.

**Step 2: Proximity Test (BEFORE face/faceless decision)**

For each interest, ask: **"Will this character share physical space with a POV character repeatedly across the story?"**

A character PASSES the proximity test if ALL of these are true:
- Present in the protagonists' physical world REGULARLY, not occasionally
- Will be physically present with a POV character in at least 3 parts
- Has a personal relationship or role that creates regular contact

A character FAILS the proximity test if ANY of these are true:
- Contact would be a single scene or rare occurrence
- Connection is institutional rather than personal (e.g., "the government" vs "the officer who lives next door")
- Pressure is felt through consequences rather than presence

**PROXIMITY IS STRICTER THAN REACHABILITY.** Almost any interest can "reach" the protagonists somehow. The question is whether they will share physical space repeatedly.

Fails proximity test → faceless force. No exceptions for thematic importance.

**Step 3: Face or Faceless Decision**

An interest GETS A FACE only if ALL of these are true:
1. Passes the proximity test (will share physical space with POV character in 3+ parts)
2. Has a personal connection to a POV character (not institutional/professional distance)
3. Has personal interests that create friction with the protagonists

An interest STAYS FACELESS if ANY ONE of these is true:
1. Fails the proximity test (won't share physical space repeatedly)
2. Represents an institution or system rather than a personal relationship
3. Pressure is felt through consequences rather than personal interaction

**IMPORTANT:** Thematic importance does NOT override proximity failure. A distant antagonist who embodies the theme perfectly but won't share space with protagonists must be faceless. The theme can be embodied by characters who ARE proximal.

**Step 3b: Consolidation Check**

After making face/faceless decisions, ask: Can any faced characters be CONSOLIDATED?

One character serving multiple interests is better than two characters each serving one. Look for:
- Two interests that could logically be held by one person
- Characters who would occupy similar spaces in the protagonists' lives
- Opportunities to deepen one character rather than spreading thin across many

Consolidate aggressively. Fewer, richer characters are better than more, thinner ones.

**Step 4: Thematic Position**

For each FACED character, determine their position on the Phase 1 theme tension.

Examples (if theme tension is "love vs safety"):
- Prioritizes love over safety (will be tested when love brings danger)
- Prioritizes safety over love (will be tested when safety means losing love)
- Believes you can have both (will be tested by forced choice)

Their position creates their LENS on events and their arc trajectory.

**Step 5: Archetype (Pressure Role)**

What kind of PRESSURE do they apply? The archetype is their FUNCTION in pressuring the protagonists:

- **The Hunter** — Actively pursues, hunts, tracks
- **The Rival** — Competes for same goal/person/position
- **The Gatekeeper** — Controls access to what protagonist needs
- **The Fanatic** — Represents extreme commitment to a belief
- **The Tempter** — Offers easy path that would betray values
- **The Mirror** — Reflects what protagonist could become
- **The Judge** — Evaluates, condemns, or threatens consequences
- **The Betrayer** — Trust weaponized into harm
- **The Guardian** — Protects something protagonist needs to change/destroy
- **The Witness** — Observes and threatens to expose

**Step 6: Arc Type and Outcome**

**Arc Type** — How does their belief evolve?
- **Transformation**: Their position on the theme CHANGES through the story
- **Hardening**: They DOUBLE DOWN on their position despite challenges

**Arc Outcome** — What happens as a consequence of their thematic choice?
- **Redemption**: They change and find something better
- **Tragic death**: Their belief kills them (literally or metaphorically)
- **Hollow victory**: They get what they wanted but it's empty
- **Damnation**: They fully embrace their darkness
- **Survival unchanged**: They persist, neither redeemed nor destroyed

The outcome must FOLLOW FROM their thematic position and arc type.

**Step 7: Full Psychology for All Stakeholder Characters**

All stakeholder characters get full psychology (wound, lie, want, need, coping_mechanism, vice, arc, voice).

This ensures every faced character has:
- A wound that connects to the theme
- A lie that justifies their thematic position
- A vice that shapes how they act on that position
- An arc that tests their belief

No partial or minimal characters. If a character doesn't warrant full psychology, they should be faceless or consolidated with another character.

**Step 8: External Plot Mapping**

Which Phase 1 external plot parts does each character EMBODY or DRIVE?

A character might:
- BE the inciting incident
- CREATE the escalation
- FORCE the crisis point
- RESOLVE or COMPLICATE the climax

Map characters to external plot parts to ensure they're integrated with the world's events, not floating in a character vacuum.

**Step 9: Screen-Time Sanity Check**

After all characters are generated, review each faced character and ask:

"How many parts will this character share physical space with a POV character?"

- If 3+ parts: Confirmed as faced character
- If fewer than 3 parts: Reconsider. Should this character be faceless? Can their role be consolidated with another character who IS proximal?

This is a FINAL CHECK. Characters who seemed important during ideation but fail the screen-time test should be converted to faceless forces or consolidated.

## OUTPUT FORMAT

{
  "protagonist": { ... full psychology ... },
  "love_interests": [ ... full psychology each ... ],
  "dynamics": { "romantic": [...], "rivals": [...] },

  "interests": [
    {
      "interest": "Description of the force/pressure/stake",
      "pressure_mechanism": "How this interest could pressure protagonists",
      "can_reach_protagonists": true,
      "reach_explanation": "Proximity assessment: Will they share physical space with POV character in 3+ parts?",
      "has_face": true,
      "why_face": "Why this passes proximity test and gets a character (or null if faceless)"
    }
  ],

  // EVERY stakeholder character MUST have ALL fields below. No partial characters. No exceptions.
  "stakeholder_characters": [
    {
      "name": "Full name",
      "interest": "Which interest they represent",
      "connected_to": "Which POV character(s)",

      // Thematic engagement (required):
      "thematic_position": "What they believe about the Phase 1 theme tension",
      "archetype": "The Hunter | The Rival | The Gatekeeper | The Fanatic | The Tempter | The Mirror | The Judge | The Betrayer | The Guardian | The Witness",
      "arc_type": "transformation | hardening",
      "arc_outcome": "redemption | tragic_death | hollow_victory | damnation | survival_unchanged",
      "external_parts": ["Array of Phase 1 external plot part names they embody or drive"],
      "pressure_mechanism": "How they reach and pressure protagonists (must be plausible)",
      "thematic_test": "What challenges their belief",

      // Full psychology (required for all stakeholder characters):
      "wound": {
        "event": "What specifically happened to them",
        "who_caused_it": "Person responsible or null",
        "age": "When it happened"
      },
      "lie": "The false belief formed because of the wound",
      "want": "What they're consciously pursuing",
      "need": "What they actually need",
      "coping_mechanism": {
        "behaviour": "How they cope",
        "as_flaw": "How it hurts them",
        "as_virtue": "How it helps them"
      },
      "vice": "The behavioral flaw from the vice list that emerges from their lie",
      "arc": {
        "starts": "Who they are at start",
        "ends": "Who they become"
      },
      "voice": {
        "register": "How they speak",
        "patterns": "Speech habits",
        "tells": "Emotional reveals"
      }
    }
  ],

  "faceless_pressures": [
    {
      "interest": "The faceless force",
      "why_faceless": "Why this fails the proximity test (won't share physical space with POV character in 3+ parts)",
      "how_manifests": "How it shows up in the story without a character"
    }
  ]
}

## CRITICAL RULES

1. Characters must have THEMATIC POSITIONS, not just plot functions.
2. Characters must PASS THE PROXIMITY TEST - will they share physical space with a POV character in 3+ parts? If not, make them faceless.
3. All stakeholder characters get FULL PSYCHOLOGY including vice. No partial or minimal characters.
4. Arc outcomes must FOLLOW FROM thematic choices, not be arbitrary.
5. Consolidate aggressively - one character serving multiple interests is better than many thin characters.
6. Thematic importance does NOT override proximity failure. Distant antagonists become faceless forces.

## ROMANTIC LEADS GUIDELINES

COUNTING LOVE INTERESTS:
- "3 suitors" = 3 love interests
- "Love triangle" = 2 love interests
- Standard romance = 1 love interest

ROLE IN STORY:
- Primary: The one protagonist ends up with (for HEA/HFN)
- Rival: Competing for protagonist's heart
- One should be marked Primary unless tragic/open ending

THE CAUSAL WOUND CHAIN:
wound → lie → coping mechanism

THE WOUND CREATES THE LIE:
- "Father sent me away for being soft" → "Softness is weakness"

THE LIE CREATES THE COPING MECHANISM:
- "Softness is weakness" → "Proves strength constantly"

THE COPING MECHANISM IS BOTH FLAW AND VIRTUE:
- Same trait, two expressions

WOUNDS CONNECT TO THEME:
- All characters' wounds should relate to the Phase 1 theme

ARCS AND ENDINGS:
- HEA: Characters overcome their lies
- HFN: Characters grow but circumstances uncertain
- Bittersweet: Characters transform but cannot be together
- Tragic: Coping mechanisms prove insurmountable

## SECONDARY CAST GUIDELINES

CONSOLIDATE AGGRESSIVELY:
- One character serving multiple interests is better than many thin characters
- Look for opportunities to combine characters who would occupy similar spaces
- Fewer, richer characters are better than more, thinner ones

ALL STAKEHOLDER CHARACTERS GET FULL PSYCHOLOGY:
- Every faced character needs wound, lie, want, need, coping_mechanism, vice, arc, voice
- If a character doesn't warrant full psychology, make them faceless or consolidate

PROXIMITY IS PARAMOUNT:
- Faced characters must share physical space with POV character in 3+ parts
- If they won't be physically present repeatedly, make them faceless
- Thematic importance does NOT override proximity failure

THEMATIC ENGAGEMENT:
- Every faced character needs a position on the theme
- Arc outcomes must follow from thematic choices`

function buildPhase2UserPrompt(concept, phase1, lengthPreset) {
  const povStructure = phase1.pov?.structure || 'Multiple'
  const povPerson = phase1.pov?.person || 'Third'

  // Build external plot parts summary
  const externalPartsSummary = (phase1.external_plot?.acts || []).map(act =>
    `**Act ${act.act}: ${act.name || ''}**\n` + (act.parts || []).map(p =>
      `  Part ${p.part}: ${p.name} — ${p.time_period || ''} (${p.world_state || ''})`
    ).join('\n')
  ).join('\n') || 'No external plot parts defined'

  // Complexity guide based on length
  const stakeholderCount = lengthPreset === 'novella' ? '2-4' : '4-8'

  return `ORIGINAL CONCEPT: ${concept}

PHASE 1 OUTPUT (Story DNA):
${JSON.stringify(phase1, null, 2)}

LENGTH PRESET: ${lengthPreset}

## PART 1: Create Romantic Leads

**POV Structure: ${povPerson} Person, ${povStructure}**
${povStructure === 'Multiple' || povStructure === 'Dual-Alternating'
    ? 'This is a multi-POV story. The protagonist AND each love interest will be POV characters. Every POV character needs full psychology.'
    : 'This is a single POV story. The protagonist is the POV character and needs full psychology. Love interests still need full psychology for consistency.'}

Count the number of love interests implied by the concept. If it mentions "3 suitors" create 3. If "love triangle" create 2. If standard romance create 1.

Ensure:
- All wounds connect to the theme tension "${phase1.theme?.tension || 'from Phase 1'}"
- Arcs match the ${phase1.ending?.type || 'established'} ending
- Each love interest is distinct with different wounds
- One love interest is marked Primary (unless tragic/open ending)
- If multiple love interests, include rival dynamics between them

## PART 2: Create Stakeholder Characters (REQUIRED - DO NOT SKIP)

You MUST create the stakeholder characters. This is not optional. Your output MUST include:
- interests array (at least 3-5 interests identified)
- stakeholder_characters array (characters who embody faced interests)
- faceless_pressures array (interests that remain atmospheric)

### THE THEME (characters must engage with this)

**Theme Tension:** ${phase1.theme?.tension}

Every faced character needs a POSITION on this tension. Their arc tests that position.

### EXTERNAL PLOT PARTS (characters can embody/drive these)

${externalPartsSummary}

Map characters to these parts - they shouldn't float in a vacuum. Each character should embody or drive at least one external plot part.

### Complexity Guide for ${lengthPreset}

- Stakeholder characters (all with full psychology): ${stakeholderCount}

### PROCESS (Follow the 9 steps from the system prompt)

**Step 1: List interests PROTAGONIST-FACING (not world-facing)**
Start from the protagonists' daily life and work outward:
- Q1: Who is in the protagonists' daily physical world?
- Q2: Who has a personal relationship with them?
- Q3: Who will the external plot force into direct contact?
- Q4: What larger forces create pressure but have no single person regularly in their space?
Q1-3 produce candidate faced characters. Q4 produces candidate faceless forces.

**Step 2: Proximity test (not just reachability)**
For each interest ask: "Will this character share physical space with a POV character in 3+ parts?"
- Must be REGULARLY present, not occasional
- Must have personal relationship or role creating regular contact
- Fails proximity → faceless. No exceptions for thematic importance.

**Step 3: Face or faceless decision with CONSOLIDATION CHECK**
Face requires ALL: passes proximity test + personal connection + personal interests creating friction
Faceless if ANY: fails proximity OR institutional/systemic OR pressure through consequences not presence
After decisions, check: Can any faced characters be CONSOLIDATED? One character serving multiple interests is better than two thin characters.

**Steps 4-8: (per system prompt)**
4. Thematic position for faced characters
5. Archetype (pressure role)
6. Arc type and outcome
7. Full psychology for ALL stakeholder characters (wound, lie, want, need, coping_mechanism, vice, arc, voice)
8. External plot mapping

**Step 9: Screen-time sanity check**
Review each faced character: How many parts will they share physical space with a POV character?
If fewer than 3 → reconsider: Should they be faceless? Can they be consolidated?

## CRITICAL OUTPUT REQUIREMENTS

Your JSON output MUST include ALL of these top-level keys:
1. protagonist (object)
2. love_interests (array)
3. dynamics (object with romantic and rivals arrays)
4. interests (array - REQUIRED, minimum 3 entries with pressure_mechanism and can_reach_protagonists for proximity assessment)
5. stakeholder_characters (array - REQUIRED, with thematic_position, archetype, arc_type, arc_outcome, external_parts, pressure_mechanism)
6. faceless_pressures (array - REQUIRED, even if empty)

DO NOT return output with empty interests or stakeholder_characters arrays.`
}

async function executePhase2(concept, phase1, lengthPreset) {
  console.log('Executing Phase 2: Full Cast (Romantic Leads + Secondary Characters)...')

  const userPrompt = buildPhase2UserPrompt(concept, phase1, lengthPreset)
  const response = await callOpenAI(PHASE_2_SYSTEM_PROMPT, userPrompt, { maxTokens: 16384 })
  const parsed = parseJSON(response)

  if (!parsed.success) {
    throw new Error(`Phase 2 JSON parse failed: ${parsed.error}`)
  }

  const data = parsed.data

  // Validate romantic leads
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

  // Validate stakeholder cast structure - these are REQUIRED
  if (!data.interests || !Array.isArray(data.interests) || data.interests.length === 0) {
    throw new Error('Phase 2 FAILED: interests array is missing or empty. The model must identify interests from the concept and external_plot.')
  }
  if (!data.stakeholder_characters || !Array.isArray(data.stakeholder_characters) || data.stakeholder_characters.length === 0) {
    throw new Error('Phase 2 FAILED: stakeholder_characters array is missing or empty. The model must create characters for faced interests.')
  }
  if (!data.faceless_pressures) {
    data.faceless_pressures = [] // This one can be empty if all interests are faced
  }

  // Remove moment arrays if model included them (Phase 3 handles character actions)
  if (data.character_moments) {
    console.log('Phase 2: Removing character_moments array (handled by Phase 3)')
    delete data.character_moments
  }
  if (data.arc_outcomes) {
    console.log('Phase 2: Removing arc_outcomes array (handled by Phase 3)')
    delete data.arc_outcomes
  }

  // Validate stakeholder characters have required fields
  for (const char of data.stakeholder_characters) {
    if (!char.name) {
      throw new Error(`Stakeholder character missing required field (name): ${JSON.stringify(char).slice(0, 100)}`)
    }
  }

  // Validate thematic fields for all stakeholder characters
  const missingThematic = data.stakeholder_characters.filter(c => !c.thematic_position || !c.archetype || !c.arc_type || !c.arc_outcome)
  if (missingThematic.length > 0) {
    console.warn('Phase 2 WARNING: Faced characters missing thematic fields:')
    missingThematic.forEach(c => {
      const missing = []
      if (!c.thematic_position) missing.push('thematic_position')
      if (!c.archetype) missing.push('archetype')
      if (!c.arc_type) missing.push('arc_type')
      if (!c.arc_outcome) missing.push('arc_outcome')
      console.warn(`  - ${c.name}: missing ${missing.join(', ')}`)
    })
  }

  // Console logging
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

  console.log(`  Interests: ${data.interests.length}`)
  const faced = data.interests.filter(i => i.has_face).length
  const faceless = data.interests.filter(i => !i.has_face).length
  console.log(`    Faced: ${faced}, Faceless: ${faceless}`)

  console.log(`  Stakeholder characters: ${data.stakeholder_characters.length}`)
  data.stakeholder_characters.forEach(c => {
    console.log(`    - ${c.name}: archetype="${c.archetype}", arc="${c.arc_type}→${c.arc_outcome}"`)
  })

  console.log(`  Faceless pressures: ${data.faceless_pressures.length}`)

  console.log('')
  console.log('Phase 2 complete output:')
  console.log(JSON.stringify(data, null, 2))

  return data
}

// =============================================================================
// PHASE 3: CHARACTER ACTION GRID
// =============================================================================

const PHASE_3_SYSTEM_PROMPT = `You are a story architect. Your task is to create an act-by-act, part-by-part CHARACTER ACTION GRID that tracks what every character does during every part of the story.

You will receive:
- The original concept
- Phase 1 output (external_plot with acts and parts, romance_arc_stages as constraint list, theme, tone)
- Phase 2 output (protagonist, love_interests, stakeholder_characters - the full cast with psychology)

## THE CHARACTER ACTION GRID

Romance arc stages are STATES the relationship moves through. They are not moments. Multiple story events can occur within a single stage before the relationship tips to the next one. The exact stages come from Phase 1's \`romance_arc_stages\` array — these are the ONLY valid values for \`romance_stage_tag\`. No invented stages. No skipping. Every stage must appear exactly once.

For EVERY part (across all acts), for EVERY character (all characters appear at all parts), generate a SCENE FRAGMENT — a structured cell containing everything needed to build a scene around that character during that part.

Each fragment must carry distinct information in every field. State is not situation. Situation is not action. Action is not outcome. Tension is not psychology_note. Every field serves a different downstream purpose.

## OUTPUT FORMAT

{
  "grid": [
    {
      "act": 1,
      "part": 1,
      "part_name": "Name from Phase 1 external_plot",
      "part_description": "What time period this covers and the world conditions",
      "fragments": [
        {
          "character": "Character name",
          "character_type": "protagonist | love_interest | stakeholder",
          "location": "Short consistent string for where they are (reuse same strings across parts)",
          "state": "Their personal condition coming into this part — mindset, emotional state, what they're carrying from previous events",
          "situation": "External context they're walking into — what's happening around them, independent of their personal state",
          "actions": ["action 1", "action 2", "action 3", ...],
          "dialogues": ["dialogue summary 1", "dialogue summary 2", ...],
          "thoughts": ["thought 1", "thought 2", ...],
          "intent": "What they were trying to achieve with their actions",
          "tension": "What's pulling against them — discomfort, doubt, observation that nags, loyalty being tested",
          "outcome": "The state change — what is different after this part because of what they did or experienced",
          "romance_stage_tag": "awareness | attraction | etc." | null,
          "psychology_note": "How this fragment relates to their lie, arc, and thematic position" | null
        }
      ]
    }
  ],

  "romance_stage_progression": [
    {
      "stage": "awareness",
      "act": 1,
      "part": 1,
      "character": "Esperanza",
      "description": "Brief description of what tips the relationship into this stage"
    }
  ],

  "validation": {
    "all_stages_present": true | false,
    "stages_in_order": true | false,
    "missing_stages": ["any stages from Phase 1 romance_arc_stages not found"],
    "protagonist_fragments_count": number,
    "total_fragments": number,
    "total_actions": number,
    "total_dialogues": number,
    "total_thoughts": number
  }
}

## CRITICAL RULES

### 1. Every Character Appears at Every Part

Every named character from Phase 2 (protagonist, love interests, all stakeholder characters) MUST have a row at every part. These characters live in this world — they are always doing something. Their actions may not intersect with the main plot at a given part, but we need to know what they're doing in their own lives, pursuing their own interests, reacting to the world events.

This is about generating maximum content density for downstream phases to select from. The alcalde doesn't stop existing during quiet parts. The priest doesn't vanish between scenes. Every character is living their life, and we want to know what that looks like during each part.

The ONLY exception: characters who are dead or have physically left the story world.

### 2. Romance Stage Tags: Sparse AND Only on Romantic Leads

Most cells have NO romance tag. Tags only appear when the relationship TIPS from one state to the next.

**HARD CONSTRAINT:** Romance stage tags may ONLY appear on protagonist or love_interest rows. Never on stakeholder characters. If a stage involves mutual transformation, place the tag on the protagonist's row.

Example: Awareness might be tagged on Act 1 Part 1. The next 10, 20, 30 cells might have no tag at all while other things happen. Then eventually a cell tips to "attraction" - and the gap between those tags is where the story lives.

### 3. Every Field is CONCRETE and DISTINCT

Each field in a fragment must carry distinct, substantive information:

- **state**: Personal condition COMING INTO this part (not what happens during it)
- **situation**: External context (not the character's feelings about it)
- **actions**: Array of physical, observable things they DO — chronologically ordered within the part
- **dialogues**: Array of dialogue SUMMARIES (what is said, not literal lines — prose phase writes actual dialogue)
- **thoughts**: Array of internal monologue — what they're thinking/feeling as events unfold (protagonist and love_interest ONLY)
- **intent**: What they were TRYING to achieve (not what they did)
- **tension**: What's pulling AGAINST them (not just difficulty — the specific discomfort)
- **outcome**: What CHANGED (not what they did — the result/consequence)

**DIALOGUE IS NOT SCRIPT.** Each dialogue entry summarizes what is said:
- GOOD: "Warns Andrés that patrols come through the vineyard at dawn"
- BAD: "The patrols come at dawn — you need to be gone before first light."

**ACTIONS ARE CHRONOLOGICAL.** List the sequence of what they physically do, in order.

**THOUGHTS ARE FOR POV CHARACTERS ONLY.** Stakeholders get 0 thoughts — their interiority is revealed through actions and dialogue only.

**LET THE STORY DICTATE VOLUME.** Each fragment should include as many actions, dialogues, and thoughts as the character's role in this part warrants. Protagonist and love interest fragments will naturally be richer than stakeholder fragments. Do not pad — if a stakeholder only does one thing in this part, that's one action. If the protagonist has a complex sequence of events, that could be six actions. Let the story dictate the volume.

GOOD action: "Goes to check frozen vines, finds wounded soldier"
BAD action: "Feels conflicted about her duty"

GOOD tension: "Notices patrol schedule has changed — someone suspects something"
BAD tension: "Is worried about getting caught"

GOOD outcome: "Now hiding a wounded enemy soldier in the tower"
BAD outcome: "Has hidden him in the tower" (this is action, not outcome)

### 4. Romance Stage Must Match Phase 1 romance_arc_stages

The romance_arc_stages from Phase 1 is a CONSTRAINT. Every stage in that list must appear somewhere in the protagonist's or love_interest's cells, tagged in order. You cannot skip stages. You cannot regress.

### 5. Lies DOMINATE Early Parts, DISSOLVE Gradually

For protagonist and love interests: the first HALF of the grid, their **actions**, **dialogues**, and **thoughts** must VISIBLY ENACT their lie and coping mechanism. They resist intimacy. They deflect. They protect themselves. The romance progresses anyway, but they fight it.

This creates earned transformation. If the lie isn't visible in early actions/dialogues/thoughts, the ending feels cheap.

Example (lie: "I must never depend on anyone"):
- Act 1 Part 1 actions: ["Refuses help carrying supplies despite struggling", "Brushes off concern with dismissive gesture"]
- Act 1 Part 1 dialogues: ["Insists she can manage alone"]
- Act 1 Part 1 thoughts: ["Reminds herself that depending on others always leads to disappointment"]
- Act 1 Part 1 intent: "To prove she doesn't need anyone"

The lie weakens mid-story (challenged by events) and releases at the dark moment or transformation.

### 6. Thematic Tests Must Fire as Visible Actions

Every stakeholder character has a \`thematic_test\` defined in Phase 2 — what challenges their belief. This test MUST appear as a concrete, visible action in at least one grid cell. The test doesn't have to be passed (hardening characters can fail it), but the moment must exist in the grid.

If a character's thematic_test is "Witnessing sacrifice that doesn't lead to destruction," then somewhere in the grid that character must WITNESS such a sacrifice. Show the test happening, not just the character's position.

### 7. Arc Outcomes Must Match Final Part Actions

Each stakeholder character's final part action(s) must reflect their defined \`arc_outcome\` from Phase 2:

- **redemption**: Character visibly changes — action shows new belief or reconciliation
- **tragic_death**: Character's death (literal or metaphorical) visible in final actions
- **hollow_victory**: Character achieves stated goal BUT action shows emptiness/cost
- **damnation**: Character fully embraces darkness — action shows doubling down
- **survival_unchanged**: Character demonstrably unchanged — same behavior as start

The model must NOT default toward redemption. A character defined as hardening with hollow_victory does NOT get a soft ending. Show the hollowness.

### 8. Central Theme Tests Every Part

Phase 1 defines \`theme.tension\` — a tension between two competing values (e.g., "duty vs truth"). Every part should contain at least one action where a character's thematic_position is being tested, reinforced, or challenged by events.

The grid is not just plot choreography. It is a thematic argument across multiple characters. Each part should advance or complicate that argument.

### 9. Locations are CONSISTENT Strings

Use the same location string every time a place appears. "The vineyard tower" should always be "vineyard_tower" — not "tower room", "the tower", "Esperanza's hiding spot". This allows downstream phases to cluster fragments by part + location mechanically.

Create a mental vocabulary of 5-15 locations for this story and reuse them consistently.

### 10. Outcome→State Continuity (CRITICAL)

Each character's **state** at Part N+1 must follow logically from their **outcome** at Part N.

If Act 1 Part 2 outcome is "Now hiding a wounded enemy soldier — terrified of discovery", then Act 1 Part 3 state must acknowledge this: "Carrying the weight of her secret, sleeping poorly, jumping at sounds".

No resets. No contradictions. No skipping consequences. The outcome→state chain creates continuity per character through the entire grid.

The first part's states come from Phase 2 character setup. Later part states come from the previous part's outcome.

### 11. Density Creates Novel

Multiple parts × full cast = potentially 50+ scene fragments. This IS the master timeline. Every fragment is a potential scene. This density is what makes a novel, not a list of 14 romance moments with gaps.

## PROCESS

1. Read the external_plot acts and parts from Phase 1
2. Read the full cast from Phase 2 (protagonist, love_interests, stakeholder_characters)
3. For each part (across all acts), include ALL characters from the cast (everyone appears at every part)
4. For each character at each part, generate a complete scene fragment with arrays for actions, dialogues, thoughts
5. Let the story dictate volume — don't pad, don't skimp
6. Ensure each character's state at Part N+1 follows from their outcome at Part N
7. After generating all fragments, identify which protagonist/love_interest cells represent romance stage transitions
8. Tag those cells with the appropriate romance_stage
9. Validate that all romance_arc_stages appear in order

## EXAMPLE

Act 1 Part 1: The Winter Offensive Period

Esperanza (protagonist):
  location: vineyard_fields
  state: Restless, unfulfilled — running family vineyard alone since father's death, no life beyond duty
  situation: Distant gunfire as Republican forces retreat through the valley
  actions: [
    "Hears distant gunfire from the east",
    "Goes to check frozen vines for damage",
    "Discovers wounded soldier collapsed in the snow",
    "Drags him to the abandoned tower",
    "Cleans and binds his wounds with torn bedsheets"
  ]
  dialogues: [
    "Asks who he is and which side he fights for",
    "Tells him to stay quiet or they'll both die"
  ]
  thoughts: [
    "Realizes helping him is treason",
    "Wonders why she didn't just leave him to die",
    "Reminds herself she handles everything alone — this is no different"
  ]
  intent: To protect the vineyard from damage, then to save a life she stumbled into
  tension: The soldier is clearly Republican — helping him means execution if discovered
  outcome: Now hiding a wounded enemy soldier in the tower, terrified of discovery
  romance_stage_tag: awareness
  psychology_note: Lie ("I must handle everything alone") already operating — she tells no one

Mikel (love_interest):
  location: vineyard_fields
  state: Exhausted, bleeding — unit scattered in failed offensive, separated from command
  situation: Nationalist patrols closing in, no safe route to Republican lines
  actions: [
    "Stumbles through frozen vineyard, leaving blood trail",
    "Collapses against stone wall",
    "Wakes to stranger binding his wounds",
    "Tries to reach for weapon, finds it gone",
    "Studies the woman's face, trying to read her intentions"
  ]
  dialogues: [
    "Demands to know if she's turning him in",
    "Refuses to give his unit or mission"
  ]
  thoughts: [
    "Calculates how long before patrols find the blood trail",
    "Wonders if this is a trap"
  ]
  intent: To survive, to assess the threat this woman poses
  tension: Completely dependent on a stranger who could be enemy
  outcome: Alive but trapped behind enemy lines, at the mercy of a woman he doesn't know
  romance_stage_tag: awareness
  psychology_note: Lie ("Trust no one outside the cause") immediately challenged — he has no choice

Don Sebastián (stakeholder):
  location: town_hall
  state: Confident, consolidating power — war going well, opportunity to eliminate rivals
  situation: Reports of Republican soldiers fleeing through the valley
  actions: [
    "Reviews patrol reports at his desk",
    "Orders increased patrols around Valdemadera",
    "Summons the priest for information on suspicious families"
  ]
  dialogues: [
    "Instructs patrol captain to check farms near the eastern road",
    "Asks Father Ignacio which families have Republican sympathies"
  ]
  thoughts: []
  intent: To capture fleeing soldiers and identify collaborators
  tension: Some families in the valley have divided loyalties — hard to know who to trust
  outcome: Suspects someone is hiding enemies, but doesn't know who yet
  psychology_note: Thematic position ("Order requires ruthless enforcement") being tested by incomplete information

[No romance tag on stakeholder — only protagonist and love_interest get romance tags]`

function buildPhase3UserPrompt(concept, phase1, phase2) {
  // Build full cast list with constraint data
  const allCharacters = []

  // Add protagonist with lie/coping for early part constraint
  allCharacters.push({
    name: phase2.protagonist?.name,
    type: 'protagonist',
    wound: phase2.protagonist?.wound?.event,
    lie: phase2.protagonist?.lie,
    coping_mechanism: phase2.protagonist?.coping_mechanism?.behaviour
  })

  // Add love interests with lie/coping
  phase2.love_interests?.forEach(li => {
    allCharacters.push({
      name: li.name,
      type: 'love_interest',
      role: li.role_in_story,
      wound: li.wound?.event,
      lie: li.lie,
      coping_mechanism: li.coping_mechanism?.behaviour
    })
  })

  // Add stakeholder characters with thematic_test and arc_outcome
  phase2.stakeholder_characters?.forEach(sc => {
    allCharacters.push({
      name: sc.name,
      type: 'stakeholder',
      archetype: sc.archetype,
      thematic_position: sc.thematic_position,
      thematic_test: sc.thematic_test,
      arc_type: sc.arc_type,
      arc_outcome: sc.arc_outcome
    })
  })

  // Build external plot parts summary
  const externalPartsSummary = (phase1.external_plot?.acts || []).map(act =>
    `**Act ${act.act}: ${act.name || ''}**\n` + (act.parts || []).map(p =>
      `  Part ${p.part}: ${p.name} — ${p.time_period || ''} (${p.world_state || ''})`
    ).join('\n')
  ).join('\n') || 'No external plot parts defined'

  // Count total parts
  const totalParts = (phase1.external_plot?.acts || []).reduce((sum, act) => sum + (act.parts?.length || 0), 0)

  // Build romance arc stages constraint
  const romanceStages = phase1.romance_arc_stages?.join(' → ') || 'awareness → attraction → tension → touch → kiss → intimacy → dark_moment → reunion'

  return `ORIGINAL CONCEPT: ${concept}

PHASE 1 OUTPUT (Story DNA):
${JSON.stringify(phase1, null, 2)}

PHASE 2 OUTPUT (Full Cast):
${JSON.stringify(phase2, null, 2)}

## Your Task

Create an act-by-act, part-by-part CHARACTER ACTION GRID. For EVERY part (across all acts), for EVERY character (no exceptions), generate a SCENE FRAGMENT. Every character appears at every part — they don't vanish when not in scenes with the protagonist.

Each field must carry distinct information. State ≠ situation ≠ outcome. Each character's state at Part N+1 must follow from their outcome at Part N.

## EXTERNAL PLOT PARTS (HARD CONSTRAINT — the grid rows)

${externalPartsSummary}

**HARD CONSTRAINT:** Use EXACTLY these ${totalParts} parts across ${phase1.external_plot?.acts?.length || 3} acts. No more. No fewer. Do not invent additional parts. Do not split parts. Do not combine parts. The grid must have exactly ${totalParts} rows, matching the list above.

## ROMANCE ARC STAGES (HARD CONSTRAINT)

${romanceStages}

Every stage above MUST appear exactly once as a \`romance_stage_tag\` in the grid. No stage may be skipped. No stages may be invented. This is a hard constraint, not a guideline.

These are STATES the relationship moves through. Tag protagonist cells when the relationship TIPS to a new stage. Most cells have NO tag - tags are sparse.

## CENTRAL THEME (CONSTRAINT)

**Theme Tension:** ${phase1.theme?.tension || 'Not defined'}

Every part should contain at least one action where a character's thematic position is tested, reinforced, or challenged.

## ROMANTIC LEADS — LIES THAT MUST DOMINATE EARLY PARTS

${allCharacters.filter(c => c.type === 'protagonist' || c.type === 'love_interest').map(c => {
  return `**${c.name}** (${c.type})
  - Lie: "${c.lie}"
  - Coping: "${c.coping_mechanism}"
  - CONSTRAINT: For the first half of parts, actions must VISIBLY ENACT this lie/coping`
}).join('\n\n')}

## STAKEHOLDER CHARACTERS — THEMATIC TESTS AND ARC OUTCOMES

${allCharacters.filter(c => c.type === 'stakeholder').map(c => {
  return `**${c.name}** (${c.archetype})
  - Position: "${c.thematic_position}"
  - Test: "${c.thematic_test}" ← MUST appear as visible action in grid
  - Arc: ${c.arc_type} → ${c.arc_outcome} ← Final part actions must reflect this outcome`
}).join('\n\n')}

## FULL CAST SUMMARY

${allCharacters.map(c => {
  if (c.type === 'protagonist') {
    return `**${c.name}** (PROTAGONIST)`
  } else if (c.type === 'love_interest') {
    return `**${c.name}** (${c.role} LOVE INTEREST)`
  } else {
    return `**${c.name}** (STAKEHOLDER)`
  }
}).join('\n')}

## REQUIREMENTS

1. For each part (across all acts), include ALL characters — protagonist, love interests, and every stakeholder character
2. Generate a complete scene fragment for EACH character at EACH part
3. Every field is substantive — no field restates another
4. Locations are consistent strings — reuse the same string for the same place
5. State at Part N+1 follows from outcome at Part N (outcome→state continuity)
6. Actions[] entries are physical and concrete, not thematic or psychological
7. Dialogues[] are summaries of exchanges, not literal script
8. Thoughts[] only for POV characters (protagonist)
9. Romance stage tags ONLY on protagonist or love_interest rows — never on stakeholders
10. Protagonist/love_interest early part actions must ENACT their lie (first half of parts)
11. Each stakeholder's thematic_test must appear as visible action somewhere in grid
12. Each stakeholder's final part fragment must reflect their arc_outcome
13. Identify which protagonist/love_interest fragments represent romance stage transitions and tag them
14. Validate all romance_arc_stages from Phase 1 appear in order

## EXPECTED FRAGMENT COUNT

You have ${allCharacters.length} characters and ${totalParts} parts. That means ${allCharacters.length} × ${totalParts} = ${allCharacters.length * totalParts} scene fragments in the grid. Every character. Every part. No exceptions.

## OUTPUT

Return valid JSON matching the schema from the system prompt. Remember: actions, dialogues, and thoughts are ARRAYS.`
}

async function executePhase3(concept, phase1, phase2) {
  console.log('Executing Phase 3: Character Action Grid...')

  const userPrompt = buildPhase3UserPrompt(concept, phase1, phase2)
  const response = await callOpenAI(PHASE_3_SYSTEM_PROMPT, userPrompt, { maxTokens: 32768 })
  const parsed = parseJSON(response)

  if (!parsed.success) {
    console.error('Phase 3 raw response (first 1000 chars):', response.slice(0, 1000))
    console.error('Phase 3 raw response (last 500 chars):', response.slice(-500))
    throw new Error(`Phase 3 JSON parse failed: ${parsed.error}`)
  }

  const data = parsed.data

  // Normalize: find whatever array the model used for fragments and rename it to 'fragments'
  if (data.grid && Array.isArray(data.grid)) {
    for (const gridEntry of data.grid) {
      if (!gridEntry.fragments) {
        // Find the array field (could be character_actions, actions, cells, etc.)
        const arrayField = Object.entries(gridEntry).find(([key, val]) =>
          Array.isArray(val) && key !== 'fragments'
        )
        if (arrayField) {
          const [fieldName, fieldValue] = arrayField
          console.log(`Phase 3: Normalizing ${fieldName} → fragments for Act ${gridEntry.act} Part ${gridEntry.part}`)
          gridEntry.fragments = fieldValue
          delete gridEntry[fieldName]
        }
      }

      // Normalize fragment fields: ensure actions/dialogues/thoughts are arrays
      if (gridEntry.fragments && Array.isArray(gridEntry.fragments)) {
        for (const fragment of gridEntry.fragments) {
          // Convert old 'action' string to 'actions' array
          if (fragment.action && !fragment.actions) {
            fragment.actions = [fragment.action]
            delete fragment.action
          }
          // Ensure arrays exist
          if (!fragment.actions) fragment.actions = []
          if (!fragment.dialogues) fragment.dialogues = []
          if (!fragment.thoughts) fragment.thoughts = []
        }
      }
    }
  }

  // Validate required fields
  if (!data.grid || !Array.isArray(data.grid)) {
    throw new Error('Phase 3 missing grid array')
  }
  if (!data.romance_stage_progression || !Array.isArray(data.romance_stage_progression)) {
    throw new Error('Phase 3 missing romance_stage_progression array')
  }
  if (!data.validation) {
    throw new Error('Phase 3 missing validation object')
  }

  // Validate grid structure
  if (data.grid.length === 0) {
    throw new Error('Phase 3 grid must have at least one part')
  }

  // Validate part count matches Phase 1
  const expectedPartCount = (phase1.external_plot?.acts || []).reduce((sum, act) => sum + (act.parts?.length || 0), 0)
  if (expectedPartCount > 0 && data.grid.length !== expectedPartCount) {
    console.warn(`Phase 3 WARNING: Grid has ${data.grid.length} parts but Phase 1 defined ${expectedPartCount} parts`)
  }

  // Count fragments, actions, dialogues, thoughts (normalization guarantees arrays exist)
  let totalFragments = 0
  let protagonistFragments = 0
  let romanceTaggedFragments = 0
  let totalActions = 0
  let totalDialogues = 0
  let totalThoughts = 0

  for (const gridEntry of data.grid) {
    if (!gridEntry.act || !gridEntry.part || !gridEntry.part_name || !gridEntry.fragments) {
      throw new Error(`Grid entry Act ${gridEntry.act || '?'} Part ${gridEntry.part || '?'} missing required fields (act, part, part_name, fragments)`)
    }
    for (const fragment of gridEntry.fragments) {
      totalFragments++
      totalActions += fragment.actions?.length || 0
      totalDialogues += fragment.dialogues?.length || 0
      totalThoughts += fragment.thoughts?.length || 0
      if (fragment.character_type === 'protagonist') {
        protagonistFragments++
      }
      if (fragment.romance_stage_tag) {
        romanceTaggedFragments++
      }
    }
  }

  // Validate romance stage progression
  const expectedStages = phase1.romance_arc_stages || []
  const foundStages = data.romance_stage_progression.map(p => p.stage)
  const missingStages = expectedStages.filter(s => !foundStages.includes(s))

  if (missingStages.length > 0) {
    console.warn(`Phase 3 WARNING: Missing romance stages: ${missingStages.join(', ')}`)
  }

  // Check stage order
  let stagesInOrder = true
  for (let i = 0; i < foundStages.length; i++) {
    const expectedIndex = expectedStages.indexOf(foundStages[i])
    if (i > 0) {
      const prevExpectedIndex = expectedStages.indexOf(foundStages[i - 1])
      if (expectedIndex <= prevExpectedIndex) {
        stagesInOrder = false
        console.warn(`Phase 3 WARNING: Romance stages out of order at ${foundStages[i]}`)
      }
    }
  }

  // Console logging
  console.log('Phase 3 complete.')
  console.log(`  Total parts: ${data.grid.length}`)
  console.log(`  Total fragments: ${totalFragments}`)
  console.log(`  Protagonist fragments: ${protagonistFragments}`)
  console.log(`  Romance-tagged fragments: ${romanceTaggedFragments}`)
  console.log(`  Total actions: ${totalActions}`)
  console.log(`  Total dialogues: ${totalDialogues}`)
  console.log(`  Total thoughts: ${totalThoughts}`)
  console.log(`  Romance stages found: ${foundStages.length}/${expectedStages.length}`)
  if (missingStages.length > 0) {
    console.log(`  Missing stages: ${missingStages.join(', ')}`)
  }
  console.log(`  Stages in order: ${stagesInOrder}`)

  // Log grid summary
  console.log('\n  Grid Summary:')
  data.grid.forEach(gridEntry => {
    console.log(`    Act ${gridEntry.act} Part ${gridEntry.part}: ${gridEntry.part_name}`)
    gridEntry.fragments.forEach(fragment => {
      const tag = fragment.romance_stage_tag ? ` [${fragment.romance_stage_tag}]` : ''
      const actCount = fragment.actions?.length || 0
      const dlgCount = fragment.dialogues?.length || 0
      const thtCount = fragment.thoughts?.length || 0
      console.log(`      ${fragment.character} (${fragment.character_type}): ${actCount}a/${dlgCount}d/${thtCount}t${tag}`)
    })
  })

  // Log romance progression
  console.log('\n  Romance Stage Progression:')
  data.romance_stage_progression.forEach(p => {
    const desc = p.description ? p.description.slice(0, 50) : 'no description'
    console.log(`    ${p.stage}: Act ${p.act} Part ${p.part}, ${p.character} - ${desc}...`)
  })

  console.log('')
  console.log('Phase 3 complete output:')
  console.log(JSON.stringify(data, null, 2))

  return data
}

// =============================================================================
// PHASE 4: SCENE ASSEMBLY
// =============================================================================

// Step 1: POV Character Journey — extract the protagonist's location-sequenced path through a part

const PHASE_4_STEP1_SYSTEM_PROMPT = `You are extracting the POV character's journey through a single story part.

You receive:
- The POV character's name
- Their Phase 3 fragment: location, actions, dialogues, thoughts
- The part context: act, part name, part description

Your job: Read the POV character's actions and determine the sequence of locations they visit during this part. Actions may all happen at one location, or they may imply movement between locations.

## RULES

1. Use the fragment's location field as the starting location
2. Read actions in order — if an action implies the character has moved to a new place, start a new journey stop
3. Each journey stop has: the location and the actions that happen there
4. Include dialogues and thoughts at the stop where they naturally occur
5. If all actions happen at one location, there is one journey stop
6. Location strings must be snake_case (e.g., hacienda_courtyard, village_church)
7. Reuse the Phase 3 location string when applicable — don't rename it

## SIGNALS THAT INDICATE MOVEMENT

- "goes to", "walks to", "rides to", "arrives at"
- "in the [new place]", "at the [new place]"
- Actions that cannot physically happen at the current location
- Meeting someone who is established as being elsewhere

## OUTPUT FORMAT (JSON)

{
  "pov_character": "Character Name",
  "journey": [
    {
      "stop": 1,
      "location": "location_string",
      "actions": ["action 1", "action 2"],
      "dialogues": ["dialogue 1"],
      "thoughts": ["thought 1"]
    }
  ]
}

Only output JSON. No commentary.`

async function executePhase4(concept, phase1, phase2, phase3) {
  console.log('Executing Phase 4: Scene Assembly (Step 1 — POV Journey)...')

  const parts = phase3.grid || []
  if (parts.length === 0) {
    throw new Error('Phase 4: Phase 3 grid is empty — no parts to process')
  }

  // Identify POV character (protagonist from Phase 2)
  const protagonist = phase2.protagonist?.name ||
    phase2.characters?.find(c => c.character_type === 'protagonist')?.name
  if (!protagonist) {
    throw new Error('Phase 4: Cannot identify protagonist from Phase 2')
  }
  console.log(`  POV character: ${protagonist}`)

  // Process first part only (Act 1 Part 1, for testing)
  const firstPart = parts[0]
  console.log(`  Processing Act ${firstPart.act} Part ${firstPart.part}: ${firstPart.part_name}`)

  // Find protagonist's fragment in first part
  const povFragment = firstPart.fragments?.find(f =>
    f.character === protagonist || f.character_type === 'protagonist'
  )
  if (!povFragment) {
    throw new Error(`Phase 4: No fragment for protagonist "${protagonist}" in Act ${firstPart.act} Part ${firstPart.part}`)
  }

  console.log(`  Fragment: ${povFragment.actions?.length || 0} actions, ${povFragment.dialogues?.length || 0} dialogues, ${povFragment.thoughts?.length || 0} thoughts @ ${povFragment.location}`)

  const userPrompt = `## POV Character
${protagonist}

## Part Context
Act ${firstPart.act} Part ${firstPart.part}: ${firstPart.part_name}
${firstPart.part_description}

## POV Character's Phase 3 Fragment
Location: ${povFragment.location}
Actions: ${JSON.stringify(povFragment.actions || [])}
Dialogues: ${JSON.stringify(povFragment.dialogues || [])}
Thoughts: ${JSON.stringify(povFragment.thoughts || [])}
State: ${povFragment.state || 'not specified'}
Intent: ${povFragment.intent || 'not specified'}

Extract the journey — the sequence of locations this character visits during this part, with their actions/dialogues/thoughts at each stop.`

  const response = await callOpenAI(PHASE_4_STEP1_SYSTEM_PROMPT, userPrompt, { maxTokens: 4096 })
  const parsed = parseJSON(response)

  if (!parsed.success) {
    console.error('Phase 4 Step 1 raw response (first 1000 chars):', response.slice(0, 1000))
    throw new Error(`Phase 4 Step 1 JSON parse failed: ${parsed.error}`)
  }

  let journeyData = parsed.data
  // Normalize: model might wrap
  if (journeyData.phase4_output) journeyData = journeyData.phase4_output
  if (journeyData.part) journeyData = journeyData.part

  // Validate journey structure
  if (!journeyData.journey || !Array.isArray(journeyData.journey)) {
    throw new Error(`Phase 4 Step 1: Missing journey array. Keys: ${Object.keys(journeyData).join(', ')}`)
  }

  // Assemble output
  const data = {
    act: firstPart.act,
    part: firstPart.part,
    part_name: firstPart.part_name,
    pov_character: protagonist,
    journey: journeyData.journey
  }

  // Log result
  console.log(`\n  POV Journey for Act ${firstPart.act} Part ${firstPart.part}:`)
  for (const stop of data.journey) {
    console.log(`    Stop ${stop.stop}: ${stop.location} — ${stop.actions?.length || 0} actions, ${stop.dialogues?.length || 0} dialogues, ${stop.thoughts?.length || 0} thoughts`)
  }

  console.log('')
  console.log('Phase 4 Step 1 complete output:')
  console.log(JSON.stringify(data, null, 2))

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
      role: 'stakeholder',
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
      external_part: t.external_part || null,
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
Wound: ${character.wound || 'none'}
Lie: ${character.lie || 'none'}
Arc: ${character.arc?.starts || '?'} → ${character.arc?.ends || '?'}

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
Wound: ${character.wound || 'none'}
Lie: ${character.lie || 'none'}
Arc: ${character.arc?.starts || '?'} → ${character.arc?.ends || '?'}
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
Stakeholder characters typically need 2-4 moments of their own for arc progression.`

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

// Place Phase 4 stakeholder moments based on their relationship to Phase 3 moments
// This runs BEFORE verification to ensure all decisive moments are represented
function placeStakeholderMoments(timeline, phase4) {
  const characterMoments = phase4.character_moments || []
  if (characterMoments.length === 0) return timeline

  let updatedTimeline = [...timeline]
  let placed = 0
  let merged = 0
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

    // Find connected moment index
    let connectedIndex = -1
    if (cm.connects_to_phase3_moment) {
      connectedIndex = updatedTimeline.findIndex(m =>
        m.moment.toLowerCase() === cm.connects_to_phase3_moment.toLowerCase()
      )
    }

    // Handle based on relationship type
    const relationship = cm.relationship || 'follows' // Default to follows for backwards compatibility

    if (relationship === 'during') {
      // "during" moments should ALWAYS merge into existing moments, never create separate entries
      if (connectedIndex >= 0) {
        // Merge into existing moment's characters_present - preserve all main moment properties
        const existingMoment = updatedTimeline[connectedIndex]
        if (!existingMoment.characters_present) existingMoment.characters_present = []

        // Check if character already present
        if (!existingMoment.characters_present.some(p => p.name === cm.character)) {
          existingMoment.characters_present.push({
            name: cm.character,
            role: 'supporting',
            action: cm.what_happens,
            arc_state: 'active'
          })
        }
        merged++
        console.log(`      Merged "${cm.moment}" into "${existingMoment.moment}" (during - enriched characters_present)`)
      } else {
        // Connected moment not found - warn but don't create separate entry for "during" moments
        console.warn(`      WARNING: Could not find connected moment "${cm.connects_to_phase3_moment}" for "during" merge of "${cm.moment}". Skipping.`)
      }
      continue
    }

    // Build the new moment entry for causes/follows
    const momentToInsert = {
      order: 0, // Will be recalculated
      moment: cm.moment,
      source: `${cm.character} stakeholder moment`,
      type: 'subplot',
      what_happens: cm.what_happens,
      pov: cm.pov || cm.character,
      characters_present: [
        {
          name: cm.character,
          role: 'supporting',
          action: cm.what_happens,
          arc_state: 'active'
        }
      ]
    }

    if (connectedIndex >= 0) {
      if (relationship === 'causes') {
        // Insert BEFORE the connected moment
        updatedTimeline.splice(connectedIndex, 0, momentToInsert)
        console.log(`      Placed "${cm.moment}" BEFORE "${cm.connects_to_phase3_moment}" (causes)`)
      } else {
        // 'follows' or default - Insert AFTER the connected moment
        updatedTimeline.splice(connectedIndex + 1, 0, momentToInsert)
        console.log(`      Placed "${cm.moment}" AFTER "${cm.connects_to_phase3_moment}" (follows)`)
      }
    } else {
      // If no connection point found, add to end
      updatedTimeline.push(momentToInsert)
      console.log(`      Placed "${cm.moment}" at end (no connection found)`)
    }

    placed++
  }

  // Recalculate order numbers
  updatedTimeline.forEach((m, i) => {
    m.order = i + 1
  })

  console.log(`    Summary: ${placed} placed, ${merged} merged, ${alreadyPresent} already present (${characterMoments.length} total from Phase 4)`)

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
${phase4.stakeholder_characters?.map(c => `- ${c.name}: ${c.interest}`).join('\n')}

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
    ...(phase4.stakeholder_characters?.map(c => ({ name: c.name, role: 'stakeholder' })) || [])
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

  // Get all stakeholder characters to process
  const stakeholderCast = phase4.stakeholder_characters || []

  console.log(`  Processing ${stakeholderCast.length} stakeholder characters...`)

  // Store all presence data for arc tracking
  const allPresenceData = []

  // Process all stakeholder characters (presence mapping - arc moments come from Phase 4)
  for (const character of stakeholderCast) {
    console.log(`    Processing ${character.name}...`)

    // Presence mapping - stakeholder characters get their arc moments from Phase 4,
    // not from Phase 5 subplot generation (which would create duplicates)
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

  console.log('')
  console.log('Phase 5 complete output:')
  console.log(JSON.stringify(result, null, 2))

  return result
}

// =============================================================================
// PHASE 6: MAJOR EVENTS & LOCATIONS
// =============================================================================

const PHASE_6_SYSTEM_PROMPT = `You organize a story's decisive moments into the spatial and social reality of the story world.

You receive a master timeline of decisive moments and the story's external plot structure. Your job:

1. IDENTIFY CLUSTERS: Group moments that would naturally occur at the same occasion (a festival, a church service, a family dinner, a battle, a ceremony). Base this on:
   - External plot part (moments tied to the same world event)
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
      "external_part": "string - which Phase 1 act/part this relates to, or null",
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
    phase4.stakeholder_characters.forEach(c => castNames.push(`${c.name} (stakeholder)`))
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

  // Extract external plot parts from Phase 1
  const externalParts = (phase1.external_plot?.acts || []).map(act =>
    `  **Act ${act.act}: ${act.name || ''}**\n` + (act.parts || []).map(p =>
      `    Part ${p.part}: ${p.name} — ${p.time_period || ''}`
    ).join('\n')
  ).join('\n') || '  (none specified)'

  return `CONCEPT: ${concept}

## SETTING & TIMESPAN

Setting: ${phase1.subgenre || 'not specified'}
Timespan: ${phase1.timespan?.duration || 'not specified'}
External plot type: ${phase1.external_plot?.container_type || 'not specified'}
External plot summary: ${phase1.external_plot?.container_summary || 'not specified'}

## EXTERNAL PLOT PARTS (from Phase 1)

${externalParts}

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

  console.log('')
  console.log('Phase 6 complete output:')
  console.log(JSON.stringify(result, null, 2))

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
    "part": "Phase 1 external act/part name or null",
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
      "who_must_know": ["Character name(s) who need to learn/feel this"],
      "who_has_info": ["Character name(s) or sources that hold this information - can be empty for internal memories"],
      "delivery_options": ["Array of valid methods: told_by | discovers | overhears | observes | internal_memory | reads_document"],
      "emotional_function": "What this does to the receiving character - pressure, guilt, hope, fear, etc.",
      "function": "seed | setup | escalation | context"
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

Setup requirements - CRITICAL STRUCTURE:
- requirement: Be specific about what must be established
- who_must_know: Character(s) who need this in their awareness. For internal memories, the remembering character. For pressure/stakes, the character being pressured.
- who_has_info: Character(s) who already know this, OR non-character sources (documents, letters, physical evidence, location itself). Empty array for internal memories.
- delivery_options: How this can enter the story. Use these exact values:
  * "told_by" - another character tells them
  * "discovers" - character finds out through investigation/action
  * "overhears" - character hears something not meant for them
  * "observes" - character witnesses something
  * "internal_memory" - character remembers (requires POV)
  * "reads_document" - character reads a letter, newspaper, etc.
- emotional_function: The emotional impact on the receiving character (pressure, guilt, hope, fear, longing, etc.)
- function: seed/setup/escalation/context as before`

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
    phase4.stakeholder_characters.forEach(c => {
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

Theme Tension: ${phase1.theme?.tension || 'not specified'}
External Plot: ${phase1.external_plot?.container_type || 'not specified'}
External Plot Parts:
${(phase1.external_plot?.acts || []).map(act =>
    `  Act ${act.act}: ${act.name || ''}\n` + (act.parts || []).map(p =>
      `    Part ${p.part}: ${p.name} — ${p.time_period || ''}`
    ).join('\n')
  ).join('\n') || '  (none)'}
${setupContext}
${previousContext}

## YOUR TASK

Develop this event fully. For each character present, specify their objective and arc state. Break down each decisive moment. Identify romance progression and psychological shifts. Specify what must be established earlier in the story for this event to land.`
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
    let parsed = parseJSON(response)

    // Retry once on parse failure with JSON reminder
    if (!parsed.success) {
      console.warn(`      ⚠ Parse failed for "${eventName}", retrying with JSON reminder...`)

      const retryPrompt = userPrompt + `

CRITICAL: Your previous response had invalid JSON. Ensure:
- No unescaped newlines inside string values (use \\n instead)
- All strings properly closed with quotes
- No trailing commas
- Valid JSON structure

Return ONLY valid JSON.`

      const retryResponse = await callOpenAI(PHASE_7_EVENT_SYSTEM_PROMPT, retryPrompt, { maxTokens: 8192 })
      const retryParsed = parseJSON(retryResponse)

      if (retryParsed.success) {
        console.log(`      ✓ Retry succeeded for "${eventName}"`)
        parsed = retryParsed
      } else {
        console.warn(`      ⚠ Retry also failed for "${eventName}": ${retryParsed.error}`)
        console.warn(`      Raw retry response (first 2000 chars):`)
        console.warn(retryResponse.slice(0, 2000))
      }
    }

    if (!parsed.success) {
      // Create a minimal fallback entry after retry failed
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
        external_pressure: { part: null },
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

  console.log('')
  console.log('Phase 7 complete output:')
  console.log(JSON.stringify(result, null, 2))

  return result
}

// =============================================================================
// PHASE 8: SUPPORTING SCENES
// =============================================================================

const PHASE_8_SYSTEM_PROMPT = `You are a story architect processing setup requirements.

Phase 7 generated STRUCTURED setup requirements with constraints. Each requirement includes:
- requirement: What must be established
- who_must_know: Character(s) who need to learn/feel this
- who_has_info: Character(s) or sources that hold this information
- delivery_options: Valid methods (told_by, discovers, overhears, observes, internal_memory, reads_document)
- emotional_function: What this does to the receiving character (pressure, guilt, hope, fear, etc.)
- function: seed/setup/escalation/context
- serves_event: Which event needs this

Your job is to:
1. Deduplicate identical or near-identical requirements
   - CRITICAL: When consolidating duplicates, merge their serves_event values into events_needing_this array
   - Set earliest_event to whichever event comes FIRST in the master timeline
   - This requirement must be placed before earliest_event to serve ALL events that need it
2. Check which requirements are ALREADY COVERED by the master timeline (these are the plot, not setup FOR the plot)
3. Attach remaining requirements to existing events where constraints are satisfied
4. Create new supporting scenes for requirements that need their own scene

CRITICAL RULES:
- Check timeline coverage FIRST - many "requirements" are actually describing things that happen in the main plot
- If a timeline moment already shows the requirement happening, it doesn't need a scene - it IS a scene
- Attachment is preferred - fewer scenes = tighter story
- Supporting scenes are LIGHT - they establish things, they don't have character arcs or transformations
- Max 3-4 requirements per supporting scene, but ONLY if a single POV character can receive all of them
- Every requirement must have a home - no orphans

When creating a supporting scene:
1. Pick a POV character - any character who naturally receives the information
2. Decide how they receive it (told_by, overhears, observes, discovers)
3. Add any other characters needed to provide the information
4. Build the scene description

Return valid JSON matching this exact structure:
{
  "deduplicated_requirements": {
    "total_from_phase_7": <number>,
    "unique_requirements": <number>,
    "duplicates_consolidated": <number>,
    "requirements": [
      {
        "requirement_id": "req_001",
        "requirement": "<exact requirement text>",
        "who_must_know": ["<character names>"],
        "who_has_info": ["<character names or sources>"],
        "delivery_options": ["<valid delivery methods>"],
        "emotional_function": "<emotional impact>",
        "events_needing_this": ["<event names>"],
        "earliest_event": "<first event that needs this>",
        "function": "seed|setup|escalation|context"
      }
    ]
  },

  "covered_by_timeline": [
    {
      "requirement_id": "req_001",
      "requirement": "<requirement text>",
      "covered_by_moment": "<timeline moment name that fulfills this>",
      "reason": "<why this moment already covers the requirement>"
    }
  ],

  "attached_to_existing": [
    {
      "event_name": "<existing event name>",
      "event_type": "major_event|lone_moment",
      "requirements_attached": [
        {
          "requirement_id": "req_001",
          "requirement": "<requirement text>",
          "who_receives": "<character from who_must_know>",
          "delivery_method": "<one of the valid delivery_options>",
          "how_established": "<specific description of how this gets delivered>",
          "serves_events": ["<event names this serves>"]
        }
      ]
    }
  ],

  "supporting_scenes": [
    {
      "scene_id": "supporting_001",
      "pov": "<character who experiences this scene>",
      "pov_receives_via": "<told_by | overhears | observes | discovers | reads_document | internal_memory>",
      "pov_learns": "<what the POV character learns in this scene>",
      "other_characters": ["<non-POV characters who provide the information - can be empty>"],
      "location": "<where the POV character receives this information>",
      "what_pov_experiences": "<1-2 sentences from POV character's perspective>",
      "requirements_established": ["req_001", "req_002"],
      "function": "seed|setup|escalation|context",
      "placement_zone": "early|mid|late",
      "must_be_before": "<earliest event needing these requirements>"
    }
  ],

  "coverage_verification": {
    "total_unique_requirements": <number>,
    "covered_by_timeline": <number>,
    "attached_to_existing": <number>,
    "in_new_scenes": <number>,
    "all_requirements_placed": true|false,
    "gaps": ["<any unplaced requirement IDs>"]
  }
}`

function buildPhase8Prompt(concept, phase1, phase2, phase4, phase5, phase6, phase7) {
  // Get master timeline from Phase 5 for coverage checking
  const masterTimeline = phase5.master_timeline || []

  // Get all events from Phase 6 for attachment candidates
  const majorEvents = phase6.major_events || []
  const loneMoments = phase6.lone_moments || []

  // Get all setup requirements from Phase 7
  const allRequirements = phase7.all_setup_requirements || []
  const developedEvents = phase7.developed_events || []

  // Build event summary with characters present (for attachment matching)
  const eventSummary = []

  for (const event of majorEvents) {
    eventSummary.push({
      name: event.name,
      type: 'major_event',
      location: event.location,
      characters_present: event.characters_present || [],
      timeline_position: event.timeline_position
    })
  }

  for (const moment of loneMoments) {
    eventSummary.push({
      name: moment.moment_name,
      type: 'lone_moment',
      location: moment.location,
      characters_present: moment.characters_present || [],
      timeline_position: moment.timeline_position
    })
  }

  // Sort by timeline position
  eventSummary.sort((a, b) => parseFloat(a.timeline_position) - parseFloat(b.timeline_position))

  // Build structured requirement list for prompt
  const formattedRequirements = allRequirements.map((req, i) => {
    const whoMustKnow = req.who_must_know?.join(', ') || 'unspecified'
    const whoHasInfo = req.who_has_info?.length > 0 ? req.who_has_info.join(', ') : 'none/internal'
    const deliveryOpts = req.delivery_options?.join(', ') || 'unspecified'
    return `${i + 1}. [${req.function}] "${req.requirement}"
   who_must_know: ${whoMustKnow}
   who_has_info: ${whoHasInfo}
   delivery_options: ${deliveryOpts}
   emotional_function: ${req.emotional_function || 'unspecified'}
   serves_event: ${req.serves_event}`
  }).join('\n\n')

  // Build timeline summary for coverage checking
  const timelineSummary = masterTimeline.map(m => {
    return `- Moment ${m.order}: "${m.name}" - ${m.what_happens?.slice(0, 100) || 'no description'}...`
  }).join('\n')

  // Build the prompt
  return `STORY: ${concept}

MASTER TIMELINE FROM PHASE 5 (${masterTimeline.length} moments):
${timelineSummary}

EXISTING EVENTS (candidates for attachment - note characters present):
${eventSummary.map(e => `- "${e.name}" (${e.type}) at "${e.location}" - Characters: ${e.characters_present.join(', ') || 'none listed'} - Timeline: ${e.timeline_position}`).join('\n')}

STRUCTURED SETUP REQUIREMENTS FROM PHASE 7 (${allRequirements.length} total):
${formattedRequirements}

TASK:
1. Deduplicate the ${allRequirements.length} requirements - many are duplicates or near-duplicates. Preserve who_must_know, who_has_info, delivery_options from original requirements. CRITICAL: When merging duplicates, combine their serves_event values into events_needing_this and set earliest_event to the event that comes first in the timeline.
2. CRITICAL: After deduplication, check which requirements are ALREADY FULFILLED by the master timeline moments. If a requirement says "X must happen" and the timeline already shows X happening, mark it as covered_by_timeline. These do NOT need attachment or new scenes.
3. For remaining unique requirements, check if they can attach to an existing event WHERE:
   - At least one who_must_know character is present in that event
   - The delivery_option is possible in that event context
4. Group remaining requirements into supporting scenes. ONLY combine requirements that share who_must_know characters. Max 3-4 per scene.
5. Assign placement zones based on function (seed=early, setup=close before event, escalation=mid, context=flexible)
6. POV for each supporting scene should be from who_must_know - the character who naturally receives the information
7. Verify every requirement is either covered_by_timeline, attached, or in a new scene

Return valid JSON.`
}


async function executePhase8(concept, phase1, phase2, phase4, phase5, phase6, phase7) {
  console.log('')
  console.log('='.repeat(60))
  console.log('Phase 8: Supporting Scenes')
  console.log('='.repeat(60))

  const allRequirements = phase7.all_setup_requirements || []
  console.log(`  Total requirements from Phase 7: ${allRequirements.length}`)

  // Step 1: Call LLM to process requirements
  console.log('')
  console.log('  Step 1: Processing requirements...')
  console.log('    - Deduplicating requirements')
  console.log('    - Checking which are already covered by timeline')
  console.log('    - Identifying attachment opportunities')
  console.log('    - Creating supporting scenes')

  const prompt = buildPhase8Prompt(concept, phase1, phase2, phase4, phase5, phase6, phase7)
  const response = await callClaude(PHASE_8_SYSTEM_PROMPT, prompt, { temperature: 0.7, maxTokens: 32768 })

  // Parse response
  const parsed = parseJSON(response)
  if (!parsed.success) {
    console.warn(`  ⚠ Parse failed: ${parsed.error}`)
    console.warn(`  Raw response (first 3000 chars):`)
    console.warn(response.slice(0, 3000))

    // Return minimal structure on parse failure
    return {
      deduplicated_requirements: {
        total_from_phase_7: allRequirements.length,
        unique_requirements: 0,
        duplicates_consolidated: 0,
        requirements: []
      },
      covered_by_timeline: [],
      attached_to_existing: [],
      supporting_scenes: [],
      coverage_verification: {
        total_unique_requirements: 0,
        covered_by_timeline: 0,
        attached_to_existing: 0,
        in_new_scenes: 0,
        requirements_per_new_scene_avg: 0,
        all_requirements_placed: false,
        gaps: ['Parse failed - all requirements unplaced']
      },
      _parse_error: parsed.error
    }
  }

  const result = parsed.data

  // Step 2: Log deduplication results
  console.log('')
  console.log('  Step 2: Deduplication complete')
  const dedup = result.deduplicated_requirements || {}
  console.log(`    Total from Phase 7: ${dedup.total_from_phase_7 || allRequirements.length}`)
  console.log(`    Unique requirements: ${dedup.unique_requirements || 0}`)
  console.log(`    Duplicates consolidated: ${dedup.duplicates_consolidated || 0}`)

  // Step 2.5: Log requirements covered by timeline
  console.log('')
  console.log('  Step 2.5: Requirements already covered by timeline')
  const coveredByTimeline = result.covered_by_timeline || []
  console.log(`    Covered by timeline: ${coveredByTimeline.length}`)
  for (const covered of coveredByTimeline) {
    console.log(`    - "${covered.requirement?.slice(0, 50)}..." covered by "${covered.covered_by_moment}"`)
    console.log(`      Reason: ${covered.reason?.slice(0, 80)}...`)
  }

  // Step 3: Log attachments
  console.log('')
  console.log('  Step 3: Attachments to existing events')
  const attachments = result.attached_to_existing || []
  let totalAttached = 0
  for (const attachment of attachments) {
    const reqCount = attachment.requirements_attached?.length || 0
    totalAttached += reqCount
    console.log(`    "${attachment.event_name}" (${attachment.event_type}): ${reqCount} requirements attached`)
    for (const req of (attachment.requirements_attached || [])) {
      console.log(`      - "${req.requirement?.slice(0, 50)}..." via ${req.how_established}`)
    }
  }
  console.log(`    Total attached: ${totalAttached}`)

  // Step 4: Log supporting scenes
  console.log('')
  console.log('  Step 4: New supporting scenes')
  const scenes = result.supporting_scenes || []
  console.log(`    Created ${scenes.length} supporting scenes`)

  for (const scene of scenes) {
    const reqCount = scene.requirements_established?.length || 0
    const pov = scene.pov || 'UNDEFINED'
    const otherChars = scene.other_characters || []

    console.log(`    "${scene.scene_id}" (${scene.function}, ${scene.placement_zone}):`)
    console.log(`      POV: ${pov}`)
    console.log(`      Receives via: ${scene.pov_receives_via || 'unspecified'}`)
    console.log(`      Learns: ${scene.pov_learns?.slice(0, 60) || 'unspecified'}...`)
    console.log(`      Other characters: ${otherChars.join(', ') || 'none'}`)
    console.log(`      Location: ${scene.location}`)
    console.log(`      What happens: ${scene.what_pov_experiences?.slice(0, 60) || 'unspecified'}...`)
    console.log(`      Must be before: ${scene.must_be_before}`)
    console.log(`      Requirements: ${Array.isArray(scene.requirements_established) ? scene.requirements_established.join(', ') : reqCount}`)
  }

  // Step 5: Log coverage verification
  console.log('')
  console.log('  Step 5: Coverage verification')
  const coverage = result.coverage_verification || {}
  console.log(`    Total unique requirements: ${coverage.total_unique_requirements || 0}`)
  console.log(`    Covered by timeline: ${coverage.covered_by_timeline || 0}`)
  console.log(`    Attached to existing: ${coverage.attached_to_existing || 0}`)
  console.log(`    In new scenes: ${coverage.in_new_scenes || 0}`)
  console.log(`    All requirements placed: ${coverage.all_requirements_placed ? 'YES' : 'NO'}`)

  if (coverage.gaps?.length > 0) {
    console.warn(`    ⚠ GAPS (unplaced requirements):`)
    for (const gap of coverage.gaps) {
      console.warn(`      - ${gap}`)
    }
  }

  // Final summary
  console.log('')
  console.log('Phase 8 complete.')
  console.log(`  Unique requirements: ${dedup.unique_requirements || 0}`)
  console.log(`  Attached to existing events: ${totalAttached}`)
  console.log(`  New supporting scenes: ${scenes.length}`)

  // Breakdown by function for supporting scenes
  const byFunction = {}
  for (const scene of scenes) {
    byFunction[scene.function] = (byFunction[scene.function] || 0) + 1
  }
  if (Object.keys(byFunction).length > 0) {
    console.log(`  Supporting scenes by function:`)
    for (const [fn, count] of Object.entries(byFunction)) {
      console.log(`    - ${fn}: ${count}`)
    }
  }

  // Breakdown by placement zone
  const byZone = {}
  for (const scene of scenes) {
    byZone[scene.placement_zone] = (byZone[scene.placement_zone] || 0) + 1
  }
  if (Object.keys(byZone).length > 0) {
    console.log(`  Supporting scenes by placement:`)
    for (const [zone, count] of Object.entries(byZone)) {
      console.log(`    - ${zone}: ${count}`)
    }
  }

  console.log('')
  console.log('Phase 8 complete output:')
  console.log(JSON.stringify(result, null, 2))

  return result
}

// =============================================================================
// PHASE 9: SCENE SEQUENCING & CHAPTER ASSEMBLY
// =============================================================================

const PHASE_9_SYSTEM_PROMPT = `You are a story architect assembling scenes into a chaptered structure.

You have:
1. Major events and lone moments (from Phase 6) with locations and characters
2. Supporting scenes (from Phase 8) with POV, must_be_before constraints
3. Timeline order from Phase 5

Your job is to:
1. Create a linear scene sequence respecting all constraints
2. Group scenes into chapters based on POV
3. Assign chapter metadata (hooks, tension, titles)

CRITICAL RULES:

SCENE SEQUENCING:
- Major events and lone moments are ordered by their lowest moment number
- Supporting scenes MUST appear BEFORE their must_be_before target
- If must_be_before is "Event X", the supporting scene goes before Event X

CHAPTER GROUPING:
- Single POV per chapter (NO mid-chapter POV switches)
- POV change triggers a new chapter
- Let chapter count emerge naturally from scene groupings - do not force a target

CHAPTER HOOKS:
Each chapter ends with a hook to pull readers forward:
- cliffhanger: Action or danger unresolved
- question: Mystery or uncertainty raised
- revelation: New information that changes everything
- emotional: Intense feeling that demands resolution
- decision: Character facing a choice

Return valid JSON matching this exact structure:
{
  "scene_sequence": [
    {
      "order": 1,
      "type": "supporting_scene | major_event | lone_moment",
      "id": "supporting_001 | Event Name",
      "pov": "Character name",
      "location": "Where this takes place",
      "brief": "One sentence summary"
    }
  ],
  "chapters": [
    {
      "number": 1,
      "title": "Evocative chapter title",
      "pov": "Character name",
      "scenes": [1, 2, 3],
      "tension_rating": 5,
      "hook_type": "cliffhanger | question | revelation | emotional | decision",
      "hook_description": "What pulls reader forward",
      "emotional_arc": "start_emotion → end_emotion"
    }
  ],
  "validation": {
    "total_scenes": 25,
    "scenes_in_chapters": 25,
    "all_scenes_placed": true,
    "must_be_before_violations": [],
    "pov_violations": [],
    "chapter_count": 12
  }
}`

function buildPhase9Prompt(concept, phase2, phase5, phase6, phase7, phase8, lengthPreset) {
  // Get POV characters
  const protag = phase2.protagonist?.name || 'Protagonist'
  const loveInterest = phase2.love_interests?.[0]?.name || 'Love Interest'

  // Get timeline for ordering
  const timeline = phase5.master_timeline || []

  // Build scene list from Phase 6 (major events and lone moments)
  const majorEvents = phase6.major_events || []
  const loneMoments = phase6.lone_moments || []

  // Build event list with timeline position (lowest moment number)
  const eventList = []

  for (const event of majorEvents) {
    const moments = event.moments_contained || []
    const lowestMoment = Math.min(...moments.filter(m => m > 0))
    // Find POV from timeline for any contained moment
    let pov = null
    for (const momentNum of moments) {
      const timelineMoment = timeline.find(m => m.order === momentNum)
      if (timelineMoment?.pov) {
        pov = timelineMoment.pov
        break
      }
    }
    eventList.push({
      type: 'major_event',
      id: event.name,
      timeline_position: lowestMoment,
      pov: pov || protag,
      location: event.location || 'unspecified',
      moments: moments,
      characters_present: event.characters_present || []
    })
  }

  for (const moment of loneMoments) {
    const timelineMoment = timeline.find(m => m.order === moment.moment_order)
    eventList.push({
      type: 'lone_moment',
      id: moment.moment_name || `Moment ${moment.moment_order}`,
      timeline_position: moment.moment_order,
      pov: timelineMoment?.pov || protag,
      location: moment.location || 'unspecified',
      characters_present: moment.characters_present || []
    })
  }

  // Sort by timeline position
  eventList.sort((a, b) => a.timeline_position - b.timeline_position)

  // Get supporting scenes from Phase 8
  const supportingScenes = phase8.supporting_scenes || []

  // Build supporting scene list
  const supportingList = supportingScenes.map(scene => ({
    type: 'supporting_scene',
    id: scene.scene_id,
    pov: scene.pov || protag,
    location: scene.location || 'unspecified',
    must_be_before: scene.must_be_before,
    what_happens: scene.what_pov_experiences || scene.pov_learns || 'Setup scene',
    placement_zone: scene.placement_zone
  }))

  // Build formatted event list
  const eventListStr = eventList.map((e, i) => {
    const chars = e.characters_present.join(', ') || 'see Phase 6'
    return `${i + 1}. [${e.type}] "${e.id}"
   Timeline position: ${e.timeline_position}
   POV: ${e.pov}
   Location: ${e.location}
   Characters: ${chars}`
  }).join('\n\n')

  // Build formatted supporting scenes list
  let supportingStr = 'No supporting scenes from Phase 8'
  if (supportingList.length > 0) {
    supportingStr = supportingList.map(s => `- "${s.id}" [POV: ${s.pov}]
   must_be_before: "${s.must_be_before}"
   placement_zone: ${s.placement_zone}
   what_happens: ${s.what_happens}`).join('\n\n')
  }

  // Build the prompt
  return `STORY: ${concept}

POV CHARACTERS:
- Protagonist (heroine): ${protag}
- Love Interest (hero): ${loveInterest}

MAJOR EVENTS AND LONE MOMENTS (in timeline order):
${eventListStr}

SUPPORTING SCENES (must be placed before their target):
${supportingStr}

TASK:
1. Create scene_sequence:
   - Start with major events and lone moments in timeline order
   - Insert each supporting scene BEFORE its must_be_before target
   - Assign order numbers 1, 2, 3...
   - Each scene gets POV from the data above (default to ${protag} if unclear)

2. Group into chapters:
   - Same POV = same chapter (continue grouping)
   - POV change = new chapter starts
   - Let chapter count emerge naturally from POV groupings

3. Assign chapter metadata:
   - title: Evocative, based on key imagery or moment
   - tension_rating: 1-10 based on stakes and conflict
   - hook_type: How chapter ends (cliffhanger/question/revelation/emotional/decision)
   - hook_description: Specific hook that pulls reader to next chapter
   - emotional_arc: "curiosity → dread" or "hope → devastation" etc.

4. Validate:
   - Every scene appears exactly once
   - No must_be_before violations
   - No mid-chapter POV changes

Return valid JSON.`
}

async function executePhase9(concept, phase2, phase5, phase6, phase7, phase8, lengthPreset) {
  console.log('')
  console.log('='.repeat(60))
  console.log('Phase 9: Scene Sequencing & Chapter Assembly')
  console.log('='.repeat(60))

  // Count input scenes
  const majorEvents = phase6.major_events || []
  const loneMoments = phase6.lone_moments || []
  const supportingScenes = phase8.supporting_scenes || []

  console.log(`  Input: ${majorEvents.length} major events, ${loneMoments.length} lone moments, ${supportingScenes.length} supporting scenes`)

  // Step 1: Call LLM
  console.log('')
  console.log('  Step 1: Sequencing scenes and assembling chapters...')

  const prompt = buildPhase9Prompt(concept, phase2, phase5, phase6, phase7, phase8, lengthPreset)
  const response = await callClaude(PHASE_9_SYSTEM_PROMPT, prompt, { temperature: 0.7, maxTokens: 16384 })

  // Parse response
  const parsed = parseJSON(response)
  if (!parsed.success) {
    console.warn(`  ⚠ Parse failed: ${parsed.error}`)
    console.warn(`  Raw response (first 3000 chars):`)
    console.warn(response.slice(0, 3000))

    // Return minimal structure on parse failure
    return {
      scene_sequence: [],
      chapters: [],
      validation: {
        total_scenes: 0,
        scenes_in_chapters: 0,
        all_scenes_placed: false,
        must_be_before_violations: ['Parse failed'],
        pov_violations: [],
        chapter_count: 0
      },
      _parse_error: parsed.error
    }
  }

  const result = parsed.data

  // Step 2: Log scene sequence
  console.log('')
  console.log('  Step 2: Scene sequence')
  const sequence = result.scene_sequence || []
  console.log(`    Total scenes in sequence: ${sequence.length}`)

  // Show first few and last few scenes
  const previewCount = 5
  if (sequence.length > 0) {
    console.log('    First scenes:')
    for (const scene of sequence.slice(0, previewCount)) {
      console.log(`      ${scene.order}. [${scene.type}] "${scene.id}" - POV: ${scene.pov}`)
    }
    if (sequence.length > previewCount * 2) {
      console.log(`      ... (${sequence.length - previewCount * 2} more scenes) ...`)
    }
    if (sequence.length > previewCount) {
      console.log('    Last scenes:')
      for (const scene of sequence.slice(-previewCount)) {
        console.log(`      ${scene.order}. [${scene.type}] "${scene.id}" - POV: ${scene.pov}`)
      }
    }
  }

  // Step 3: Log chapters
  console.log('')
  console.log('  Step 3: Chapters')
  const chapters = result.chapters || []
  console.log(`    Total chapters: ${chapters.length}`)

  for (const chapter of chapters) {
    const sceneCount = chapter.scenes?.length || 0
    console.log(`    Ch ${chapter.number}: "${chapter.title}" - POV: ${chapter.pov}, ${sceneCount} scenes, tension: ${chapter.tension_rating}/10`)
    console.log(`      Hook: ${chapter.hook_type} - ${chapter.hook_description?.slice(0, 50)}...`)
  }

  // Step 4: Validation
  console.log('')
  console.log('  Step 4: Validation')
  const validation = result.validation || {}

  // Check scene coverage
  const expectedScenes = majorEvents.length + loneMoments.length + supportingScenes.length
  const actualScenes = sequence.length
  console.log(`    Scenes: ${actualScenes}/${expectedScenes} (expected)`)

  if (validation.all_scenes_placed) {
    console.log('    ✓ All scenes placed')
  } else {
    console.warn('    ⚠ Not all scenes placed!')
  }

  // Check must_be_before violations
  const beforeViolations = validation.must_be_before_violations || []
  if (beforeViolations.length === 0) {
    console.log('    ✓ No must_be_before violations')
  } else {
    console.warn(`    ⚠ must_be_before violations: ${beforeViolations.length}`)
    for (const v of beforeViolations) {
      console.warn(`      - ${v}`)
    }
  }

  // Check POV violations
  const povViolations = validation.pov_violations || []
  if (povViolations.length === 0) {
    console.log('    ✓ No POV violations within chapters')
  } else {
    console.warn(`    ⚠ POV violations: ${povViolations.length}`)
    for (const v of povViolations) {
      console.warn(`      - ${v}`)
    }
  }

  console.log(`    Chapter count: ${chapters.length}`)

  // Final summary
  console.log('')
  console.log('Phase 9 complete.')
  console.log(`  Scene sequence: ${sequence.length} scenes`)
  console.log(`  Chapters: ${chapters.length}`)
  console.log(`  POV split: ${povDist.protagonist_name} ${protagPercent}% / ${povDist.love_interest_name} ${liPercent}%`)

  console.log('')
  console.log('Phase 9 complete output:')
  console.log(JSON.stringify(result, null, 2))

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
        updatedBible.sceneAssembly = await executePhase4(concept, updatedBible.coreFoundation, updatedBible.characters, updatedBible.actionGrid)
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
    case 8:
      if (phaseNumber <= 8) {
        updatedBible.supportingScenes = await executePhase8(
          concept,
          updatedBible.coreFoundation,
          updatedBible.characters,
          updatedBible.subplots,
          updatedBible.masterTimeline,
          updatedBible.eventsAndLocations,
          updatedBible.eventDevelopment
        )
      }
    case 9:
      if (phaseNumber <= 9) {
        updatedBible.chapterAssembly = await executePhase9(
          concept,
          updatedBible.characters,
          updatedBible.masterTimeline,
          updatedBible.eventsAndLocations,
          updatedBible.eventDevelopment,
          updatedBible.supportingScenes,
          lengthPreset
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
  1: { name: 'Story DNA', description: 'Establishing story DNA, theme, external plot acts/parts, and romance arc stages' },
  2: { name: 'Full Cast', description: 'Creating protagonist, love interests, AND stakeholder characters with psychology' },
  3: { name: 'Character Action Grid', description: 'Act-by-act, part-by-part actions for all characters across all external parts' },
  4: { name: 'Scene Assembly', description: 'Extracting POV character journey through each part' },
  6: { name: 'Major Events & Locations', description: 'Organizing grid actions into events, assigning locations' },
  7: { name: 'Event Development', description: 'Developing events back-to-front with setup requirements' },
  8: { name: 'Supporting Scenes', description: 'Creating supporting scenes to fulfill setup requirements' },
  9: { name: 'Scene Sequencing', description: 'Assembling scenes into chaptered structure with POV and hooks' },
}

/**
 * Run a single phase of the bible generation pipeline
 * @param {number} phase - Which phase to run (1, 2, or 3)
 * @param {string} concept - Story concept/description
 * @param {string} lengthPreset - 'novella' or 'novel'
 * @param {string} level - Reading level (Beginner, Intermediate, Native)
 * @param {Object} bible - Existing bible object (for phases 2+)
 * @param {Array} librarySummaries - Existing book summaries for diversity (default [])
 * @returns {Promise<Object>} Updated bible with new phase data
 */
export async function runPhase(phase, concept, lengthPreset, level, bible = {}, librarySummaries = []) {
  console.log('='.repeat(60))
  console.log(`RUNNING PHASE ${phase}`)
  console.log(`Concept: ${concept}`)
  console.log(`Length: ${lengthPreset}, Level: ${level}`)
  console.log('='.repeat(60))

  switch (phase) {
    case 1:
      console.log('Phase 1: Story DNA (includes romance_arc_stages)')
      bible.coreFoundation = await executePhase1(concept, lengthPreset, level, librarySummaries)
      console.log('')
      console.log('Phase 1 complete output:')
      console.log(JSON.stringify(bible.coreFoundation, null, 2))
      break

    case 2:
      if (!bible.coreFoundation) {
        throw new Error('Phase 2 requires Phase 1 (bible.coreFoundation) to be complete')
      }
      console.log('Phase 2: Full Cast (Protagonist, Love Interests, Secondary Characters)')
      bible.characters = await executePhase2(concept, bible.coreFoundation, lengthPreset)
      console.log('')
      console.log('Phase 2 complete output:')
      console.log(JSON.stringify(bible.characters, null, 2))
      break

    case 3:
      if (!bible.coreFoundation || !bible.characters) {
        throw new Error('Phase 3 requires Phases 1-2 (bible.coreFoundation, bible.characters) to be complete')
      }
      console.log('Phase 3: Character Action Grid')
      bible.actionGrid = await executePhase3(concept, bible.coreFoundation, bible.characters)
      console.log('')
      console.log('Phase 3 complete output:')
      console.log(JSON.stringify(bible.actionGrid, null, 2))
      break

    case 4:
      if (!bible.coreFoundation || !bible.characters || !bible.actionGrid) {
        throw new Error('Phase 4 requires Phases 1-3 (bible.coreFoundation, bible.characters, bible.actionGrid) to be complete')
      }
      console.log('Phase 4: Scene Assembly (Step 1 — POV Journey)')
      bible.sceneAssembly = await executePhase4(concept, bible.coreFoundation, bible.characters, bible.actionGrid)
      break

    default:
      throw new Error(`Unknown phase: ${phase}. Valid phases are 1, 2, 3, 4`)
  }

  return bible
}

/**
 * Generate a complete story bible through the full pipeline (runs all phases sequentially)
 * @param {string} concept - Story concept/description
 * @param {string} level - Reading level (Beginner, Intermediate, Native)
 * @param {string} lengthPreset - 'novella' or 'novel'
 * @param {string} language - Target language
 * @param {number} maxValidationAttempts - Max validation retry attempts (default 2)
 * @param {Function} onProgress - Optional callback for progress updates
 * @param {Array} librarySummaries - Existing book summaries for diversity (default [])
 * @param {Function} onPhaseSave - Optional callback to save bible after each phase: (bible, phase) => Promise<void>
 * @returns {Promise<Object>} Generated bible result
 */
export async function generateBible(concept, level, lengthPreset, language, maxValidationAttempts = 2, onProgress = null, librarySummaries = [], onPhaseSave = null) {
  console.log('='.repeat(60))
  console.log('STARTING BIBLE GENERATION PIPELINE')
  console.log(`Concept: ${concept}`)
  console.log(`Level: ${level}, Length: ${lengthPreset}, Language: ${language}`)
  console.log('='.repeat(60))

  let bible = {}
  let validationAttempts = 0
  const totalPhases = 7 // Phases 1, 2, 3, 6, 7, 8, 9 (old 4-5 eliminated)

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

  // Helper to save bible after each phase
  const savePhase = async (phase) => {
    if (onPhaseSave) {
      try {
        console.log(`[Phase ${phase}] Saving bible to Firestore...`)
        await onPhaseSave(bible, phase)
        console.log(`[Phase ${phase}] Bible saved successfully`)
      } catch (e) {
        console.error(`[Phase ${phase}] Failed to save bible:`, e.message)
        // Don't throw - allow generation to continue even if save fails
      }
    }
  }

  try {
    // Phase 1: Story DNA (includes romance_arc_stages based on ending type)
    reportProgress(1, 'starting')
    bible.coreFoundation = await executePhase1(concept, lengthPreset, level, librarySummaries)
    reportProgress(1, 'complete', {
      subgenre: bible.coreFoundation.subgenre,
      origin: bible.coreFoundation.tropes?.origin,
      theme: bible.coreFoundation.theme,
      externalPlot: bible.coreFoundation.external_plot?.container_type,
      externalActs: bible.coreFoundation.external_plot?.acts?.length,
      romanceArcStages: bible.coreFoundation.romance_arc_stages?.length
    })
    await savePhase(1)

    // Phase 2: Full Cast (Protagonist, Love Interests, AND Secondary Characters)
    // Secondary character creation moved here from old Phase 4
    reportProgress(2, 'starting')
    bible.characters = await executePhase2(concept, bible.coreFoundation, lengthPreset)
    reportProgress(2, 'complete', {
      protagonist: bible.characters.protagonist?.name,
      loveInterests: bible.characters.love_interests?.length,
      stakeholderCharacters: bible.characters.stakeholder_characters?.length,
      interests: bible.characters.interests?.length,
      facelessPressures: bible.characters.faceless_pressures?.length
    })
    await savePhase(2)

    // Phase 3: Character Action Grid (replaces old Phase 3 timeline + eliminates old Phase 4/5)
    // The grid IS the master timeline - all characters gridded simultaneously
    reportProgress(3, 'starting')
    bible.actionGrid = await executePhase3(concept, bible.coreFoundation, bible.characters)
    reportProgress(3, 'complete', {
      totalParts: bible.actionGrid.grid?.length,
      totalFragments: bible.actionGrid.validation?.total_fragments,
      protagonistFragments: bible.actionGrid.validation?.protagonist_fragments_count,
      romanceStagesFound: bible.actionGrid.romance_stage_progression?.length,
      allStagesPresent: bible.actionGrid.validation?.all_stages_present,
      stagesInOrder: bible.actionGrid.validation?.stages_in_order
    })
    await savePhase(3)

    // Phase 4: Scene Assembly — Step 1: POV Journey
    reportProgress(4, 'starting')
    bible.sceneAssembly = await executePhase4(concept, bible.coreFoundation, bible.characters, bible.actionGrid)
    reportProgress(4, 'complete', {
      part: bible.sceneAssembly.part_name,
      povCharacter: bible.sceneAssembly.pov_character,
      journeyStops: bible.sceneAssembly.journey?.length
    })
    await savePhase(4)

    // TESTING: Stop after Phase 4 Step 1 to validate POV journey
    console.log('='.repeat(60))
    console.log('TEST MODE - Stopping after Phase 4 Step 1 (POV Journey)')
    console.log('Phase 4 Output:', JSON.stringify(bible.sceneAssembly, null, 2))
    console.log('='.repeat(60))

    return {
      success: true,
      bible,
      validationStatus: 'PHASE_4_TEST',
      validationAttempts: 0
    }

    // TODO: Downstream phases (6+) need to be updated to read from bible.sceneAssembly
    // instead of bible.plot, bible.subplots, bible.masterTimeline

    // Phase 6: Major Events & Locations (needs update to read from actionGrid)
    reportProgress(6, 'starting')
    bible.eventsAndLocations = await executePhase6(concept, bible.coreFoundation, bible.characters, bible.actionGrid)
    reportProgress(6, 'complete', {
      majorEvents: bible.eventsAndLocations.major_events?.length || 0,
      loneMoments: bible.eventsAndLocations.lone_moments?.length || 0,
      locations: bible.eventsAndLocations.location_inventory?.length || 0
    })
    await savePhase(6)

    // TESTING: Stop after Phase 6 to validate event clustering
    console.log('='.repeat(60))
    console.log('TEST MODE - Stopping after Phase 6')
    console.log('Phase 6 Output:', JSON.stringify(bible.eventsAndLocations, null, 2))
    console.log('='.repeat(60))

    return {
      success: true,
      bible,
      validationStatus: 'PHASE_6_TEST',
      validationAttempts: 0
    }

    // Phase 7: Event Development (Back to Front)
    reportProgress(7, 'starting')
    bible.eventDevelopment = await executePhase7(concept, bible.coreFoundation, bible.characters, bible.subplots, bible.masterTimeline, bible.eventsAndLocations)
    reportProgress(7, 'complete', {
      eventsDeveloped: bible.eventDevelopment.developed_events?.length || 0,
      setupRequirements: bible.eventDevelopment.all_setup_requirements?.length || 0
    })
    await savePhase(7)

    // Phase 8: Supporting Scenes
    reportProgress(8, 'starting')
    bible.supportingScenes = await executePhase8(concept, bible.coreFoundation, bible.characters, bible.subplots, bible.masterTimeline, bible.eventsAndLocations, bible.eventDevelopment)
    reportProgress(8, 'complete', {
      uniqueRequirements: bible.supportingScenes.deduplicated_requirements?.unique_requirements || 0,
      attachedToExisting: bible.supportingScenes.attached_to_existing?.length || 0,
      newSupportingScenes: bible.supportingScenes.supporting_scenes?.length || 0
    })
    await savePhase(8)

    // Phase 9: Scene Sequencing & Chapter Assembly
    reportProgress(9, 'starting')
    bible.chapterAssembly = await executePhase9(concept, bible.characters, bible.masterTimeline, bible.eventsAndLocations, bible.eventDevelopment, bible.supportingScenes, lengthPreset)
    reportProgress(9, 'complete', {
      sceneSequence: bible.chapterAssembly.scene_sequence?.length || 0,
      chapters: bible.chapterAssembly.chapters?.length || 0
    })
    await savePhase(9)

    // TESTING: Stop after Phase 9 to validate Chapter Assembly output
    console.log('='.repeat(60))
    console.log('TEST MODE - Stopping after Phase 9')
    console.log('Phase 1 Output:', JSON.stringify(bible.coreFoundation, null, 2))
    console.log('Phase 2 Output:', JSON.stringify(bible.characters, null, 2))
    console.log('Phase 3 Output:', JSON.stringify(bible.plot, null, 2))
    console.log('Phase 4 Output:', JSON.stringify(bible.subplots, null, 2))
    console.log('Phase 5 Output:', JSON.stringify(bible.masterTimeline, null, 2))
    console.log('Phase 6 Output:', JSON.stringify(bible.eventsAndLocations, null, 2))
    console.log('Phase 7 Output:', JSON.stringify(bible.eventDevelopment, null, 2))
    console.log('Phase 8 Output:', JSON.stringify(bible.supportingScenes, null, 2))
    console.log('Phase 9 Output:', JSON.stringify(bible.chapterAssembly, null, 2))
    console.log('='.repeat(60))

    return {
      success: true,
      bible,
      validationStatus: 'PHASE_9_TEST',
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

const CHAPTER_SYSTEM_PROMPT = `You are a romance novelist writing in {{target_language}}. Your task is to write a single chapter that executes the provided events while maintaining voice consistency, continuity, and reading level.

You will receive:
- Story bible (core elements)
- POV character profile (voice, psychology, arc)
- This chapter's breakdown (events, location, hook, foreshadowing)
- Previous chapter summaries (context)
- Level-specific prose guidance

Your job is to:
1. Write the chapter prose in {{target_language}}
2. Hit every specified event
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

EVENTS:
- Every event listed must appear in the chapter
- Events should flow naturally, not feel like a checklist
- You may add connective tissue between events
- Do not add major events not in the event list

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

// Calculate word count target for a scene based on event count
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
1. Hit every event listed above
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
- Extend dialogue exchanges (another exchange or two)
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
  executePhase1,
  executePhase2,
  executePhase3,
  executePhase4,
  executePhase5,
  executePhase6,
  executePhase7,
  executePhase8,
  executePhase9,
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
  executePhase9,
  CONFIG,
  LEVEL_DEFINITIONS,
  LANGUAGE_LEVEL_ADJUSTMENTS,
  PHASE_DESCRIPTIONS
}
