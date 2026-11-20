# Current game information audit — 18 November 2026

> Historical design / QA record. Dates, test counts, images, balances and open
> branches below describe that run. For the current player flow, deployment and
> sponsor behavior, see [Current Ashenkin release](current-state.md).

Compared the deployed loot-balance release, current contracts, keeper API, and
source text visible in the guide, judge checklist, Proof Center, Archives,
Treasury, collection, Arena, Hall and seasonal screens.

Corrected:

- The guide now follows Gas → Hatch → Fight → Life; optional local practice and
  Beacon story are no longer described as required steps before the first hunt.
- Wallet/email identity restores the Circle-managed game wallet. Owned NFTs gate
  gameplay. Hosted Circle signing is distinct from external wallet popups.
- Removed the unconditional first-mint sponsorship promise and the claim that
  every move is a Sepolia transaction. Zero-gas Circle accounts use the in-game
  daily faucet link instead of an unrelated external faucet.
- Kept Sepolia ETH, test cZAMA and ordinary living items distinct. No cash/yield or
  guaranteed daily loot claims. Weak NFTs can fail a sponsored challenge safely.
- Appearance and ownership are public; hidden alleles are sequenced privately or
  irreversibly opened by the owner. Certification opens access; rare-lineage
  claims separately check the visible-trait proof onchain.
- Living encounters now have a Proof Center explanation and contract link.
  Their proof is checked through a read-only contract call before backend item
  credit, distinct from paid settlement in the Colosseum. Judge progress for this
  step records only an actual successful verification, not page navigation.
- Trail lantern is cosmetic, not the separate Depths door-reading lantern.
- First-hunt result CTA points to Living Xenos; test cZAMA instructions name the
  Wishing Well rather than confusing it with the ETH gas faucet.

Validation: 110 frontend tests, TypeScript and production build passed. Changed
file lint has no errors; seven existing warnings remain in judge, practice,
season and stage components. Browser copy checks passed at 320, 390 and 1440px
for guide, Proof Center, Archives, Treasury and Judge Mode, without page errors
or horizontal overflow. Actual account/NFT data was read from the live API.

The new 180-second video uses real-time game animation, recorded Sepolia battle
replays, genuine public KMS comparisons and existing verified living outcomes.
Local practice is explicitly labelled. No new blockchain transaction is needed
for filming. Rendering and browser runs occur on the VPS, not the user's PC.

Evidence: /opt/ashenkin/auth/content-refresh-20261118 and
/opt/ashenkin/media/refresh-20261118. Publishing was approved and that release used
ashenkin:content-refresh-20261118-1900. Live responsive checks passed for the same
screens at all three widths. A real Living proof check also confirmed Judge Mode
records that milestone only after success. Keeper configuration is unchanged.
Ten live browser clips were recorded successfully, including real public KMS
verification and the existing NFT #4 Archive fragment outcome. The final MP4
passed full decoding: 180.000 seconds, H.264 1920×1080, 30 fps, exactly 5,400 video
frames, AAC stereo and 26 non-overlapping English subtitle blocks. Each gameplay
source is a real WebM browser recording, not a still image. No blockchain action
was submitted for filming. Output is a music/subtitle edit; real-person narration
remains for the owner to record before using it as a completed pitch.
The original music/subtitle edit and timed read-along were delivered outside the source repository. A later AI-narrated walkthrough and matching SRT are linked from README; the owner handles the real-person submission pitch.
