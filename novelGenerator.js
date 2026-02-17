// Novel Generator - Bible Generation Pipeline
// Implements Phases 1-8 for generating complete story bibles

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import fs from 'fs/promises'
import path from 'path'
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
  "synopsis": {
    "variables": "This is an enemies-to-lovers romance novel set in [location] during [period]. The tension is [tension]. The ending is [ending]. There is [no] love triangle. There is [no] secret.",
    "act1": "One sentence summarising Act 1 arc",
    "act2": "One sentence summarising Act 2 arc",
    "act3": "One sentence summarising Act 3 arc",
    "act4": "One sentence summarising Act 4 arc"
  },
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
  if (!data.synopsis) {
    throw new Error('Phase 1: missing synopsis')
  }
  if (!data.synopsis.variables || !data.synopsis.act1 || !data.synopsis.act2 || !data.synopsis.act3 || !data.synopsis.act4) {
    throw new Error('Phase 1: synopsis missing required fields (variables, act1, act2, act3, act4)')
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
  console.log(`  Synopsis: ${data.synopsis.variables}`)

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

// =============================================================================
// PHASE 3: SCENE GENERATION
// =============================================================================

const PHASE_3_SYSTEM_PROMPT = `You are breaking a single chapter into scenes — the skeleton that prose generation will build from.

You will receive:
- The original concept
- All 14 chapter functions and descriptions (so you know where the story is going)
- The full cast with psychology from Phase 2 (protagonist, love interests, stakeholder characters)
- All scenes from previous chapters (empty for chapter 1)
- The current chapter number, function, and description to generate scenes for

Generate 3-5 scenes for this chapter.

Each scene must serve the chapter's function. If the chapter function is "Maybe I was wrong", every scene in that chapter contributes to that shift.

Characters appear because the scene needs them, not to fill a quota. Only list characters who are present and active in the scene.

Locations come from the world the concept establishes. Do not invent locations that contradict the setting.

No two scenes in a chapter may share both the same location and the same cast. If you need multiple beats in the same place with the same people, they are one scene.

Use character psychology from Phase 2. A character's wound, lie, and coping mechanism should be visible in how they behave, even if not stated explicitly.

The scene action should be what happens, not what it means. "She inspects the barrels and finds three have spoiled" not "We see her competence and her burden."

Maintain continuity with all previous chapters. Do not contradict what has already happened. Characters who left cannot reappear without explanation. Information revealed stays revealed.

You can see all 14 chapter functions. Use this to plant setups for later chapters. A detail in chapter 2 can be planted knowing it will pay off in chapter 9.

Do not generate prose. Scenes are skeletons — location, cast, action.

Do not invent new named characters. All characters must come from the Phase 2 cast or the supporting census. Unnamed background people (soldiers, workers, market crowds) are fine but should not have names or dialogue.

Do not describe character psychology in the action. Show what they DO, not what they FEEL. Psychology informs behaviour but is not stated.

Output format:

{
  "chapter": <chapter number>,
  "function": "<chapter function>",
  "scenes": [
    {
      "scene": 1,
      "location": "Where this scene takes place — a specific place from the story's world",
      "cast": ["Character names present in this scene"],
      "action": "What happens in this scene. 2-3 sentences. Concrete and specific."
    }
  ]
}`

function buildPhase3UserPrompt(concept, phase1, phase2, previousScenes, currentChapter) {
  const chapters = phase1.chapters || []

  // Format all 14 chapter functions/descriptions
  const chapterList = chapters.map(ch =>
    `  Chapter ${ch.chapter} [${ch.function}]: ${ch.description}`
  ).join('\n')

  // Format full cast from Phase 2
  const castLines = []

  if (phase2.protagonist) {
    castLines.push(`PROTAGONIST: ${phase2.protagonist.name}`)
    if (phase2.protagonist.wound) castLines.push(`  Wound: ${phase2.protagonist.wound.event}`)
    if (phase2.protagonist.lie) castLines.push(`  Lie: ${phase2.protagonist.lie}`)
    if (phase2.protagonist.coping_mechanism) castLines.push(`  Coping: ${phase2.protagonist.coping_mechanism.behaviour}`)
  }

  if (phase2.love_interests) {
    for (const li of phase2.love_interests) {
      castLines.push(`LOVE INTEREST: ${li.name} (${li.role_in_story || 'love interest'})`)
      if (li.wound) castLines.push(`  Wound: ${li.wound.event}`)
      if (li.lie) castLines.push(`  Lie: ${li.lie}`)
      if (li.coping_mechanism) castLines.push(`  Coping: ${li.coping_mechanism.behaviour}`)
    }
  }

  if (phase2.stakeholder_characters) {
    for (const sc of phase2.stakeholder_characters) {
      castLines.push(`STAKEHOLDER: ${sc.name} (${sc.archetype || sc.role || 'supporting'})`)
      if (sc.thematic_position) castLines.push(`  Position: ${sc.thematic_position}`)
    }
  }

  if (phase2.census) {
    castLines.push('')
    castLines.push('SUPPORTING CAST (from census — available for scenes but not required):')
    const censusCategories = phase2.census.protagonist || {}
    const allCensus = [
      ...(censusCategories.family || []),
      ...(censusCategories.friends || []),
      ...(censusCategories.everyone_else || [])
    ]
    for (const c of allCensus) {
      castLines.push(`  - ${c.who} (${c.relationship}) — ${c.proximity}`)
    }
  }

  // Format previous chapter scenes
  let previousScenesText = 'None yet (this is chapter 1).'
  if (previousScenes.length > 0) {
    previousScenesText = previousScenes.map(ch => {
      const sceneLines = ch.scenes.map(s =>
        `    Scene ${s.scene}: [${s.location}] ${s.cast.join(', ')} — ${s.action}`
      ).join('\n')
      return `  Chapter ${ch.chapter} [${ch.function}]:\n${sceneLines}`
    }).join('\n')
  }

  return `CONCEPT: ${concept}

ALL 14 CHAPTERS (the full story):
${chapterList}

FULL CAST (from Phase 2):
${castLines.join('\n')}

PREVIOUS CHAPTER SCENES:
${previousScenesText}

CURRENT CHAPTER TO GENERATE:
  Chapter ${currentChapter.chapter} [${currentChapter.function}]: ${currentChapter.description}

Generate 3-5 scenes for chapter ${currentChapter.chapter}. Return valid JSON.`
}

async function executePhase3(concept, phase1, phase2) {
  console.log('Executing Phase 3: Scene Generation...')

  const chapters = phase1.chapters || []
  const allScenes = []

  for (const chapter of chapters) {
    console.log(`  Chapter ${chapter.chapter} [${chapter.function}]...`)

    const userPrompt = buildPhase3UserPrompt(concept, phase1, phase2, allScenes, chapter)
    const response = await callOpenAI(PHASE_3_SYSTEM_PROMPT, userPrompt, { maxTokens: 4096 })
    const parsed = parseJSON(response)

    if (!parsed.success) {
      console.error(`Phase 3 raw response for chapter ${chapter.chapter}:`, response.slice(0, 500))
      throw new Error(`Phase 3 chapter ${chapter.chapter} JSON parse failed: ${parsed.error}`)
    }

    const data = parsed.data

    // Validate scene count
    if (!data.scenes || !Array.isArray(data.scenes)) {
      throw new Error(`Phase 3 chapter ${chapter.chapter}: missing scenes array`)
    }
    if (data.scenes.length < 3 || data.scenes.length > 5) {
      console.warn(`Phase 3 WARNING: chapter ${chapter.chapter} has ${data.scenes.length} scenes (expected 3-5)`)
    }

    // Validate each scene
    for (const scene of data.scenes) {
      if (!scene.location) {
        throw new Error(`Phase 3 chapter ${chapter.chapter} scene ${scene.scene}: missing location`)
      }
      if (!scene.cast || !Array.isArray(scene.cast) || scene.cast.length === 0) {
        throw new Error(`Phase 3 chapter ${chapter.chapter} scene ${scene.scene}: missing or empty cast`)
      }
      if (!scene.action) {
        throw new Error(`Phase 3 chapter ${chapter.chapter} scene ${scene.scene}: missing action`)
      }
    }

    const result = {
      chapter: chapter.chapter,
      function: chapter.function,
      scenes: data.scenes
    }

    allScenes.push(result)
    console.log(`    → ${data.scenes.length} scenes`)
  }

  const totalScenes = allScenes.reduce((sum, ch) => sum + ch.scenes.length, 0)
  console.log(`Phase 3 complete. ${allScenes.length} chapters, ${totalScenes} total scenes.`)

  // Log summary
  console.log('\n  Scene Summary:')
  for (const ch of allScenes) {
    console.log(`    Chapter ${ch.chapter} [${ch.function}]: ${ch.scenes.length} scenes`)
    for (const s of ch.scenes) {
      console.log(`      Scene ${s.scene}: [${s.location}] ${s.cast.join(', ')}`)
    }
  }

  console.log('')
  console.log('Phase 3 complete output:')
  console.log(JSON.stringify({ chapters: allScenes }, null, 2))

  return { chapters: allScenes }
}

// =============================================================================
// PHASE 4: SCENE & CHAPTER BOUNDARIES
// =============================================================================

const PHASE_4_SYSTEM_PROMPT = `You are a story architect dividing a story part into scenes and chapters.

You receive:
- A Phase 3 grid entry for a single part containing:
  - pov_actions: numbered actions for the POV character (15-20 actions)
  - characters: array of present characters (with their own numbered actions) and absent characters (with pressures)
  - part context: act, part number, part name, part description

Your job: Draw boundaries between scenes, group scenes into chapters, and specify exactly what content belongs in each scene.

## IDENTIFYING SCENE BREAKS

Read the POV actions in order. A new scene starts when:

1. **Location change** — the action implies the character has moved to a different place
2. **Time jump** — a gap in time is implied (morning to evening, one day to the next)
3. **Character entrance/exit** — a significant character enters or leaves the POV's space
4. **Dramatic beat shift** — tension peaks and releases, or a new tension begins

Not every small moment change is a scene break. A scene is a continuous unit of action in one place, at one time, with a stable set of characters. Aim for 3-8 scenes per part.

## ASSIGNING CHARACTERS TO SCENES

For each scene, determine which PRESENT characters have actions that overlap with the POV actions in that scene:

- Each present character has their own actions array with order numbers (1-10)
- Look at each character's action content and determine which ones temporally/spatially coincide with the POV actions in this scene
- List the character's relevant action order numbers (from their own actions array in Phase 3)
- If a character has first_appearance: true and this is the scene containing their first relevant action, set first_appearance: true and include narration_cue

## ASSIGNING PRESSURES TO SCENES

For absent characters' pressures:
- Event pressures (a letter arrives, news comes) should appear in exactly ONE scene — the most dramatically appropriate one
- Ambient pressures (distant sounds, weather effects) CAN appear in multiple scenes if they persist
- Place each pressure where it creates maximum narrative impact

## GROUPING SCENES INTO CHAPTERS

Group scenes into chapters based on:
- **Narrative arc**: setup, confrontation, aftermath
- **Pacing**: 2-4 scenes per chapter is typical
- **Endings**: chapters should end at cliffhanger moments or resolution points

## RULES

1. Every POV action order number must appear in exactly one scene — no skipping, no duplicating
2. POV actions within a scene must be consecutive (you split the ordered sequence at boundaries)
3. Do not invent content — only organize what Phase 3 provided
4. Do not assign a present character to a scene unless their actions temporally overlap with that scene's POV actions
5. Every present character action must appear in exactly one scene — no skipping, no duplicating
6. Pressures from absent characters should be placed where dramatically appropriate
7. Narration cues appear in the scene where the character first appears

## OUTPUT FORMAT (JSON)

{
  "act": <number>,
  "part": <number>,
  "part_name": "<string>",
  "chapters": [
    {
      "chapter_number": 1,
      "scenes": [
        {
          "scene_number": 1,
          "pov_actions": [1, 2, 3, 4, 5],
          "present_characters": [
            {
              "name": "Character Name",
              "actions": [1, 2, 3],
              "first_appearance": true,
              "narration_cue": "Brief cue for prose introduction"
            }
          ],
          "pressures": [
            "Distant sound of conflict from the hills"
          ]
        }
      ]
    }
  ]
}

Only output JSON. No commentary.`

async function executePhase4(concept, phase1, phase2, phase3) {
  console.log('Executing Phase 4: Scene & Chapter Boundaries...')

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

  const allPartBreakdowns = []

  for (const gridPart of parts) {
    console.log(`\n  Processing Act ${gridPart.act} Part ${gridPart.part}: ${gridPart.part_name}`)

    const povActions = gridPart.pov_actions || []
    if (povActions.length === 0) {
      throw new Error(`Phase 4: No POV actions in Act ${gridPart.act} Part ${gridPart.part}`)
    }

    console.log(`    POV actions: ${povActions.length}`)

    // Build present characters summary
    const presentChars = (gridPart.characters || []).filter(c => c.present)
    const absentChars = (gridPart.characters || []).filter(c => !c.present)

    console.log(`    Present characters: ${presentChars.map(c => c.name).join(', ') || 'none'}`)
    console.log(`    Absent characters: ${absentChars.map(c => c.name).join(', ') || 'none'}`)

    // Build user prompt with full Phase 3 data for this part
    const userPrompt = `## Part Context
Act ${gridPart.act} Part ${gridPart.part}: ${gridPart.part_name}
${gridPart.part_description || ''}

## POV Character: ${protagonist}

### POV Actions (${povActions.length} actions)
${povActions.map(a => `${a.order}. ${a.action}`).join('\n')}

## Present Characters
${presentChars.length === 0 ? 'None' : presentChars.map(c => {
  const actions = (c.actions || []).map(a => `  ${a.order}. ${a.action}`).join('\n')
  const firstApp = c.first_appearance ? `\nFirst appearance: true\nNarration cue: ${c.narration_cue || 'none'}` : ''
  return `### ${c.name}${firstApp}\nActions:\n${actions}`
}).join('\n\n')}

