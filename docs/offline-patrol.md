# Offline patrol

**Superseded prototype.** The owner rejected delegated gas-paid patrols in favour
of automatic Living NFT encounters. Production startup and player navigation no
longer enable this prototype. See `living-nft-mvp.md` for the approved feature.

Build an opt-in camp inside Expeditions. A keeper delegates a fixed NFT, route,
1–6 trips and a maximum Sepolia ETH gas budget for eight hours. The server runs
without an open browser. Existing expedition contracts provide NFT escrow,
encrypted Zama randomness, XP and Treasury-capped loot. No new token issuance,
decryption authority, wallet type, automatic top-up or contract deployment.

## Delivery order

1. Persistent SQLite patrols, transaction intents and a recoverable scheduler.
   Test restart, simultaneous workers, stopping, expiry, failure and fee caps.
2. Chain adapter checks ownership, training/defence/Depths conflicts and daily
   limits. Circle execution enforces the mandate's remaining budget before send.
   An ambiguous submission is reconciled, never blindly repeated.
3. Authenticated camp endpoints share the keeper's existing same-origin session.
   Lock conflicting manual actions while a patrol controls the NFT. Logout does
   not cancel an explicit mandate; stop prevents new trips but returns away NFTs.
4. Mobile camp scene, route/trip selectors, explicit permission and gas cap,
   real progress and persistent journal, sealed reports linked to Expeditions.
5. Run backend regression tests, frontend type check/build and browser checks at
   small/mobile and large window sizes. No live account gets an active mandate
   as a side effect of installation. Live publishing/execution is separate from
   local implementation and needs existing or explicit authorization.

## Invariants / acceptance

- A session or mere login never permits autonomous spending. Start requires the
  exact consent version and validated route, owned NFT, count and budget.
- One active patrol per keeper; committed intents and leases survive restart.
- A pending/unknown Circle request prevents any further send. Receipt success
  and actual gas expenditure are checked before progressing.
- Gas reservations leave a conservative return allowance before dispatch; every
  send, including retries/failures, counts against the authorized gas budget.
- Stop/expiry/daily quota never strand an already-away NFT. Insufficient gas or
  provider outage is visible and retryable; a manual return remains possible.
- The worker never fabricates loot or decrypts reports. Trail checkpoints are
  narrative milestones, not additional random rewards.
- Existing gameplay and data remain intact. No extra dependencies are needed.

Expected checks: `node --test lib/*.test.js` in backend; `npm run type-check`
and `npm run build` in frontend; isolated browser interaction/animation checks.
Record observed results here after implementation.

## Verified locally — 18 November 2026

- `node --test lib/*.test.js`: **34 passed**, including 17 patrol cases for
  opt-in/ownership/session isolation, SQLite reopen, two workers, stale leases,
  lost acknowledgements, gas limits/reserved return gas, expiry, cancellation,
  reverted receipts, repeated event verification and batch fairness.
- `bun test tests` in frontend: **103 passed**. `npm run type-check` and
  `npm run build` passed. Build retains the existing large-bundle warning.
- Isolated headless browser: 320×740, 390×844, 1440×900 and 844×390. Checked
  consent, begin, stop, manual-return navigation, animations, reduced motion and
  no horizontal overflow; zero page errors. Camp API was a fixture; NFT reads
  used public Sepolia data and previously verified public phenotype cache.
- `node scripts/check-patrol-chain.js`: read-only validation of real prior
  departure/return receipts, contract timestamps, all three generated calls and
  live availability checks. **No new transactions or signatures.**
- No VPS deployment or live autonomous patrol was performed. A full new Sepolia
  trip with the browser closed remains the runtime acceptance check after
  deployment/execution authorization. Tests with mocked providers do not prove
  Circle signing, a future fee quote or live payout availability.

## Player and operations behaviour

Find **Offline patrol** in the Expedition Gate; **Single expedition** keeps the
manual flow. Choose a wallet-held NFT, route and 1/3/6 trips in the UI (API accepts
1–6). Consent lasts eight hours. The gas budget is 0.004–0.05 Sepolia ETH, default
0.01, paid by the player's Circle game wallet. The worker caps quotes at 0.1 gwei
and reserves 0.0016 ETH before approving/dispatching for a conservative return.
Unused ETH stays in the wallet. There is no automatic top-up or cZAMA spending.

The app server polls every ten seconds. SQLite and its existing Docker volume
hold jobs, consent, journal and transaction intents. Each lease lasts two minutes
and renews every twenty seconds; a killed process may therefore need up to two
minutes before a replacement resumes it. Run one app replica as in the current
compose deployment: worker fencing is database-backed, while coordination with
manual HTTP submissions uses the keeper store's per-process serialization.
Multiple app replicas would require a shared cross-process admission lock first.

Stopping or expiry prevents another launch but retains narrow return authority
for an already-away NFT. A pending departure may still complete. An unresolved
provider acknowledgement is never resubmitted automatically. Failed transactions
pause the job; the owner can stop it and use the existing manual return after
any pending action is resolved. Provider outages, lack of wallet ETH or fees over
the selected cap can delay a return; the interface does not promise a fixed time.
Trail checkpoints are narrative progress, not extra RNG rolls or token rewards.

Receipt evidence (existing audited trip, read-only replay):
- Departure: `0x629de8d3926f984cd905f1b0f1f6900c56203320c378f84ddc35cc50ed13c9ca`
- Return: `0xa05cba9709c67b7ec66709e482bd334b6a8e71945ea7b02ef883779b89ce13ef`

Circle custody behaviour follows the existing developer-controlled EOA
integration; the worker uses the
[official smart-contract execution flow](https://developers.circle.com/api-reference/wallets/developer-controlled-wallets/create-developer-transaction-contract-execution)
with explicit gas parameters and persistent idempotency/reference IDs.
