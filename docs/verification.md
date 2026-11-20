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
restorable spies, and file isolation is enabled for repeatable CI execution.
The contracts job also installs backend dependencies for its worker integration
test. An older random-outcome hunt test now reuses the same rival NFT across
losses instead of exhausting the genesis mint cap. No contract rules were changed. The original
63 frontend warnings are reviewed debt: mixed component/helper exports, hook
subscriptions and unused expressions/imports. They are not silently suppressed or
claimed fixed. `npm run lint` permits warnings but fails on errors.

The November 19 patch results and deployed-bytecode comparison are recorded in
[the machine-readable check summary](verification-20261119/checks.json).

## November 20: hunts and pipelined settlement

The current backend passed **107 tests** and frontend passed **114 tests** on the
VPS, with frontend type checking and production build successful. Lint has zero
errors and the same 63 pre-existing warnings. These are dated results, not a
replacement for the latest [GitHub CI run](https://github.com/duclucky/ashenkin/actions/workflows/checks.yml).

The [settlement integration test](../contracts/test/SettlementPipeline.ts) opens
three fights on the local FHEVM mock, disables automining, broadcasts all three
settlements with consecutive nonces before any mines, then mines and verifies
all receipts and journal states. This is deterministic concurrency/recovery
coverage, not a measurement of live FHE latency.

Live Sepolia acceptance confirmed seven successful settlements from the dedicated
interactive signer. Three were included together in block **12173908**, and four
in **12173910**. For example, these transactions have consecutive nonces 0, 1 and 2
and share the first block:

- [Settlement 0](https://sepolia.etherscan.io/tx/0xe1be3d38d87d59829369c6b66ed12512849d3059ca36a56712e5653b13bea461)
- [Settlement 1](https://sepolia.etherscan.io/tx/0x528ebc665c9797e5dabcc9d4948f3cd1121cd5a5fbc804e72afa3638fa06cdbd)
- [Settlement 2](https://sepolia.etherscan.io/tx/0x8bb15c3aaf5613c30cf6a8ade54faec8701d305180a8a67ce56a9bb351cce6cd)

Their receipts and expected outcomes were checked independently over RPC, with
accepted Zama proofs and journal confirmation. Observed signing/broadcast-to-mining
intervals for the seven transactions were about **4–10 seconds**. This excludes
opening transactions and prior FHE/proof work; it is not an end-to-end latency
promise. No contract or NFT deployment changed. See [transaction design](transaction-design.md)
and [configuration](configuration.md#optional-funding-services) for signer
separation, receipt recovery and ordinary-hunt allocation.

The full contract suite passed **131 tests** on the VPS after isolating the
interactive integration signer from the earlier living-worker fixture. The first
CI run exposed their shared test account retaining a blocker for a closed SQLite
store. The integration now uses a separate funded Hardhat account, matching the
hosted signer separation; no production transaction code or contract changed.

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

## Explorer source verification — November 19

All **16 deployed application contracts** returned `Pass - Verified` from Etherscan.
A follow-up `getsourcecode` read confirmed each contract name, published source
and ABI, and constructor arguments matching its creation transaction. Sourcify
and Blockscout also completed verification for all 16.
[Addresses, creation transactions and explorer links](verification-20261119/source-verification.json).

Sourcify reports `creationMatch: match` and `runtimeMatch: match` for every contract.
The submitted inputs came from the original deployment build records: Solidity
`0.8.27+commit.40a35a09`, optimizer enabled with 800 runs, Cancun EVM and metadata
bytecode hash `none`. Both original build records were retained to reproduce the
creation code exactly. No contracts were redeployed and no new blockchain
transactions were sent for source verification.

These results establish correspondence between published and deployed code.
They are separate from behavioral tests, FHE privacy checks and an independent
security audit. The [deployment table](../README.md#sepolia-deployment) links
verified Etherscan source for every application contract.

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

Use the [five-minute walkthrough](judge-walkthrough.md) for pages, actions,
expected outcomes, pending-battle recovery and proof boundaries. It covers a new
NFT-to-hunt route and a read-only check of historical battle #1. Living encounters
are optional; a new NFT may need to wait for a later day.

The owner reports the competition submission is complete. Final pitch and X-post
links are managed by the owner and are not inferred from repository drafts. The
[submission preparation record](submission.md) retains the original checklist
separately from reproducible repository and source-verification checks.
