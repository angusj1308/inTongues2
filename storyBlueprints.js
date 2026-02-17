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
      description: 'Believes passion is the whole answer. No caution, no consequences. Makes the protagonist\'s restraint look like cowardice.',
      employmentOptions: [
        'A younger sister or cousin',
        'A best friend or close companion',
        'A female colleague or peer in the same world',
        'A servant or attendant with proximity to her private life'
      ]
    },
    {
      function: 'Burned by Danger',
      color: 'caution',
      description: 'Destroyed by danger and now lives inside walls. Her caution is earned. Represents the future if fear wins.',
      employmentOptions: [
        'A mother or grandmother who lost someone to danger',
        'An older female relative — chose danger once and paid',
        'A widow — her story is the cautionary tale',
        'A female elder in the community — respected, protective',
        'A former version of the protagonist\'s role'
      ]
    },
    {
      function: 'Voice of the Dignified Life',
      color: 'dignity',
      description: 'Chose safety and made it noble through effort and loyalty. Proves the safe path has real value.',
      employmentOptions: [
        'Her father',
        'A senior figure in her profession — foreman, mentor, veteran',
        'An elderly male relative — uncle, grandfather',
        'A neighbour or community figure who built something through patience'
      ]
    },
    {
      function: 'Someone the Primary Protects',
      color: 'tender',
      description: 'Can\'t protect themselves. The primary protects them anyway. She sees him be tender and her framework breaks.',
      employmentOptions: [
        'A child he\'s responsible for — his own, an orphan, a ward',
        'A younger sibling or relative he raised',
        'An elderly parent or grandparent he cares for',
        'A loyal subordinate who depends on him',
        'A vulnerable person others abandoned but he hasn\'t'
      ]
    },
    {
      function: 'The Rival',
      color: 'rival',
      description: 'The safe option personified. His flaw cascades from flicker to full exposure.',
      requiresTriangle: true,
      employmentOptions: []
    }
  ],
  identity: [
    {
      function: 'The Source',
      color: 'passion',
      description: 'Where the identity came from. Their approval is what the framework was built to earn. She can\'t change without confronting this origin.',
      employmentOptions: [
        'A parent she modelled herself on',
        'A mentor or teacher who shaped her framework',
        'A formative figure from her past — no longer present but their influence is the architecture',
        'An older sibling she grew up admiring'
      ]
    },
    {
      function: 'The Validator',
      color: 'caution',
      description: 'Confirms her framework is correct. Takes her side. Reflects her judgments back uncritically. Makes the identity feel earned and shared rather than constructed.',
      employmentOptions: [
        'A best friend or close peer who shares her worldview',
        'A colleague or rival who operates by the same rules',
        'A confidant who reflects her judgments back to her uncritically'
      ]
    },
    {
      function: 'What She\'s Afraid Of Becoming',
      color: 'dignity',
      description: 'The undisciplined, out-of-control, or degraded version. The reason the framework exists. Every time she sees this person, she grips tighter.',
      employmentOptions: [
        'A parent or relative who represents the undisciplined version',
        'A sibling or peer who abandoned the same standards',
        'A public figure in her world who lost standing or control',
        'A former version of herself she\'s buried'
      ]
    },
    {
      function: 'The One Who Let Go',
      color: 'tender',
      description: 'Chose differently. Abandoned the framework or broke ranks. Either it destroyed them or freed them. Either way, she can\'t look at them without seeing a possible future.',
      employmentOptions: [
        'A friend or peer who chose differently and survived — or didn\'t',
        'A sibling who took the other path',
        'Someone from her world who broke ranks and either thrived or was destroyed'
      ]
    },
    {
      function: 'Someone He\'s Genuine With',
      color: 'rival',
      description: 'Can\'t protect themselves. He protects them anyway. She sees him be tender and her categorisation breaks. Trope-level — shared across tensions.',
      employmentOptions: [
        'A child he\'s responsible for — his own, an orphan, a ward',
        'A younger sibling or relative he raised',
        'An elderly parent or grandparent he cares for',
        'A loyal subordinate who depends on him',
        'A vulnerable person others abandoned but he hasn\'t'
      ]
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
          },
          identity: {
            header: 'Employment Options',
            options: [
              { id: 'competence', text: 'She is defined by her competence — she\'s the best at what she does and that\'s who she is' },
              { id: 'principles', text: 'She is defined by her principles — a moral or intellectual framework that governs everything' },
              { id: 'role', text: 'She is defined by her role — daughter, leader, professional, caretaker. The role IS her' },
              { id: 'rejection', text: 'She is defined by what she\'s rejected — she built herself in opposition to something, a past, a class, a world' },
              { id: 'reputation', text: 'She is defined by how others see her — reputation, standing, image in the community is the architecture of her self' }
            ]
          }
        }
      },

      // ─── CH.2: THE FIRST ENCOUNTER ───────────────────────────────────────
      ch2: {
        title: 'The First Encounter',
        endStates: {
          safety: 'By the end, the reader\'s first impression of the primary as dangerous and hostile is established.',
          identity: 'By the end, the reader understands why he is a threat to who she is. The enmity is personal.'
        },
        employment: {
          howTheyMeet: {
            header: 'How They Meet',
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
              { id: 'she_pursues', text: 'She is an authority figure pursuing him' },
              { id: 'he_threatens', text: 'He is an authority figure threatening her livelihood' }
            ],
            constraints: [
              { disables: ['rivals', 'opposite_sides'], when: 'ch1 === "safe_stable"', note: '"rivals" and "opposite sides" unavailable when Ch.1 is "safe, stable, and unremarkable"' }
            ]
          },
          enmity_identity_competence: {
            header: 'Why They\'re Enemies — Competence',
            tension: 'identity',
            requiresCh1: 'competence',
            options: [
              { id: 'hes_better', text: 'He\'s better than her at the thing that defines her' },
              { id: 'dismisses_skill', text: 'He dismisses her skill as irrelevant — wins a different way' },
              { id: 'effortless', text: 'He succeeds effortlessly at what she had to fight for' },
              { id: 'exposes_flaw', text: 'He exposes a flaw in her competence she didn\'t know existed' }
            ]
          },
          enmity_identity_principles: {
            header: 'Why They\'re Enemies — Principles',
            tension: 'identity',
            requiresCh1: 'principles',
            options: [
              { id: 'embodies_wrong', text: 'He embodies what she believes is wrong and thrives' },
              { id: 'opposing_works', text: 'He lives by an opposing philosophy and it works' },
              { id: 'celebrated', text: 'He acts against her principles and people celebrate him for it' },
              { id: 'blind_spot', text: 'He proves her framework has a blind spot she can\'t explain away' }
            ]
          },
          enmity_identity_role: {
            header: 'Why They\'re Enemies — Role',
            tension: 'identity',
            requiresCh1: 'role',
            options: [
              { id: 'role_impossible', text: 'He makes the role impossible to perform' },
              { id: 'role_forbids', text: 'He offers her something the role forbids her from wanting' },
              { id: 'sees_past_role', text: 'He sees her apart from the role and she finds that threatening' },
              { id: 'step_outside', text: 'He needs something from her that requires stepping outside the role' }
            ]
          },
          enmity_identity_rejection: {
            header: 'Why They\'re Enemies — Rejection',
            tension: 'identity',
            requiresCh1: 'rejection',
            options: [
              { id: 'is_rejected_thing', text: 'He IS the thing she rejected — same class, same world, same past' },
              { id: 'proud_of_shame', text: 'He\'s proud of what she\'s ashamed of' },
              { id: 'sees_through', text: 'He sees through her reinvention' },
              { id: 'makes_appealing', text: 'He makes the rejected thing look appealing' }
            ]
          },
          enmity_identity_reputation: {
            header: 'Why They\'re Enemies — Reputation',
            tension: 'identity',
            requiresCh1: 'reputation',
            options: [
              { id: 'destroys_standing', text: 'Association with him would destroy her standing' },
              { id: 'publicly_despised', text: 'He\'s publicly despised by the people whose opinion she needs' },
              { id: 'doesnt_care', text: 'He doesn\'t care about reputation and that itself is a threat' },
              { id: 'sees_gap', text: 'He sees the gap between who she is and who people think she is' }
            ]
          }
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

      // ─── CH.3: IDENTITY — THE REJECTION ──────────────────────────────────
      ch3_identity: {
        title: 'The Rejection',
        conditions: { tension: 'identity' },
        endStates: {
          default: 'By the end, the reader sees how strong the wall is. She has rejected him, misread what\'s real, and reinforced the identity. The reader sees what she can\'t.'
        },
        employment: {
          main: {
            header: 'Employment Options',
            options: [
              { id: 'weaponises_identity', text: 'She uses her identity as a weapon against him — the very thing that defines her becomes the instrument of rejection' },
              { id: 'categorises', text: 'She categorises and dismisses him — her framework slots him, labels him, and she\'s done. He\'s a type she already understands' },
              { id: 'doubles_down', text: 'She doubles down on being more herself — doesn\'t engage with the threat, just becomes louder, sharper, more committed to who she already is' },
              { id: 'humiliates_publicly', text: 'She humiliates him publicly — the rejection is performative. Others witness it. Her identity is reinforced socially. Now she can\'t back down without losing face' }
            ]
          }
        }
      },

      // ─── CH.4: IDENTITY — THE PERSISTENCE ────────────────────────────────
      ch4_identity: {
        title: 'The Persistence',
        conditions: { tension: 'identity' },
        endStates: {
          default: 'By the end, he is a fixture she can\'t remove. Her rejection failed.'
        },
        employment: {
          main: {
            header: 'Employment Options',
            options: [
              { id: 'keeps_showing_up', text: 'He keeps showing up in her space — she can\'t avoid him without changing her own routine' },
              { id: 'matches_her', text: 'He matches her — she pushes, he pushes back with wit or competence. He won\'t retreat' },
              { id: 'does_without_asking', text: 'He does something for her without asking — no performance. She finds out after' },
              { id: 'shows_up_differently', text: 'He shows up differently than expected — she can\'t stabilise her framework because he won\'t stay in the box' },
              { id: 'forced_obligation', text: 'They\'re forced into shared obligation — she can\'t exit without sacrificing something her identity depends on' }
            ]
          }
        }
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
          default: 'By the end, her framework is broken. She can no longer maintain he is what she decided he was.'
        },
        employment: {
          main: {
            header: 'How the primary cracks her framework',
            options: [
              { id: 'defies_framework', text: 'He does something her framework says he shouldn\'t be capable of — he doesn\'t fit the box she put him in' },
              { id: 'sees_her', text: 'He sees something true about her that no one else has noticed — she can\'t dismiss someone who sees her clearly' },
              { id: 'genuinely_himself', text: 'She witnesses him being genuinely himself — the contrast between who he is and who she decided he was is undeniable' },
              { id: 'earns_respect', text: 'He earns respect from someone she respects — someone whose judgment she trusts disagrees with her framework' }
            ]
          }
        }
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
          default: 'By the end, she has started becoming someone she doesn\'t recognise. The identity she built is no longer holding.'
        },
        employment: {
          main: {
            header: 'How she falls',
            options: [
              { id: 'likes_herself', text: 'She likes who she is around him — the version of herself that emerges feels more real than the constructed one' },
              { id: 'buried_part', text: 'He draws out a part of her she\'d buried — something her identity required her to suppress comes back alive around him' },
              { id: 'his_world_home', text: 'She enters his world and finds herself at home — the thing she rejected or dismissed turns out to hold something she actually wanted' },
              { id: 'defends_him', text: 'She defends him when she doesn\'t have to — she catches herself doing it and knows the identity cracked without her permission' }
            ]
          }
        }
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
        employment: {
          secret: {
            header: 'The Secret (what it is)',
            showWhen: 'secret',
            options: [
              { id: 'manufactured', text: 'His approach to her was manufactured — someone arranged it, paid for it, or orchestrated it. The persistence wasn\'t real' },
              { id: 'ulterior', text: 'He had an ulterior motive — what looked like genuine interest was strategic. He needed something from her' },
              { id: 'used_intimacy', text: 'He used what he learned about her against her — the intimacy was intelligence gathering. The things she revealed became tools' }
            ]
          },
          secretSurface: {
            header: 'How the secret surfaces',
            showWhen: 'secret',
            options: [
              { id: 'discovers_herself', text: 'She discovers it herself — stumbles onto evidence' },
              { id: 'third_party', text: 'A third party reveals it innocently' },
              { id: 'primary_confesses', text: 'He confesses — too late' },
              { id: 'witnesses_motive', text: 'She witnesses him in a moment that exposes the motive' }
            ]
          },
          trigger: {
            header: 'What triggers the dark moment',
            showWhen: '!secret',
            options: [
              { id: 'reverts', text: 'He reverts to type — does the exact thing she originally categorised him as. The framework snaps back into place' },
              { id: 'sees_herself', text: 'She sees herself through someone else\'s eyes and doesn\'t recognise who she\'s become — the gap between her constructed self and her current self is horrifying' },
              { id: 'pushes_too_far', text: 'He challenges the core of her identity directly — not by accident, deliberately. He pushes too far' },
              { id: 'world_punishes', text: 'The world she built punishes her for changing — the people, the standing, the role she\'s been abandoning start to collapse' },
              { id: 'self_sabotage', text: 'She sabotages it herself — the identity reasserts from inside. She can\'t tolerate who she\'s becoming and destroys what she built with him' }
            ]
          }
        }
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

      // ─── CH.8: IDENTITY — THE RETREAT ────────────────────────────────────
      ch8_identity: {
        title: 'The Retreat',
        conditions: { tension: 'identity' },
        endStates: {
          default: 'By the end, she has rebuilt the wall. She is who she was before the fall — but the reader sees it\'s a performance now. Something is dead inside her.'
        },
        employment: {
          main: {
            header: 'How she retreats',
            options: [
              { id: 'back_to_self', text: 'She goes back to exactly who she was — same sharpness, same framework, same posture. But it doesn\'t fit anymore. The reader sees the seams' },
              { id: 'overcorrects', text: 'She overcorrects — becomes a harder version of her constructed self than she ever was before. The identity isn\'t natural anymore, it\'s armour' },
              { id: 'cuts_everything', text: 'She cuts everything associated with the fall — avoids places, drops habits, removes anything that reminds her of who she was becoming' },
              { id: 'public_recommit', text: 'She publicly recommits to her identity — makes a show of it. Takes a stand or makes a decision in front of others so she can\'t go back' }
            ]
          }
        }
      }
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

      // ─── CH.9: IDENTITY — SECRET ON — THE FULL PICTURE ───────────────────
      ch9_identity_secret: {
        title: 'The Full Picture',
        conditions: { tension: 'identity', secret: true },
        endStates: {
          default: 'By the end, she learns the fall was real. What she built with him was genuine. The framework was the lie, not the feelings.'
        },
        employment: {
          main: {
            header: 'How she learns the full picture',
            options: [
              { id: 'evidence_surfaces', text: 'Evidence surfaces that reveals the full context' },
              { id: 'ally_tells_her', text: 'Someone from his world tells her what was real' },
              { id: 'primary_acts', text: 'He acts to protect her at great cost — proving the motive changed' }
            ]
          }
        }
      },

      // ─── CH.9: IDENTITY — SECRET OFF — THE GRAND GESTURE ─────────────────
      ch9_identity_nosecret: {
        title: 'The Grand Gesture',
        conditions: { tension: 'identity', secret: false },
        endStates: {
          default: 'By the end, he has proven through action that the person she was becoming around him was the real one.'
        },
        employment: {
          main: {
            header: 'The grand gesture',
            options: [
              { id: 'shows_up_himself', text: 'He shows up as himself — no performance, no strategy, just vulnerable' },
              { id: 'does_impossible', text: 'He does the thing her framework said he was incapable of — and it costs him' },
              { id: 'lets_her_go', text: 'He lets her go — and that act of release is what breaks her framework permanently' },
              { id: 'fights_for_her', text: 'He fights for her in a way that only makes sense if the fall was real' }
            ]
          }
        }
      },

      // ─── CH.10: IDENTITY — REUNITED ──────────────────────────────────────
      ch10_identity: {
        title: 'Reunited',
        conditions: { tension: 'identity' },
        endStates: {
          default: 'By the end, she chooses him knowing it means becoming someone new. She lets the constructed self go.'
        },
        employment: {
          main: {
            header: 'How they come back together',
            options: [
              { id: 'she_goes_to_him', text: 'She goes to him — she initiates' },
              { id: 'he_comes_for_her', text: 'He comes for her' },
              { id: 'forced_together_again', text: 'Circumstance forces them together — the choice happens in the moment' }
            ]
          }
        }
      },

      // ─── CH.11: IDENTITY — HEA ──────────────────────────────────────────
      ch_hea_identity: {
        title: 'HEA',
        conditions: { tension: 'identity' },
        endStates: {
          default: 'By the end, she is someone new — not the constructed self, not a stranger. Her. The reader sees who she was always going to be.'
        },
        employment: {}
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
              { id: 'conflict_destroys', text: 'The conflict itself destroys him — the thing that made them enemies kills him' },
              { id: 'was_monster', text: 'He was the monster all along — the fall was the lie, Act II was the con' }
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
        showWhen: 'ch9_tragedy !== "was_monster"',
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

      // ─── CH.10: TRAGEDY — THE FULL EXTENT (monster) ──────────────────────
      ch10_tragedy_monster: {
        title: 'The Full Extent',
        showWhen: 'ch9_tragedy === "was_monster"',
        endStates: {
          default: 'By the end, she discovers the dark moment was only the surface. It\'s worse than she thought.'
        },
        employment: {
          main: {
            header: 'How the full extent is revealed',
            options: [
              { id: 'discovers_more', text: 'She discovers additional evidence — the deception ran deeper than the secret' },
              { id: 'he_reveals', text: 'He reveals himself fully — no longer needs to pretend' },
              { id: 'others_emerge', text: 'Other victims emerge — she wasn\'t the first, the pattern becomes visible' }
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
                { id: 'takes_life', text: 'She takes her own life — the guilt is unsurvivable' },
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
                { id: 'takes_life', text: 'She takes her own life' },
                { id: 'lives_with_it', text: 'She lives with it — the tragedy is endurance' },
                { id: 'destroys_defended', text: 'She destroys what she was defending — nothing matters anymore' }
              ]
            }
          },
          monster: {
            showWhen: '!triangle && ch9_tragedy === "was_monster"',
            endState: 'By the end, she faces what she gave herself to.',
            employment: {
              header: 'The consequence',
              options: [
                { id: 'destroys_him', text: 'She destroys him — turns his own weapons against him' },
                { id: 'escapes', text: 'She escapes — survival is the victory' },
                { id: 'lives_with_it', text: 'She lives with it — the tragedy is what she learned about herself' }
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
    return {
      chapter: chapterNum,
      function: def.title,
      endState,
      employment,
      notes
    }
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

  // Ch.4 (identity gets persistence, safety gets escalation)
  // Identity also gets ch4 — The Persistence
  if (tension === 'identity') {
    act1Chapters.push(makeChapter(act1.chapters.ch4_identity))
  } else {
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

  // Ch.8
  if (tension === 'identity') {
    act3Chapters.push(makeChapter(act3.chapters.ch8_identity))
  } else {
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

    // Ch.10 — Truth Too Late (default) or Full Extent (monster)
    // Include both variants — the AI picks based on Ch.9 selection
    act4Chapters.push({
      chapter: ++chapterNum,
      function: trag.chapters.ch10_tragedy_truth.title,
      endState: trag.chapters.ch10_tragedy_truth.endStates.default,
      employment: collectEmployment(trag.chapters.ch10_tragedy_truth.employment),
      notes: [],
      variant: 'default'
    })
    // Monster variant (only available when no triangle + was_monster selected)
    if (!triangle) {
      act4Chapters.push({
        chapter: chapterNum, // same chapter number — variant
        function: trag.chapters.ch10_tragedy_monster.title,
        endState: trag.chapters.ch10_tragedy_monster.endStates.default,
        employment: collectEmployment(trag.chapters.ch10_tragedy_monster.employment),
        notes: [],
        variant: 'was_monster',
        variantNote: 'This chapter replaces "The Truth Arrives Too Late" if Ch.9 selection is "He was the monster all along"'
      })
    }

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
      consequenceVariants.push({
        variant: 'monster',
        label: 'If he was the monster all along',
        endState: ch11t.variants.monster.endState,
        employment: [{ header: ch11t.variants.monster.employment.header, options: ch11t.variants.monster.employment.options.map(o => ({ id: o.id, text: o.text })), constraints: [], cascadingNote: null }]
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
    // IDENTITY HEA PATH
    const res = CHAPTER_TREE.act4_resolution

    // Ch.9
    if (secret) {
      act4Chapters.push(makeChapter(res.chapters.ch9_identity_secret))
    } else {
      act4Chapters.push(makeChapter(res.chapters.ch9_identity_nosecret))
    }

    // Ch.10 — Reunited
    act4Chapters.push(makeChapter(res.chapters.ch10_identity))

    // Ch.11 — HEA
    act4Chapters.push(makeChapter(res.chapters.ch_hea_identity))

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
    // Identity: HEA only, no triangle, 2 secret options = 2
    { tension: 'identity', ending: 'hea', secret: true, triangle: false },
    { tension: 'identity', ending: 'hea', secret: false, triangle: false }
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
      if (member.employmentOptions.length > 0) {
        castText += '\n  Employment options:'
        for (const opt of member.employmentOptions) {
          castText += `\n    - ${opt}`
        }
      }
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
  PHASE_1_BLUEPRINT_SYSTEM_PROMPT,
  buildPhase1BlueprintPrompt
}
