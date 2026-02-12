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
  // Secret modifier: bilateral secrets between protagonist and primary
  secretStructure: {
    type: 'bilateral',
    description: 'Each lover holds a secret that, if known, would destroy the other\'s trust. The secrets work underground until Phase 3-4.',
    protagonist_secret: 'Something she did that harmed the primary or his people before they met.',
    primary_secret: 'Something he did that harmed the protagonist or her people before they met.',
    surfacing: 'Phase 3 (chapter 9) — both secrets collide in a single confrontation.'
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
If the blueprint has a secret structure, your descriptions must account for it:
- Plant the secrets in early chapter descriptions (who did what before the story began)
- Show the secrets working underground in middle chapters
- Make the secret surfacing in the designated chapter feel inevitable, not sudden
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
    secretText = `\n\nSECRET STRUCTURE (${ss.type}):\n${ss.description}\n- Protagonist's secret: ${ss.protagonist_secret}\n- Primary's secret: ${ss.primary_secret}\n- Secrets surface: ${ss.surfacing}`
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
