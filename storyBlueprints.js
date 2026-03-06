// =============================================================================
// STORY BLUEPRINTS v2.7 — Complete extraction from Blueprint Builder HTML
// =============================================================================
// Full decision-tree data for enemies_to_lovers across all variable combinations.
// Covers both tension axes (safety, identity), all endings (HEA, bittersweet,
// tragic), secret on/off, and triangle on/off. Identity locks to HEA + no triangle.
//
// Data is stored as a single structured tree. The resolveBlueprint() function
// assembles a flat blueprint for any valid combination, matching the shape
// downstream consumers expect (phases → chapters with function + description).
//
// Employment options are choices the AI makes when filling the blueprint.
// End states are what must be true by the end of each chapter.
// Constraints link earlier choices to later availability.
// =============================================================================

// =============================================================================
// CAST DEFINITIONS
// =============================================================================
const CAST = {
  safety: [
    {
      function: 'All Passion, No Fear',
      color: 'passion',
      description: 'Believes passion is the whole answer. No caution, no consequences. Makes the protagonist\'s restraint look like cowardice.'
    },
    {
      function: 'Burned by Danger',
      color: 'caution',
      description: 'Destroyed by danger and now lives inside walls. Her caution is earned. Represents the future if fear wins.'
    },
    {
      function: 'Voice of the Dignified Life',
      color: 'dignity',
      description: 'Chose safety and made it noble through effort and loyalty. Proves the safe path has real value.'
    },
    {
      function: 'Someone the Primary Protects',
      color: 'tender',
      description: 'Can\'t protect themselves. The primary protects them anyway. She sees him be tender and her framework breaks.'
    },
    {
      function: 'The Rival',
      color: 'rival',
      description: 'The safe option personified. His flaw cascades from flicker to full exposure.',
      requiresTriangle: true
    }
  ],
  identity: [
    {
      function: 'The Source',
      color: 'passion',
      description: 'An older individual who had a significant influence over her as a formative figure. Their approval is what the core belief was built to earn.'
    },
    {
      function: 'The Romantic Confidant',
      color: 'caution',
      description: 'A female character of a similar age. Sees the romance before she does. Names the attraction before the protagonist will admit it. Plants the seed. Later, the person she confesses to. May have her own romantic resolution.'
    },
    {
      function: 'Her Opposite',
      color: 'dignity',
      description: 'A younger woman or girl who does not share her core belief and lives in opposition to it.'
    },
    {
      function: 'The Mirror',
      color: 'tender',
      description: 'An older woman who shows her what a life looks like at the end of the road she\'s on. Either she chose romance and was burned, or she kept her identity and is alone.'
    }
  ]
}

// =============================================================================
// CHAPTER DATA — THE COMPLETE DECISION TREE
// =============================================================================
// Each chapter is an object with:
//   title        — chapter name
//   conditions   — when this chapter appears { tension, triangle, ending, secret, ... }
//   endStates    — array of { text, when } where 'when' describes the condition
//   employment   — array of { header, options[], constraints[] }
//   notes        — cascading/conditional notes
//
// Conditions use simple keys:
//   tension: 'safety' | 'identity'
//   triangle: true | false
//   secret: true | false
//   ending: 'hea' | 'bittersweet' | 'tragic'
//   ch1: selection id from ch1 (for downstream constraints)
//   ch2e: selection from ch2 enmity
//   ch3t: selection from ch3 triangle
// =============================================================================

// =============================================================================
// VALUE TENSIONS (identity tension only)
// The core conflict between protagonist and primary's worldviews.
// =============================================================================
const VALUE_TENSIONS = {
  conforms: {
    label: 'She conforms, he is free',
    flavours: [
      { id: 'prudence_instinct', her: 'Prudence', his: 'Instinct', description: 'She does what is proper and responsible. He follows his gut and is right.' },
      { id: 'reputation_authenticity', her: 'Reputation', his: 'Authenticity', description: 'She curates herself for the world. He is the same person in every room.' },
      { id: 'control_surrender', her: 'Control', his: 'Surrender', description: 'She manages everything. He trusts what comes and it works.' }
    ]
  },
  rebels: {
    label: 'She rebels, he is rooted',
    flavours: [
      { id: 'cynicism_sincerity', her: 'Cynicism', his: 'Sincerity', description: 'She assumes the worst and protects herself. He trusts openly and is not destroyed.' },
      { id: 'defiance_rootedness', her: 'Defiance', his: 'Rootedness', description: 'She rejects tradition. He is grounded in it and whole.' },
      { id: 'independence_belonging', her: 'Independence', his: 'Belonging', description: 'She needs no one. He is woven into community and stronger for it.' }
    ]
  }
}

// =============================================================================
// SECRET HOLDERS (identity tension only)
// Who holds the secret that detonates in the dark moment.
// =============================================================================
const SECRET_HOLDERS = [
  { id: 'primary', label: 'The Primary', description: 'He entered her world with a hidden motive. The romance was real but the origin was manufactured.' },
  { id: 'source_disapproves', label: 'The Source (disapproves)', description: 'The Source manufactured the dark moment to break them apart. Fabricated evidence, arranged a situation, or revealed something out of context.' },
  { id: 'source_complicit', label: 'The Source (complicit)', description: 'The Source arranged his presence in her world. The detonation breaks the romance AND the foundation of her identity.' },
  { id: 'confidant', label: 'The Confidant', description: 'She was with the primary before the protagonist fell for him. She listened to every confession knowing she had been there first.' },
  { id: 'protagonist', label: 'The Protagonist', description: 'While hostile she took action that damaged him. He does not know. The dark moment is guilt and shame, not betrayal.' }
]

