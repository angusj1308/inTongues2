// Novel Generator
// Phase 1: Concept Generation (skeleton + setting → concept)
// Subsequent phases will be added in follow-up tasks

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { rollSkeleton } from './storyBlueprints.js'

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
// PHASE 1: CONCEPT GENERATION
// =============================================================================

const PHASE_1_CONCEPT_SYSTEM_PROMPT = `You are a romance novelist architecting a complete story concept. You receive a structural skeleton — every plot decision has already been made. Your job is to make it concrete.

You will receive:
1. A complete structural skeleton: trope, tension type, ending type, whether there is a love triangle, whether there is a secret, every chapter with its employment option and end state, and all cast functions with their descriptions and employment options.
2. A setting string from the user (a place and time).

YOUR JOB:
- Turn abstract structural elements into specific people, places, obligations, and events that belong to this setting.
- Ground everything in the historical and social reality of the setting. If the setting is "Buenos Aires, 1806", that means the British invasion, colonial Spanish society, specific social structures. The characters must belong to that world.
- Employment options are ALREADY SELECTED in the skeleton. You do not choose different ones. You make the selected options concrete in this world.
- For each cast function, select ONE employment option from the list provided and create a specific character for it.
- If triangle is false, the rival field must be null. Do not create a rival character.
- If secret is false, do not invent a secret.

KEY FIELDS:
- protagonist.framework: This is the tension-specific psychological core.
  For SAFETY tension: What threat does she protect against? Why does danger terrify her? What does this protection cost her?
  For IDENTITY tension: What belief system has she built? Why does it define her? What does maintaining it cost her?
- primary.threat: This mirrors the framework.
  For SAFETY tension: He IS the danger. What about him represents a direct threat to her safety?
  For IDENTITY tension: He dismantles who she thinks she is. What about him challenges her framework?

OUTPUT FORMAT:
Return a single JSON object with this exact structure:
{
  "synopsis": "A single plain-text string. Two stanzas separated by a blank line.\n\nStanza 1 — Variables on setting (exactly 2 sentences):\nSentence 1: Trope + setting. When the skeleton has a love triangle, include 'love triangle' in the sentence. When it does not, simply omit it — do not mention its absence.\n  Triangle active: 'This is an enemies-to-lovers love triangle romance set in [setting].'\n  Triangle inactive: 'This is an enemies-to-lovers romance set in [setting].'\nSentence 2: Tension. 'The central thematic exploration of this story is passion vs [safety/identity].'\n\nStanza 2 — Employment options as story:\nWalk through every chapter's selected employment option in order. Write each as a concrete story beat grounded in the setting. This is the core romance only — she and he. No character names. No cast members. Every employment option must appear. None skipped. The ending type should be apparent from how the final chapters play out — not declared. The secret (if active) should be apparent from the story — not labelled.",
  "characters": {
    "protagonist": {
      "name": "Full name",
      "backstory": "Where she came from, what shaped her, key events",
      "psychology": "What she wants, what she fears, how she thinks, what she avoids",
      "framework": "Tension-specific (see KEY FIELDS above)",
      "appearance": "Physical description",
      "mannerisms": "Speech patterns, habits, tells",
      "voice": "How she thinks internally, what her interiority sounds like"
    },
    "primary": {
      "name": "Full name",
      "backstory": "Where he came from, what shaped him",
      "psychology": "What he wants, what he fears, how he operates",
      "threat": "Tension-specific (see KEY FIELDS above)",
      "appearance": "Physical description",
      "mannerisms": "Speech patterns, habits, tells"
    },
    "rival": {
      "name": "Full name or null if no triangle",
      "backstory": "...",
      "psychology": "...",
      "appearance": "...",
      "mannerisms": "..."
    },
    "cast": [
      {
        "name": "Full name",
        "function": "Plain language description of what this character does thematically — not just the label but the full explanation of the role and why they exist in the story",
        "functionId": "The cast function ID from the skeleton (e.g. 'all_passion_no_fear')",
        "employmentOption": "Which employment option was selected for this cast member (e.g. 'A younger sister or cousin')",
        "backstory": "Who they are, where they came from, why they're in this world",
        "psychology": "How they think, what they want, what they fear",
        "appearance": "Physical description",
        "mannerisms": "How they speak, move, behave",
        "relationshipToProtagonist": "Specific dynamic, history, emotional weight"
      }
    ]
  }
}

IMPORTANT:
- Return ONLY the JSON object. No preamble, no explanation, no markdown fences.
- Every field must be filled with substantive content grounded in the setting.
- The cast array must have exactly one entry per cast function in the skeleton.
- If triangle is false, set rival to null (not an empty object).`

