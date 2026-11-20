# Current Ashenkin release

Reviewed against the deployed game and source on **20 November 2026**. This page
is the current reference; dated research, plans and QA reports retain their
original measurements and release history.

## Player flow and ownership

Sign in with wallet or email, fund the linked Circle game wallet when needed,
mint an NFT, then follow **Gas → Hatch → Fight → Life**. The sign-in wallet is an
identity credential for hosted play; the linked Circle wallet holds the NFTs and
pays for its game transactions. Returning with the same identity restores it.
An owned NFT is required for gameplay, including local practice. Guests can read
guides, inspect metadata and verify existing replays without playing a new match.
A separately configured standalone deployment can use an external wallet directly.

The daily faucet supplies **0.002 Sepolia ETH per account per rolling 24 hours**
while funded, with no server-wide daily cap. Its wallet is separate from both
interactive settlement and offline encounter sponsorship. Test ETH, test cZAMA
and ordinary inventory items serve different purposes.

## Colosseum hunts

**Start a hunt** reserves an idle ordinary wild NFT for the signed-in keeper, or
uses `explore` to generate a new one when capacity permits. It does not require
another player online. Shared rare sightings are a separate list: at least two
of the seven public appearance traits must be Rare/Mythic. This is an appearance
filter, not disclosure of hidden genes or a guarantee of combat strength.

The backend binds a reservation to the keeper, champion and fixed calldata.
Unsubmitted reservations expire after five minutes; bound requests with an
unknown submission remain protected while reconciled. Reservations coordinate
the hosted path, not direct public contract callers. A single NFT cannot be
captured by two hunters; shared sightings can still become engaged.

The hosted Colosseum is configured with `maxRoaming = 10,000` and a 180-second
battle cooldown. The Lab population ceiling remains 10,000. The contract source
default is still 24 roaming slots: a new deployment needs explicit owner
configuration. Available population and each champion's cooldown still apply.

## Signatures, gas and settlement

Circle signs allowed hosted calls on the server. External wallets sign their own
calls. Backend stories, practice and cosmetic crafting do not submit gameplay
transactions. Minting, opening a live hunt, breeding and other contract actions
still consume Sepolia gas; fewer popups does not mean fewer chain transactions.

A hunt has opening and settlement transactions with FHE/proof work between them.
The configured interactive sponsor pays for public battle, egg and training
settlement. It is separate from the offline encounter signer and faucet. Its
persistent journal allows up to eight pending transactions and allocates unique
nonces without waiting for each earlier receipt to mine. Lost acknowledgements
reuse the same signed transaction hash, not a fresh signature. The journal marks
finality after the inclusion block plus two more blocks. The UI still reads the
receipt and expected event before displaying a successful result.

The browser retries explicit pre-signing busy refusals up to three times. A
network error with an unknown outcome requires reconciliation, not a blind new
submission. Reloaded pending actions can be resumed from the Inbox or battle
log. This is not a guarantee of instant confirmation: RPC, Circle, Zama and
Sepolia can still delay an action. Without a dedicated interactive key, the
backend retains conservative shared-signer behavior.

[Transaction design](transaction-design.md) · [Sponsor configuration](configuration.md#optional-funding-services).

## Economy and Living Xenos

Breeding preserves both parents. The introductory egg requires no lineage charge;
later breeding requires a charge from voluntary, permanent NFT retirement through
Ascension. Population headroom, payment, cooldown and breeding limits still apply.
Treasury rewards use a bounded daily budget, not unlimited token emission.

Eligible wallet-held NFTs receive at most one sponsored Living challenge per UTC
day, whether the owner is online or offline. New NFTs may wait for a later daily
population snapshot. Zama generates encounter, difficulty, luck and loot; FHE
checks hidden power and element. A verified win credits ordinary items to the
NFT's bag; a loss removes nothing. Sponsorship limits can postpone draws. Owners
do not sign or claim each daily result. This replaces the delegated patrol
prototype, which is not active in player navigation or production startup.

The first cosmetic Trail lantern costs **3 Ash thread** or **1 Ash thread +
1 Archive fragment**. It grants no combat power or token yield and is distinct
from the Depths door-reading lantern. Bags follow NFT ownership. The backend
verifies encounter proofs before crediting its server-authoritative inventory.

[Item pacing](living-item-balance.md) · [Privacy and operator trust](confidentiality.md).

## Release evidence and history

The public game uses the Ashenkin contract set linked in the
[root deployment table](../README.md#sepolia-deployment). All 16 application
contracts were source-verified on three explorers on 19 November. The current
settlement change does not redeploy contracts or change NFT ownership rules.
Internal `Chimera*` code names and the `original`/`v2` worlds are retained for
historical NFT and proof compatibility; the default entry is Ashenkin.

See [verification](verification.md) for dated tests and live receipts. Old image
names, balances, test counts and pending branches in historical reports describe
their recorded run, not today's deployment. The owner reported the competition
submission complete; the old [submission preparation checklist](submission.md)
is retained as a record, not a new outstanding work list.
