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
// PHASE 1: CHARACTER GENERATION
// =============================================================================

const TENSION_FRAMEWORK_DESCRIPTIONS = {
  safety: 'She built a framework to protect something tangible — a livelihood, a family, a fragile stability. Danger is physical, material, real. The primary represents that danger. Her behaviour shows what she protects and why she cannot afford to let him close.',
  identity: 'She built a framework that defines who she is — competence, principles, a role, a reputation. The primary threatens that constructed self. Her behaviour shows what framework she built and why losing it feels like losing herself.'
}

const CHARACTER_FIELDS = ['backstory', 'psychology', 'voiceAndMannerisms', 'appearance']

const PHASE_1_CALL1_SYSTEM_PROMPT = `You are creating the core characters for an enemies-to-lovers romance. You receive a setting, a tension type with its framework description, and whether a love triangle exists.

You will produce:
- "protagonist" — She. The woman whose framework the story breaks.
- "primary" — He. The man who represents danger to that framework.
- If triangle is YES: "rival" — The safe option. The man who represents everything her framework endorses.

RULES:
1. Each character has exactly four fields: backstory, psychology, voiceAndMannerisms, appearance. Each field is one paragraph of substantial prose.
2. No "name" field. Names appear naturally within the backstory paragraph — chosen to fit the setting, the culture, the time.
3. Every character must be alive and physically present in the setting. No ghosts, no memories, no abstractions.
4. Ground each character in the historical and social reality of the setting. If the setting is a frontier during a military campaign, these people exist in that world — their clothes, their trades, their scars come from that reality.
5. Traditional gender roles preferred. Avoid modernist feminist tropes. Build characters whose roles are plausible for the era and setting.
6. Psychology must reflect the tension type without ever naming or declaring it. For safety tension: her psychology shows what she protects and why danger terrifies her. For identity tension: her psychology shows the constructed self and why it cannot bend. No theme lectures. No meta-commentary.
7. The primary's psychology must make him genuinely dangerous to her framework — not a bad person, but someone whose nature or position makes her framework unsustainable.
8. If triangle is YES, the rival is the safe option personified — stable, respectable, everything the framework endorses. But he has a latent flaw that will surface later. Plant it subtly in his psychology without declaring it.
9. Voice and mannerisms must be distinct per character. How they speak, move, and occupy space should be different from each other.
10. Appearance must be specific and grounded — no generic beauty. Physical details that come from the world they live in.

OUTPUT FORMAT:
Return a single JSON object:
{
  "protagonist": {
    "backstory": "One paragraph. Where she came from, what shaped her.",
    "psychology": "One paragraph. What she wants, fears, avoids. How the tension manifests in her thinking.",
    "voiceAndMannerisms": "One paragraph. How she speaks, moves, behaves. Speech patterns, habits, tells.",
    "appearance": "One paragraph. Physical description grounded in the setting."
  },
  "primary": {
    "backstory": "One paragraph.",
    "psychology": "One paragraph. What he wants, fears. How he relates to her tension.",
    "voiceAndMannerisms": "One paragraph.",
    "appearance": "One paragraph."
  },
  "rival": null
}

When triangle is YES, rival follows the same four-field structure instead of null.

IMPORTANT:
- Return ONLY the JSON object. No preamble, no explanation, no markdown fences.
- Every paragraph must be substantive — at least 3-4 sentences of concrete detail.
- Do not produce generic characters. These people are specific to this setting, this time, this place.`

