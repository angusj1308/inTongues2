// =============================================================================
// STORY BLUEPRINTS
// =============================================================================
// Pre-built chapter structures keyed by trope × tension × ending × modifier.
// Each blueprint contains phases with chapter functions (generic) that Phase 1
// fills with story-specific descriptions.
//
// Blueprint stops at chapter functions. Scene composition varies by story/cast/setting.
// Characters multiply scene opportunities — one function becomes multiple scenes
// when cast exists.
// =============================================================================
// BLUEPRINT REGISTRY
// =============================================================================
const BLUEPRINTS = {}
// Key format: "trope|tension|ending|modifier"
// modifier is "both" (secret + love_triangle), "love_triangle", "secret", or "none"
function blueprintKey(trope, tension, ending, modifier) {
  return `${trope}|${tension}|${ending}|${modifier}`
}
function getBlueprint(trope, tension, ending, modifier) {
  const key = blueprintKey(trope, tension, ending, modifier)
  const blueprint = BLUEPRINTS[key]
  if (!blueprint) {
    return null
  }
  return blueprint
}
function hasBlueprint(trope, tension, ending, modifier) {
  return getBlueprint(trope, tension, ending, modifier) !== null
}
// =============================================================================
// BLUEPRINT: enemies_to_lovers | safety | HEA | both (secret + love_triangle)
// =============================================================================
BLUEPRINTS[blueprintKey('enemies_to_lovers', 'safety', 'HEA', 'both')] = {
  id: 'enemies_to_lovers|safety|HEA|both',
  name: 'Enemies to Lovers + Safety + HEA + Secret + Love Triangle',
  trope: 'enemies_to_lovers',
  tension: 'safety',
  ending: 'HEA',
  modifier: 'both',
  totalChapters: 14,
  // Characters the blueprint expects (roles, not names)
  expectedRoles: {
    protagonist: 'Female lead. Protecting something. Safety matters to her.',
    primary: 'Male love interest. Enters as hostile force. Dangerous but magnetic.',
    rival: 'Safe option. Genuinely appealing at first. Becomes possessive, then villain.'
  },
  // Secret modifier: the concept provides the secret, blueprint provides placement and pacing
  secretStructure: {
    description: 'The concept contains a secret. Plant it early, let it work underground, and surface it in the dark moment (chapter 9).',
    surfacing: 'Phase 3 (chapter 9) — the secret surfaces and changes how the other character sees the relationship.',
    guidance: {
      qualities: [
        'The reader understands why it is being hidden — fear, shame, loyalty, love. The person keeping it is sympathetic, not villainous.',
        'The reveal recontextualises what came before. Every kind moment, every intimate conversation, every step closer now looks different.',
        'It connects to what the characters value most. The secret threatens the thing the story is about.'
      ],
      common_forms: [
        'I am not who you think I am (a hidden connection, identity, or history)',
        'I did something that affects your world and you do not know it was me',
        'I know something about you that you have not chosen to share with me',
        'Someone I love hurt you and I am protecting them',
        'I am here under false pretences — our meeting was not what you think it was'
      ],
      rules: [
        'Do not invent a secret. The concept provides it. Your job is placement and pacing.',
        'The secret can be held by one person or both. One secret held by one person is often stronger than two.',
        'A secret in romance is not a plot twist. It is information one character is hiding that, when revealed, changes how the other character sees the relationship.'
      ]
    }
  },
  phases: [
    {
      phase: 1,
      name: 'Setup',
      description: 'She hates him because he represents something dangerous. Forced proximity.',
      chapters: [
        {
          chapter: 1,
          function: 'Her world',
          description: 'Establish the protagonist\'s daily life and the pressure that makes her situation unsustainable. Show what she\'s protecting and why safety matters to her.'
        },
        {
          chapter: 2,
          function: 'The meet',
          description: 'The love interest enters her world as a hostile force. First encounter establishes mutual antagonism. He notices her. The aftermath worsens her existing pressure.'
        },
        {
          chapter: 3,
          function: 'The safe option presents itself',
          description: 'The rival offers a solution to her pressure. The offer is genuinely appealing — safety, stability, rescue. Real world consequences reinforce why she must accept. People around her depend on it.'
        },
        {
          chapter: 4,
          function: 'Forced proximity that reinforces first impression',
          description: 'A second encounter with the primary confirms her initial judgement. His behaviour is aggressive or threatening — the only response he knows. She commits to the safe path. He is exactly what she feared.'
        }
      ]
    },
    {
      phase: 2,
      name: 'Falling',
      description: 'She discovers he\'s not what she assumed. The attraction feels dangerous. Each step closer terrifies her.',
      chapters: [
        {
          chapter: 5,
          function: 'Maybe I was wrong',
          description: 'Real trouble exposes her vulnerability. The rival fails to meet the moment. The primary contradicts her first impression through action — protection, provision, generosity. No words, no explanation, just the act.'
        },
        {
          chapter: 6,
          function: 'There\'s so much more to him',
          description: 'The rival\'s flaw is exposed — not evil, just small. A deeper encounter reveals the primary\'s true character — real vulnerability, real conversation. The rival senses the shift and gains leverage he can use later.'
        },
        {
          chapter: 7,
          function: 'He can actually keep me safe',
          description: 'The primary makes a spontaneous gesture — he\'s there for her, not for business. She enters his world and sees who he really is. The almost — physical closeness, the line nearly crossed. The rival confronts her. The safe option becomes possessive.'
        }
      ]
    },
    {
      phase: 3,
      name: 'Retreat',
      description: 'He does something that triggers her original wound. Everything she feared seems confirmed. She retreats to hatred because hatred is safer than heartbreak.',
      chapters: [
        {
          chapter: 8,
          function: 'The withdrawal and retreat',
          description: 'The primary pulls away without explanation. The rival manufactures evidence against the primary, confirming her original fears. She retreats to the safe option and commits fully.'
        },
        {
          chapter: 9,
          function: 'The dark moment',
          description: 'The primary and protagonist confront each other. Secrets surface between them. Neither believes the other. They part with nothing left — enemies again, but with love underneath.'
        }
      ]
    },
    {
      phase: 4,
      name: 'Resolution',
      description: 'She sees she hated him because she was afraid of what he made her feel. She chooses vulnerability over armour.',
      chapters: [
        {
          chapter: 10,
          function: 'Accepted her fate',
          description: 'She commits to the safe option. Goes through the motions. Something is dead inside her. We see what she\'s lost.'
        },
        {
          chapter: 11,
          function: 'Discovers the truth',
          description: 'Evidence emerges that the rival manipulated the retreat. The safe option was never safe — the rival is the real danger. Everything that destroyed them was engineered.'
        },
        {
          chapter: 12,
          function: 'Reunited',
          description: 'She goes to the primary with the truth. Everything is on the table. He already knew the worst about her and chose her anyway. No more secrets, no more armour. The consummation. They choose each other.'
        },
        {
          chapter: 13,
          function: 'The reversal',
          description: 'The rival is exposed publicly and becomes the actual threat. He uses his remaining power to hunt them. Someone from her world eliminates the rival — someone who finally saw the truth.'
        },
        {
          chapter: 14,
          function: 'HEA',
          description: 'She secures what she built by entrusting it to others. The primary commits his resources to protect what matters to her. They leave together — not into safety, not into danger. Just together.'
        }
      ]
    }
  ]
}
// =============================================================================
// PHASE 1: BLUEPRINT → CHAPTER DESCRIPTIONS
// =============================================================================
// Takes a concept + matched blueprint and generates story-specific chapter
// descriptions. This is the new Phase 1. No Story DNA, no external plot acts,
// no tone/timespan/POV fields. Just: what happens in each chapter of this story.
const PHASE_1_BLUEPRINT_SYSTEM_PROMPT = `You are a story architect. You receive a romance novel concept and a structural blueprint — a sequence of chapters with generic functions. Your job is to fill each chapter function with a story-specific description.
## WHAT YOU DO
For each chapter in the blueprint, write a 2-4 sentence description of what happens in THIS story. The description must:
- Fulfil the chapter's generic function exactly
- Use the specific characters, setting, and circumstances from the concept
- Be concrete enough that a reader could picture the scene
- Not introduce characters or events that contradict the concept
## WHAT YOU DON'T DO
- Don't invent named supporting characters (Phase 2 does that)
- Don't break chapters into scenes (that happens later)
- Don't add chapters or remove chapters — the blueprint is fixed
- Don't write prose — write clear, direct descriptions of what happens
- Don't add backstory or world-building beyond what the concept provides
## SECRET MODIFIER
If the blueprint has a secret structure, your job is placement and pacing — not invention. The concept provides the secret. You decide:
- When the reader learns it (plant it early so it works underground from the start)
- When the other character learns it (the designated surfacing chapter — usually the dark moment)
- What it destroys when it surfaces (it must change how the other character sees the relationship)

A good secret in romance is not a plot twist. It is information one character is hiding that, when revealed, changes how the other character sees the relationship. It has three qualities:
1. The reader understands why it is being hidden. Fear, shame, loyalty, love — the person keeping it has a reason that makes them sympathetic, not villainous.
2. The reveal recontextualises what came before. Every kind moment, every intimate conversation, every step closer now looks different because this was underneath the whole time.
3. It connects to what the characters value most. The secret threatens the thing the story is about — safety, identity, duty, whatever the tension is.

The secret can be held by one person or both. It does not need to be bilateral. One secret held by one person is often stronger than two secrets splitting the reader's attention. The POV character holding the secret creates slow dread. The other character holding it creates sudden devastation. Either works.

Do not invent a secret. Do not force a bilateral pattern. Use what the concept gives you.
## LOVE TRIANGLE MODIFIER
If the blueprint has a rival role:
- The rival must be genuinely appealing in early chapters — not a villain from the start
- The rival's degradation must be gradual and motivated
- The rival's manipulation in later chapters must use tools established earlier
## OUTPUT FORMAT
Return a JSON object:
{
  "concept_summary": "One sentence summary of the concept as you understand it",
  "chapters": [
    {
      "chapter": 1,
      "phase": 1,
      "function": "Her world",
      "description": "Story-specific description of what happens in this chapter. 2-4 sentences. Concrete, not abstract."
    }
  ]
}
Every chapter in the blueprint must appear in your output. Same chapter numbers, same functions. Only the description is yours.`
function buildPhase1BlueprintPrompt(concept, blueprint) {
  // Build the blueprint reference for the prompt
  const blueprintText = blueprint.phases.map(phase => {
    const chaptersText = phase.chapters.map(ch =>
      `  Chapter ${ch.chapter} — "${ch.function}"\n    ${ch.description}`
    ).join('\n\n')
    return `PHASE ${phase.phase}: ${phase.name}\n${phase.description}\n\n${chaptersText}`
  }).join('\n\n---\n\n')
  // Build secret structure reference if present
  let secretText = ''
  if (blueprint.secretStructure) {
    const ss = blueprint.secretStructure
    const qualitiesText = ss.guidance.qualities.map((q, i) => `${i + 1}. ${q}`).join('\n')
    const formsText = ss.guidance.common_forms.map(f => `* ${f}`).join('\n')
    const rulesText = ss.guidance.rules.map(r => `- ${r}`).join('\n')
    secretText = `\n\nSECRET STRUCTURE:\n${ss.description}\nSurfaces: ${ss.surfacing}\n\nQualities of a good secret:\n${qualitiesText}\n\nCommon forms secrets take in romance:\n${formsText}\n\nRules:\n${rulesText}`
  }
  // Build expected roles
  const rolesText = Object.entries(blueprint.expectedRoles)
    .map(([role, desc]) => `- ${role}: ${desc}`)
    .join('\n')
  return `CONCEPT:\n${concept}\n\nBLUEPRINT: ${blueprint.name}\nTotal chapters: ${blueprint.totalChapters}\n\nEXPECTED ROLES:\n${rolesText}${secretText}\n\nCHAPTER STRUCTURE:\n\n${blueprintText}\n\nFill each chapter function with a story-specific description for this concept. 2-4 sentences per chapter. Concrete and specific to this story.`
}
export {
  BLUEPRINTS,
  blueprintKey,
  getBlueprint,
  hasBlueprint,
  PHASE_1_BLUEPRINT_SYSTEM_PROMPT,
  buildPhase1BlueprintPrompt
}