## Absent Characters & Pressures
${absentChars.length === 0 ? 'None' : absentChars.map(c => {
  const pressures = (c.pressures || []).length > 0
    ? c.pressures.map(p => `  - ${p}`).join('\n')
    : '  (no pressures)'
  return `### ${c.name}\nPressures:\n${pressures}`
}).join('\n\n')}

Divide this part into scenes and chapters. Every POV action must appear in exactly one scene. Assign present characters and pressures to scenes where they belong.`

    const response = await callOpenAI(PHASE_4_SYSTEM_PROMPT, userPrompt, { maxTokens: 8192 })
    const parsed = parseJSON(response)

    if (!parsed.success) {
      console.error(`Phase 4 raw response for Act ${gridPart.act} Part ${gridPart.part} (first 1000 chars):`, response.slice(0, 1000))
      throw new Error(`Phase 4 JSON parse failed for Act ${gridPart.act} Part ${gridPart.part}: ${parsed.error}`)
    }

    let partData = parsed.data
    // Normalize: model might wrap in phase4_output or similar
    if (partData.phase4_output) partData = partData.phase4_output
    if (partData.scene_breakdown) partData = partData.scene_breakdown

    // Validate chapters array
    if (!partData.chapters || !Array.isArray(partData.chapters)) {
      throw new Error(`Phase 4: Missing chapters array for Act ${gridPart.act} Part ${gridPart.part}. Keys: ${Object.keys(partData).join(', ')}`)
    }

    // Validate every POV action appears exactly once
    const allPovActionNums = new Set(povActions.map(a => a.order))
    const assignedPovActions = new Set()
    let totalScenes = 0

    for (const chapter of partData.chapters) {
      for (const scene of (chapter.scenes || [])) {
        totalScenes++
        for (const actionNum of (scene.pov_actions || [])) {
          if (assignedPovActions.has(actionNum)) {
            console.warn(`    WARNING: POV action ${actionNum} assigned to multiple scenes`)
          }
          assignedPovActions.add(actionNum)
        }
      }
    }

    const missingActions = [...allPovActionNums].filter(n => !assignedPovActions.has(n))
    if (missingActions.length > 0) {
      console.warn(`    WARNING: POV actions not assigned to any scene: ${missingActions.join(', ')}`)
    }

    // Ensure act/part/part_name are set
    partData.act = gridPart.act
    partData.part = gridPart.part
    partData.part_name = gridPart.part_name

    // Log result
    console.log(`\n    Act ${gridPart.act} Part ${gridPart.part}: ${partData.chapters.length} chapters, ${totalScenes} scenes`)
    for (const chapter of partData.chapters) {
      console.log(`      Chapter ${chapter.chapter_number}:`)
      for (const scene of (chapter.scenes || [])) {
        const charNames = (scene.present_characters || []).map(c => c.name).join(', ')
        const pressureCount = (scene.pressures || []).length
        console.log(`        Scene ${scene.scene_number}: POV actions [${(scene.pov_actions || []).join(',')}], characters: ${charNames || 'none'}, pressures: ${pressureCount}`)
      }
    }

    allPartBreakdowns.push(partData)
  }

  const result = { parts: allPartBreakdowns, pov_character: protagonist }

  console.log('')
  console.log('Phase 4 complete.')
  console.log(`  Total parts: ${allPartBreakdowns.length}`)
  console.log(`  Total chapters: ${allPartBreakdowns.reduce((sum, p) => sum + p.chapters.length, 0)}`)
  console.log(`  Total scenes: ${allPartBreakdowns.reduce((sum, p) => sum + p.chapters.reduce((s, c) => s + (c.scenes?.length || 0), 0), 0)}`)

  console.log('')
  console.log('Phase 4 complete output:')
  console.log(JSON.stringify(result, null, 2))

  return result
}


// =============================================================================
// PROSE GENERATION (Scene by Scene)
// =============================================================================

const PROSE_FIRST_SCENE_SYSTEM_PROMPT = `You are a romance novel writer. You are to write Act 1 Part 1 Scene 1 in the style of Charlotte Brontë's prose, with a long and detailed opening to the book in the style of John Steinbeck that describes the physical world.