const PHASE_1_CALL2_SYSTEM_PROMPT = `You are creating the secondary cast for an enemies-to-lovers romance. You receive the setting, tension type, the already-created protagonist and primary characters, and a list of cast functions with employment options.

For each cast function, you must:
1. Select exactly ONE employment option from the provided list.
2. Create a concrete character who fulfils that function in relationship to the protagonist.

RULES:
1. Each cast member has exactly six fields: functionId, employmentOption, backstory, psychology, voiceAndMannerisms, appearance.
2. functionId must match the id provided in the cast function list exactly.
3. employmentOption must be copied exactly from the provided options — the one you selected.
4. No "name" field. Names appear naturally within the backstory paragraph.
5. Every cast member must be alive and physically present in the setting. No ghosts, no memories, no abstractions.
6. Ground each character in the historical and social reality of the setting. A "widow" on the Argentine pampas is different from a "widow" in Regency England. Make the employment option real for this world.
7. Traditional gender roles preferred. Avoid modernist feminist tropes. Build characters whose roles are plausible for the era and setting.
8. Each cast member exists in relationship to the protagonist. The function description tells you what role they play in her story. Their backstory and psychology should make that relationship concrete and specific — build them knowing who she is.
9. Voice and mannerisms must be distinct from each other and from the protagonist and primary.
10. Appearance must be specific and grounded.
11. backstory, psychology, voiceAndMannerisms, and appearance are each one paragraph of substantial prose.

OUTPUT FORMAT:
Return a single JSON object:
{
  "cast": [
    {
      "functionId": "exact_id_from_list",
      "employmentOption": "Exact option text you selected",
      "backstory": "One paragraph.",
      "psychology": "One paragraph.",
      "voiceAndMannerisms": "One paragraph.",
      "appearance": "One paragraph."
    }
  ]
}

One entry per cast function. Do not skip any. Do not add extras.

IMPORTANT:
- Return ONLY the JSON object. No preamble, no explanation, no markdown fences.
- Every paragraph must be substantive — at least 3-4 sentences of concrete detail.
- Do not produce generic characters. These people are specific to this setting, this protagonist, this world.`

/**
 * Build the user prompt for Call 1: protagonist, primary, and optionally rival.
 */
function buildCall1UserPrompt(setting, tension, tensionFramework, triangle) {
  return `=== SETTING ===
${setting}

=== TENSION TYPE ===
${tension}

=== TENSION FRAMEWORK ===
${tensionFramework}

=== TRIANGLE ===
${triangle ? 'YES — create a rival character (the safe option).' : 'NO — rival must be null.'}

Create the protagonist (she), the primary (he)${triangle ? ', and the rival' : ''}. Return the JSON object only.`
}

/**
 * Build the user prompt for Call 2: secondary cast.
 * Includes protagonist and primary from Call 1 so the LLM builds cast in relation to them.
 */
function buildCall2UserPrompt(setting, tension, protagonist, primary, castFunctions) {
  const castList = castFunctions.map(cf => {
    const optionsStr = cf.employmentOptions.map((o, i) => `    ${i + 1}. ${o}`).join('\n')
    return `- Function: "${cf.name}" (id: ${cf.id})
  Description: ${cf.description}
  Employment options (pick exactly one):
${optionsStr}`
  }).join('\n\n')

  return `=== SETTING ===
${setting}

=== TENSION TYPE ===
${tension}

=== PROTAGONIST (already created) ===
Backstory: ${protagonist.backstory}
Psychology: ${protagonist.psychology}
Voice and mannerisms: ${protagonist.voiceAndMannerisms}
Appearance: ${protagonist.appearance}

=== PRIMARY (already created) ===
Backstory: ${primary.backstory}
Psychology: ${primary.psychology}
Voice and mannerisms: ${primary.voiceAndMannerisms}
Appearance: ${primary.appearance}

=== CAST FUNCTIONS ===
${castList}

Create one character for each cast function. Select one employment option per function. Return the JSON object only.`
}

/**
 * Validate that a character object has all four required non-empty string fields.
 */
function validateCharacterFields(obj, label) {
  if (!obj || typeof obj !== 'object') {
    throw new Error(`Phase 1: ${label} is missing or not an object`)
  }
  for (const field of CHARACTER_FIELDS) {
    if (!obj[field] || typeof obj[field] !== 'string' || obj[field].trim().length === 0) {
      throw new Error(`Phase 1: ${label} missing or empty field "${field}"`)
    }
  }
}

