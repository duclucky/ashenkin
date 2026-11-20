# Living NFT: daily encounters

> Historical design / QA record. Dates, test counts, images, balances and open
> branches below describe that run. For the current player flow, deployment and
> sponsor behavior, see [Current Ashenkin release](current-state.md).

Approved scope: every owned NFT automatically experiences up to one daily
challenge, online or offline. Zama randomizes encounter, difficulty, small luck
roll and loot. FHE compares the existing hidden battle power/element against
difficulty. A loss has no debit, injury, XP loss or NFT transfer. Rewards are
non-transferable backend items attached to the NFT. No player signature or gas.

## Implementation

1. New independent `AshenkinEncounters` contract, not an upgrade of the Lab.
   The Lab owner must grant it `setCombat` to access transient encrypted battle
   profiles. Fixed rules, one result/NFT/UTC day, bounded batches and a minted-ID
   snapshot before the first draw of each day. Publish only the packed encounter
   result; never grant decryption of power, element or random input.
2. SQLite encounter store and sponsor worker. Persist a signed raw transaction
   and its hash BEFORE broadcast, recover receipts after restart, never replace
   an ambiguous request with a new roll. Enforce daily gas cap, RPC fee ceiling,
   per-transaction gas ceiling and one instance lease. No player-wallet signing.
3. Decrypt final result with Zama; verify its KMS proof by read-only contract call
   before atomically crediting items. Replay/restart cannot duplicate rewards.
   Persist failed and victorious encounters plus receipt/proof for inspection.
4. A Living NFT screen with animated story replay, resident activity and item
   bag; link it from the map and creature life story. Keep single expeditions
   intact. Remove the obsolete delegated patrol from player flows and startup;
   retain its local files as superseded work rather than deleting them.
5. Contract tests cover hidden ACLs, rules, win/loss, duplicate/cross-day draws,
   batch bounds and proof forgery. Backend tests cover crash recovery, budgets,
   daily scheduling, ownership, proof failure and exactly-once item credit.
   Frontend type/build/tests plus responsive isolated browser interaction.

## Rules v1

- One daily trial, 00:00 UTC day index. No offline-only advantage; login does not
  trigger/skip/reset it. No retroactive farming for missed days.
- Tier draw 50% gentle / 37.5% daring / 12.5% formidable; difficulty 60/95/130.
- Hidden gene power + existing training/relic bonus + element advantage 20
  (Void 10) + encrypted d16. Success uses >=. No scores/rolls are published.
- Winning loot: Ash thread (1/2/3 by tier), an archive fragment on 3/16 rolls,
  or a lantern cosmetic on the highest tier and a 0/16 loot roll. No payout for
  a loss. These items have no token redemption or onchain power effect in v1.
- Three narrative templates: Signal beneath the ash, Keeper of the crossing,
  Footprints in the hollows. Replay uses the verified result, not new randomness.
- Items/history belong to NFT identity; a new owner inherits the bag. Only the
  current wallet holder may read/use its account view. Escrow/arena/market-held
  NFTs are skipped until available; eligibility is rechecked before scheduling.

## Release boundary

Implement and verify locally first. The superseded patrol deployment approval
was explicitly stopped and does not authorize deployment of a new contract.
Keep encounters disabled without a configured deployed contract. Do not deploy,
modify live Lab permissions or spend sponsor gas until the concrete release is
reviewable and the user authorizes those actions.

Expected checks: `npx hardhat test test/AshenkinEncounters.ts` in contracts,
`node --test lib/*.test.js` in backend, `bun test tests`, `npm run type-check`
and `npm run build` in frontend. Record actual evidence below after execution.

The backend item ledger remains server-authoritative. KMS verification proves
the contract result, not trustless custody/redemption of backend inventory.

## Verification — 18 November 2026

- Full contract suite: **128 passed**. Latest focused encounter suite: **6 passed**,
  including the actual backend adapter signing a local transaction, contract FHE
  execution, KMS proof verification by `eth_call`, persisted reward credit and a
  restart of the worker without a player session. FHE is the Hardhat mock network;
  this does not establish live Sepolia coprocessor/relayer timing or fees.
- Two-NFT draw: **10,011,472 global HCU / 1,895,000 depth**, within the existing
  20m/5m limits. Local mock gas **2,163,520**; do not treat it as a Sepolia quote.
- Backend suite: **49 passed** (15 focused living-world/sponsor tests). Includes
  same-byte transaction retry, verified-once item credit, daily cap/reset,
  provider read failure recovery, actor ownership, inheritance and atomic crafting.
- Frontend: **105 passed**, type check/build and lint of the new screen/rules
  passed. Existing build large-chunk warning remains.
