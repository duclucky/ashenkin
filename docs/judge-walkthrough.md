# Five-minute judge walkthrough

Use [ashenkin.xyz](https://ashenkin.xyz/). Five minutes is a review route, not a
confirmation-time promise. Blockchain and FHE services can take longer.

| Time | Action | Expected result |
| --- | --- | --- |
| 0:00–0:45 | Read [How to Play](https://ashenkin.xyz/#/guide), then sign in with wallet or email. | Your verified identity restores a persistent Circle game wallet. Its address can differ from the sign-in wallet. |
| 0:45–1:30 | Follow Gas → Hatch at the [Lab](https://ashenkin.xyz/#/lab). If needed, use the daily faucet, then Hatch embryo. | An owned NFT appears. Ownership and appearance are public; genes use Zama randomness and hidden traits have contract read permissions. |
| 1:30–3:15 | In the [Colosseum](https://ashenkin.xyz/#/arena), select the NFT, choose three moves and select Start a hunt in Wild hunts. | Complete a three-round hunt without needing another player online. Win or lose, settlement counts toward the first-fight tutorial. |
| 3:15–4:15 | On the settled battle, choose Verify the rounds → Verify all three rounds. | Public KMS results match the three Sepolia round bits and majority winner. |
| 4:15–5:00 | Visit [Living Xenos](https://ashenkin.xyz/#/life), replay an available story and check its proof. | A verified daily challenge may give ordinary items without a player claim transaction. Loss removes nothing. |

## Ownership, gas and recovery

An owned NFT is required to play. Guests may browse guides/metadata, replay old
matches and verify public results; this does not play a new match or earn rewards.
The faucet offers 0.002 Sepolia ETH per account per rolling 24 hours, subject to
funding. It supplies test gas, not cash income. Use the linked game-wallet address.

Circle signs allowed hosted game calls on the server. Minting and live hunts
still consume gas. Standalone external wallets authorize their own transactions.
A hunt has opening and settlement transactions with FHE/decryption work between.
Ordinary hunts allocate an opponent per keeper; shared rare sightings remain
competitive. The interactive sponsor pays for settlement independently of the
offline worker. It can broadcast multiple settlements before earlier ones mine;
this does not remove Sepolia or Zama processing time.
After a reload, resume Battle log → Awaiting reveal → Reveal rounds before opening
another hunt. The settled record determines the result; animation presents it.

## Immediate public proof check

Open [Wild Hunt #1](https://ashenkin.xyz/#/arena/log/1) as a guest and select
Verify the rounds → Verify all three rounds. Keliakor won rounds 1 and 2 and lost
round 3. This is a historical real match, not a new guest-played match.

The contract accepts settlement only after checking a KMS proof for stored battle
handles. The guest UI compares public results with that accepted record. It does
not reveal every random roll or independently re-execute FHE.
[Transactions and live evidence](verification.md).

## Why Zama matters

A public defender plan allows a challenger to counter each move. FHE scores sealed
plans and power, with a fresh encrypted 0–31 roll per side per round. Public round
winners decide the match; inputs remain governed by read permissions. NFT ownership
and appearance are intentionally public. Genome publication is optional.
[Privacy and fairness design](confidentiality.md).

Living encounters use Zama randomness and FHE hidden-strength comparisons. Newly
minted NFTs may wait for a later UTC population snapshot, and sponsorship limits
can postpone draws. Immediate stories or loot are not guaranteed. Ordinary bags,
crafting and cosmetics are backend-managed. Practice and story choices do not
claim FHE execution. The hosted operator controls Circle signing and inventory.
[Known limits](verification.md#known-limits) · [Item pacing](living-item-balance.md).

For code review: [setup](configuration.md), [tests and evidence](verification.md),
and [all verified contracts](../README.md#sepolia-deployment). Source verification
establishes code correspondence; it is not a security audit.