/**
 * Validate Call 1 output: protagonist, primary, and optionally rival.
 */
function validateCall1(data, triangle) {
  validateCharacterFields(data.protagonist, 'protagonist')
  validateCharacterFields(data.primary, 'primary')

  if (triangle) {
    if (!data.rival) {
      throw new Error('Phase 1 Call 1: rival must be present when triangle is true')
    }
    validateCharacterFields(data.rival, 'rival')
  } else {
    if (data.rival !== null && data.rival !== undefined) {
      throw new Error('Phase 1 Call 1: rival must be null when triangle is false')
    }
  }
}

/**
 * Validate Call 2 output: cast array with functionId, employmentOption, and character fields.
 */
function validateCall2(data, filteredCastFunctions) {
  if (!Array.isArray(data.cast)) {
    throw new Error('Phase 1 Call 2: cast must be an array')
  }

  if (data.cast.length !== filteredCastFunctions.length) {
    throw new Error(
      `Phase 1 Call 2: expected ${filteredCastFunctions.length} cast members, got ${data.cast.length}`
    )
  }

  const expectedIds = new Set(filteredCastFunctions.map(cf => cf.id))

  for (const member of data.cast) {
    if (!member.functionId || !expectedIds.has(member.functionId)) {
      throw new Error(
        `Phase 1 Call 2: invalid or missing functionId "${member.functionId}". Expected one of: ${[...expectedIds].join(', ')}`
      )
    }

    if (!member.employmentOption || typeof member.employmentOption !== 'string' || member.employmentOption.trim().length === 0) {
      throw new Error(`Phase 1 Call 2: cast member "${member.functionId}" missing employmentOption`)
    }

    validateCharacterFields(member, `cast member "${member.functionId}"`)
  }

  const returnedIds = new Set(data.cast.map(m => m.functionId))
  for (const expectedId of expectedIds) {
    if (!returnedIds.has(expectedId)) {
      throw new Error(`Phase 1 Call 2: missing cast member for functionId "${expectedId}"`)
    }
  }
}

/**
 * Phase 1: Character Generation
 * Takes a rolled skeleton and user setting, makes two LLM calls,
 * and returns a characters object with protagonist, primary, rival, and cast.
 *
 * Call 1: Setting + tension → protagonist and primary (+ rival if triangle)
 * Call 2: Setting + protagonist + primary + cast functions → secondary cast
 *
 * @param {Object} skeleton - Output of rollSkeleton() from storyBlueprints.js
 * @param {string} setting - User-provided setting string
 * @returns {Promise<Object>} Object with characters
 */
