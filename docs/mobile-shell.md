# One fluid mobile game surface

The game uses one mobile layout on phones and desktop Chrome. Its width is 100% of the available window up to 430px. On wider windows it is centered. No iframe, screenshot scaling or browser zoom is involved; wallet integration remains in the original document.

Implementation:

1. Make the app a named inline-size container. Existing layout breakpoints query the game container instead of the browser window. Use container units for scene typography and geometry.
2. Keep a fixed-height application surface using the dynamic viewport height, with a scrolling content area, persistent header and four primary destinations at the bottom. Keep overlays, toasts and transitions inside this surface; preserve safe-area insets and route scroll resets.
3. Check 320px, 375px, 430px and wide Chrome windows, including short/landscape windows. Verify the roster, nursery selection, specimen sections, menu, wallet, Inbox, proof and battle replay; run relevant tests, type-check and build.

Do not change contracts, wallet permissions, motion policy or transaction behavior as part of this layout change.

## Verification (14 November 2026)

| Chrome viewport | Game width × height | Horizontal page overflow |
| --- | --- | --- |
| 320 × 568 | 320 × 568 | None in Arena, Nursery and specimen Genome after fixing a rigid trait column |
| 375 × 812 | 375 × 812 | None in Arena, Lab and proof drawer |
| 430 × 932 | 430 × 932 | None in Arena |
| 768 × 430 | 430 × 430 | None; the menu ends at the bottom navigation and scrolls internally |
| 1440 × 900 | 430 × 900, centered | None in Arena; Inbox and replay use the same 430px frame |

- The bottom navigation remains at the game surface's bottom edge at all measured sizes.
- Changed a 120px genome column to fluid columns after observing 337px content inside a 310px content area at the smallest size; rechecked at 310/310.
- Both Nursery roster entries including A/B badges fit at 320px (284px content / 284px available).
- Menu and wallet surfaces have height limits that reserve navigation and safe-area space.
- Replay #19 reached 3–0 with sealed opposing commands, then resized from wide Chrome to 375px without losing the result. Verify the rounds opened the proof drawer inside the frame.
- Lab bottom navigation reset the content scroll position to zero. Habitat → specimen #30 travel worked from a centered desktop frame; Genome remained selected after resizing to 320px.
- The transition coordinate regression was reproduced (desktop click used page coordinates) and corrected with a game-relative origin. Two new unit tests pass; full frontend suite: 27 passed, zero failures.
- Type-check and production build pass. Vite's pre-existing large wallet/FHE chunk advisory remains.
- No contract changes, wallet signatures, new transactions or wallet network changes. These are Chrome viewport checks, not physical-device or Safari checks.

References: [Tailwind custom variants](https://tailwindcss.com/docs/adding-custom-styles), [container queries](https://tailwindcss.com/docs/responsive-design).

## Zama color roles — 14 November 2026

Source: [official Zama Brand Kit](https://www.zama.org/zama-brand-kit). Core colors are #FFD209, #000000, #2D2D2D, #F4F4F4 and #FFFFFF.

Yellow is now a major surface in the header, location strips, active bottom navigation and roster selections. UI backgrounds, cards, menus, wallet panels and battle reports use neutral black/charcoal/white/light gray instead of the former olive/cream palette. Character traits, game scenery and semantic battle feedback keep their gameplay colors.

Chrome computed styles confirm header, location and selected navigation backgrounds are rgb(255, 210, 9); the regular play surface is rgb(244, 244, 244). Nursery content remains 420px within its 420px content area. No geometry, wallet permissions or transaction behavior was changed by this palette pass.

Palette QA: Map, Lab, Nursery selection and settled battle replay checked in Chrome. A 320px Lab viewport retains 310px content inside its 310px scroll area, and computed yellow remains #FFD209 on the header, title strip and selected navigation. Type-check and production build passed.


### Follow-up: shared controls and legacy UI colors

After checking the live Chrome page, the shell was already yellow, but three-command planning still mixed brown, teal and purple. The shared command queue and selected move now use #FFD209 with black ink; inactive command icons use charcoal and white. Move chips keep distinct icons and STR/GRD/FNT labels without separate decorative palettes. Selected mode tabs use the same yellow/black state.

Legacy #FFDD00 and cream utility classes in the secondary screens, practice, travel and battle overlays now reference the shared yellow/gray tokens. Pending notices use yellow/black, success notices use black/yellow, and the battle tip label uses black/yellow. Error and battle outcome colors retain their semantic meaning, as do pixel scenery, NFT traits and spell effects.

Verification: Chrome computed styles confirm #FFD209 for the active command, round, mode, header and location strip. At 320px, Arena and Breed each have 310px scroll content within a 310px available content area. At the regular desktop window, the centered frame remains 430px. Type-check and production build pass (existing large-chunk advisory only). No wallet signatures or transactions were triggered.
