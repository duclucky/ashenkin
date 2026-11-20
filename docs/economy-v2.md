# Economy v2 — finite rewards and lineage circulation

> Historical design / QA record. Dates, test counts, images, balances and open
> branches below describe that run. For the current player flow, deployment and
> sponsor behavior, see [Current Ashenkin release](current-state.md).

User choice: parents survive breeding and permanent offerings are voluntary. This document records the November 16 economy rollout into the historical `v2` world. The default public entry now uses the Ashenkin release, which also includes these economy rules; `?world=original` and `?world=v2` retain access to legacy NFTs.

## Đề xuất quỹ thưởng mainnet

- Mỗi mùa công bố tài sản thưởng, số tiền đã nạp và cách chia theo hạng trước khi mở. Chỉ mở mùa có thưởng khi quỹ đã đủ. Nguồn quỹ là tài trợ cam kết hoặc một phần doanh thu đã thu từ các giao dịch thật và dịch vụ trong game. Số lượt đăng ký mới không làm tăng nghĩa vụ đã công bố.
- Điểm xếp hạng lấy từ các trận FHE đã chốt. Backend có thể tổ chức lịch, ghép trận và dựng bảng điểm. Cách tính điểm và quyền đòi thưởng phải kiểm tra được từ dữ liệu đã xác nhận. Có thể gom nhận thưởng một lần cuối mùa.
- Tách ngân sách gas khỏi quỹ giải. Quái vật, chỉ số và vật phẩm ở Sepolia phục vụ test, còn khả năng tạo doanh thu và chi phí mainnet cần được định lượng riêng trước khi ra mắt.

## Problems and scope

Ascension already removes NFTs from player circulation by locking them forever, but only rewards XP. Breeding creates new reusable breeders; seven uses per parent does not bound descendant growth. Treasury fees recirculate, rather than burn cZAMA; unbounded testnet minting is external testing supply, not sustainable game revenue. Before this rollout, Treasury had no daily budget; an oversized payment returns zero instead of an affordable partial reward. Seasonal payments are sequential and can favor the first seat when reserves run out.

## Rules to implement

- Keep parents and existing inheritance, encrypted RNG, fees and seven-use limit. One introductory breeding per keeper needs no lineage charge. Each later egg consumes one nontransferable charge, earned by permanently offering one owned spare NFT to the configured Ascension vault. Refund the charge/introduction on an unpaid egg. Pending eggs reserve population headroom. Retirement releases one slot; breeding fills one slot. The global population ceiling is 10,000 including wild inventory and pending eggs; a configured lower ceiling may never exceed that maximum or strand existing reservations.
- Ascension continues to offer XP plus a charge. Add an explicit charge-only retirement path for players who do not want XP or have reached the XP limit. Both paths check ownership, defender status and relics. Vault configuration is one-time and must be a contract; retired NFTs cannot leave it. Credits and retirement accounting live in the Lab transfer boundary, so transfers cannot farm them.
- Treasury snapshots a daily encrypted budget at the first payout: min(1% of current reserve, 3,000 cZAMA). Payments are min(request, current balance, remaining budget), and budget decreases by the actual token amount transferred. Midday deposits do not reset the budget. Reset at the UTC day boundary. Keep individual balances and payout requests encrypted; aggregate reserve/budget snapshots are intentionally public.
- Season obtains a single affordable pool, then splits the actual pool proportionally across occupied paid thrones. Rounding dust goes to the last eligible seat. Empty seats do not consume budget. No first-seat funding preference, overflow, or second claim.
- Frontend reads capabilities from the deployed contracts. Old Sepolia contracts keep their actual rules and are identified honestly. New world UI shows charges, population headroom, daily reward budget and irreversible-offering consequences; no client-only enforcement or claims that undeployed rules are live.

## Execution and acceptance

1. Add failing local Hardhat cases for intro/charge use, retirement replay/ownership, refunds, pending population reservations, partial/empty/limited treasury payouts and UTC reset, pro-rata season prizes and settlement replay.
2. Implement the smallest changes to Lab, Ascension, Treasury and Season, preserving FHE proof checks. Update affected tests only for intentionally changed economics. Run focused checks, then the contract suite and compile/HCU checks.
3. Integrate capability-aware frontend views/actions, meaningful model tests, type-check/build, and Chrome checks against the existing world. Do not rewrite live deployment addresses or ABIs as if new bytecode were deployed.
4. Add deterministic economic simulations: population accounting and repeated day budgets under no deposits and fee replenishment. Report reserve trajectory and assumptions rather than token price or profit claims.
5. Provide a concrete rollout checklist after all local verification. New Lab rules require a new world or an explicitly reviewed migration because the deployed Lab is not upgradeable. Existing NFTs and balances stay untouched until a separate deployment decision.

## Limits

Wallet quotas are not Sybil resistance. Open Sepolia faucet supply has no economic scarcity. The budget guarantees bounded outflow, not equal rewards for different claim times or a market price. Aggregate publication can reveal net treasury flow between snapshots. This is an implementable testnet economy, not a guarantee of a sustainable real-money market.