- Isolated headless browser: 320×740, 390×844, 1440×900, 844×390. Three story
  replays, correct win/loss captions, crafting/equipment, forged proof rejection,
  pause and reduced-motion navigation, no horizontal overflow or page errors.
  Browser life API was a fixture; no transactions or wallet requests were made.
- Read-only Sepolia release quote succeeded using the actual Lab owner. No
  deployment or Lab ACL transaction was sent. Two public RPCs returned a bounded
  deployment estimate of **14,888,469 gas**; release gas limit capped at **16m**.
  The dry-run script defaults to no broadcast and the worker is not enabled live.

Evidence: `uploads/living-contract-tests.log`, `living-contract-focused.log`,
`living-backend-tests.log`, `living-frontend-tests.log`, `living-build.log`,
`living-deployment-quote.json`, `living-ui/result.json` and its scene screenshots.

## Concrete release

1. Back up the VPS keeper SQLite volume and preserve the current release image.
2. With the existing Lab-owner signer, deploy `AshenkinEncounters` on Sepolia and
   grant only `ChimeraLab.setCombat(newContract, true)`. This grants transient
   encrypted battle profile access, not NFT transfer or token spending authority.
   `contracts/scripts/deploy-living.ts` produces a public manifest; default is a
   read-only quote. Broadcasting requires `ASHENKIN_DEPLOY_LIVING=true`.
3. Deploy the checked backend/frontend. Set server-only configuration:
   `ASHENKIN_ENCOUNTERS_ADDRESS=<new address>`, `ASHENKIN_LIFE_WORKER=true`,
   `ASHENKIN_LIFE_DAILY_ETH=0.005`, `ASHENKIN_LIFE_MAX_GWEI=0.1`.
   The existing sponsor/deployer key is reused on the server, never in the UI.
4. Run one sponsored NFT draw first, with all player browser sessions closed.
   Verify real receipt, KMS proof, win/loss and exactly-once inventory. Measure
   actual gas before enabling the recurring worker for the collection.
5. The worker polls every minute, one NFT/draw initially. Contract accepts up to
   two NFTs, but the conservative worker starts with one pending transaction.
   Day/ID snapshots, results and inventory persist in the existing keeper DB.

Budget is a maximum, not a promise to cover every NFT: high fees, an exhausted
budget, an unavailable sponsor or an escrowed NFT can defer/skip a daily trial.
There is no historical catch-up farming. Today’s trial does not need a login.
The NFT’s training/profile is read at its actual draw, not snapshotted at 00:00.

The shared sponsor signing lane and durable pending blocker assume the existing
single app replica. External scripts using that signer must be coordinated during
release. An unresolved raw transaction deliberately stops new sponsorship rather
than spending again; operator reconciliation is required if its nonce was consumed
elsewhere. Two-block confirmation is used for MVP inventory; a deeper reorg would
require ledger reconciliation. Ordinary item state remains backend-authoritative.


## Live release — 18 November 2026

The user approved deployment and a 0.005 ETH Sepolia/day sponsor cap. All release
builds, tests and browser checks run on the VPS; do not build or run services on
the user's PC for subsequent work.

- Release source: `/opt/ashenkin/releases/living-20261118-0836`.
- Image: `ashenkin:living-20261118-0836`.
- Image ID: `sha256:d284c765874f858cc274c04744a8b7df86ab082865c63710dd5eea9f48f48770`.
- Live page: https://ashenkin.xyz/#/life
- Contract: `0xf2aAf9a3dc7b1a58013117f4712ee6214D8F73E4`.
- Deployment: `0x5d5da2d4a8d60765984034db5a51caf44b7ca98ebd7986a205db5c53415038a7`.
- Lab combat ACL: `0xa7fff4cdf031e80d5a1b5c905e4f96d3e9318625699bdea813d5f7a98e37efa0`.
- Enabled recurring server worker, 0.005 ETH/day, max 0.1 gwei.
- First real draw: `0x7e86e452e5348bb3a575c45e19cddee58703bb0e44b7243abdd7e8d1d18eceaa`.
  NFT #1 won one Ash thread, KMS proof verified and duplicate credit ignored.
- Recurring worker also recorded a real loss for NFT #3, code 6: no reward.
- All sessions used for the initial draw: zero. Player signatures: zero.
- On-VPS rerun: 128 contract, 49 backend and 105 frontend tests passed.
- SQLite backup and previous image/env are preserved under
  `/opt/ashenkin/auth/living-20261118/before`.
- Runtime acceptance, receipt/proof reports and browser evidence are in
  `/opt/ashenkin/auth/living-20261118`; private session material is not public.

Live browser acceptance passed at 390×844 and 1440×900: actual NFT #4 history, Archive fragment reward, KMS Verify button, animated replay, no horizontal overflow or page errors. Browser ran on the VPS, requested no wallet actions, and its temporary copied QA cookie was removed afterwards.