const CHAPTER_TREE = {
  // ═══════════════════════════════════════════════════════════════════════════
  // ACT I — THE SETUP
  // ═══════════════════════════════════════════════════════════════════════════
  act1: {
    act: 1,
    name: 'The Setup',
    descriptions: {
      safety: 'She hates him because he represents something dangerous. Forced proximity.',
      identity: 'She hates him because he threatens the person she has built herself to be. Forced proximity.'
    },
    chapters: {

      // ─── CH.1: ESTABLISH HER WORLD ───────────────────────────────────────
      ch1: {
        title: 'Establish Her World',
        endStates: {
          safety_default: 'By the end, the reader understands what makes her vulnerable.',
          safety_safe_stable: 'By the end, the reader understands what she stands to lose.',
          identity: 'By the end, the reader understands who she has built herself to be.'
        },
        conditionalNotes: [
          { text: 'The rival is established as part of her world', when: 'triangle' }
        ],
        employment: {
          safety: {
            header: 'Employment Options',
            options: [
              { id: 'precarious', text: 'She has built something fragile that sustains her — a business, a home, a livelihood. It works, but it wouldn\'t survive a shock' },
              { id: 'hurt_before', text: 'She has been hurt before — by a person, by an event, by loss. Her world is organised around that wound' },
              { id: 'safety_scarce', text: 'She lives in a world where safety is scarce — a frontier, a contested territory, an unstable community. What she has is the exception' },
              { id: 'safe_stable', text: 'Her world is safe, stable, and unremarkable — nothing is broken, nothing is threatened. The danger when it arrives is something she\'s never imagined' }
            ]
          }
        },
        sceneArchitecture: {
          identity: [
            { scene: 1, description: 'We see her core belief operating in private.' },
            { scene: 2, description: 'The reader sees her core belief operating in the social world.' }
          ]
        }
      },

      // ─── CH.2: THE FIRST ENCOUNTER ───────────────────────────────────────
      ch2: {
        title: 'The First Encounter',
        endStates: {
          safety: 'By the end, the reader\'s first impression of the primary as dangerous and hostile is established.',
          identity: 'By the end, she has formed a negative impression that no one else shares. The threat to her identity is personal and private.'
        },
        employment: {
          howTheyMeet: {
            header: 'How They Meet',
            tension: 'safety',
            options: [
              { id: 'open_hostility', text: 'They meet already knowing — open hostility from the first moment' },
              { id: 'meet_not_knowing', text: 'They meet not knowing — attraction or neutrality first, enmity surfaces' },
              { id: 'asymmetric', text: 'One knows, the other doesn\'t — asymmetric power' },
              { id: 'encounter_is_hostile', text: 'The encounter IS the hostile act' },
              { id: 'forced_together', text: 'Forced into the same space by a third party or circumstance' }
            ],
            constraints: [
              { disables: 'open_hostility', when: 'ch1 === "safe_stable"', note: '"open hostility" unavailable when Ch.1 is "safe, stable, and unremarkable"' }
            ]
          },
          enmity_safety: {
            header: 'Why They\'re Enemies',
            tension: 'safety',
            options: [
              { id: 'rivals', text: 'They are rivals competing over the same thing or resource' },
              { id: 'opposite_sides', text: 'They are enemies on opposite sides of an external conflict' },
              { id: 'acquiring', text: 'He is trying to acquire what she already has' },
              { id: 'he_threatens', text: 'He is an authority figure threatening her livelihood' }
            ],
            constraints: [
              { disables: ['rivals', 'opposite_sides'], when: 'ch1 === "safe_stable"', note: '"rivals" and "opposite sides" unavailable when Ch.1 is "safe, stable, and unremarkable"' }
            ]
          }
        },
        sceneArchitecture: {
          identity: [
            { scene: 1, description: 'He shows up in her world. She forms a negative impression rooted in her core belief.' },
            { scene: 2, description: 'The reader sees how her social circle responds to him.' }
          ]
        }
      },

      // ─── CH.3: TRIANGLE — THE SAFE OPTION (safety + triangle) ────────────
      ch3_triangle: {
        title: 'The Safe Option',
        conditions: { tension: 'safety', triangle: true },
        endStates: {
          already_in_life: 'By the end, the reader sees the first crack in the shelter.',
          presents_solution: 'By the end, the reader sees a credible alternative to the conflict.',
          default: 'End state determined by employment option selection.'
        },
        employment: {
          main: {
            header: 'Employment Options',
            options: [
              { id: 'already_in_life', text: 'He\'s already in her life — the safe option fails her for the first time' },
              { id: 'presents_solution', text: 'He presents himself as a solution to the problem the primary represents' }
            ],
            constraints: [
              { disables: 'presents_solution', when: 'ch2e === "opposite_sides" || ch2e === "she_pursues"', note: '"presents as solution" unavailable when Ch.2 enmity is "opposite sides" or "she pursues him"' }
            ]
          },
          flawOptions: {
            header: 'The First Crack — Rival\'s Flaw (Already In Her Life)',
            showWhen: 'ch3t === "already_in_life"',
            options: [
              { id: 'cowardice', text: 'Cowardice — he can\'t protect her' },
              { id: 'indifference', text: 'Indifference — he won\'t protect her' }
            ],
            cascadingNote: 'This flaw cascades — same flaw escalates through Ch.5, Ch.6, and Act III'
          }
        }
      },

      // ─── CH.3: NO TRIANGLE — THE SAFE PATH (safety + no triangle) ────────
      ch3_notriangle: {
        title: 'The Safe Path',
        conditions: { tension: 'safety', triangle: false },
        endStates: {
          default: 'By the end, the reader sees a credible way out that doesn\'t involve him.'
        },
        employment: {
          main: {
            header: 'Employment Options',
            options: [
              { id: 'leave', text: 'She could leave — abandon the situation entirely, start over elsewhere' },
              { id: 'comply', text: 'She could comply — accept the terms, lose something but survive' },
              { id: 'surrender', text: 'She could surrender what\'s at stake — cut her losses' },
              { id: 'retreat', text: 'She could retreat into her existing world — withdraw behind existing structures' },
              { id: 'official', text: 'She could pursue resolution through official channels — use the system' }
            ]
          }
        }
      },

      // ─── CH.3: IDENTITY — THE ESCALATION ─────────────────────────────────
      ch3_identity: {
        title: 'The Escalation',
        conditions: { tension: 'identity' },
        endStates: {
          default: 'By the end, the hostility is open.'
        },
        employment: {},
        sceneArchitecture: [
          { scene: 1, description: 'He is becoming a regular part of her world. Her dislike intensifies.' },
          { scene: 2, description: 'A confrontation. The hostility becomes open.' },
          { scene: 3, description: 'The reader sees the response of her social circle.' }
        ]
      },

      // ─── CH.4: SAFETY — THE ESCALATION ───────────────────────────────────
      ch4_safety: {
        title: 'The Escalation',
        conditions: { tension: 'safety' },
        endStates: {
          default: 'By the end, she is locked into contact with him and her fear is confirmed. But the primary has noticed her and is attracted.'
        },
        employment: {
          main: {
            header: 'Employment Options',
            options: [
              { id: 'targets_her', text: 'The conflict targets her specifically — becomes personal' },
              { id: 'forced_proximity', text: 'She\'s forced into repeated proximity — avoidance impossible' },
              { id: 'stakes_increase', text: 'The stakes increase — what she stands to lose grows larger' },
              { id: 'demonstrates_danger', text: 'He demonstrates his capacity for danger — she witnesses it' },
              { id: 'given_responsibility', text: 'She\'s given responsibility she can\'t refuse' }
            ]
          }
        }
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ACT II — THE FALL
  // ═══════════════════════════════════════════════════════════════════════════
  act2: {
    act: 2,
    name: 'The Fall',
    descriptions: {
      safety: 'She discovers he\'s not what she assumed. The attraction feels dangerous. Each step closer terrifies her.',
      identity: 'She discovers he\'s not what she decided he was. The person she becomes around him doesn\'t fit the identity. Each step closer dismantles her.'
    },
    chapters: {

      // ─── CH.5: SAFETY — THE CRACK ────────────────────────────────────────
      ch5_safety: {
        title: 'The Crack',
        conditions: { tension: 'safety' },
        endStates: {
          default: 'By the end, her first impression of the primary is broken. She can no longer maintain he is simply dangerous.'
        },
        employment: {
          main: {
            header: 'How the primary cracks her impression',
            options: [
              { id: 'protects_her', text: 'He protects her when he has no reason to' },
              { id: 'shows_restraint', text: 'He shows restraint or mercy when she expects aggression' },
              { id: 'witnessed_vulnerable', text: 'She witnesses him vulnerable in a moment he didn\'t intend her to see' },
              { id: 'sacrifices_for_other', text: 'He sacrifices something for someone other than her' }
            ]
          },
          rivalFlawEmerges: {
            header: 'Rival\'s Flaw Emerges (Presents as Solution)',
            showWhen: 'triangle && ch3t === "presents_solution"',
            options: [
              { id: 'greed', text: 'Greed — his solution conveniently benefits him more than her' },
              { id: 'wrath', text: 'Wrath — his charm slips, anger surfaces when challenged' }
            ],
            cascadingNote: 'This flaw cascades — same flaw escalates through Ch.6 and Act III'
          }
        },
        notes: {
          cascade: { text: 'Rival\'s flaw escalates — same flaw from Ch.3, louder', showWhen: 'triangle && ch3t === "already_in_life"' }
        }
      },

      // ─── CH.5: IDENTITY — THE CRACK ──────────────────────────────────────
      ch5_identity: {
        title: 'The Crack',
        conditions: { tension: 'identity' },
        endStates: {
          default: 'By the end, her categorization of him is broken, and the attraction has registered.'
        },
        employment: {},
        sceneArchitecture: [
          { scene: 1, description: 'He acts in a way that breaks her categorization of him.' },
          { scene: 2, description: 'The attraction registers. She fights it.' }
        ]
      },

      // ─── CH.6: SAFETY — THE FALL ─────────────────────────────────────────
      ch6_safety: {
        title: 'The Fall',
        conditions: { tension: 'safety' },
        endStates: {
          triangle: 'By the end, she has seen his depth, surrendered to the attraction. The line is nearly crossed. The rival senses the shift.',
          notriangle: 'By the end, she has seen his depth, surrendered to the attraction. The line is nearly crossed.'
        },
        employment: {
          main: {
            header: 'How she falls',
            options: [
              { id: 'there_for_her', text: 'He\'s there for her personally, disconnected from the conflict' },
              { id: 'crisis_intimacy', text: 'A crisis forces intimacy — alone, walls drop, closeness' },
              { id: 'enters_his_world', text: 'She enters his world and sees who he really is' },
              { id: 'chooses_her', text: 'He chooses her over his own interests' }
            ]
          }
        },
        notes: {
          cascade: { text: 'Rival\'s flaw escalates further — degradation accelerates', showWhen: 'triangle' }
        }
      },

      // ─── CH.6: IDENTITY — THE FALL ───────────────────────────────────────
      ch6_identity: {
        title: 'The Fall',
        conditions: { tension: 'identity' },
        endStates: {
          default: 'By the end, she has fallen in love with him.'
        },
        employment: {},
        sceneArchitecture: [
          { scene: 1, description: 'She\'s in her routine but her mind is occupied with him. She\'s starting to give in.' },
          { scene: 2, description: 'He invites her into his world. She accepts.' },
          { scene: 3, description: 'She sees who he really is. The first kiss or the almost.' }
        ]
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ACT III — THE RETREAT
  // ═══════════════════════════════════════════════════════════════════════════
  act3: {
    act: 3,
    name: 'The Retreat',
    descriptions: {
      safety: 'He does something that triggers her original wound. Everything she feared seems confirmed. She retreats to hatred because hatred is safer than heartbreak.',
      identity: 'Something triggers the old framework. Everything she feared about losing herself seems confirmed. She retreats to the constructed identity because the identity is safer than the unknown.'
    },
    chapters: {

      // ─── CH.7: SAFETY — THE DARK MOMENT ──────────────────────────────────
      ch7_safety: {
        title: 'The Dark Moment',
        conditions: { tension: 'safety' },
        endStates: {
          default: 'By the end, she believes it was too good to be true. He really is a monster. Every tender moment recontextualises.'
        },
        employment: {
          secret: {
            header: 'The Secret (what it is)',
            showWhen: 'secret',
            options: [
              { id: 'hostile_motive', text: 'His original motive was hostile — he entered her life to harm her interests' },
              { id: 'connected_threat', text: 'He is connected to the original threat — caused or part of what endangered her' },
              { id: 'withheld_info', text: 'He withheld information that would have changed her choices' }
            ]
          },
          secretSurface: {
            header: 'How the secret surfaces',
            showWhen: 'secret',
            options: [
              { id: 'discovers_herself', text: 'She discovers it herself — stumbles onto evidence' },
              { id: 'rival_exposes', text: 'The rival exposes it', showWhen: 'triangle' },
              { id: 'third_party', text: 'A third party reveals it innocently' },
              { id: 'primary_confesses', text: 'The primary confesses — too late' },
              { id: 'forced_to_act', text: 'The primary is forced to act on the secret in front of her' }
            ]
          },
          trigger: {
            header: 'What triggers the dark moment',
            showWhen: '!secret',
            options: [
              { id: 'reverts', text: 'He reverts to type — does something that confirms her original fear' },
              { id: 'conflict_resurfaces', text: 'The conflict between them resurfaces — the enmity reasserts itself' },
              { id: 'sees_cost', text: 'She sees the cost of choosing him — the danger becomes real and concrete again' },
              { id: 'someone_warns', text: 'Someone she trusts warns her — reframes everything as recklessness' },
              { id: 'self_sabotage', text: 'She sabotages it herself — her own safety instinct destroys what she built' }
            ]
          },
          rivalRole: {
            header: 'Rival\'s role in the dark moment',
            showWhen: 'triangle',
            options: [
              { id: 'active', text: 'Active — he engineers or manipulates the dark moment' },
              { id: 'passive', text: 'Passive — he benefits and opens his arms when she arrives' }
            ],
            constraints: [
              { fixes: 'active', when: 'ch3t === "presents_solution"', note: 'Fixed: Active — rival "presents as solution" always acts to protect his position' },
              { fixes: 'passive', when: 'ch3t === "already_in_life"', note: 'Fixed: Passive — rival "already in her life" absorbs her return' }
            ]
          },
          manipulation_secret: {
            header: 'How the rival weaponises the secret (Active + Secret)',
            showWhen: 'triangle && rivalRole === "active" && secret',
            options: [
              { id: 'strips_context', text: 'Strips context — removes the part where the primary changed' },
              { id: 'engineers_timing', text: 'Engineers timing — deploys at maximum damage' },
              { id: 'exaggerates', text: 'Fabricates or exaggerates details' },
              { id: 'uses_proxy', text: 'Uses a proxy — hands look clean' }
            ]
          },
          manipulation_nosecret: {
            header: 'How the rival engineers the dark moment (Active + No Secret)',
            showWhen: 'triangle && rivalRole === "active" && !secret',
            options: [
              { id: 'manufactures_situation', text: 'Manufactures a situation that forces the primary to act in a way that confirms her original fear' },
              { id: 'reframes_actions', text: 'Reframes the primary\'s actions — poisons her interpretation of what she\'s seen' },
              { id: 'provokes_primary', text: 'Provokes the primary into reverting to type — goads him into aggression she witnesses' },
              { id: 'confronts_cost', text: 'Confronts her with the cost — forces her to see what choosing the primary means for her world' }
            ]
          }
        }
      },

      // ─── CH.7: IDENTITY — THE DARK MOMENT ────────────────────────────────
      ch7_identity: {
        title: 'The Dark Moment',
        conditions: { tension: 'identity' },
        endStates: {
          default: 'By the end, she believes the fall was the lie. Her original framework was right. The person she was becoming around him was built on nothing.'
        },
        employment: {},
        sceneArchitecture: [
          { scene: 1, description: 'The high. The romance is alive. She\'s in her world but transformed by it.' },
          { scene: 2, description: 'The secret detonates. Everything falls apart.' },
          { scene: 3, description: 'Days later. She\'s back to who she was. It\'s hollow.' }
        ]
      },

      // ─── CH.8: SAFETY — THE RETREAT ───────────────────────────────────────
      ch8_safety: {
        title: 'The Retreat',
        conditions: { tension: 'safety' },
        endStates: {
          triangle: 'By the end, she has committed to the rival. Something is dead inside her. The reader sees what she\'s lost.',
          notriangle: 'By the end, she has committed to the safe path. Something is dead inside her. The reader sees what she\'s lost.'
        },
        employment: {
          main: {
            header: 'How she retreats',
            options: [
              { id: 'goes_cold', text: 'She goes cold — shuts everything down, becomes the version of herself that never fell' },
              { id: 'performs_normalcy', text: 'She performs normalcy — accepts the terms, smiles when expected, dead behind the eyes' },
              { id: 'destroys_evidence', text: 'She actively destroys evidence of the fall — burns letters, avoids places, cuts all connection' },
              { id: 'doubles_down', text: 'She throws herself into the alternative — doubles down on the safe path as if to prove it was right' }
            ]
          }
        }
      },

    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ACT IV — THE RESOLUTION (HEA / BITTERSWEET)
  // ═══════════════════════════════════════════════════════════════════════════
  act4_resolution: {
    act: 4,
    name: 'The Resolution',
    conditions: { ending: ['hea', 'bittersweet'] },
    descriptions: {
      safety: 'She sees she hated him because she was afraid of what he made her feel. She chooses vulnerability over armour.',
      identity: 'She sees the constructed identity was the cage, not the safety. She chooses becoming over staying.'
    },
    chapters: {

      // ─── CH.9: SAFETY — SECRET ON — THE FULL PICTURE ─────────────────────
      ch9_safety_secret: {
        title: 'The Full Picture',
        conditions: { tension: 'safety', secret: true },
        endStates: {
          active_rival: 'By the end, she learns the truth was distorted. The rival\'s manipulation is exposed. His feelings were real.',
          passive_rival: 'By the end, she learns the truth was incomplete. He changed, tried to stop, sacrificed the thing the secret was about.',
          notriangle: 'By the end, she learns the truth was incomplete. He changed, tried to stop, sacrificed the thing the secret was about.'
        },
        employment: {
          main: {
            header: 'How she learns the full picture',
            options: [
              { id: 'evidence_surfaces', text: 'Evidence surfaces that reveals the full context' },
              { id: 'ally_tells_her', text: 'Someone from the primary\'s world tells her the truth he couldn\'t' },
              { id: 'rival_slips', text: 'The rival overplays his hand — manipulation becomes visible', showWhen: 'triangle' },
              { id: 'primary_acts', text: 'The primary acts to protect her at great cost' }
            ]
          }
        }
      },

      // ─── CH.9: SAFETY — SECRET OFF — THE GRAND GESTURE ───────────────────
      ch9_safety_nosecret: {
        title: 'The Grand Gesture',
        conditions: { tension: 'safety', secret: false },
        endStates: {
          default: 'By the end, he has proven through action that his feelings are real. The gesture is restorative and self-sacrificing.'
        },
        employment: {
          main: {
            header: 'The grand gesture',
            options: [
              { id: 'undoes_harm', text: 'He undoes the harm he caused — reverses or repairs the damage from the original conflict' },
              { id: 'protects_hers', text: 'He protects what she stands to lose — at cost to himself' },
              { id: 'sacrifices_position', text: 'He sacrifices his position or power for her benefit' },
              { id: 'chooses_her_world', text: 'He chooses her world over his own — abandons his side' }
            ]
          }
        }
      },

      // ─── CH.10: SAFETY — REUNITED ────────────────────────────────────────
      ch10_safety: {
        title: 'Reunited',
        conditions: { tension: 'safety' },
        endStates: {
          default: 'By the end, everything is on the table. No secrets, no armour. She chooses him. The consummation.'
        },
        employment: {
          main: {
            header: 'How they come back together',
            options: [
              { id: 'she_goes_to_him', text: 'She goes to him — she initiates' },
              { id: 'he_comes_for_her', text: 'He comes for her — risks everything to reach her' },
              { id: 'forced_together_again', text: 'Circumstance forces them together — the choice happens in the moment' }
            ]
          }
        }
      },

      // ─── CH.11: SAFETY — RIVAL NEUTRALISED (triangle only) ───────────────
      ch11_rival: {
        title: 'The Rival Neutralised',
        conditions: { tension: 'safety', triangle: true },
        endStates: {
          default: 'By the end, the rival is removed as a threat. The safe option is gone. There is no going back.'
        },
        employment: {
          main: {
            header: 'How the rival is neutralised',
            options: [
              { id: 'exposed', text: 'Exposed — his true nature becomes public' },
              { id: 'defeated', text: 'Defeated — his attempt to destroy or reclaim fails' },
              { id: 'walks_away', text: 'Walks away — sees the truth and leaves' },
              { id: 'destroyed_by_flaw', text: 'Destroyed by his own flaw — the crack from Ch.3 finally breaks him' }
            ]
          }
        }
      },

      // ─── FINAL: SAFETY — HEA ─────────────────────────────────────────────
      ch_hea_safety: {
        title: 'HEA',
        conditions: { tension: 'safety', ending: 'hea' },
        dynamicNumber: true,  // 12 with triangle, 11 without
        endStates: {
          default: 'By the end, she has secured what matters. He has committed to protect it. They choose each other — not safety, not danger. Just together.'
        },
        employment: {}
      },

      // ─── FINAL: SAFETY — BITTERSWEET ──────────────────────────────────────
      ch_bittersweet_safety: {
        title: 'Together, But At a Cost',
        conditions: { tension: 'safety', ending: 'bittersweet' },
        dynamicNumber: true,
        endStates: {
          default: 'By the end, they choose each other. But the reader feels what it cost.'
        },
        employment: {
          withTriangle: {
            header: 'What was lost (with triangle)',
            showWhen: 'triangle',
            options: [
              { id: 'dignity_lost_rival', text: 'The dignified life character is lost as a consequence of the rival\'s actions' },
              { id: 'rival_destroys', text: 'The rival destroys something irreplaceable before he\'s neutralised' },
              { id: 'passion_pays', text: 'The passion character paid the price — her recklessness caught up with her in the crossfire' },
              { id: 'lost_defending', text: 'She lost what she was defending — the thing from Ch.1 is gone' },
              { id: 'his_cost', text: 'He lost his position or his people — the cost fell on his side for choosing her' },
              { id: 'world_closed', text: 'Her world no longer accepts her — she chose the enemy, the community is closed to her' }
            ]
          },
          withoutTriangle: {
            header: 'What was lost (without triangle)',
            showWhen: '!triangle',
            options: [
              { id: 'lost_defending', text: 'She lost what she was defending — the thing established in Ch.1 is gone' },
              { id: 'dignity_lost_conflict', text: 'The dignified life character is lost to the conflict' },
              { id: 'his_cost', text: 'He lost his position or his people — the cost fell on his side' },
              { id: 'passion_pays', text: 'The passion character paid the price of her own philosophy' },
              { id: 'warning_true', text: 'The burned by danger character\'s warning came true — not about him, but about the cost' }
            ]
          }
        }
      },

      // ─── CH.7: IDENTITY — REUNITED ─────────────────────────────────────
      ch_reunited_identity: {
        title: 'Reunited',
        conditions: { tension: 'identity' },
        endStates: {
          default: 'By the end, she is someone new — not the constructed self, not a stranger. Her. The reader sees who she was always going to be.'
        },
        employment: {},
        sceneArchitecture: [
          { scene: 1, description: 'The full picture arrives through revelation or grand gesture. The fall wasn\'t a lie.' },
          { scene: 2, description: 'The reconciliation and the consummation. Honest, difficult, real.' },
          { scene: 3, description: 'The new life. The identity is still there but it has room in it now. HEA.' }
        ]
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ACT IV — THE COST (TRAGIC — SAFETY ONLY)
  // ═══════════════════════════════════════════════════════════════════════════
  act4_tragedy: {
    act: 4,
    name: 'The Cost',
    conditions: { ending: 'tragic', tension: 'safety' },
    descriptions: {
      safety: 'It was real and it doesn\'t matter. Someone acted on the lie and the damage cannot be undone.'
    },
    chapters: {

      // ─── CH.9: TRAGEDY — THE IRREVERSIBLE ACT ────────────────────────────
      ch9_tragedy: {
        title: 'The Irreversible Act',
        endStates: {
          triangle: 'By the end, someone has acted on the lie. The damage cannot be undone.',
          notriangle: 'By the end, the damage cannot be undone.'
        },
        employment: {
          withTriangle: {
            header: 'The irreversible act',
            showWhen: 'triangle',
            options: [
              { id: 'rival_kills', text: 'The rival kills him — jealousy or rage' },
              { id: 'she_betrays', text: 'She betrays him to his enemies while still in her dark moment' },
              { id: 'she_fails', text: 'She fails to act when she could have saved him — her retreat has consequences' }
            ]
          },
          withoutTriangle: {
            header: 'The irreversible act',
            showWhen: '!triangle',
            options: [
              { id: 'she_betrays', text: 'She betrays him to his enemies while still in her dark moment' },
              { id: 'she_fails', text: 'She fails to act when she could have saved him' },
              { id: 'conflict_destroys', text: 'The conflict itself destroys him — the thing that made them enemies kills him' }
            ],
            notes: [
              { on: 'conflict_destroys', text: '"Conflict destroys him" requires a setting with lethal stakes (war, crime, frontier)' }
            ]
          }
        }
      },

      // ─── CH.10: TRAGEDY — THE TRUTH ARRIVES TOO LATE ─────────────────────
      ch10_tragedy_truth: {
        title: 'The Truth Arrives Too Late',
        endStates: {
          default: 'By the end, she knows the full picture. But he\'s already gone.'
        },
        employment: {
          main: {
            header: 'How the truth reaches her',
            options: [
              { id: 'evidence_surfaces', text: 'Evidence surfaces that reveals the full context' },
              { id: 'ally_tells_her', text: 'Someone from his world tells her the truth he couldn\'t' },
              { id: 'primary_left_proof', text: 'He left proof — a letter, a document, an act she discovers after' }
            ]
          }
        }
      },

      // ─── CH.11: TRAGEDY — THE CONSEQUENCE ────────────────────────────────
      ch11_tragedy: {
        title: 'The Consequence',
        variants: {
          rival_killed: {
            showWhen: 'triangle && ch9_tragedy === "rival_kills"',
            endState: 'By the end, the rival has paid for what he did.',
            employment: {
              header: 'The consequence',
              options: [
                { id: 'she_destroys_rival', text: 'She destroys the rival — revenge' },
                { id: 'exposes_rival', text: 'She exposes the rival publicly — his crime becomes known' },
                { id: 'rival_self_destructs', text: 'The rival is destroyed by the consequences of his own act' }
              ]
            }
          },
          she_caused: {
            showWhen: 'ch9_tragedy === "she_betrays" || ch9_tragedy === "she_fails"',
            endState: 'By the end, she faces what she\'s done.',
            employment: {
              header: 'The consequence',
              options: [
                { id: 'lives_with_it', text: 'She lives with it — the tragedy is endurance, not death' },
                { id: 'destroys_safe_path', text: 'She destroys what she retreated to — burns the safe path that made her complicit' }
              ]
            }
          },
          conflict: {
            showWhen: '!triangle && ch9_tragedy === "conflict_destroys"',
            endState: 'By the end, she faces what the world has done.',
            employment: {
              header: 'The consequence',
              options: [
                { id: 'lives_with_it', text: 'She lives with it — the tragedy is endurance' },
                { id: 'destroys_defended', text: 'She destroys what she was defending — nothing matters anymore' }
              ]
            }
          }
        }
      }
    }
  }
}

// =============================================================================
// SECRET STRUCTURE GUIDANCE
// =============================================================================
const SECRET_GUIDANCE = {
  safety: {
    description: 'The concept contains a secret. Plant it early, let it work underground, and surface it in the dark moment.',
    surfacing: 'The dark moment chapter — the secret surfaces and changes how the other character sees the relationship.',
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
  },
  identity: {
    description: 'The concept contains a secret. Plant it early, let it work underground, and surface it in the dark moment.',
    surfacing: 'The dark moment chapter — the secret surfaces and changes how she sees what was real.',
    qualities: [
      'The reader understands why it is being hidden — fear, shame, loyalty, love. The person keeping it is sympathetic, not villainous.',
      'The reveal recontextualises what came before. Every kind moment, every intimate conversation, every step closer now looks different.',
      'It connects to what the characters value most. The secret threatens the thing the story is about — who she is.'
    ],
    common_forms: [
      'His approach to her was manufactured — someone arranged it, paid for it, or orchestrated it',
      'He had an ulterior motive — what looked like genuine interest was strategic',
      'He used what he learned about her against her — the intimacy was intelligence gathering'
    ],
    rules: [
      'Do not invent a secret. The concept provides it. Your job is placement and pacing.',
      'The secret can be held by one person or both. One secret held by one person is often stronger than two.',
      'A secret in romance is not a plot twist. It is information one character is hiding that, when revealed, changes how the other character sees the relationship.'
    ]
  }
}

// =============================================================================
// CONSTRAINT RULES (cross-chapter dependencies)
// =============================================================================
const CONSTRAINTS = {
  // Ch.1 safe_stable blocks certain Ch.2 options (safety only)
  ch1_safe_stable_blocks_ch2_meet: ['open_hostility'],
  ch1_safe_stable_blocks_ch2_enmity: ['rivals', 'opposite_sides'],
  // Ch.2 enmity blocks certain Ch.3 triangle options
  ch2_enmity_blocks_ch3_solution: ['opposite_sides', 'she_pursues'],
  // Ch.3 triangle selection fixes Ch.7 rival role
  ch3_already_in_life_fixes_rival: 'passive',
  ch3_presents_solution_fixes_rival: 'active',
  // Ch.7 surface: rival_exposes forces rival role to active
  ch7_rival_exposes_forces_active: true
}

// =============================================================================
// RESOLVER — builds a flat blueprint for any valid combination
// =============================================================================
function resolveBlueprint(tension, ending, secret, triangle) {
  // Enforce identity constraints
  if (tension === 'identity') {
    ending = 'hea'
    triangle = false
    secret = true  // LOCK: identity → secret always on
  }

  const phases = []
  let chapterNum = 0

  // Helper: pick correct end state
  function pickEndState(endStates, context) {
    if (typeof endStates === 'string') return endStates
    if (endStates.default && Object.keys(endStates).length === 1) return endStates.default

    if (tension === 'identity' && endStates.identity) return endStates.identity
    if (tension === 'safety') {
      if (endStates.triangle && triangle) return endStates.triangle
      if (endStates.notriangle && !triangle) return endStates.notriangle
      if (endStates.safety_default) return endStates.safety_default
      if (endStates.safety) return endStates.safety
    }
    return endStates.default || Object.values(endStates)[0]
  }

  // Helper: collect employment options for a chapter, filtering by conditions
  function collectEmployment(empGroups) {
    const result = []
    for (const [key, group] of Object.entries(empGroups)) {
      if (!group || !group.options) continue
      // Check tension filter
      if (group.tension && group.tension !== tension) continue
      // Check showWhen conditions
      if (group.showWhen) {
        if (group.showWhen === 'secret' && !secret) continue
        if (group.showWhen === '!secret' && secret) continue
        if (group.showWhen === 'triangle' && !triangle) continue
        if (group.showWhen === '!triangle' && triangle) continue
      }
      // Filter options that have their own showWhen
      const filteredOptions = group.options.filter(opt => {
        if (opt.showWhen === 'triangle' && !triangle) return false
        if (opt.showWhen === '!triangle' && triangle) return false
        return true
      })
      if (filteredOptions.length > 0) {
        result.push({
          header: group.header,
          options: filteredOptions.map(o => ({ id: o.id, text: o.text })),
          constraints: group.constraints || [],
          cascadingNote: group.cascadingNote || null
        })
      }
    }
    return result
  }

  // Helper: make a chapter entry
  function makeChapter(def, overrideNumber) {
    chapterNum = overrideNumber || (chapterNum + 1)
    const endState = pickEndState(def.endStates)
    const employment = def.employment ? collectEmployment(def.employment) : []
    const notes = []
    if (def.notes) {
      for (const [, note] of Object.entries(def.notes)) {
        if (note.showWhen === 'triangle' && !triangle) continue
        if (note.showWhen === '!triangle' && triangle) continue
        notes.push(note.text)
      }
    }
    if (def.conditionalNotes) {
      for (const cn of def.conditionalNotes) {
        if (cn.when === 'triangle' && triangle) notes.push(cn.text)
      }
    }
    const entry = {
      chapter: chapterNum,
      function: def.title,
      endState,
      employment,
      notes
    }
    // Include scene architecture if present (identity chapters)
    let sceneArch = null
    if (Array.isArray(def.sceneArchitecture)) {
      sceneArch = def.sceneArchitecture
    } else if (def.sceneArchitecture && def.sceneArchitecture[tension]) {
      sceneArch = def.sceneArchitecture[tension]
    }
    if (sceneArch) {
      entry.sceneArchitecture = sceneArch
    }
    return entry
  }

  // ═══ ACT I ═══
  const act1Chapters = []
  const act1 = CHAPTER_TREE.act1

  // Ch.1 — always present
  act1Chapters.push(makeChapter(act1.chapters.ch1))

  // Ch.2 — always present
  act1Chapters.push(makeChapter(act1.chapters.ch2))

  // Ch.3 — varies
  if (tension === 'identity') {
    act1Chapters.push(makeChapter(act1.chapters.ch3_identity))
  } else if (triangle) {
    act1Chapters.push(makeChapter(act1.chapters.ch3_triangle))
  } else {
    act1Chapters.push(makeChapter(act1.chapters.ch3_notriangle))
  }

  // Ch.4 (safety only — identity has no Ch.4 in Act I)
  if (tension !== 'identity') {
    act1Chapters.push(makeChapter(act1.chapters.ch4_safety))
  }

  phases.push({
    phase: 1,
    name: act1.name,
    description: act1.descriptions[tension],
    chapters: act1Chapters
  })

  // ═══ ACT II ═══
  const act2Chapters = []
  const act2 = CHAPTER_TREE.act2

  // Ch.5
  if (tension === 'identity') {
    act2Chapters.push(makeChapter(act2.chapters.ch5_identity))
  } else {
    act2Chapters.push(makeChapter(act2.chapters.ch5_safety))
  }

  // Ch.6
  if (tension === 'identity') {
    act2Chapters.push(makeChapter(act2.chapters.ch6_identity))
  } else {
    act2Chapters.push(makeChapter(act2.chapters.ch6_safety))
  }

  phases.push({
    phase: 2,
    name: act2.name,
    description: act2.descriptions[tension],
    chapters: act2Chapters
  })

  // ═══ ACT III ═══
  const act3Chapters = []
  const act3 = CHAPTER_TREE.act3

  // Ch.7
  if (tension === 'identity') {
    act3Chapters.push(makeChapter(act3.chapters.ch7_identity))
  } else {
    act3Chapters.push(makeChapter(act3.chapters.ch7_safety))
  }

  // Ch.8 (safety only — identity has no retreat chapter)
  if (tension !== 'identity') {
    act3Chapters.push(makeChapter(act3.chapters.ch8_safety))
  }

  phases.push({
    phase: 3,
    name: act3.name,
    description: act3.descriptions[tension],
    chapters: act3Chapters
  })

  // ═══ ACT IV ═══
  const act4Chapters = []

  if (ending === 'tragic' && tension === 'safety') {
    // TRAGEDY PATH
    const trag = CHAPTER_TREE.act4_tragedy

    // Ch.9 — Irreversible Act
    const ch9t = trag.chapters.ch9_tragedy
    const ch9Employment = triangle
      ? collectEmployment({ main: ch9t.employment.withTriangle })
      : collectEmployment({ main: ch9t.employment.withoutTriangle })
    act4Chapters.push({
      chapter: ++chapterNum,
      function: ch9t.title,
      endState: triangle ? ch9t.endStates.triangle : ch9t.endStates.notriangle,
      employment: ch9Employment,
      notes: []
    })

    // Ch.10 — Truth Too Late
    act4Chapters.push({
      chapter: ++chapterNum,
      function: trag.chapters.ch10_tragedy_truth.title,
      endState: trag.chapters.ch10_tragedy_truth.endStates.default,
      employment: collectEmployment(trag.chapters.ch10_tragedy_truth.employment),
      notes: []
    })

    // Ch.11 — Consequence (variants based on Ch.9)
    const ch11t = trag.chapters.ch11_tragedy
    const consequenceVariants = []
    if (triangle) {
      consequenceVariants.push({
        variant: 'rival_killed',
        label: 'If the rival killed him',
        endState: ch11t.variants.rival_killed.endState,
        employment: [{ header: ch11t.variants.rival_killed.employment.header, options: ch11t.variants.rival_killed.employment.options.map(o => ({ id: o.id, text: o.text })), constraints: [], cascadingNote: null }]
      })
    }
    consequenceVariants.push({
      variant: 'she_caused',
      label: 'If she betrayed or failed to act',
      endState: ch11t.variants.she_caused.endState,
      employment: [{ header: ch11t.variants.she_caused.employment.header, options: ch11t.variants.she_caused.employment.options.map(o => ({ id: o.id, text: o.text })), constraints: [], cascadingNote: null }]
    })
    if (!triangle) {
      consequenceVariants.push({
        variant: 'conflict',
        label: 'If the conflict destroyed him',
        endState: ch11t.variants.conflict.endState,
        employment: [{ header: ch11t.variants.conflict.employment.header, options: ch11t.variants.conflict.employment.options.map(o => ({ id: o.id, text: o.text })), constraints: [], cascadingNote: null }]
      })
    }
    act4Chapters.push({
      chapter: ++chapterNum,
      function: ch11t.title,
      endState: 'Varies by Ch.9 selection — see variants.',
      consequenceVariants,
      employment: [],
      notes: []
    })

    phases.push({
      phase: 4,
      name: CHAPTER_TREE.act4_tragedy.name,
      description: CHAPTER_TREE.act4_tragedy.descriptions.safety,
      chapters: act4Chapters
    })

  } else if (tension === 'identity') {
    // IDENTITY HEA PATH — single Reunited chapter
    const res = CHAPTER_TREE.act4_resolution
    act4Chapters.push(makeChapter(res.chapters.ch_reunited_identity))

    phases.push({
      phase: 4,
      name: CHAPTER_TREE.act4_resolution.name,
      description: CHAPTER_TREE.act4_resolution.descriptions.identity,
      chapters: act4Chapters
    })

  } else {
    // SAFETY HEA/BITTERSWEET PATH
    const res = CHAPTER_TREE.act4_resolution

    // Ch.9
    if (secret) {
      act4Chapters.push(makeChapter(res.chapters.ch9_safety_secret))
    } else {
      act4Chapters.push(makeChapter(res.chapters.ch9_safety_nosecret))
    }

    // Ch.10 — Reunited
    act4Chapters.push(makeChapter(res.chapters.ch10_safety))

    // Ch.11 — Rival Neutralised (triangle only)
    if (triangle) {
      act4Chapters.push(makeChapter(res.chapters.ch11_rival))
    }

    // Final chapter — HEA or Bittersweet
    if (ending === 'hea') {
      act4Chapters.push(makeChapter(res.chapters.ch_hea_safety))
    } else {
      act4Chapters.push(makeChapter(res.chapters.ch_bittersweet_safety))
    }

    phases.push({
      phase: 4,
      name: CHAPTER_TREE.act4_resolution.name,
      description: CHAPTER_TREE.act4_resolution.descriptions.safety,
      chapters: act4Chapters
    })
  }

  // Count total chapters
  const totalChapters = phases.reduce((sum, p) => sum + p.chapters.filter(c => !c.variant || c.variant === 'default' || !c.variantNote).length, 0)

  // Build expected roles
  const expectedRoles = {
    protagonist: tension === 'safety'
      ? 'Female lead. Protecting something. Safety matters to her.'
      : 'Female lead. Defined by a constructed identity. Who she is matters more than what she has.',
    primary: tension === 'safety'
      ? 'Male love interest. Enters as hostile force. Dangerous but magnetic.'
      : 'Male love interest. Enters as a threat to who she is. Doesn\'t fit her framework.'
  }
  if (triangle) {
    expectedRoles.rival = 'Safe option. Genuinely appealing at first. Becomes possessive, then villain.'
  }

  // Build secret structure if applicable
  let secretStructure = null
  if (secret) {
    const sg = SECRET_GUIDANCE[tension]
    secretStructure = {
      description: sg.description,
      surfacing: sg.surfacing,
      guidance: {
        qualities: sg.qualities,
        common_forms: sg.common_forms,
        rules: sg.rules
      }
    }
  }

  // Build modifier string for compatibility
  let modifier = 'none'
  if (secret && triangle) modifier = 'both'
  else if (triangle) modifier = 'love_triangle'
  else if (secret) modifier = 'secret'

  const endingLabel = { hea: 'HEA', bittersweet: 'Bittersweet', tragic: 'Tragic' }[ending]
  const tensionLabel = { safety: 'Safety', identity: 'Identity' }[tension]
  const parts = ['Enemies to Lovers', tensionLabel, endingLabel]
  if (secret) parts.push('Secret')
  if (triangle) parts.push('Love Triangle')

  return {
    id: `enemies_to_lovers|${tension}|${endingLabel}|${modifier}`,
    name: parts.join(' + '),
    trope: 'enemies_to_lovers',
    tension,
    ending: endingLabel,
    modifier,
    totalChapters,
    expectedRoles,
    secretStructure,
    cast: CAST[tension],
    constraints: CONSTRAINTS,
    phases
  }
}

// =============================================================================
// BLUEPRINT REGISTRY — populated for all 14 valid combinations
// =============================================================================
const BLUEPRINTS = {}

function blueprintKey(trope, tension, ending, modifier) {
  return `${trope}|${tension}|${ending}|${modifier}`
}

// Populate all valid combinations
function populateRegistry() {
  const combos = [
    // Safety: 3 endings × 2 secret × 2 triangle = 12
    { tension: 'safety', ending: 'hea', secret: true, triangle: true },
    { tension: 'safety', ending: 'hea', secret: true, triangle: false },
    { tension: 'safety', ending: 'hea', secret: false, triangle: true },
    { tension: 'safety', ending: 'hea', secret: false, triangle: false },
    { tension: 'safety', ending: 'bittersweet', secret: true, triangle: true },
    { tension: 'safety', ending: 'bittersweet', secret: true, triangle: false },
    { tension: 'safety', ending: 'bittersweet', secret: false, triangle: true },
    { tension: 'safety', ending: 'bittersweet', secret: false, triangle: false },
    { tension: 'safety', ending: 'tragic', secret: true, triangle: true },
    { tension: 'safety', ending: 'tragic', secret: true, triangle: false },
    { tension: 'safety', ending: 'tragic', secret: false, triangle: true },
    { tension: 'safety', ending: 'tragic', secret: false, triangle: false },
    // Identity: HEA only, no triangle, secret locked true = 1
    { tension: 'identity', ending: 'hea', secret: true, triangle: false }
  ]
  for (const c of combos) {
    const bp = resolveBlueprint(c.tension, c.ending, c.secret, c.triangle)
    BLUEPRINTS[blueprintKey('enemies_to_lovers', c.tension, bp.ending, bp.modifier)] = bp
  }
}

populateRegistry()

function getBlueprint(trope, tension, ending, modifier) {
  const key = blueprintKey(trope, tension, ending, modifier)
  return BLUEPRINTS[key] || null
}

function hasBlueprint(trope, tension, ending, modifier) {
  return getBlueprint(trope, tension, ending, modifier) !== null
}

// =============================================================================
// PHASE 1: BLUEPRINT → CHAPTER DESCRIPTIONS
// =============================================================================
const PHASE_1_BLUEPRINT_SYSTEM_PROMPT = `You are a story architect. You receive a romance novel concept and a structural blueprint — a sequence of chapters with generic functions, end states, and employment options. Your job is to fill each chapter function with a story-specific description.

## WHAT YOU DO

For each chapter in the blueprint, write a 2-4 sentence description of what happens in THIS story. The description must:
- Fulfil the chapter's generic function exactly
- Achieve the end state specified for that chapter
- Use the specific characters, setting, and circumstances from the concept
- Be concrete enough that a reader could picture the scene
- Not introduce characters or events that contradict the concept

## EMPLOYMENT OPTIONS

Each chapter may include employment options — these are the available approaches for that chapter. Select ONE option per employment group that best fits this specific concept and setting. Your chapter description should implement the selected option.

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

## CAST

The blueprint includes a supporting cast with thematic functions. These characters exist to pressure the protagonist's tension from different angles. When writing chapter descriptions, reference how cast functions apply (e.g. "the protagonist's safety instinct is reinforced by...") but do not name or specify cast members — Phase 2 does that.

## CONSTRAINTS

Some employment options are constrained by earlier selections. The blueprint notes these constraints. Respect them — if an option is marked as unavailable for a given earlier selection, do not choose it.

## OUTPUT FORMAT

Return a JSON object:
{
  "concept_summary": "One sentence summary of the concept as you understand it",
  "selections": {
    "ch1": "option_id selected for chapter 1",
    "ch2_meet": "option_id for how they meet",
    "ch2_enmity": "option_id for why they're enemies"
  },
  "chapters": [
    {
      "chapter": 1,
      "phase": 1,
      "function": "Establish Her World",
      "description": "Story-specific description of what happens in this chapter. 2-4 sentences. Concrete, not abstract."
    }
  ]
}

Every chapter in the blueprint must appear in your output. Same chapter numbers, same functions. Only the description is yours.`

function buildPhase1BlueprintPrompt(concept, blueprint) {
  // Build the blueprint reference for the prompt
  const blueprintText = blueprint.phases.map(phase => {
    const chaptersText = phase.chapters.map(ch => {
      let text = `  Chapter ${ch.chapter} — "${ch.function}"\n    End state: ${ch.endState}`

      // Add employment options
      if (ch.employment && ch.employment.length > 0) {
        for (const group of ch.employment) {
          text += `\n    ${group.header}:`
          for (const opt of group.options) {
            text += `\n      - [${opt.id}] ${opt.text}`
          }
          if (group.constraints && group.constraints.length > 0) {
            for (const c of group.constraints) {
              text += `\n      ⚠ Constraint: ${c.note}`
            }
          }
          if (group.cascadingNote) {
            text += `\n      ↳ ${group.cascadingNote}`
          }
        }
      }

      // Add notes
      if (ch.notes && ch.notes.length > 0) {
        for (const note of ch.notes) {
          text += `\n    Note: ${note}`
        }
      }

      // Add consequence variants (tragedy)
      if (ch.consequenceVariants) {
        for (const v of ch.consequenceVariants) {
          text += `\n    ${v.label}:`
          text += `\n      End state: ${v.endState}`
          for (const eg of v.employment) {
            text += `\n      ${eg.header}:`
            for (const opt of eg.options) {
              text += `\n        - [${opt.id}] ${opt.text}`
            }
          }
        }
      }

      // Add variant note
      if (ch.variantNote) {
        text += `\n    ⚠ ${ch.variantNote}`
      }

      return text
    }).join('\n\n')

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

  // Build cast reference
  let castText = ''
  if (blueprint.cast) {
    castText = '\n\nSUPPORTING CAST (thematic functions):\n'
    for (const member of blueprint.cast) {
      if (member.requiresTriangle && !blueprint.modifier.includes('love_triangle') && blueprint.modifier !== 'both') continue
      castText += `\n${member.function}: ${member.description}`
    }
  }

  // Build constraints reference
  let constraintText = '\n\nCROSS-CHAPTER CONSTRAINTS:'
  constraintText += '\n- If Ch.1 = "safe_stable": Ch.2 "open hostility" is unavailable; Ch.2 enmity "rivals" and "opposite sides" are unavailable'
  constraintText += '\n- If Ch.2 enmity = "opposite_sides" or "she_pursues": Ch.3 "presents as solution" is unavailable'
  constraintText += '\n- If Ch.3 = "already_in_life": rival\'s flaw cascades through Ch.5, Ch.6, Act III; Ch.7 rival role is fixed to Passive'
  constraintText += '\n- If Ch.3 = "presents_solution": Ch.5 rival flaw emerges fresh; Ch.7 rival role is fixed to Active'
  constraintText += '\n- If Ch.7 surface = "rival_exposes": rival role is forced to Active'

  return `CONCEPT:\n${concept}\n\nBLUEPRINT: ${blueprint.name}\nTotal chapters: ${blueprint.totalChapters}\n\nEXPECTED ROLES:\n${rolesText}${secretText}${castText}${constraintText}\n\nCHAPTER STRUCTURE:\n\n${blueprintText}\n\nFill each chapter function with a story-specific description for this concept. 2-4 sentences per chapter. Concrete and specific to this story. For each employment group, select the option that best fits this concept.`
}

// =============================================================================
// ROLL SKELETON — Pure randomizer, no LLM calls
// =============================================================================
// Reads the blueprint data and produces a complete rolled skeleton with every
// structural variable selected and every chapter employment option chosen,
// respecting all constraints and locks. Output is ready for concept generation.
// =============================================================================

function rollSkeleton() {
  // ── Helpers ────────────────────────────────────────────────────────────────
  function weightedPick(options) {
    const total = options.reduce((sum, o) => sum + o.weight, 0)
    let r = Math.random() * total
    for (const o of options) {
      r -= o.weight
      if (r <= 0) return o.value
    }
    return options[options.length - 1].value
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)]
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. STRUCTURAL VARIABLES (rolled in order, with locks)
  // ═══════════════════════════════════════════════════════════════════════════
  const trope = 'enemies_to_lovers'
  // TESTING LOCK: identity tension only while we test the new scene architecture
  const tension = 'identity'

  let ending, triangle, secret, valueTension, secretHolder
  if (tension === 'identity') {
    ending = 'HEA'       // LOCK: identity → HEA
    triangle = false      // LOCK: identity → no triangle
    secret = true         // LOCK: identity → secret always on

    // Select value tension
    const tensionDirection = pick(['conforms', 'rebels'])
    const tensionFlavours = VALUE_TENSIONS[tensionDirection].flavours
    const selectedFlavour = pick(tensionFlavours)
    valueTension = {
      direction: tensionDirection,
      flavourId: selectedFlavour.id,
      herPosition: selectedFlavour.her,
      hisPosition: selectedFlavour.his,
      description: selectedFlavour.description
    }

    // Select secret holder
    const selectedSecretHolder = pick(SECRET_HOLDERS)
    secretHolder = {
      id: selectedSecretHolder.id,
      label: selectedSecretHolder.label,
      description: selectedSecretHolder.description
    }
  } else {
    ending = weightedPick([
      { value: 'HEA', weight: 60 },
      { value: 'bittersweet', weight: 30 },
      { value: 'tragic', weight: 10 }
    ])
    triangle = Math.random() < 0.3
    secret = Math.random() < 0.5
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. CHAPTER EMPLOYMENT OPTIONS (sequential, constraints enforced)
  // ═══════════════════════════════════════════════════════════════════════════
  const chapters = []
  let chapterNum = 0

  // Cross-chapter state
  let ch1Selection = null
  let ch2EnmitySelection = null
  let ch3TriangleSelection = null
  let rivalRole = null
  let rivalFlaw = { id: null, selectedIn: null }
  let ch9TragedySelection = null

  // ═══════════════════════════════════════════════════════════════════════════
  // IDENTITY PATH — 7 chapters, all scene architecture, no employment
  // ═══════════════════════════════════════════════════════════════════════════
  if (tension === 'identity') {
    const act1 = CHAPTER_TREE.act1.chapters
    const act2 = CHAPTER_TREE.act2.chapters
    const act3 = CHAPTER_TREE.act3.chapters
    const act4 = CHAPTER_TREE.act4_resolution.chapters

    // Helper for identity chapters — scene architecture, no employment
    function addIdentityChapter(def) {
      chapterNum++
      const entry = {
        chapter: chapterNum,
        title: def.title,
        endState: def.endStates.default || def.endStates.identity || Object.values(def.endStates)[0],
        employmentSelections: []
      }
      // Include scene architecture
      if (Array.isArray(def.sceneArchitecture)) {
        entry.sceneArchitecture = def.sceneArchitecture
      } else if (def.sceneArchitecture && def.sceneArchitecture.identity) {
        entry.sceneArchitecture = def.sceneArchitecture.identity
      }
      chapters.push(entry)
    }

    // Ch.1 — Establish Her World
    addIdentityChapter(act1.ch1)
    // Ch.2 — The First Encounter
    addIdentityChapter(act1.ch2)
    // Ch.3 — The Escalation
    addIdentityChapter(act1.ch3_identity)
    // Ch.4 — The Crack
    addIdentityChapter(act2.ch5_identity)
    // Ch.5 — The Fall
    addIdentityChapter(act2.ch6_identity)
    // Ch.6 — The Dark Moment
    addIdentityChapter(act3.ch7_identity)
    // Ch.7 — Reunited
    addIdentityChapter(act4.ch_reunited_identity)

    // Build cast functions
    const castFunctions = CAST[tension]
      .map(c => ({
        id: c.function.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
        name: c.function,
        description: c.description
      }))

    // Attach presence and beats to each cast function
    for (const cf of castFunctions) {
      if (cf.id === 'the_source') {
        if (valueTension.direction === 'conforms') {
          cf.presence = "Part of the protagonist's routine. Appears naturally across her world — meals, conversations, passing moments. A recurring presence, not a guest star."
          cf.beats = [
            { by: 1, beat: 'The approval dynamic is visible.' },
            { by: 3, beat: 'The Source has demonstrated approval in action.' },
            { by: 6, beat: "The Source's role in the protagonist's crisis is felt — through failure, absence, or opposition." },
            { by: 7, beat: "The Source's relationship to the protagonist has changed." }
          ]
        } else {
          cf.presence = "A shadow over the protagonist's world. May be physically distant but present through letters, habits, objects, or other characters' references. The weight of their influence is felt even in absence."
          cf.beats = [
            { by: 1, beat: 'The reader understands who she is running from.' },
            { by: 3, beat: "The Source's influence has reached into her current life." },
            { by: 6, beat: 'The Source is connected to the crisis.' },
            { by: 7, beat: "The protagonist's relationship to the Source has changed." }
          ]
        }
        // Secret holder modifications for the Source
        if (secretHolder.id === 'source_disapproves') {
          cf.beats.push({ by: 4, beat: "The Source has witnessed the protagonist's shift toward the primary." })
          const ch6Beat = cf.beats.find(b => b.by === 6)
          if (ch6Beat) ch6Beat.beat = 'The Source manufactures or triggers the detonation.'
        } else if (secretHolder.id === 'source_complicit') {
          cf.beats.push({ by: 3, beat: "The Source's connection to the primary's presence is established but appears innocent." })
          const ch6Beat = cf.beats.find(b => b.by === 6)
          if (ch6Beat) ch6Beat.beat = "The truth about the Source's arrangement is revealed."
        }
      } else if (cf.id === 'the_romantic_confidant') {
        cf.presence = "A regular companion. Appears in the protagonist's personal life — walks, visits, shared meals. The person she is most relaxed around."
        cf.beats = [
          { by: 1, beat: 'The reader sees she is romantically inclined.' },
          { by: 3, beat: 'She has observed the attraction before the protagonist names it.' },
          { by: 5, beat: 'The protagonist has processed the romance through her.' },
          { by: 7, beat: 'The dynamic between them is tested.' }
        ]
        // Secret holder modification for the Confidant
        if (secretHolder.id === 'confidant') {
          cf.beats = cf.beats.map(b => {
            if (b.by === 3) return { by: 3, beat: 'The reader has seen a moment between the Confidant and the primary that seems innocent but will recontextualise later.' }
            if (b.by === 7) return { by: 6, beat: "The secret that detonates is the Confidant's — not an external discovery." }
            return b
          })
          cf.beats.push({ by: 5, beat: "The Confidant's encouragement of the romance carries a note the reader may later recognise as guilt." })
        }
      } else if (cf.id === 'her_opposite') {
        cf.presence = "Encountered in social settings. Not part of the protagonist's daily routine but present in her wider world — events, gatherings, through other characters."
        cf.beats = [
          { by: 2, beat: 'The reader sees her living in opposition to the core belief.' },
          { by: 5, beat: "Her way of being has intersected with the protagonist's arc." }
        ]
      } else if (cf.id === 'the_mirror') {
        cf.presence = "Encountered rarely but memorably. Each appearance carries weight. Not a daily presence but someone whose scenes leave a crater."
        cf.beats = [
          { by: 3, beat: "The reader has seen the Mirror's life." },
          { by: 6, beat: "The Mirror's existence has intersected with the protagonist's emotional state." }
        ]
      }
    }

    return {
      trope,
      tension,
      ending,
      triangle,
      secret,
      valueTension,
      secretHolder,
      chapters,
      rivalFlaw: { id: null, selectedIn: null },
      castFunctions
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SAFETY PATH — original logic with employment selections
  // ═══════════════════════════════════════════════════════════════════════════

  // ── CH.1: ESTABLISH HER WORLD ──────────────────────────────────────────
  chapterNum++
  const ch1Def = CHAPTER_TREE.act1.chapters.ch1
  const ch1Options = ch1Def.employment.safety.options
  const ch1Pick = pick(ch1Options)
  ch1Selection = ch1Pick.id

  let ch1EndState
  if (ch1Selection === 'safe_stable') {
    ch1EndState = ch1Def.endStates.safety_safe_stable
  } else {
    ch1EndState = ch1Def.endStates.safety_default
  }

  const ch1Entry = {
    chapter: chapterNum,
    title: ch1Def.title,
    endState: ch1EndState,
    employmentSelections: [
      { group: 'Employment Options', id: ch1Pick.id, text: ch1Pick.text }
    ]
  }
  if (triangle) ch1Entry.notes = ['The rival is established as part of her world']
  chapters.push(ch1Entry)

  // ── CH.2: THE FIRST ENCOUNTER ──────────────────────────────────────────
  chapterNum++
  const ch2Def = CHAPTER_TREE.act1.chapters.ch2
  const ch2Selections = []

  // How they meet
  let meetOptions = [...ch2Def.employment.howTheyMeet.options]
  if (ch1Selection === 'safe_stable') {
    meetOptions = meetOptions.filter(o => o.id !== 'open_hostility')
  }
  const ch2MeetPick = pick(meetOptions)
  ch2Selections.push({ group: 'How They Meet', id: ch2MeetPick.id, text: ch2MeetPick.text })

  // Why they're enemies
  let enmityOptions = [...ch2Def.employment.enmity_safety.options]
  if (ch1Selection === 'safe_stable') {
    enmityOptions = enmityOptions.filter(o => o.id !== 'rivals' && o.id !== 'opposite_sides')
  }
  const enmityPick = pick(enmityOptions)
  ch2EnmitySelection = enmityPick.id
  ch2Selections.push({ group: "Why They're Enemies", id: enmityPick.id, text: enmityPick.text })

  chapters.push({
    chapter: chapterNum,
    title: ch2Def.title,
    endState: ch2Def.endStates.safety,
    employmentSelections: ch2Selections
  })

  // ── CH.3 ───────────────────────────────────────────────────────────────
  chapterNum++
  if (triangle) {
    const ch3Def = CHAPTER_TREE.act1.chapters.ch3_triangle
    let ch3Options = [...ch3Def.employment.main.options]
    // CONSTRAINT: presents_solution disabled if ch2 enmity is opposite_sides or she_pursues
    if (ch2EnmitySelection === 'opposite_sides' || ch2EnmitySelection === 'she_pursues') {
      ch3Options = ch3Options.filter(o => o.id !== 'presents_solution')
    }
    const ch3Pick = pick(ch3Options)
    ch3TriangleSelection = ch3Pick.id

    const ch3Sels = [{ group: 'Employment Options', id: ch3Pick.id, text: ch3Pick.text }]

    if (ch3TriangleSelection === 'already_in_life') {
      // Flaw selected now, rival fixed to passive
      const flawPick = pick(ch3Def.employment.flawOptions.options)
      rivalFlaw = { id: flawPick.id, selectedIn: 'ch3' }
      ch3Sels.push({ group: "The First Crack — Rival's Flaw", id: flawPick.id, text: flawPick.text })
      rivalRole = 'passive'
    } else {
      // presents_solution — flaw deferred to ch5, rival fixed to active
      rivalRole = 'active'
    }

    const ch3EndState = ch3Def.endStates[ch3TriangleSelection] || ch3Def.endStates.default
    chapters.push({
      chapter: chapterNum,
      title: ch3Def.title,
      endState: ch3EndState,
      employmentSelections: ch3Sels
    })
  } else {
    const ch3Def = CHAPTER_TREE.act1.chapters.ch3_notriangle
    const ch3Pick = pick(ch3Def.employment.main.options)
    chapters.push({
      chapter: chapterNum,
      title: ch3Def.title,
      endState: ch3Def.endStates.default,
      employmentSelections: [{ group: 'Employment Options', id: ch3Pick.id, text: ch3Pick.text }]
    })
  }

  // ── CH.4 ───────────────────────────────────────────────────────────────
  chapterNum++
  const ch4Def = CHAPTER_TREE.act1.chapters.ch4_safety
  const ch4Pick = pick(ch4Def.employment.main.options)
  chapters.push({
    chapter: chapterNum,
    title: ch4Def.title,
    endState: ch4Def.endStates.default,
    employmentSelections: [{ group: ch4Def.employment.main.header, id: ch4Pick.id, text: ch4Pick.text }]
  })

  // ── CH.5: THE CRACK ────────────────────────────────────────────────────
  chapterNum++
  {
    const ch5Def = CHAPTER_TREE.act2.chapters.ch5_safety
    const ch5Sels = []
    const ch5Pick = pick(ch5Def.employment.main.options)
    ch5Sels.push({ group: ch5Def.employment.main.header, id: ch5Pick.id, text: ch5Pick.text })

    // Rival flaw emerges in ch5 when triangle + presents_solution
    if (triangle && ch3TriangleSelection === 'presents_solution') {
      const flawPick = pick(ch5Def.employment.rivalFlawEmerges.options)
      rivalFlaw = { id: flawPick.id, selectedIn: 'ch5' }
      ch5Sels.push({ group: ch5Def.employment.rivalFlawEmerges.header, id: flawPick.id, text: flawPick.text })
    }

    const ch5Entry = {
      chapter: chapterNum,
      title: ch5Def.title,
      endState: ch5Def.endStates.default,
      employmentSelections: ch5Sels
    }
    if (triangle && ch3TriangleSelection === 'already_in_life') {
      ch5Entry.notes = ["Rival's flaw escalates — same flaw from Ch.3, louder"]
    }
    chapters.push(ch5Entry)
  }

  // ── CH.6: THE FALL ─────────────────────────────────────────────────────
  chapterNum++
  {
    const ch6Def = CHAPTER_TREE.act2.chapters.ch6_safety
    const ch6Pick = pick(ch6Def.employment.main.options)
    const ch6Entry = {
      chapter: chapterNum,
      title: ch6Def.title,
      endState: triangle ? ch6Def.endStates.triangle : ch6Def.endStates.notriangle,
      employmentSelections: [{ group: ch6Def.employment.main.header, id: ch6Pick.id, text: ch6Pick.text }]
    }
    if (triangle) {
      ch6Entry.notes = ["Rival's flaw escalates further — degradation accelerates"]
    }
    chapters.push(ch6Entry)
  }

  // ── CH.7: THE DARK MOMENT ──────────────────────────────────────────────
  chapterNum++
  {
    const ch7Def = CHAPTER_TREE.act3.chapters.ch7_safety
    const ch7Sels = []

    if (secret) {
      const secretPick = pick(ch7Def.employment.secret.options)
      ch7Sels.push({ group: ch7Def.employment.secret.header, id: secretPick.id, text: secretPick.text })

      // Filter rival_exposes to triangle-only
      let surfaceOptions = [...ch7Def.employment.secretSurface.options]
      if (!triangle) {
        surfaceOptions = surfaceOptions.filter(o => o.id !== 'rival_exposes')
      }
      const surfacePick = pick(surfaceOptions)
      ch7Sels.push({ group: ch7Def.employment.secretSurface.header, id: surfacePick.id, text: surfacePick.text })

      // rival_exposes overrides rival role to active
      if (surfacePick.id === 'rival_exposes') {
        rivalRole = 'active'
      }
    } else {
      const triggerPick = pick(ch7Def.employment.trigger.options)
      ch7Sels.push({ group: ch7Def.employment.trigger.header, id: triggerPick.id, text: triggerPick.text })
    }

    // Rival role + manipulation (triangle only)
    if (triangle) {
      const rivalRoleOpt = ch7Def.employment.rivalRole.options.find(o => o.id === rivalRole)
      ch7Sels.push({ group: ch7Def.employment.rivalRole.header, id: rivalRole, text: rivalRoleOpt.text })

      if (rivalRole === 'active') {
        if (secret) {
          const manipPick = pick(ch7Def.employment.manipulation_secret.options)
          ch7Sels.push({ group: ch7Def.employment.manipulation_secret.header, id: manipPick.id, text: manipPick.text })
        } else {
          const manipPick = pick(ch7Def.employment.manipulation_nosecret.options)
          ch7Sels.push({ group: ch7Def.employment.manipulation_nosecret.header, id: manipPick.id, text: manipPick.text })
        }
      }
    }

    chapters.push({
      chapter: chapterNum,
      title: ch7Def.title,
      endState: ch7Def.endStates.default,
      employmentSelections: ch7Sels
    })
  }

  // ── CH.8: THE RETREAT ──────────────────────────────────────────────────
  chapterNum++
  const ch8Def = CHAPTER_TREE.act3.chapters.ch8_safety
  const ch8Pick = pick(ch8Def.employment.main.options)
  const ch8EndState = triangle ? ch8Def.endStates.triangle : ch8Def.endStates.notriangle

  chapters.push({
    chapter: chapterNum,
    title: ch8Def.title,
    endState: ch8EndState,
    employmentSelections: [{ group: ch8Def.employment.main.header, id: ch8Pick.id, text: ch8Pick.text }]
  })

  // ═══ ACT IV — branching by ending ═════════════════════════════════════

  if (ending === 'tragic' && tension === 'safety') {
    // ── TRAGEDY PATH ──────────────────────────────────────────────────
    const trag = CHAPTER_TREE.act4_tragedy.chapters

    // Ch.9: The Irreversible Act
    chapterNum++
    const ch9Def = trag.ch9_tragedy
    const ch9Options = triangle
      ? [...ch9Def.employment.withTriangle.options]
      : [...ch9Def.employment.withoutTriangle.options]
    const ch9Pick = pick(ch9Options)
    ch9TragedySelection = ch9Pick.id

    chapters.push({
      chapter: chapterNum,
      title: ch9Def.title,
      endState: triangle ? ch9Def.endStates.triangle : ch9Def.endStates.notriangle,
      employmentSelections: [{ group: 'The irreversible act', id: ch9Pick.id, text: ch9Pick.text }]
    })

    // Ch.10: locked by Ch.9 selection
    chapterNum++
    const ch10Def = trag.ch10_tragedy_truth
    const ch10Pick = pick(ch10Def.employment.main.options)
    chapters.push({
      chapter: chapterNum,
      title: ch10Def.title,
      endState: ch10Def.endStates.default,
      employmentSelections: [{ group: ch10Def.employment.main.header, id: ch10Pick.id, text: ch10Pick.text }]
    })

    // Ch.11: The Consequence — variant locked by Ch.9
    chapterNum++
    const ch11Def = trag.ch11_tragedy
    let consequenceVariant
    if (triangle && ch9TragedySelection === 'rival_kills') {
      consequenceVariant = ch11Def.variants.rival_killed
    } else if (ch9TragedySelection === 'she_betrays' || ch9TragedySelection === 'she_fails') {
      consequenceVariant = ch11Def.variants.she_caused
    } else if (!triangle && ch9TragedySelection === 'conflict_destroys') {
      consequenceVariant = ch11Def.variants.conflict
    }

    const ch11Pick = pick(consequenceVariant.employment.options)
    chapters.push({
      chapter: chapterNum,
      title: ch11Def.title,
      endState: consequenceVariant.endState,
      employmentSelections: [{ group: consequenceVariant.employment.header, id: ch11Pick.id, text: ch11Pick.text }]
    })
    // No Ch.12 for tragedy

  } else {
    // ── SAFETY HEA / BITTERSWEET PATH ─────────────────────────────────
    const res = CHAPTER_TREE.act4_resolution.chapters

    // Ch.9
    chapterNum++
    if (secret) {
      const ch9Def = res.ch9_safety_secret
      // rival_slips only available when triangle is on
      let ch9Options = [...ch9Def.employment.main.options]
      if (!triangle) {
        ch9Options = ch9Options.filter(o => o.id !== 'rival_slips')
      }
      const ch9Pick = pick(ch9Options)

      let ch9EndState
      if (triangle && rivalRole === 'active') {
        ch9EndState = ch9Def.endStates.active_rival
      } else if (triangle && rivalRole === 'passive') {
        ch9EndState = ch9Def.endStates.passive_rival
      } else {
        ch9EndState = ch9Def.endStates.notriangle
      }

      chapters.push({
        chapter: chapterNum,
        title: ch9Def.title,
        endState: ch9EndState,
        employmentSelections: [{ group: ch9Def.employment.main.header, id: ch9Pick.id, text: ch9Pick.text }]
      })
    } else {
      const ch9Def = res.ch9_safety_nosecret
      const ch9Pick = pick(ch9Def.employment.main.options)
      chapters.push({
        chapter: chapterNum,
        title: ch9Def.title,
        endState: ch9Def.endStates.default,
        employmentSelections: [{ group: ch9Def.employment.main.header, id: ch9Pick.id, text: ch9Pick.text }]
      })
    }

    // Ch.10: Reunited
    chapterNum++
    const ch10Def = res.ch10_safety
    const ch10Pick = pick(ch10Def.employment.main.options)
    chapters.push({
      chapter: chapterNum,
      title: ch10Def.title,
      endState: ch10Def.endStates.default,
      employmentSelections: [{ group: ch10Def.employment.main.header, id: ch10Pick.id, text: ch10Pick.text }]
    })

    // Ch.11: Rival Neutralised (triangle only)
    if (triangle) {
      chapterNum++
      const ch11Def = res.ch11_rival
      const ch11Pick = pick(ch11Def.employment.main.options)
      chapters.push({
        chapter: chapterNum,
        title: ch11Def.title,
        endState: ch11Def.endStates.default,
        employmentSelections: [{ group: ch11Def.employment.main.header, id: ch11Pick.id, text: ch11Pick.text }]
      })
    }

    // Final chapter: HEA or Bittersweet
    chapterNum++
    if (ending === 'HEA') {
      chapters.push({
        chapter: chapterNum,
        title: res.ch_hea_safety.title,
        endState: res.ch_hea_safety.endStates.default,
        employmentSelections: []
      })
    } else {
      const bsDef = res.ch_bittersweet_safety
      const bsGroup = triangle ? bsDef.employment.withTriangle : bsDef.employment.withoutTriangle
      const bsPick = pick(bsGroup.options)
      chapters.push({
        chapter: chapterNum,
        title: bsDef.title,
        endState: bsDef.endStates.default,
        employmentSelections: [{ group: bsGroup.header, id: bsPick.id, text: bsPick.text }]
      })
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. CAST FUNCTIONS (listed, not rolled — LLM fills during concept gen)
  // ═══════════════════════════════════════════════════════════════════════════
  const castFunctions = CAST[tension]
    .filter(c => !c.requiresTriangle || triangle)
    .map(c => ({
      id: c.function.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
      name: c.function,
      description: c.description
    }))

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. RETURN COMPLETE SKELETON
  // ═══════════════════════════════════════════════════════════════════════════
  return {
    trope,
    tension,
    ending,
    triangle,
    secret,
    chapters,
    rivalFlaw: triangle ? rivalFlaw : { id: null, selectedIn: null },
    castFunctions
  }
}

export {
  BLUEPRINTS,
  CHAPTER_TREE,
  CAST,
  CONSTRAINTS,
  SECRET_GUIDANCE,
  blueprintKey,
  getBlueprint,
  hasBlueprint,
  resolveBlueprint,
  rollSkeleton,
  PHASE_1_BLUEPRINT_SYSTEM_PROMPT,
  buildPhase1BlueprintPrompt
}