Sources consulted: [Axie breeding](https://whitepaper.axieinfinity.com/gameplay/breeding), [Zama Solidity guides](https://docs.zama.org/protocol/solidity-guides), [OpenZeppelin confidential tokens](https://docs.openzeppelin.com/confidential-contracts/api/token). Exact APIs checked against installed dependencies.

## Local verification, 2026-11-16

- `npx hardhat test --network hardhat` passed 100 cases, including paid and unpaid eggs, cap reservations, the irreversible offering, preserved parents, a shared daily budget, UTC reset and actual quest receipts. The three-seat season split used 12,692,760 HCU at depth 4,386,064 in the local FHEVM mock, within the suite’s 20,000,000 / 5,000,000 thresholds.
- Frontend passed 84 Bun tests, TypeScript and the production build. Chrome rendered the economy preview and showed one offering enabling one later egg. The prior 320-pixel check had no horizontal overflow. The original Sepolia Nursery and Treasury were checked against the deployed v1 selectors. The new rules still require a real Sepolia FHEVM run after deployment.
- Quest lifetime targets retain their existing public counter. The last actual transfer has its own encrypted receipt, including a valid zero. The UI reads it when the keeper has unlocked a Lab key and avoids claiming the nominal amount was paid. Treasury snapshots remain public, so adjacent snapshots can reveal individual outflow even when the transfer handle and wallet balance use FHE.

The reserve simulation starts at 300,000 cZAMA, adds the specified fees before each day's first payout, and spends the full allowed amount every day. Figures are rounded to whole cZAMA. The machine-readable inputs and outputs are in `economy-v2-simulation.json`.

| Daily fees entering Treasury | Reserve after 30 days | After 90 days | After 365 days |
| ---: | ---: | ---: | ---: |
| 0 | 221,910 | 121,420 | 7,655 |
| 500 | 234,799 | 150,887 | 55,892 |
| 3,000 | 300,000 | 300,000 | 300,000 |

After a keeper’s introductory egg, each successful breeding requires a permanent retirement credit. One retirement followed by one birth changes circulating population by zero. Starter embryos and wild spawns still add supply until the global ceiling. The 10,000 ceiling, introductory allowance and budget parameters are initial design choices, pending testnet gameplay data. With the current target prizes, three occupied thrones request 3,500 cZAMA and divide at most 3,000 cZAMA, or less if other claims used the day's budget.

## Rollout checkpoint

1. Deploy a separate v2 world with a new Lab and Treasury. Keep the v1 deployment records and link intact so existing NFT owners can continue in that world. Neither the v1 Lab nor the v1 Treasury has an upgrade path for these rules.
2. Wire the new Lab to its own Colosseum and the Ascension vault. Set the altar’s defender and relic links before registering the permanent vault. Wire the new Treasury to Expeditions, Quests, Depths and Season, and route fees from the v2 spending contracts to the v2 pools. Fund controlled test wallets and record the starting reserve.
3. Export v2 addresses and ABIs to a separate frontend configuration. Smoke-test one complete v2 flow on Sepolia: first egg, retirement, second egg, a failed fee proof, a clipped Treasury reward and season distribution. Compare the ERC-721 owner, charge count, reserves and actual encrypted receipts against the UI.
4. Publish the v2 entry after the checks. Any carryover of legacy NFTs, XP or funds is a separate migration decision. Moving an old NFT does not move a ciphertext or its access permissions to a new contract automatically.

## Sepolia deployment

The v2 deployment journal is `contracts/deployments-v2/sepolia.json`. It records all 15 deployed contracts and 45 setup transactions in blocks 12143835–12143844. Each transaction was confirmed and the final script checked the Lab, vault and Treasury wiring, plus ownership of all 15 contracts. The three reward pools were seeded with 300,000 cZAMA for the Treasury, 2,000 for the Boss and 200 for the Oracle.

The smoke test uses dedicated test keepers. It tests breeding against the new Lab. Exhausting a reward budget and closing a season use a separate instance of the same Treasury and Season contracts so the live world opens with a funded Treasury and a regular season. See `contracts/deployments-v2/smoke.json` for transaction hashes and final verified results.

At the November 16 rollout, the default game address opened v1. Today the default opens Ashenkin; `?world=original` and `?world=v2` select the two historical worlds. NFT IDs are scoped to the world. The local metadata API uses `/api/nft` for v1 and `/api/nft-v2` for v2. Each world’s Lab key is stored separately.

The live smoke test passed. Egg #5 was unpaid and returned the introductory allowance. The same keeper hatched #6, retired it for one charge, then spent that charge to hatch #7. Both parents (#1 and #4) stayed in the keeper’s wallet. The live Quest paid 1 cZAMA. The isolated reward test opened a 2 cZAMA budget, paid 1 to the first check-in and split the remaining 1 among the thrones as 0.571428, 0.285714 and 0.142858 cZAMA. The next check-in received 0. Each transfer was read through the real Zama KMS. The regular v2 season remained on season 1.

Chrome confirmed 5 of 10,000 circulating specimens and 2,999 of 3,000 cZAMA left in the live daily budget. The menu switched successfully between v1 and v2 in both directions. Both metadata routes responded independently and the v2 route returned Junaudra #7. The v2 on-chain `tokenURI` has no public base URL configured. These local frontend and metadata links use the game server on this computer.
