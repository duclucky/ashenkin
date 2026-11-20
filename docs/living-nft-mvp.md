# Living Xenos: daily encounters

Eligible owned NFTs automatically experience up to one challenge per UTC day,
whether their keeper is online or offline. Zama randomizes the encounter,
difficulty, luck and loot. FHE compares hidden power and element with difficulty.
A verified win adds ordinary items; a loss has no debit, injury, XP loss or NFT
transfer. The operator pays draw gas; the player does not sign or claim each
result. This is the live Living Xenos feature, separate from single expeditions.

## Contract and result flow

`AshenkinEncounters` is deployed at
[0xf2aAf9a3dc7b1a58013117f4712ee6214D8F73E4](https://sepolia.etherscan.io/address/0xf2aAf9a3dc7b1a58013117f4712ee6214D8F73E4#code).
The Lab grants it combat-profile access; it does not hold or transfer the NFT.
Only the packed encounter/loot result is publicly decryptable. Power, element,
luck and comparison inputs remain under their FHE permissions.

1. The worker selects eligible wallet-held NFTs from the daily minted-ID snapshot.
2. It persists a signed raw transaction and hash before broadcasting. Restart or
   a lost acknowledgement reuses those bytes, never rerolls an unknown result.
3. After the inclusion block plus two more blocks, it reads the receipt, obtains
   the public Zama result and verifies its KMS proof through contract `verify`.
4. SQLite atomically records that world/day/NFT result and credits any item once.
   Replay, restart and duplicate proof submissions cannot credit it again.
5. The Life screen shows the verified story, proof and NFT bag. A replay presents
   the existing outcome; it does not request a new roll.

The ordinary inventory ledger is server-authoritative. Proof verification shows
the contract outcome, not trustless custody or redemption of backend items.
[Confidentiality and operator powers](confidentiality.md).

## Daily rules and loot

- One trial per NFT per UTC day. Login does not trigger, reset or skip it, and
  missed days cannot be farmed retroactively.
- Tier draw: 50% gentle / 37.5% daring / 12.5% formidable, difficulty 60/95/130.
- Hidden gene power plus training/relic bonus, element advantage 20 (Void 10)
  and encrypted d16 determine success with `>=`. Scores and rolls stay hidden.
- A win grants Ash thread (1/2/3 by tier), an Archive fragment on 3/16 loot rolls,
  or a Trail lantern on the highest tier with loot roll 0. A loss grants nothing.
- Narrative templates are Signal beneath the ash, Keeper of the crossing and
  Footprints in the hollows.
- Items and history follow NFT ownership. Only the current owner can use its
  account view. Escrow/arena/market-held NFTs are skipped while unavailable.
- NFTs minted after the day's population snapshot wait for a subsequent day.
  Budget, fee ceilings or RPC/KMS problems can postpone draws. Daily loot is
  not guaranteed. The battle profile is read at draw time, not at midnight.

The first cosmetic Trail lantern costs **3 Ash thread** or **1 Ash thread +
1 Archive fragment**. It has no token redemption or combat bonus and is distinct
from the Depths door-reading lantern. [Recipes and pacing](living-item-balance.md).
Opening the Life page alone does not mark a story seen; replay must reach its
result. [Tutorial and returning reminders](first-steps.md).

## Hosting and recovery

The recurring worker polls once per minute and starts with one pending draw.
The contract supports batches of up to two NFTs. Its offline signer is separate
from interactive settlement and faucet funding. An unresolved offline transaction
blocks another draw from that signer, without blocking the dedicated interactive
signer. External scripts must not independently spend from a managed signer.

The service uses `ASHENKIN_ENCOUNTERS_ADDRESS`, `ASHENKIN_LIFE_WORKER=true`,
`ASHENKIN_LIFE_DAILY_ETH=0.005` and `ASHENKIN_LIFE_MAX_GWEI=0.1`; the budget is a
maximum, not a promise to process the entire population. SQLite and signed
transaction state persist in the keeper volume. The deployed setup has one app
replica and durable worker leases. A nonce consumed outside its journal requires
operator reconciliation; a deeper reorg can require inventory reconciliation.
[Configuration and backups](configuration.md#optional-funding-services).

The old delegated patrol prototype is disabled in production startup and player
navigation. Living Xenos needs neither a player-selected route nor an eight-hour
gas-spending mandate.

## Tests

Run the repository checks in [verification](verification.md). The focused contract
suite is `npx hardhat test test/AshenkinEncounters.ts` from `contracts/`, using the
FHEVM mock. It covers rules, hidden ACLs, loss/win, duplicate/cross-NFT proofs and
the real backend worker's exactly-once item credit. Backend tests cover budgets,
scheduling, ownership and crash recovery. Mock tests do not measure live FHE fees.

The following sections retain the measured evidence from the initial release.
Their image names and counts describe that release, not the latest running image.

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
  At this pre-release check, the dry-run script had not broadcast and the worker
  had not yet been enabled. The authorized deployment evidence follows below.

Evidence: `uploads/living-contract-tests.log`, `living-contract-focused.log`,
`living-backend-tests.log`, `living-frontend-tests.log`, `living-build.log`,
`living-deployment-quote.json`, `living-ui/result.json` and its scene screenshots.


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
