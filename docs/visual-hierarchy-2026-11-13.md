# Visual hierarchy — 13 November 2026

> Historical design / QA record. Dates, test counts, images, balances and open
> branches below describe that run. For the current player flow, deployment and
> sponsor behavior, see [Current Ashenkin release](current-state.md).

## Implemented

- Shared compact location strip, consistent Zama yellow, quieter frames and a clear place for primary actions.
- Colosseum: actual champion and unknown opponent in the scene; a compact roster below; three-round commands and one hunt action in the adjoining console. Loading/error states do not pretend the roster is empty.
- Battle history: defaults to the connected keeper's fights, with an explicit all-fights filter. Public score and replay stay visible; wallets, commands, unsealing and proof are inside Details. Scores explicitly use challenger/opponent order.
- Battle result: one score, three compact round records, sealed opponent commands, actual reward/replay status and the existing next actions. Removed the duplicate result dialog and irrelevant transaction progress on replays.
- Lab: habitat takes priority; energy and hatch action are in the location strip. Collection cards and extended statistics are available in Collection details.
- Specimen: Overview, Genome, Trade and Life story sections; fight/breed access in the header. Publishing and sequencing remain in Genome with their existing wallet/confirmation behavior. Mobile secondary sections use a compact identity card.
- Nursery: two parents in a shared laboratory scene, selected A/B badges in the roster, one fee/action console and an optional inheritance forecast. Unknown alleles are explicitly an estimate. An incomplete selection, unavailable fee, cooldown, breeding limit, known insufficient balance or active action disables breeding.
- Arena and Nursery use the same reusable specimen roster. Displayed traits and stages come from existing public reads. Decorative unknown opponents/offspring do not imply a predetermined result.
- Mobile fixes: wallet tools fit the header, the lock icon keeps its intended size, specimen navigation stays in one row, and both selected parents fit the roster at 375px.

## Runtime checks

Chrome tab automation only; no desktop or mouse control.

- Champion #30/#31 selection and command auto-advance checked.
- History filter showed 2 keeper fights and 20 total fights. Details retained private-plan access and proof.
- Settled fight #19 replay reached 3–0 with Strike/Guard/Feint, opposing moves sealed, no new rewards. Back to the log closed the scene correctly.
- Result checked on desktop and 375px mobile.
- Specimen #30 Genome, Trade and Life story displayed their respective content; the public life story loaded the hatch and 3–0 hunt events.
- Nursery #31 + #30 showed parent A/B, 10 cZAMA fee and <1% Chimera estimate. Removing B disabled the action; all seven forecast rows remained accessible.
- Nursery mobile: roster client/content width both 334px at a 375px viewport; no document overflow. Temporary viewport overrides reset and QA tabs closed.
- World map inspected: mission, collapsed activity and distributed buildings retained. No additional map layout change was needed in this pass.

## Verification and boundaries

- Frontend tests: 25 passed, 0 failed; type-check and production build passed. Vite retains the existing large-chunk advisory for the wallet/FHE bundle.
- No contract changes, deployment, wallet signatures or new on-chain transactions.
- Existing wallet was observed on another network during UI QA; the wallet network was not changed. Live paid actions were not retested in this pass.
- Existing always-on game motion policy retained.