async function executePhase1(skeleton, setting) {
  console.log('Executing Phase 1: Character Generation...')
  console.log(`  Tension: ${skeleton.tension}`)
  console.log(`  Ending: ${skeleton.ending}`)
  console.log(`  Triangle: ${skeleton.triangle}`)
  console.log(`  Secret: ${skeleton.secret}`)
  console.log(`  Cast functions: ${skeleton.castFunctions.length}`)
  console.log(`  Setting: ${setting}`)

  const tension = skeleton.tension
  const triangle = skeleton.triangle
  const tensionFramework = TENSION_FRAMEWORK_DESCRIPTIONS[tension]

  // ── Call 1: Protagonist, Primary, and optionally Rival ──────────────
  console.log('\n  Call 1: Generating protagonist, primary' + (triangle ? ', and rival...' : '...'))

  const call1UserPrompt = buildCall1UserPrompt(setting, tension, tensionFramework, triangle)

  const call1Response = await callClaude(PHASE_1_CALL1_SYSTEM_PROMPT, call1UserPrompt, {
    model: 'claude-sonnet-4-20250514',
    temperature: 1.0,
    maxTokens: 4096
  })

  const call1Parsed = parseJSON(call1Response)
  if (!call1Parsed.success) {
    throw new Error(`Phase 1 Call 1 JSON parse failed: ${call1Parsed.error}`)
  }

  validateCall1(call1Parsed.data, triangle)
  console.log('  Call 1 validated successfully.')

  const { protagonist, primary, rival } = call1Parsed.data

  // ── Call 2: Secondary Cast ──────────────────────────────────────────
  // Filter out cast functions with empty employmentOptions (e.g., The Rival)
  const filteredCastFunctions = skeleton.castFunctions.filter(cf => cf.employmentOptions.length > 0)

  console.log(`\n  Call 2: Generating ${filteredCastFunctions.length} secondary cast members...`)

  const call2UserPrompt = buildCall2UserPrompt(setting, tension, protagonist, primary, filteredCastFunctions)

  const call2Response = await callClaude(PHASE_1_CALL2_SYSTEM_PROMPT, call2UserPrompt, {
    model: 'claude-sonnet-4-20250514',
    temperature: 1.0,
    maxTokens: 8192
  })

  const call2Parsed = parseJSON(call2Response)
  if (!call2Parsed.success) {
    throw new Error(`Phase 1 Call 2 JSON parse failed: ${call2Parsed.error}`)
  }

  validateCall2(call2Parsed.data, filteredCastFunctions)
  console.log('  Call 2 validated successfully.')

  // ── Assemble output ─────────────────────────────────────────────────
  const characters = {
    protagonist,
    primary,
    rival: rival || null,
    cast: call2Parsed.data.cast
  }

  console.log('\nPhase 1 Character Generation complete.')
  console.log(`  Protagonist backstory: ${protagonist.backstory.slice(0, 80)}...`)
  console.log(`  Primary backstory: ${primary.backstory.slice(0, 80)}...`)
  if (rival) {
    console.log(`  Rival backstory: ${rival.backstory.slice(0, 80)}...`)
  }
  for (const m of characters.cast) {
    console.log(`  Cast [${m.functionId}] (${m.employmentOption}): ${m.backstory.slice(0, 60)}...`)
  }

  return { characters }
}

// =============================================================================
// PHASE 2: SCENE SUMMARIES
// =============================================================================

const PHASE_2_SYSTEM_PROMPT = `You are a story architect creating scene-by-scene chapter summaries for an enemies-to-lovers romance. You receive a complete chapter skeleton with employment selections and end states, plus full character profiles from Phase 1.

Your job: break every chapter into 2-5 scenes. Each scene is a unit of continuous action in one location with specific characters physically present.

RULES:

1. The employment selection is a mandatory beat, not a chapter description. Every chapter has one or more employment selections from the skeleton. Each employment selection must appear as a concrete beat in exactly one scene in that chapter. But the employment beat is not the only thing that happens in the chapter — it is a guardrail for the central romance arc, nothing more.

2. Other scenes do other work. A chapter with 3 scenes might have: one scene introducing a cast member, one scene building a relationship or showing the world, and one scene where the employment beat lands. The chapter is not 3 variations of the same beat. Not every scene carries an employment beat.

3. Scenes chain. Within a chapter, Scene 1's exitState flows naturally into Scene 2's entryState. Scene 2's exitState flows into Scene 3's entryState. The final scene's exitState must align with the chapter's endState from the skeleton. For Chapter 1, the first scene's entryState establishes the status quo. For later chapters, continue from the previous chapter's trajectory.

4. Entry and exit states only. Do not describe what happens in the scene. Do not include beats, turning points, dialogue suggestions, mood, or tone. Just the emotional or situational state at the opening and closing. The gap between entry and exit is the prose generator's creative space.

5. Characters present means physically in the scene. Only list characters who are in the room, on the road, at the table. Not characters who are discussed, remembered, or thought about.

6. Use character names from the profiles. Read the backstory paragraphs of every character to find their names. Use those exact first names in the characters arrays.

7. Locations are specific. Not "the estancia" but "the estancia kitchen at dawn" or "the corral behind the main house." Specific enough to write a scene in.

8. Chapter numbers and titles must match the skeleton exactly. Do not renumber, rename, or reorder.

9. Cast members serve their function. When a cast member appears in a scene, they should be doing something consistent with their narrative function described in their profile. Do not use cast members as generic extras.

OUTPUT FORMAT:
Return a single JSON object:
{
  "chapters": [
    {
      "chapter": 1,
      "title": "Exact Title from Skeleton",
      "scenes": [
        {
          "location": "Specific location with atmosphere or time detail",
          "characters": ["FirstName", "FirstName"],
          "entryState": "One sentence. Where things stand when the scene opens.",
          "exitState": "One sentence. Where things stand when the scene ends."
        }
      ]
    }
  ]
}

IMPORTANT:
- Return ONLY the JSON object. No preamble, no explanation, no markdown fences.
- Every chapter from the skeleton must appear in your output.
- 2 to 5 scenes per chapter. No fewer, no more.
- Every employment selection must be realised in exactly one scene per chapter.
- Scene chains must be continuous — no gaps, no jumps.`

