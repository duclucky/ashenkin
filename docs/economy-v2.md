# Ashenkin economy: finite rewards and lineage circulation

Ashenkin's deployed Lab, Ascension, Treasury and Season contracts enforce these
rules on Sepolia. Parents survive breeding; permanent NFT retirement is voluntary.
The default game uses the [Ashenkin deployment](../README.md#sepolia-deployment).
The filename retains the earlier economy revision name; players do not need to
select a version to use these rules.

## Breeding, retirement and population

The keeper's introductory egg needs no lineage charge. Each later egg consumes
one nontransferable charge from permanently offering an owned spare NFT through
Ascension. The normal offering can grant XP and a charge; charge-only retirement
supports keepers who do not want XP or have reached the XP cap. Both paths check
ownership, defender status and equipped relics. The configured retirement vault
cannot release an offered NFT. Transfers cannot farm charges.

Breeding retains both parents and their inherited encrypted-genome mechanics,
fees, cooldown and seven-use limit. An unpaid egg refunds its charge/introduction
and releases its reserved population slot. Pending eggs reserve headroom. Retirement
releases a slot; a subsequent birth fills one. Starter embryos and wild spawns
can still add supply while population headroom remains. The global ceiling is
10000, including wild inventory and pending eggs; a lower configured ceiling
cannot strand existing reservations or exceed the hard limit.

Ordinary hunts reserve separate opponents per keeper; shared rare sightings
remain competitive. Captures transfer an existing wild NFT rather than minting a
second copy. The hosted Colosseum has `maxRoaming = 10000`, with a 180-second battle
cooldown. Its source default of 24 roaming slots applies to fresh deployments
until configured; the Lab population ceiling remains independently enforced.
[Hunt allocation and transactions](transaction-design.md#cấp-cuộc-săn).

## Treasury and seasonal payments

At the first payout of a UTC day, Treasury snapshots an encrypted budget of
`min(1% of current reserve, 3000 cZAMA)`. An actual payout is the minimum of the
request, available balance and remaining daily budget. The budget decreases by
the amount actually transferred; a deposit later that day does not reset it.
The next UTC day opens a new budget from that day's reserve. Individual balances
and requests remain encrypted; aggregate reserve/budget snapshots are public.

Season obtains one affordable pool and splits it proportionally across occupied
paid thrones. Rounding dust goes to the last eligible seat. Empty seats consume
no share, and settlement cannot pay twice. Configured target prizes are not a
promise to pay more than the available pool. Quests retain their nominal progress
targets but expose an encrypted actual payout receipt, including a valid zero.

Fees recirculate to the configured pools rather than burning cZAMA. Open testnet
mint/wrap supply is testing infrastructure, not earned operating revenue. The UI
reads actual contract capabilities, charges, headroom, budgets and receipts.
[Lab](../contracts/contracts/ChimeraLab.sol) ·
[Ascension](../contracts/contracts/ChimeraAscension.sol) ·
[Treasury](../contracts/contracts/ChimeraTreasury.sol) ·
[Season](../contracts/contracts/ChimeraSeason.sol).

## ETH, cZAMA and ordinary items

- **Sepolia ETH** pays chain gas. The separate daily faucet supplies 0.002 ETH
  per account per rolling 24 hours while funded, without a server-wide daily cap.
  The interactive sponsor pays public battle/egg/training settlement; the offline
  sponsor pays Living draws. Sponsoring changes the gas payer, not the gas used.
- **Test cZAMA** pays confidential game fees and contract rewards. It is distinct
  from ETH funding and ordinary inventory, with no redeemable income promise.
- **Living items** are server-managed materials and cosmetics earned only from
  verified winning daily trials. Loss removes nothing. Bags follow the NFT. The
  first lantern costs 3 Ash thread or 1 thread + 1 Archive fragment; it has no
  combat bonus or token yield. [Item pacing](living-item-balance.md).

## Verification and model

The [economy contract tests](../contracts/test/EconomyV2.ts) cover unpaid-egg
refunds, preserved parents, permanent retirement, headroom, bounded Treasury
payouts and UTC reset. The [full game QA](qa-2026-11-18.md) verifies live breeding,
training and market flows; [reward QA](qa-rewards-2026-11-18.md) verifies actual
season and other reward transfers. See [verification](verification.md) for the
latest suite results and the distinction between mocks and Sepolia evidence.

The reserve simulation starts at 300,000 cZAMA, adds the specified fees before each day's first payout, and spends the full allowed amount every day. Figures are rounded to whole cZAMA. The machine-readable inputs and outputs are in [economy-v2-simulation.json](economy-v2-simulation.json).

| Daily fees entering Treasury | Reserve after 30 days | After 90 days | After 365 days |
| ---: | ---: | ---: | ---: |
| 0 | 221,910 | 121,420 | 7,655 |
| 500 | 234,799 | 150,887 | 55,892 |
| 3,000 | 300,000 | 300,000 | 300,000 |


This model uses the stated starting reserve and fees, not today's live balance.
The 10000 cap, introductory allowance and payout parameters remain design choices
whose long-term balance needs player data. Wallet quotas are not Sybil resistance;
public reserve snapshots may reveal net outflow between observations.

## Existing worlds and new deployments

The public entry uses the Ashenkin contracts and `/api/ashenkin-nft` metadata.
`?world=original` and `?world=v2` retain historical NFT/proof access; IDs and Lab
keys are scoped to each world. Those records do not imply NFT, ciphertext or
balance migration between contracts. The deployed contracts are not upgradeable.

The current [deployment receipts](../contracts/deployments-ashenkin/sepolia.json)
and [full Sepolia QA](qa-2026-11-18.md) provide the published release and gameplay
evidence. Use those addresses for new play; historical v2 NFT IDs and measurements
belong to their own Lab, not the current Ashenkin collection.

## Mainnet scope

There is no audited mainnet economy or established cash-yield model in this
Sepolia release. A future funded prize season needs an announced asset, funded
pool, split and operating/gas budget before enrollment. Its payout obligation
must depend on already received funding or revenue, not future entrants. Such a
release requires separate implementation and verification; testnet rewards are
not evidence of sustainable mainnet income.