Write continuous prose. Render the provided actions as narrative — characters doing things, moving through space, interacting. Weave pressures into the atmosphere. Use narration cues when introducing characters for the first time.

Do not add events, characters, or plot points not in the scene data. The actions are your choreography — transform them into vivid prose. Do not include chapter headings or scene numbers.`

const PROSE_SCENE_SYSTEM_PROMPT = `You are a romance novel writer. You are to write this scene in the style of Charlotte Brontë's prose.

Write continuous prose. Render the provided actions as narrative — characters doing things, moving through space, interacting. Weave pressures into the atmosphere. Use narration cues when introducing characters for the first time.

Do not add events, characters, or plot points not in the scene data. The actions are your choreography — transform them into vivid prose. Do not include chapter headings or scene numbers.`

function flattenScenes(sceneAssembly) {
  const scenes = []
  for (const part of (sceneAssembly.parts || [])) {
    for (const chapter of (part.chapters || [])) {
      for (const scene of (chapter.scenes || [])) {
        scenes.push({
          ...scene,
          act: part.act,
          part: part.part,
          part_name: part.part_name,
          chapter_number: chapter.chapter_number
        })
      }
    }
  }
  return scenes
}

function getCharacterPsychology(phase2, name) {
  if (phase2.protagonist?.name === name) {
    const p = phase2.protagonist
    return {
      name: p.name,
      role: 'protagonist',
      wound: p.wound?.event,
      lie: p.lie,
      coping_mechanism: p.coping_mechanism?.behaviour,
      desire: p.desire
    }
  }
  const li = phase2.love_interests?.find(c => c.name === name)
  if (li) {
    return {
      name: li.name,
      role: 'love_interest',
      wound: li.wound?.event,
      lie: li.lie,
      coping_mechanism: li.coping_mechanism?.behaviour,
      role_in_story: li.role_in_story
    }
  }
  const sc = phase2.stakeholder_characters?.find(c => c.name === name)
  if (sc) {
    return {
      name: sc.name,
      role: 'stakeholder',
      archetype: sc.archetype,
      thematic_position: sc.thematic_position
    }
  }
  return null
}

async function generateProseScene(bible, sceneIndex, previousSceneProse = null) {
  const allScenes = flattenScenes(bible.sceneAssembly)

  if (sceneIndex < 0 || sceneIndex >= allScenes.length) {
    throw new Error(`Scene index ${sceneIndex} out of range (0-${allScenes.length - 1})`)
  }

  const scene = allScenes[sceneIndex]
  const isFirstScene = sceneIndex === 0
  const povName = bible.sceneAssembly.pov_character

  // Find Phase 3 grid entry for this part
  const gridPart = (bible.actionGrid.grid || []).find(
    p => p.act === scene.act && p.part === scene.part
  )
  if (!gridPart) {
    throw new Error(`Phase 3 grid entry not found for Act ${scene.act} Part ${scene.part}`)
  }

  // Resolve POV action order numbers to text
  const povActionTexts = (scene.pov_actions || []).map(orderNum => {
    const action = (gridPart.pov_actions || []).find(a => a.order === orderNum)
    return action ? action.action : `[Action ${orderNum}]`
  })

  // Resolve present character actions and get psychology
  const presentCharacterDetails = (scene.present_characters || []).map(sc => {
    const gridChar = (gridPart.characters || []).find(c => c.name === sc.name)
    const actionTexts = (sc.actions || []).map(orderNum => {
      const action = (gridChar?.actions || []).find(a => a.order === orderNum)
      return action ? action.action : `[Action ${orderNum}]`
    })
    const psychology = getCharacterPsychology(bible.characters, sc.name)
    return {
      name: sc.name,
      actions: actionTexts,
      first_appearance: sc.first_appearance,
      narration_cue: sc.narration_cue,
      psychology
    }
  })

  // Get POV character psychology
  const povPsychology = getCharacterPsychology(bible.characters, povName)

  // Get romance stage for this part from romance_stage_progression
  const romanceStages = (bible.actionGrid.romance_stage_progression || [])
    .filter(rsp => rsp.act === scene.act && rsp.part === scene.part)
    .map(rsp => `${rsp.stage}: ${rsp.description}`)

  // Build prompts
  const systemPrompt = isFirstScene ? PROSE_FIRST_SCENE_SYSTEM_PROMPT : PROSE_SCENE_SYSTEM_PROMPT

  let userPrompt = `## Part Context