/**
 * Build the user prompt for Phase 2: scene summaries.
 * Combines story structure, character profiles, and chapter skeleton.
 */
function buildPhase2UserPrompt(skeleton, characters) {
  // ── Story structure ──
  const structureBlock = `=== STORY STRUCTURE ===
Tension: ${skeleton.tension}
Ending: ${skeleton.ending}
Triangle: ${skeleton.triangle ? 'YES' : 'NO'}
Secret: ${skeleton.secret ? 'YES' : 'NO'}
Total chapters: ${skeleton.chapters.length}`

  // ── Character profiles ──
  let characterBlock = `=== PROTAGONIST ===
Backstory: ${characters.protagonist.backstory}
Psychology: ${characters.protagonist.psychology}
Voice and mannerisms: ${characters.protagonist.voiceAndMannerisms}

=== PRIMARY ===
Backstory: ${characters.primary.backstory}
Psychology: ${characters.primary.psychology}
Voice and mannerisms: ${characters.primary.voiceAndMannerisms}`

  if (characters.rival) {
    characterBlock += `

=== RIVAL ===
Backstory: ${characters.rival.backstory}
Psychology: ${characters.rival.psychology}
Voice and mannerisms: ${characters.rival.voiceAndMannerisms}`
  }

  if (characters.cast && characters.cast.length > 0) {
    characterBlock += '\n\n=== CAST ==='
    for (const member of characters.cast) {
      characterBlock += `

--- ${member.functionId} (${member.employmentOption}) ---
Backstory: ${member.backstory}
Psychology: ${member.psychology}`
    }
  }

  // ── Chapters ──
  const chaptersBlock = skeleton.chapters.map(ch => {
    let chapterStr = `--- Chapter ${ch.chapter}: ${ch.title} ---
End state: ${ch.endState}`

    if (ch.employmentSelections.length > 0) {
      chapterStr += '\nEmployment selections:'
      for (const sel of ch.employmentSelections) {
        chapterStr += `\n  - [${sel.group}] ${sel.text}`
      }
    } else {
      chapterStr += '\nEmployment selections: (none — this is a resolution chapter)'
    }

    return chapterStr
  }).join('\n\n')

  return `${structureBlock}

${characterBlock}

=== CHAPTERS ===
${chaptersBlock}

Create scene summaries for every chapter. Return the JSON object only.`
}

/**
 * Validate Phase 2 output: scene summaries for all chapters.
 */
