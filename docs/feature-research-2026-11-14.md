# Tactical Fieldbook — research and implementation

Goal: research and add meaningful game features, preserving the mobile surface, Zama colors, NFT ownership, existing encrypted state and deployed Sepolia gameplay.

The previous work advanced the authoritative implementation: mobile layout and brand palette were implemented and checked. This goal begins by inspecting the current source and plan instead of assuming those changes or the old feature list are complete.

## Research and decisions

- [Zama Season 5 criteria](https://www.zama.org/post/zama-developer-program-mainnet-season-5-confidential-gaming): gameplay must make secrecy matter and support a full, verifiable Sepolia round. The existing Colosseum provides sealed commands and on-chain encrypted rolls; preparation and learning need more depth.
- [Zama encrypted randomness](https://docs.zama.org/protocol/solidity-guides/smart-contract/operations/random): rolls are generated during transactions. Historical statistics must never be presented as the next roll, hidden plan or a guaranteed win probability.
- [boardgame.io secret-state design](https://github.com/boardgameio/boardgame.io/blob/main/docs/documentation/secret-state.md): separate each player's authorized view rather than merely hiding secret values in the UI. Scouting will consume a deliberately public data projection and will not query private plans, stakes, power or decryption endpoints.
- [boardgame.io phases](https://github.com/boardgameio/boardgame.io/blob/main/docs/documentation/api/Game.md): preparation, resolution and learning should have clear boundaries. Apply that principle to Scout → Plan → existing encrypted fight → replay/learn. No external game code or assets are copied.
- Source audit: `registerDefender` refreshes `since`; `replan` changes the encrypted plan and increments a counter. Historical form therefore describes observed past fights, not the current defender's plan. Duel results must be flipped for a specimen that fought as defender. Pending fights have no public round result.

## Delivery sequence

### 1. Public opponent scouting

- A mobile scouting drawer reachable from wild and defender cards.
- Read settled fights from the existing latest-30-fights query, shared through its query cache and fetched only when the drawer is open.
- Correct perspective for challenger, wild opponent and PvP defender; current keeper filter for defender records; deterministic ordering and duplicate/invalid record exclusion.
- Show observed wins/losses, each round's public record and individual replays. Label the observation window and retain an honest no-data/loading/error state.
- Scout replays include public results only, with no private move lookup, payout or reward claims.
- Acceptance: tests exercise both perspectives, pending/invalid results, ownership changes and duplicate/out-of-order input. Chrome checks verify the drawer, Escape/focus handling, replay and 320px geometry.

### 2. Personal tactical playbooks

- Save, name, apply and delete three-command plans; bound the collection size and validate stored data.
- Scope saves to chain, Colosseum deployment, wallet and specimen. Switching wallet/specimen must not expose or overwrite a different scope.
- Explain that saves are local to this browser; encryption for Sepolia still happens through the existing entry action. No synchronization, secret transmission or fake on-chain persistence.
- Acceptance: tests cover isolation, malformed storage, three valid commands, persistence failure and deletion. Browser checks cover save → edit → apply → reload and changed specimen scope.

### 3. Learning loop

- Upgrade the existing animated practice into **Lumen’s Cipher Trial**, one three-encounter run. It teaches three information conditions rather than adding a disconnected minigame.
- Encounter 1: choose three commands against a locally concealed rival. Show public round winners only, including during animation and in the report; do not reveal its actions through poses, labels or accessibility text.
- Encounter 2: explicitly expose that same training rival’s commands. Reuse its plan, both sides’ rolls and equal training power so changes in outcome come from the player's new commands. Require all three correct counters to progress; a counter is +30, not a guaranteed round win.
- Encounter 3: the rival replans and both sides receive fresh local rolls. Show the prior encounters as public results from the rival’s perspective, not a prediction or reconstruction of its new plan. Complete the run after this match regardless of win/loss.
- Use the deployed contract's round formula (equal training base power 100, counter +30, rolls 0–31, tied scores go to the rival/defender). Mark browser-generated scenarios as local training with no encryption, on-chain randomness, gas, XP or token rewards. This does not simulate an NFT's real private power or elemental profile.
- Reuse the existing per-round attack/guard/feint animation for the player's chosen commands. For concealed rivals use a neutral sealed pulse, avoiding accidental disclosure through animation. Exposed rivals may show their known command poses.
- A completed run shows blind/exposed/fresh results, explains what changed and offers the final draft in the real Colosseum without submitting anything. The draft can then be saved in the scoped playbook through the normal controls. Keep practice available to connected players via a quiet link.
- Pure-model tests cover exact score ties, counter/roll boundaries, identical conditions on exposed retries, progression gates, public projection and fresh scenario generation. Chrome checks must finish all three matches, exercise an incorrect exposed plan and retry, verify concealed views contain no enemy moves, and inspect 320px layout and final draft transfer.
- Rejected alternatives: a second generic practice button duplicates current gameplay; score-only progression would imply deterministic RPS despite the contract’s hidden power and rolls. The trial teaches the actual scoring boundary instead.

## Verification and authority

Run focused failing behavior tests before implementation, then the frontend suite, type-check and build. Inspect Chrome using browser control only. Preserve current artwork, always-on effects and the fluid 430px game surface. No new dependencies, contract deployment, wallet signatures, paid action or publication is authorized by this plan.

The wider goal remains active while the delivery sequence or required verification is incomplete.


## Tactical delivery audit — 14 November 2026

The previous goal turn was progress: it changed the shared brand palette and verified Chrome, tests and build. This turn implemented the learning feature and completed the planned runtime checks for scouting and playbooks.

| Requirement | Current evidence |
| --- | --- |
| Research applied to gameplay | Sources above; inspected `ChimeraColosseum._round` / `_fight`. Local training follows +30, d32, strict greater-than and equal training bases. No claim that browser draws are Zama randomness. |
| Scouting from wild and defender cards | `Arena.tsx` renders `ScoutButton` in both card footers. Eight scouting tests cover challenger/defender/wild perspective, keeper changes, pending/invalid records, duplicate ordering, the global observation window, no private fields and the five-row display limit. |
| Live public record and honest privacy boundary | Chrome Scout #24 read one settled encounter in the latest 20 fights; fight #14 appears 2–1 from #24’s perspective (L/W/W). Pending fight #20 contributes no result. Profile and report show no private plans, power, stakes or next-roll prediction. |
| Scouting keyboard and replay | Shift+Tab from Close wraps to Back to planning. Escape closes the drawer, retains #/arena and restores focus to Scout specimen #24. Replay #14 completes 2–1 with all six commands shown as Sealed and “Replay · no new rewards”; Back to planning closes it on the same route. Fixed the formerly misleading return label for scout replays. |
| Playbook behavior and scope | Eight playbook tests pass for persistence, copies, chain/deployment/wallet/NFT boundaries, validation, six-slot limit, update/delete, corrupt documents and failed writes. Chrome saved QA Fieldbook 14 for #31 with Guard/Strike/Feint, changed round 1, reapplied the exact saved plan, and retained the save through reload. #30 shows 0/6 while #31 retains 1/6; removed only this QA entry afterward. |
| Complete learning loop | Chrome completed blind 2–1, intentionally incorrect exposed 1–2 with 0/3 counters (retry required), correct exposed 3–0 with 3/3 counters, then replanned 3–0. Completed view showed all three results and the real Colosseum / proof routes. |
| Scoring and state progression | Six trial model tests pass. They cover a +30 counter losing 130–131, equal scores favoring the rival, exact rematch inputs, retry gate, fresh replanning even when local draws repeat, completion after any final outcome, invalid inputs and concealed projections. |
| No hidden animation disclosure | In a live 320px blind round: player pose=strike; rival pose=sealed, animation=chm-practice-brace; no rival data-move effect; caption says “concealed command”. Only the explicitly exposed drill receives rival commands in its view. |
| Draft handoff | Chrome transferred the final Guard/Strike/Feint plan into the real Arena command queue. Three handoff tests cover one-time consumption, copies, wallet identity changes and invalid plans. This does not submit or automatically save anything. |
| Mobile and visual language | 430px centered frame checked. At 320px, fixed an observed aspect-ratio/min-height overflow: playfield is now 310/310px, trial 284/284px, stage 264px; exposed picker 262/262px. Playbook form 252/252px; scout drawer 320/320px and scrolling content 310/310px. Yellow/black/gray controls and per-command animations remain active. |
| Regression checks | `bun test tests`: 52 passed, zero failed, 164 assertions across 14 files. `npm run type-check` passes. Production build passes with the existing large wallet/FHE chunk advisory. No dependency, contract or deployment change. |

Verification limits: Chrome viewport emulation, not physical phones or Safari. Live PvP defender scouting could not be clicked because no active defenders were waiting; its entry wiring and keeper-filter model were inspected/tested. Wallet isolation was tested without switching the user's actual wallet. No wallet signature, new on-chain match, paid action or publication was performed, and the existing pending fight was left untouched.

Evidence screenshots: `tmpshots/cipher-trial-completed.jpg`, `tmpshots/scout-replay-public-result.jpg`, `tmpshots/scout-mobile-320.jpg`.


## User direction: all three feature tracks

The user answered the priority question with “cả 3”: tactics/PvP, story/quests and breeding/NFT. The overall goal remains active. The tactical audit above covers the first track; it is not a completion claim for the expanded objective.

A final focus check also reproduced a shell bug: overflow:hidden allowed the outer game frame to scroll 138px when focus moved, leaving navigation above an empty bottom region. Changed the frame to overflow:clip with hidden fallback. Chrome checks now show root.scrollTop=0 and nav.bottom=root.bottom=862px at desktop, including result and next-encounter focus; at 320×568 the same values are 0 and 568px, with 310/310px content. Only the main content scrolls.

### 4. Breeding objectives and uncertainty

Research: [Axie breeding](https://whitepaper.axieinfinity.com/gameplay/breeding) makes inherited traits a reason to choose parents, while using breed limits and increasing fees. Adapt the decision loop, not its public gene disclosure or token model. CHIMERA keeps its deployed seven-breed cap, prices and Zama inheritance. [Zama ACL](https://docs.zama.org/protocol/solidity-guides/smart-contract/acl) confirms why publicly decryptable looks and keeper-authorized alleles must remain separate.

- Add a trait objective in the Nursery: choose a visible locus and Rare (12+) or Mythic (15). Default to Rare Crest to connect with the campaign.
- Compute a lower/upper success probability over every allele consistent with visible traits, using sequenced/certified loci only when the existing authorized reader supplies them. Do not assume the genesis prior for unknown bred-parent genes. No simulation is a promise of the next on-chain mutation.
- The deployed lab inherits one allele per parent, mutates Parent A's allele with probability 1/32 to a uniform nibble, then expresses min(A,B). Compare the reversed pair and let the player swap parent positions; this changes the forecast and selected parents only.
- Link uncertain parents to their specimen files for sequencing. Keep exact knowledge and certainty about a particular threshold distinct: sometimes visible traits alone determine the probability of reaching a target.
- Tests: full genotype cases, unknown bounds containing all consistent genotypes, knowledge narrowing, mutation asymmetry and invalid inputs. Chrome: select #30/#31, change target, swap, inspect range, check 320px. No breed/signature is required or authorized for QA.

### 5. Playable campaign journal

- Replace the Journal's initial wall of prose with three navigable story acts: Keeper's pact (own specimen + settled fight), Reading the dark (read a gene), Blood of two lines (raise a bred specimen, then restore a rare crest).
- Each act shows its objectives, a compact illustrated scene, a Lumen line, evidence from current Sepolia state and one relevant next action. Keep the existing lore and specimen atlas available behind disclosures.
- Progress comes from owned NFT metadata, settled tactics counters, sequencing flags and publicly decryptable child Crest traits. Missing/error reads are unknown, not zero or completed. Buying/receiving a bred NFT can satisfy “raise a bred specimen”; do not claim that the keeper personally bred it without event evidence.
- Rare-crest restoration requires a real bred specimen with two recorded parents and a public Crest >=12. Genesis/wild rarity does not satisfy lineage restoration. No local checklist, fabricated on-chain achievement, extra XP or token emission.
- Route the final act to the Nursery goal planner and the relevant specimen, tying fight → read → parent selection → offspring back into the existing economy. No new contract/deployment needed.
- Tests: partial/unknown data, wrong source specimens, fight settlement, certified vs sequenced knowledge, true bred lineage and public target proof. Chrome: current wallet progress, act navigation, links, disclosures, 320px bounds and Zama colors.


## Expanded-track verification — 14 November 2026

### Breeding / NFT

- Implemented `breeding-goal.ts` and the Nursery's `BreedingObjective`. Five focused tests initially failed on a stub, then passed: known genotype probabilities, all consistent unknown genotype combinations, narrowed knowledge, mutation orientation, and invalid/contradictory data. The test suite checks 328 assertions here, including every compatible hidden-allele pair for the representative unknown parents.
- Inspected `ChimeraLab._inherit` and `_store`: selection is 50/50 per parent; only A mutates, threshold 8/256, uniform high nibble; public expressed trait is min(A,B). The goal model uses these exact operations' probabilities rather than estimating an unseen genotype.
- Chrome selected the real owned specimens #31/#30. Rare Crest showed a 0–24.6% bound with 0/2 loci read. Mythic Eyes showed 0–24.3%. Swapping changed Parent A to #30 and Parent B to #31 while preserving selected IDs and the appropriate forecast; equal ranges for these unknown loci are reported honestly rather than implying an improvement.
- Inspect Eyes #31 opened #/creature/31/genome with the Genome section selected. The route now supports this explicit section without sequence/publish/sign actions. Model tests prove the asymmetric case: common A / mythic B has 1/512 Mythic chance from mutation, reversed has zero when common B cannot pass the target.
- At 320×568, planner is 244/244px and playfield 310/310px. Navigation remains at 568px; root.scrollTop=0. The normal 10 cZAMA breeding action and existing fee/cooldown checks remain in the original handler. It was not clicked during QA.

### Story / quests

- Added `campaign.ts` and illustrated `CampaignBoard` above the Journal's disclosed lore and Atlas. Four tests were observed failing before implementation, then passed for unknown/disconnected data, independent objectives, certified/sequenced state, settled fights without requiring a win, real bred ancestry, rare Crest proof, stale ownership, duplicate IDs and malformed parents.
- Chrome current wallet record shows Pact 2/2, Research 1/2, Lineage 0/2: three of six objectives confirmed. One settled fight is counted, and pending fight #20 does not invent an additional settlement. #30/#31 are owned but have no sequenced loci or bred-generation evidence, so those objectives remain open.
- Checked each act, the completed Pact → Continue story action, Research → Genome, Lineage → Plan a Rare Crest (Nursery), and the daily Quest Board link. The existing chronicle still opens and displays its prologue.
- At 320px the campaign is 284/284px and playfield 310/310px. Opening lore plus Atlas exposed an older 340px intrinsic-grid overflow (310/394px). Fixed the Atlas grid to minmax(0,1fr), fluid SVG and wrapping trait rows; rechecked 310/310px with both disclosures open.
- Changed the labeled Crest illustration slider from 13 to 14; campaign remained 3/6, demonstrating that an illustration or local click does not forge an on-chain objective. Added the story link to Lumen's map briefing for discoverability.

Evidence: `tmpshots/breeding-goal-320.jpg`; final campaign screenshot is saved separately. Live completion of the new lineage objective was not attempted: it would require breeding/acquiring and sequencing NFTs with wallet transactions. Its derivation is covered by the model tests; current-wallet incomplete states and links were checked on Sepolia in Chrome. The campaign is a view of existing on-chain state, not a new deployed achievement or reward contract.

Final regression gate: 61 frontend tests, zero failures, 508 assertions across 16 files; type-check and production build. No dependency additions, contract changes, deployment, token emission, wallet signatures or new transactions. Physical-device/Safari checks and a live PvP defender record remain outside the performed verification.


## Final completion audit

The expanded request is research plus implemented features in all three tracks, preserving the existing Sepolia game. The current code and verification above cover:

1. Tactics/PvP preparation: public scouting, correct perspective and keeper scope, replay, personal per-NFT playbooks and the complete three-encounter Cipher Trial with draft handoff.
2. Story/quests: three illustrated acts, six state-derived objectives, correct loading/incomplete states, preserved chronicle/Atlas, links to the existing daily rewards and a playable route into breeding.
3. Breeding/NFT: selectable target trait/rarity, genotype uncertainty bounds, mutation orientation comparison and parent swapping, plus direct Genome inspection and verified bred-lineage progress.
4. Confidentiality/fairness: no new secret fetch or public disclosure; the local trial is explicitly local; actual Zama transactions and existing ACL/scoring remain in the original contracts. Browser training and campaign projection do not create token/XP rewards.
5. Mobile/brand/motion: #FFD209 with neutral controls, live actor effects, checked 320px and centered 430px frames. Corrected the practice arena, Atlas and focus-induced outer scrolling defects observed during this work.
6. Final commands after source changes: 61 tests passed (508 assertions), type-check exit 0, production build exit 0. Existing large bundle advisory only.

All implementation and permitted verification tasks in this feature plan are complete. The verification limits above are explicit: no claim is made of a newly signed breeding/PvP transaction, physical-phone/Safari verification, or a new campaign contract. No publish/deploy is part of this objective.

The user-facing tab is left at #/journal, Act 3, with the current wallet's 3/6 observed objectives. Final screenshot: `tmpshots/campaign-restoration.jpg` (full 430px game frame); additional evidence remains in the screenshots listed above.