Act ${scene.act} Part ${scene.part}: "${scene.part_name}"
${gridPart.part_description || ''}

## Scene ${scene.scene_number} (Chapter ${scene.chapter_number})

### POV Character: ${povName}
Actions in this scene:
${povActionTexts.map((text, i) => `${i + 1}. ${text}`).join('\n')}`

  if (povPsychology) {
    userPrompt += `\n\nPOV Psychology:`
    if (povPsychology.wound) userPrompt += `\n- Wound: ${povPsychology.wound}`
    if (povPsychology.lie) userPrompt += `\n- Lie they believe: ${povPsychology.lie}`
    if (povPsychology.coping_mechanism) userPrompt += `\n- Coping mechanism: ${povPsychology.coping_mechanism}`
    if (povPsychology.desire) userPrompt += `\n- Desire: ${povPsychology.desire}`
  }

  if (presentCharacterDetails.length > 0) {
    userPrompt += `\n\n### Present Characters`
    for (const char of presentCharacterDetails) {
      userPrompt += `\n\n**${char.name}**`
      if (char.first_appearance && char.narration_cue) {
        userPrompt += `\nFirst appearance — narration cue: ${char.narration_cue}`
      }
      userPrompt += `\nActions:\n${char.actions.map((text, i) => `${i + 1}. ${text}`).join('\n')}`
      if (char.psychology) {
        if (char.psychology.wound) userPrompt += `\n- Wound: ${char.psychology.wound}`
        if (char.psychology.lie) userPrompt += `\n- Lie: ${char.psychology.lie}`
        if (char.psychology.thematic_position) userPrompt += `\n- Position: ${char.psychology.thematic_position}`
      }
    }
  }

  if ((scene.pressures || []).length > 0) {
    userPrompt += `\n\n### Atmospheric Pressures\n${scene.pressures.map(p => `- ${p}`).join('\n')}`
  }

  if (romanceStages.length > 0) {
    userPrompt += `\n\n### Romance Stage\n${romanceStages.map(s => `- ${s}`).join('\n')}`
  }

  if (previousSceneProse) {
    const words = previousSceneProse.split(/\s+/)
    const contextWords = words.length > 500 ? words.slice(-500).join(' ') : previousSceneProse
    userPrompt += `\n\n### Previous Scene (for continuity)\n${contextWords}`
  }

  userPrompt += `\n\nWrite this scene as continuous prose.`

  console.log(`Generating prose for Act ${scene.act} Part ${scene.part} Chapter ${scene.chapter_number} Scene ${scene.scene_number}...`)

  const response = await callOpenAI(systemPrompt, userPrompt, { maxTokens: 4096 })

  const wordCount = response.split(/\s+/).length
  console.log(`  Generated ${wordCount} words`)

  return {
    prose: response,
    scene_index: sceneIndex,
    act: scene.act,
    part: scene.part,
    part_name: scene.part_name,
    chapter_number: scene.chapter_number,
    scene_number: scene.scene_number,
    word_count: wordCount
  }
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
// 2. source field (characters listed e.g. "Character A + Character B")
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
      // Re-roll skeleton and regenerate concept
      updatedBible.skeleton = rollSkeleton()
      updatedBible.concept = await executePhase1(updatedBible.skeleton, concept)
      // Fall through to regenerate subsequent phases
    case 3:
      if (phaseNumber <= 3) {
        updatedBible.scenes = await executePhase3(concept, updatedBible.coreFoundation, updatedBible.characters)
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
  1: { name: 'Concept Generation', description: 'Rolling skeleton and generating story concept with characters from setting' },
  3: { name: 'Scene Generation', description: 'Breaking each chapter into 3-5 scenes with location, cast, and action' },
  6: { name: 'Major Events & Locations', description: 'Organizing grid actions into events, assigning locations' },
  7: { name: 'Event Development', description: 'Developing events back-to-front with setup requirements' },
  8: { name: 'Supporting Scenes', description: 'Creating supporting scenes to fulfill setup requirements' },
  9: { name: 'Scene Sequencing', description: 'Assembling scenes into chaptered structure with POV and hooks' },
}

