// =============================================================================
// PHASE 1 BLUEPRINT EXECUTION
// =============================================================================
// This replaces the old Phase 1 (Story DNA) when a blueprint exists.
// It takes concept + blueprint → story-specific chapter descriptions.
//
// Integration points:
// 1. After concept expansion selects trope/tension/ending/modifier
// 2. Check hasBlueprint() — if no blueprint, refuse generation
// 3. If blueprint exists, call executePhase1Blueprint instead of old executePhase1
// 4. Output feeds Phase 2 (cast generation) which reads chapter descriptions
//    instead of the old Story DNA fields
import {
  getBlueprint,
  hasBlueprint,
  PHASE_1_BLUEPRINT_SYSTEM_PROMPT,
  buildPhase1BlueprintPrompt
} from './storyBlueprints.js'
// Assumes callClaude and parseJSON are available from novelGenerator.js
// In production, import them. For now, these are passed as dependencies.
/**
 * Execute Phase 1 using blueprint matching.
 *
 * @param {string} concept - The expanded concept text
 * @param {string} tropeId - e.g. 'enemies_to_lovers'
 * @param {string} tensionId - e.g. 'safety'
 * @param {string} endingId - e.g. 'HEA'
 * @param {string} modifierId - e.g. 'both', 'love_triangle', 'secret', 'none'
 * @param {Function} callLLM - async function(systemPrompt, userPrompt, options) => string
 * @param {Function} parseJSONFn - function(string) => { success, data, error }
 * @returns {Object} Phase 1 output: { blueprint, chapters, concept_summary }
 * @throws {Error} if no blueprint exists for this combination
 */
async function executePhase1Blueprint(concept, tropeId, tensionId, endingId, modifierId, callLLM, parseJSONFn) {
  console.log('Executing Phase 1: Blueprint → Chapter Descriptions...')
  console.log(`  Combination: ${tropeId} | ${tensionId} | ${endingId} | ${modifierId}`)
  // Step 1: Look up blueprint
  const blueprint = getBlueprint(tropeId, tensionId, endingId, modifierId)
  if (!blueprint) {
    throw new Error(
      `No blueprint exists for combination: ${tropeId} | ${tensionId} | ${endingId} | ${modifierId}. ` +
      `Generation cannot proceed without a blueprint. ` +
      `Available blueprints must be built before this combination can be used.`
    )
  }
  console.log(`  Blueprint found: "${blueprint.name}" (${blueprint.totalChapters} chapters)`)
  // Step 2: Build prompt
  const userPrompt = buildPhase1BlueprintPrompt(concept, blueprint)
  // Step 3: Call LLM
  const response = await callLLM(PHASE_1_BLUEPRINT_SYSTEM_PROMPT, userPrompt, {
    model: 'claude-sonnet-4-20250514',
    temperature: 1.0,
    maxTokens: 8192
  })
  const parsed = parseJSONFn(response)
  if (!parsed.success) {
    throw new Error(`Phase 1 Blueprint JSON parse failed: ${parsed.error}`)
  }
  const data = parsed.data
  // Step 4: Validate output
  if (!data.chapters || !Array.isArray(data.chapters)) {
    throw new Error('Phase 1 Blueprint: missing chapters array')
  }
  if (data.chapters.length !== blueprint.totalChapters) {
    throw new Error(
      `Phase 1 Blueprint: expected ${blueprint.totalChapters} chapters, got ${data.chapters.length}`
    )
  }
  // Validate each chapter matches the blueprint
  const allBlueprintChapters = blueprint.phases.flatMap(p => p.chapters)
  for (const ch of data.chapters) {
    const expected = allBlueprintChapters.find(bc => bc.chapter === ch.chapter)
    if (!expected) {
      throw new Error(`Phase 1 Blueprint: unexpected chapter number ${ch.chapter}`)
    }
    if (!ch.description || ch.description.trim().length < 20) {
      throw new Error(`Phase 1 Blueprint: chapter ${ch.chapter} description is too short or missing`)
    }
    // Ensure function matches
    if (ch.function !== expected.function) {
      console.warn(
        `Phase 1 Blueprint: chapter ${ch.chapter} function mismatch. ` +
        `Expected "${expected.function}", got "${ch.function}". Overriding.`
      )
      ch.function = expected.function
    }
  }
  // Step 5: Build the Phase 1 output
  // This is what downstream phases consume instead of the old Story DNA
  const result = {
    // The blueprint reference (structure)
    blueprint: {
      id: blueprint.id,
      name: blueprint.name,
      trope: blueprint.trope,
      tension: blueprint.tension,
      ending: blueprint.ending,
      modifier: blueprint.modifier,
      totalChapters: blueprint.totalChapters,
      expectedRoles: blueprint.expectedRoles,
      secretStructure: blueprint.secretStructure || null,
      phases: blueprint.phases
    },
    // The story-specific chapter descriptions (content)
    chapters: data.chapters,
    // Concept summary from the LLM
    concept_summary: data.concept_summary || concept
  }
  // Step 6: Log output
  console.log('Phase 1 Blueprint complete.')
  console.log(`  Concept: ${result.concept_summary}`)
  console.log(`  Chapters:`)
  for (const ch of result.chapters) {
    const desc = ch.description.length > 80
      ? ch.description.slice(0, 80) + '...'
      : ch.description
    console.log(`    ${ch.chapter}. [${ch.function}] ${desc}`)
  }
  console.log('')
  console.log('Phase 1 Blueprint complete output:')
  console.log(JSON.stringify(result, null, 2))
  return result
}
/**
 * Guard function: check if a blueprint exists before allowing generation.
 * Call this after concept expansion selects variables.
 *
 * @param {string} tropeId
 * @param {string} tensionId
 * @param {string} endingId
 * @param {string} modifierId
 * @returns {{ allowed: boolean, reason?: string, blueprintName?: string }}
 */
function checkBlueprintAvailable(tropeId, tensionId, endingId, modifierId) {
  if (hasBlueprint(tropeId, tensionId, endingId, modifierId)) {
    const bp = getBlueprint(tropeId, tensionId, endingId, modifierId)
    return {
      allowed: true,
      blueprintName: bp.name
    }
  }
  return {
    allowed: false,
    reason: `No blueprint for: ${tropeId} | ${tensionId} | ${endingId} | ${modifierId}. ` +
            `Build this blueprint before generation can proceed.`
  }
}
export {
  executePhase1Blueprint,
  checkBlueprintAvailable
}
