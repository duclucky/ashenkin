# Verification record

This page separates deterministic tests from live Sepolia evidence. All commands
and browser checks for the hosted project run on its VPS. The independent QA bot
is not part of the submitted game, its source or these test totals.

## Reproduce the repository checks

[CI](../.github/workflows/checks.yml) runs separate frontend, backend and contract
jobs on pushes and pull requests. It uses Node.js 22, Bun 1.4.0 and committed
lockfiles. No wallet secret, faucet grant or live transaction is needed for CI.

```sh
bun install --cwd frontend --frozen-lockfile
bun install --cwd backend --frozen-lockfile
npm --prefix frontend run lint
npm --prefix frontend run type-check
bun test --isolate --cwd frontend tests
npm --prefix frontend run build
node scripts/check-doc-links.js
node --test backend/lib/*.test.js
npm --prefix contracts ci
npm --prefix contracts test
```

The November 19 repository review began at commit
`4d4774069f1619fe8d5c0346bf131b38a380ea67`. That clean public clone passed 110
frontend, 74 backend and 128 contract tests (312 total), type checking and build.
The follow-up repository-readiness patch adds a control-character regression test
and repairs the two lint errors without disabling either rule. The first GitHub
run exposed a persistent module mock in the operator tests; it was replaced with
restorable spies, and file isolation is enabled for repeatable CI execution. The original
63 frontend warnings are reviewed debt: mixed component/helper exports, hook
subscriptions and unused expressions/imports. They are not silently suppressed or
claimed fixed. `npm run lint` permits warnings but fails on errors.

Current patch results and deployed-bytecode comparison are recorded in
[the machine-readable check summary](verification-20261119/checks.json).

## What was checked live on November 19

| Check | Evidence / interpretation |
| --- | --- |
| Public HTTPS demo and tokenURI | `check-demo-v2.js --release https://ashenkin.xyz 1 --require-uri` passed, including frontend entry, both FHE WASM assets, NFT JSON and SVG. |
| Fresh clone server | The same read check passed on an isolated server built from the public clone, without Circle or sponsor credentials. |
| Guest browser, 390px | How to Play, Proof Center, About and Wild Hunt #1 opened without page errors or horizontal overflow. |
| Guest proof | Three public KMS winner bits matched the settled Sepolia battle and the majority winner. No account, signature or new transaction was used. |
| Source/runtime consistency | Runtime bytecode for all 16 deployed application contracts matched the clean compiler output after masking constructor immutable ranges. This does not verify those masked values or establish an independent security audit. |

[Public battle #1](https://ashenkin.xyz/#/arena/log/1) ·
[Opening transaction](https://sepolia.etherscan.io/tx/0xdd102d9b3391f71ee5539ab71d9d0324823e5e3c9ccd1446ae05d8440f1aeddd) ·
[Settlement transaction](https://sepolia.etherscan.io/tx/0xab52e10d32f2b05bd0b3b4dc09fd58bd72a47bc869b1f02cddcc90b13c4e9d1e) ·
[Runtime comparison](verification-20261119/bytecode-comparison.json).

Explorer source verification could not be independently confirmed during this
review. Runtime comparison and an explorer's verified-source listing are distinct.
No new blockchain transactions were sent during this repository review.

## Earlier actual gameplay and privacy checks

- [Full Sepolia game QA, November 18](qa-2026-11-18.md): wallet identity recovery,
  mint, breed/hatch, hunts, PvP, expeditions, training, market and other activities;
  229 receipts with 226 successes and three expected throne-contest reverts.
- [Reward and ACL checks](qa-rewards-2026-11-18.md): 31 successful receipts for
  raffle, season prizes, Oracle jackpot/expiry and reward privacy. Test deadlines
  were shortened with authorization and original round durations restored.
- [Underlying reward verification](qa-rewards-2026-11-18/reward-final-verification.json)
  records live checks. [Owner privacy](qa-rewards-2026-11-18/reward-owner-privacy.json)
  tests that contract admin ownership alone cannot decrypt the current Oracle
  answer. It does not imply privacy from an operator controlling a player's wallet.

Historical QA files are dated snapshots, not claims that the same image or every
balance remains current. Tests may use known fixtures only on local chain 31337;
production genes, outcomes and rare-title thresholds are not overwritten.

## Known limits

- An organically rare NFT has not completed the successful rare-title claim on
  Sepolia. Local fixture tests exercise success and rejection boundaries.
- Offline encounters need sponsor budget and the daily population snapshot;
  newly minted NFTs may wait for a later UTC day. A loss gives no loot and no loss.
- Item bags and cosmetic crafting remain backend-managed. Contract proof checks
  establish valid outcomes, not a trustless inventory service.
- Wallet/email hosting depends on Circle, SMTP, RPC and Zama availability. The
  hosted operator controls game-wallet signing; see [the threat model](confidentiality.md).
- Mock test success is not end-to-end proof on Sepolia, a formal security audit,
  proof of mainnet economics, or a claim of production readiness under all loads.

## Judge path

1. Read [How to Play](https://ashenkin.xyz/#/guide).
2. Sign in, request gas if needed, mint an NFT, and complete one Wild Hunt.
3. If the tab closes, return to Battle log to settle the pending result.
4. Open [battle #1](https://ashenkin.xyz/#/arena/log/1) in a guest browser and choose
   **Verify the rounds → Verify all three rounds** to repeat the public check.
5. Read [Living Xenos](https://ashenkin.xyz/#/life) for ordinary daily items; this
   branch is optional for completing the first playable and verifiable match.

The owner handles the real-person pitch and published X post required by the
[competition](https://www.zama.org/post/zama-developer-program-mainnet-season-5-confidential-gaming).
