# First steps and returning stories

Sign in with wallet or email and restore the linked Circle game wallet. The
hosted tutorial follows **Gas → Hatch → Fight → Life**. The sign-in wallet is an
identity credential; NFTs and gameplay ETH belong to the linked game wallet.
An owned NFT is required for gameplay, including local practice. Guests can
browse guides, metadata and settled replays and check public proofs.

| Step | What the player does | Completion condition |
| --- | --- | --- |
| Gas | Use the faucet when the game wallet needs ETH. | The wallet can cover mint gas. Faucet grants 0.002 Sepolia ETH per account per rolling 24 hours while funded, with no server-wide daily cap. |
| Hatch | Select Hatch embryo in the Lab. | A confirmed mint creates an NFT owned by the game wallet. |
| Fight | Choose the champion and three moves, then Start a hunt. | A three-round hunt is settled, win or lose. Ordinary opponents are reserved per keeper; rare sightings remain shared. |
| Life | Open Living Xenos and replay an available story. | The introduction flag is saved, and an existing verified story becomes seen only when its result appears. |

Circle signs allowed hosted contract calls on the server. Minting and a live hunt
still use Sepolia gas; the interactive sponsor pays public settlement separately
from offline encounters and faucet funding. A hunt can remain pending while Zama
or Sepolia processes it. Resume from Inbox or Battle log after reloading. Practice
and Beacon are optional after NFT ownership and do not award onchain rewards.
[Transactions and recovery](transaction-design.md) · [Faucet](daily-gas-faucet.md).

New NFTs may wait for a later UTC population snapshot before their first Living
trial. Sponsorship limits can postpone it. A verified win gives ordinary items;
a loss takes nothing. No tutorial step fabricates a daily event or a reward.
[Living encounter rules](living-nft-mvp.md).

A server account flag records introduction to Living Xenos. Seen encounter rows
are scoped to keeper + world + NFT + day and require current ownership and an
existing verified result. A replay is marked seen only when its result appears.
Map reminders show real unseen stories and already-earned rewards. Opening a
page, loading art or receiving rewards never silently dismisses the story.

[Latest repository verification](verification.md). The following evidence records
the original tutorial release; its test counts and image describe that dated run.

## Verification — 2026-11-18

- Backend: 58 tests passed, including current ownership, same-origin writes,
  account isolation and idempotent story acknowledgement.
- Frontend: 108 tests passed; TypeScript, production build and changed-file lint passed.
- Headless Chromium on VPS: complete fixture journey passed at 320×740,
  390×844 and 1440×900, without browser errors or horizontal overflow.
- Fixture journey covers faucet-to-mint readiness, NFT-to-fight progression,
  a settled battle regardless of outcome, Living introduction, replay result
  acknowledgement and removal of the returning story reminder.
- Browser fixtures do not send real faucet, mint or battle transactions.
- Evidence: /opt/ashenkin/auth/first-steps-20261118.
- Release image: ashenkin:first-steps-20261118-0950
  sha256:7f27398096d103e51d54ce672d1b5ccf32735a385de5d672f7c5e299514f9810.
- Public deployment authorized and completed on 2026-11-18. The image at that release was
  ashenkin:first-steps-20261118-0950; previous image and SQLite backup are
  retained under /opt/ashenkin/auth/first-steps-20261118/before.
- Live https://ashenkin.xyz check passed using the existing QA account:
  unseen count 2 → 1 after replaying NFT #15; opening alone kept it unread;
  introduction and seen state survived reload; guest page loaded at 1440px.
  No browser errors, horizontal overflow or financial POST actions.
  Only QA introduction and one seen-story record were changed.
- Health endpoint returned OK and container is healthy. Evidence: live-check.log
  and browser/live-check.json. Temporary QA cookie copy removed after testing.