function validatePhase2(data, skeleton) {
  if (!data.chapters || !Array.isArray(data.chapters)) {
    throw new Error('Phase 2: chapters must be an array')
  }

  if (data.chapters.length !== skeleton.chapters.length) {
    throw new Error(
      `Phase 2: expected ${skeleton.chapters.length} chapters, got ${data.chapters.length}`
    )
  }

  for (let i = 0; i < data.chapters.length; i++) {
    const ch = data.chapters[i]
    const skCh = skeleton.chapters[i]

    if (ch.chapter !== skCh.chapter) {
      throw new Error(
        `Phase 2: chapter ${i + 1} has number ${ch.chapter}, expected ${skCh.chapter}`
      )
    }

    if (!ch.title || ch.title !== skCh.title) {
      throw new Error(
        `Phase 2: chapter ${ch.chapter} title mismatch: got "${ch.title}", expected "${skCh.title}"`
      )
    }

    if (!Array.isArray(ch.scenes) || ch.scenes.length < 2 || ch.scenes.length > 5) {
      throw new Error(
        `Phase 2: chapter ${ch.chapter} must have 2-5 scenes, got ${ch.scenes?.length ?? 0}`
      )
    }

    for (let j = 0; j < ch.scenes.length; j++) {
      const scene = ch.scenes[j]

      if (!scene.location || typeof scene.location !== 'string' || scene.location.trim().length === 0) {
        throw new Error(`Phase 2: chapter ${ch.chapter} scene ${j + 1} missing or empty location`)
      }

      if (!Array.isArray(scene.characters) || scene.characters.length === 0) {
        throw new Error(`Phase 2: chapter ${ch.chapter} scene ${j + 1} must have at least one character`)
      }
      for (const name of scene.characters) {
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
          throw new Error(`Phase 2: chapter ${ch.chapter} scene ${j + 1} has empty character name`)
        }
      }

      if (!scene.entryState || typeof scene.entryState !== 'string' || scene.entryState.trim().length === 0) {
        throw new Error(`Phase 2: chapter ${ch.chapter} scene ${j + 1} missing or empty entryState`)
      }

      if (!scene.exitState || typeof scene.exitState !== 'string' || scene.exitState.trim().length === 0) {
        throw new Error(`Phase 2: chapter ${ch.chapter} scene ${j + 1} missing or empty exitState`)
      }
    }
  }
}

/**
 * Phase 2: Generate scene summaries for all chapters.
 * One LLM call. Input: skeleton + Phase 1 characters.
 * Output: 2-5 scene summaries per chapter.
 */
async function executePhase2(skeleton, characters) {
  console.log('\nExecuting Phase 2: Scene Summaries...')
  console.log(`  Chapters: ${skeleton.chapters.length}`)
  console.log(`  Cast members: ${characters.cast.length}`)
  console.log(`  Triangle: ${skeleton.triangle}`)

  const userPrompt = buildPhase2UserPrompt(skeleton, characters)

  const response = await callClaude(PHASE_2_SYSTEM_PROMPT, userPrompt, {
    model: 'claude-sonnet-4-20250514',
    temperature: 1.0,
    maxTokens: 16384
  })

  const parsed = parseJSON(response)
  if (!parsed.success) {
    throw new Error(`Phase 2 JSON parse failed: ${parsed.error}`)
  }

  validatePhase2(parsed.data, skeleton)
  console.log('  Phase 2 validated successfully.')

  for (const ch of parsed.data.chapters) {
    console.log(`  Chapter ${ch.chapter} "${ch.title}": ${ch.scenes.length} scenes`)
  }

  console.log('\nPhase 2 Scene Summaries complete.')

  return { sceneSummaries: parsed.data }
}

/**
 * Pipeline entry point.
 * Rolls a skeleton, generates characters (Phase 1), then scene summaries (Phase 2).
 *
 * @param {string} setting - User-provided setting string
 * @returns {Promise<Object>} Object with skeleton, characters, and sceneSummaries
 */
export async function generateStory(setting) {
  const skeleton = rollSkeleton()
  const phase1 = await executePhase1(skeleton, setting)
  const phase2 = await executePhase2(skeleton, phase1.characters)
  return { skeleton, characters: phase1.characters, sceneSummaries: phase2.sceneSummaries }
}

export {
  callClaude,
  callChatGPT,
  parseJSON,
  getLevelDefinition,
  formatLevelDefinitionForPrompt,
  executePhase1,
  executePhase2,
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
  executePhase2,
  CONFIG,
  LEVEL_DEFINITIONS,
  LANGUAGE_LEVEL_ADJUSTMENTS
}

