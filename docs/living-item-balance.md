# Living encounter item pacing — 2026-11-18

## Scope

Tune the first cosmetic milestone, not the verified encounter reward stream.
Each eligible NFT retains one UTC-day trial, the existing hidden power/element
challenge, Zama entropy, win condition, drop table, packed result and proof.
Only a verified winning encounter adds materials; a loss grants/removes nothing.
No contract deployment, extra sponsor draw, player signature or new gas expense.

The first Trail lantern can be crafted for either:

- 3 Ash thread, or
- 1 Ash thread + 1 Archive fragment.

The owner explicitly chooses the recipe; the server checks and consumes that
recipe atomically. A first recipe is rejected once the NFT owns any lantern,
including a natural rare drop. Bags follow the NFT across ownership changes.
Current lanterns cannot be spent, transferred separately or deleted; the item
itself therefore persists as the first-craft entitlement marker. Any future
lantern consumption/transfer feature must introduce a durable milestone flag.

Standard 5 thread + 2 fragments remains supported for older clients and later
crafts. The current UI hides crafting after a lantern exists because additional
identical cosmetics have no gameplay use. Explicit discount choices are required;
a cached client without a recipe keeps its original standard price.

The server supplies recipe quotes and the UI shows owned/required quantities,
missing materials, disabled readiness and craft/equip feedback. Existing inventory,
confirmed receipts and claimed rewards are not rewritten or backfilled.

## Pacing model

Exact enumeration of all 8192 relevant entropy patterns, per fixed hypothetical
power/element, followed by a daily inventory-state probability calculation.
Equal fixed Ember/Spore/Tide cohorts are mixed after calculation (element does not
reroll daily). The first-craft calculation assumes choosing an affordable recipe
and keeping materials until crafting. This is a planning model, not observed
population analytics or a guarantee. Hidden real NFT profiles are never read.

| Fixed hypothetical power | Old median daily trials | New median daily trials | New completion by trial 5 |
| --- | ---: | ---: | ---: |
| 50 | 34 | 8 | 24.5% |
| 60 | 19 | 5 | 61.2% |
| 75 | 15 | 4 | 82.6% |
| 90 | 12 | 3 | 97.5% |
| 105 | 10 | 2 | 99.7% |

Daily trials may be delayed by snapshot eligibility, NFT escrow, RPC/KMS or the
sponsor budget. The model excludes these delays. Low-power NFTs still take longer;
there is no loss consolation, guaranteed loot or random outcome override.
Rare natural lanterns retain the original onchain gate and probability.

## Verification

- New backend behavior: observed RED, then GREEN; full backend 62 passed.
- Frontend 110 passed; TypeScript, production build, changed-file lint passed.
- VPS Chromium: 320×740 insufficient materials/disabled action; 390×844 fragment
  recipe; 1440×900 thread recipe. Actual Express keeper router and in-memory SQLite
  store consumed only selected costs, denied discount reuse, and equipped crafted
  lanterns. Test rewards are seeded fixture results; no real chain writes.
- No browser errors or horizontal overflow. Existing current-owner, same-origin,
  atomicity, duplicate reward, malformed proof/result and account tests pass.
- AshenkinEncounters.sol byte-identical to live source (SHA256
  302aae44e8487c92c5c7ed71a7c9a6c6aa599b83db4416910b14ad58649db7e0).
- Draft image ashenkin:loot-balance-20261118-1040, SHA256
  9c5395f6919cbcf6c38790cbc9ed8214bd03da58a3ef2a9fb432b0d182ac920a.
- Evidence and reproducible pacing script:
  /opt/ashenkin/auth/loot-balance-20261118.

## Public release verification

Publishing authorized and completed on 2026-11-18. Live image is
ashenkin:loot-balance-20261118-1040. Previous image, config and online SQLite
backup are retained privately under /opt/ashenkin/auth/loot-balance-20261118/before.
The keeper environment config is byte-identical to its pre-release backup.

VPS Chromium checked the real site and existing QA NFT #15 at 320×740,
390×844 and 1440×900: both quoted costs and inventory readiness are correct,
no overflow or browser errors, no POST writes and no inventory changes.
No real craft was performed on the public NFT. Craft/equip mutations were
verified against the actual router and SQLite in the isolated test run above.
Health endpoint returned OK; container healthy. No blockchain transaction sent.
Evidence: live-check.log, browser/live-check.json and live-crafting-*.png.
Temporary QA cookie copy removed after verification.
