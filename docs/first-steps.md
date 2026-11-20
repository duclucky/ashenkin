# First steps and returning stories

> Historical design / QA record. Dates, test counts, images, balances and open
> branches below describe that run. For the current player flow, deployment and
> sponsor behavior, see [Current Ashenkin release](current-state.md).

Scope: signed-in Circle accounts follow free gas → first NFT → settled first
hunt → Living Xenos. Existing practice and Beacon remain optional routes.
Reuse current onchain evidence; no extra transactions/rewards for tutorial steps.

A server account flag records introduction to Living Xenos. Seen encounter rows
are scoped to keeper + world + NFT + day and require current ownership and an
existing verified result. A replay is marked seen only when its result appears.
Map reminders show real unseen stories and already-earned rewards. Opening a
page, loading art or receiving rewards never silently dismisses the story.

Implement on the VPS, test pure progression/ownership/read-state and responsive
journeys using fixtures, then verify existing real accounts without any player
transaction. Preserve the running faucet and living-world worker.

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