/**
 * Run a single phase of the bible generation pipeline
 * @param {number} phase - Which phase to run (1 or 3+)
 * @param {string} setting - User setting string (for Phase 1)
 * @param {string} lengthPreset - 'novella' or 'novel'
 * @param {string} level - Reading level (Beginner, Intermediate, Native)
 * @param {Object} bible - Existing bible object (for phases 3+)
 * @returns {Promise<Object>} Updated bible with new phase data
 */
export async function runPhase(phase, setting, lengthPreset, level, bible = {}) {
  console.log('='.repeat(60))
  console.log(`RUNNING PHASE ${phase}`)
  console.log(`Setting: ${setting}`)
  console.log(`Length: ${lengthPreset}, Level: ${level}`)
  console.log('='.repeat(60))

  switch (phase) {
    case 1:
      console.log('Phase 1: Concept Generation')
      bible.skeleton = rollSkeleton()
      bible.concept = await executePhase1(bible.skeleton, setting)
      console.log('')
      console.log('Phase 1 complete output:')
      console.log(JSON.stringify({ skeleton: bible.skeleton, concept: bible.concept }, null, 2))
      break

    case 3:
      if (!bible.skeleton || !bible.concept) {
        throw new Error('Phase 3 requires Phase 1 (bible.skeleton, bible.concept) to be complete')
      }
      console.log('Phase 3: Scene Generation')
      bible.scenes = await executePhase3(setting, bible.concept, bible.concept.characters)
      console.log('')
      console.log('Phase 3 complete output:')
      console.log(JSON.stringify(bible.scenes, null, 2))
      break

    default:
      throw new Error(`Unknown phase: ${phase}. Valid phases are 1, 3`)
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
  const totalPhases = 2 // Phase 1 (concept), Phase 3+ (downstream phases not yet updated)

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
    // Phase 1: Concept Generation (skeleton + setting → concept)
    reportProgress(1, 'starting')
    bible.skeleton = rollSkeleton()
    bible.concept = await executePhase1(bible.skeleton, concept)
    reportProgress(1, 'complete', {
      tension: bible.skeleton.tension,
      ending: bible.skeleton.ending,
      triangle: bible.skeleton.triangle,
      chapters: bible.skeleton.chapters?.length,
      protagonist: bible.concept.characters?.protagonist?.name,
      primary: bible.concept.characters?.primary?.name,
      cast: bible.concept.characters?.cast?.length
    })
    await savePhase(1)

    // Phase 3: Scene Generation
    reportProgress(3, 'starting')
    bible.scenes = await executePhase3(concept, bible.concept, bible.concept.characters)
    reportProgress(3, 'complete', {
      totalChapters: bible.scenes.chapters?.length,
      totalScenes: bible.scenes.chapters?.reduce((sum, ch) => sum + ch.scenes.length, 0)
    })
    await savePhase(3)

    // TESTING: Stop after Phase 3 to validate scene generation
    console.log('='.repeat(60))
    console.log('TEST MODE - Stopping after Phase 3 (Scene Generation)')
    console.log('Phase 3 Output:', JSON.stringify(bible.scenes, null, 2))
    console.log('='.repeat(60))

    return {
      success: true,
      bible,
      validationStatus: 'PHASE_3_TEST',
      validationAttempts: 0
    }

    // TODO: Downstream phases need to be updated to read from bible.scenes

    // Phase 6: Major Events & Locations
    reportProgress(6, 'starting')
    bible.eventsAndLocations = await executePhase6(concept, bible.coreFoundation, bible.characters, bible.scenes)
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
    console.log('Skeleton Output:', JSON.stringify(bible.skeleton, null, 2))
    console.log('Concept Output:', JSON.stringify(bible.concept, null, 2))
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
  executePhase3,
  executePhase4,
  executePhase5,
  executePhase6,
  executePhase7,
  executePhase8,
  executePhase9,
  generateProseScene,
  flattenScenes,
  WORD_COUNT_BY_TENSION,
  LEVEL_DEFINITIONS,
  LANGUAGE_LEVEL_ADJUSTMENTS,
  PHASE_DESCRIPTIONS
}

export default {
  generateBible,
  generateStory,
  generateChapter,
  generateChapterByScenes,
  generateScene,
  generateChapterWithValidation,
  buildPreviousContext,
  compressSummaries,
  executePhase1,
  executePhase3,
  executePhase4,
  executePhase5,
  executePhase6,
  executePhase7,
  executePhase8,
  executePhase9,
  generateProseScene,
  flattenScenes,
  CONFIG,
  LEVEL_DEFINITIONS,
  LANGUAGE_LEVEL_ADJUSTMENTS,
  PHASE_DESCRIPTIONS
}