/**
 * Format a rolled skeleton into a readable document for the LLM prompt.
 * Converts raw skeleton data into structured plain language.
 */
function formatSkeletonForPrompt(skeleton) {
  const lines = []

  // Structural variables
  lines.push('=== STRUCTURAL VARIABLES ===')
  lines.push(`Trope: ${skeleton.trope}`)
  lines.push(`Tension: ${skeleton.tension}`)
  lines.push(`Ending: ${skeleton.ending}`)
  lines.push(`Love Triangle: ${skeleton.triangle ? 'YES' : 'NO'}`)
  lines.push(`Secret: ${skeleton.secret ? 'YES' : 'NO'}`)
  lines.push('')

  // Rival flaw (if triangle)
  if (skeleton.triangle && skeleton.rivalFlaw && skeleton.rivalFlaw.id) {
    lines.push(`Rival Flaw: ${skeleton.rivalFlaw.id} (selected in ${skeleton.rivalFlaw.selectedIn})`)
    lines.push('')
  }

  // Chapters
  lines.push('=== CHAPTERS ===')
  for (const ch of skeleton.chapters) {
    lines.push(`Chapter ${ch.chapter}: "${ch.title}"`)
    lines.push(`  End state: ${ch.endState}`)

    if (ch.employmentSelections && ch.employmentSelections.length > 0) {
      for (const sel of ch.employmentSelections) {
        lines.push(`  [${sel.group}] ${sel.text}`)
      }
    }

    if (ch.notes && ch.notes.length > 0) {
      for (const note of ch.notes) {
        lines.push(`  Note: ${note}`)
      }
    }
    lines.push('')
  }

  // Cast functions
  lines.push('=== CAST FUNCTIONS ===')
  lines.push('For each cast function below, select ONE employment option and create a concrete character.')
  lines.push('')

  for (const cf of skeleton.castFunctions) {
    lines.push(`Function: "${cf.name}" (id: ${cf.id})`)
    lines.push(`  Description: ${cf.description}`)
    if (cf.employmentOptions && cf.employmentOptions.length > 0) {
      lines.push('  Employment options (choose one):')
      for (const opt of cf.employmentOptions) {
        lines.push(`    - ${opt}`)
      }
    } else {
      lines.push('  (No specific employment options — role is determined by story context)')
    }
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Build the user prompt from skeleton + setting for Phase 1 concept generation.
 */
function buildPhase1UserPrompt(skeleton, setting) {
  const skeletonText = formatSkeletonForPrompt(skeleton)

  return `=== SETTING ===
${setting}

${skeletonText}
Generate the complete story concept for this skeleton and setting. Return the JSON object only.`
}

/**
 * Phase 1: Concept Generation
 * Takes a rolled skeleton and user setting, makes one LLM call,
 * and returns the complete concept document.
 *
 * @param {Object} skeleton - Output of rollSkeleton() from storyBlueprints.js
 * @param {string} setting - User-provided setting string, e.g. "Buenos Aires, 1806"
 * @returns {Promise<Object>} The concept document with synopsis and characters
 */
async function executePhase1(skeleton, setting) {
  console.log('Executing Phase 1: Concept Generation...')
  console.log(`  Tension: ${skeleton.tension}`)
  console.log(`  Ending: ${skeleton.ending}`)
  console.log(`  Triangle: ${skeleton.triangle}`)
  console.log(`  Secret: ${skeleton.secret}`)
  console.log(`  Chapters: ${skeleton.chapters.length}`)
  console.log(`  Cast Functions: ${skeleton.castFunctions.length}`)
  console.log(`  Setting: ${setting}`)

  const userPrompt = buildPhase1UserPrompt(skeleton, setting)

  const response = await callClaude(PHASE_1_CONCEPT_SYSTEM_PROMPT, userPrompt, {
    model: 'claude-sonnet-4-20250514',
    temperature: 1.0,
    maxTokens: 8192
  })

  const parsed = parseJSON(response)
  if (!parsed.success) {
    throw new Error(`Phase 1 Concept Generation JSON parse failed: ${parsed.error}`)
  }

  const data = parsed.data

  // Validate required top-level fields
  if (!data.synopsis || typeof data.synopsis !== 'string' || data.synopsis.trim().length === 0) {
    throw new Error('Phase 1: synopsis must be a non-empty string')
  }

  if (!data.characters) {
    throw new Error('Phase 1: missing characters')
  }
  if (!data.characters.protagonist) {
    throw new Error('Phase 1: missing characters.protagonist')
  }
  if (!data.characters.primary) {
    throw new Error('Phase 1: missing characters.primary')
  }

  // Validate protagonist fields
  const protag = data.characters.protagonist
  for (const field of ['name', 'backstory', 'psychology', 'framework', 'appearance', 'mannerisms', 'voice']) {
    if (!protag[field] || (typeof protag[field] === 'string' && protag[field].trim().length === 0)) {
      throw new Error(`Phase 1: protagonist missing required field: ${field}`)
    }
  }

  // Validate primary fields
  const primary = data.characters.primary
  for (const field of ['name', 'backstory', 'psychology', 'threat', 'appearance', 'mannerisms']) {
    if (!primary[field] || (typeof primary[field] === 'string' && primary[field].trim().length === 0)) {
      throw new Error(`Phase 1: primary missing required field: ${field}`)
    }
  }

  // Validate rival presence matches skeleton
  if (skeleton.triangle) {
    if (!data.characters.rival || !data.characters.rival.name) {
      throw new Error('Phase 1: skeleton has triangle=true but rival is missing or has no name')
    }
  }

  // Validate cast array
  if (!Array.isArray(data.characters.cast)) {
    throw new Error('Phase 1: characters.cast must be an array')
  }

  // Filter out the rival cast function for count comparison (rival is in characters.rival, not cast)
  const nonRivalCastFunctions = skeleton.castFunctions.filter(cf => cf.id !== 'the_rival')
  if (data.characters.cast.length !== nonRivalCastFunctions.length) {
    console.warn(`Phase 1: expected ${nonRivalCastFunctions.length} cast members, got ${data.characters.cast.length}`)
  }

  // Validate each cast member
  for (const member of data.characters.cast) {
    for (const field of ['name', 'function', 'functionId', 'employmentOption', 'backstory', 'psychology', 'appearance', 'mannerisms', 'relationshipToProtagonist']) {
      if (!member[field] || (typeof member[field] === 'string' && member[field].trim().length === 0)) {
        throw new Error(`Phase 1: cast member missing required field: ${field}`)
      }
    }
  }

  console.log('Phase 1 Concept Generation complete.')
  console.log(`  Protagonist: ${data.characters.protagonist.name}`)
  console.log(`  Primary: ${data.characters.primary.name}`)
  if (data.characters.rival && data.characters.rival.name) {
    console.log(`  Rival: ${data.characters.rival.name}`)
  }
  console.log(`  Cast: ${data.characters.cast.length} members`)
  console.log(`  Synopsis: ${data.synopsis.slice(0, 120)}...`)

  return data
}

/**
 * New pipeline entry point.
 * Rolls a skeleton, then generates the concept in one LLM call.
 *
 * @param {string} setting - User-provided setting string
 * @returns {Promise<Object>} Object with skeleton and concept
 */
export async function generateStory(setting) {
  const skeleton = rollSkeleton()
  const concept = await executePhase1(skeleton, setting)
  return { skeleton, concept }
}

export {
  callClaude,
  callChatGPT,
  parseJSON,
  getLevelDefinition,
  formatLevelDefinitionForPrompt,
  executePhase1,
  CONFIG,
  LEVEL_DEFINITIONS,
  LANGUAGE_LEVEL_ADJUSTMENTS
}

export default {
  generateStory,
  callClaude,
  callChatGPT,
  parseJSON,
  executePhase1,
  CONFIG,
  LEVEL_DEFINITIONS,
  LANGUAGE_LEVEL_ADJUSTMENTS
}
