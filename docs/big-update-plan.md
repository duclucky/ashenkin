# CHIMERA — Kế hoạch Big Update "Season of Masks" (v5)

> Historical design / QA record. Dates, test counts, images, balances and open
> branches below describe that run. For the current player flow, deployment and
> sponsor behavior, see [Current Ashenkin release](current-state.md).

> Mốc: hôm nay 12/11/2026 → **nộp bài 13/12** (hạn chót Zama 14/12 23:59 AOE). Còn ~4,5 tuần.
> Mục tiêu: biến CHIMERA từ "bộ sưu tập tính năng FHE" thành **một game có chiều sâu quyết định**, nơi việc giấu thông tin chính là luật chơi, kèm một nền kinh tế không tự sụp.

---

## 0. Tóm tắt 30 giây

| # | Hạng mục | Vì sao | Ưu tiên |
|---|---|---|---|
| 1 | **Blind Tactics** – chiến đấu 3 hiệp, mỗi bên chọn chiêu **bí mật** | Hiện trận đấu là 1 cú bấm, người chơi không có quyết định nào. Zama nêu rõ "moves" là thứ nên mã hoá | **P0** |
| 2 | **Relic Caches** – hộp bí ẩn công khai tỉ lệ, kết quả riêng tư + trang bị | Zama gợi ý đúng "mystery boxes with provable odds but private results"; tạo hệ nâng cấp thứ 2 và hố tiêu cZAMA | **P0** |
| 3 | **Oracle's Riddle** – giải đố gen hằng ngày kiểu Mastermind | Mini-game mà **sẽ hỏng ngay nếu dữ liệu công khai** (người khác copy gợi ý). Rẻ, vui, chơi mỗi ngày | **P0** |
| 4 | **Cân bằng kinh tế** + Proof Center (minh bạch, kiểm chứng) | Hiện XP và phần thưởng đang "chảy" quá nhanh; giám khảo chấm "Fairness" | **P0** |
| 5 | **Thế giới sống**: NPC keepers, hộp thư việc chờ, tự chốt kết quả | Giám khảo vào thấy game vắng → mất điểm "fun" | **P0** |
| 6 | **Mùa giải "Ngai vàng"** (King of the Hill on-chain) | Lý do quay lại mỗi ngày, có phần thưởng cuối mùa | P1 |
| 7 | **Ascension** – hiến tế sinh vật thừa để lấy XP | Sinh vật hoang bắt được đang lạm phát, cần chỗ "đốt" | P1 |
| 8 | Sealed Raffle, Gene Serum, Arkhive Depths (PvE nhiều tầng), guild | Hay nhưng tốn công/rủi ro | P2 (sau nộp bài) |

---

## 1. Ban giám khảo chấm gì (Season 5 – Confidential Gaming)

Theo bài công bố chính thức của Zama:

1. **Gameplay & UX** – có vui, dễ hiểu không, dữ liệu mã hoá có "nhẹ nhàng" với người chơi không. *"FHE chạy được chỉ là vé vào cửa, chúng tôi tìm game vui."*
2. **Confidentiality design** – cái gì được mã hoá, và **game có hỏng không nếu cái đó công khai?**
3. **Fairness** – ngẫu nhiên phải sinh on-chain và người chơi kiểm chứng được.
4. **Functionality** – chơi trọn một vòng, kiểm chứng end-to-end trên Sepolia.
5. **Demo** – video 3 phút, người thật nói.
6. **Code quality** – sạch, có test, có tài liệu.

Gợi ý của Zama: poker (bài úp), **mystery box** (tỉ lệ kiểm chứng được, kết quả riêng), **raffle**, các "nước đi / cược / lần gieo xúc xắc" bị giấu.
→ Kế hoạch bên dưới bám sát từng tiêu chí; mỗi tính năng mới đều trả lời được câu "nếu công khai thì hỏng ở đâu".

---

## 2. Hiện trạng CHIMERA (đã kiểm tra trong code)

### Đang có
- **Lab**: 3 phôi miễn phí / ví, gen 8 locus mã hoá, năng lượng 3/ngày để "đọc" 1 gen, chứng nhận genome, xác minh CHIMERA.
- **Nursery (lai tạo)**: phí theo số lần đã lai của mỗi bố/mẹ: 5 → 8 → 12 → 18 → 26 → 38 → 55 cZAMA, tối đa 7 lần. Phí chia 60% hũ Boss / 40% Treasury.
- **Ashlands**: săn thú hoang (thắng = bắt về), đấu tay đôi với cược ẩn (chỉ `min(cược A, cược B)` bị đặt cược, phần dư hoàn lại, rake 5% vào hũ Boss). Điểm = gen + khắc hệ (+25) + d64 ngẫu nhiên mã hoá. **Chỉ giải mã 1 bit: ai thắng.**
- **Expeditions**: 3 vùng (10 / 30 / 60 phút), độ khó 60 / 95 / 130, loot ẩn: 3+rand(4,2) · 8+rand(8,4) · 20+rand(33,5) cZAMA, 6 lượt/ngày.
- **World Boss**: HP ẩn, chỉ lộ thanh máu 10 nấc, 25% hũ cho đòn kết liễu, 50% chia đều người đánh (đã sửa lỗi người vào muộn).
- **Dojo**: XP → lên cấp, mỗi cấp +2..5 sức mạnh **ẩn**, tiến hoá LV5 / LV10; phí 3 + 2×cấp cZAMA; XP cần 10 × (cấp+1).
- **Quests**: điểm danh 1, 4 nhiệm vụ × 2, rương 10 cZAMA, streak tới ×2.
- **Market**: giá công khai, thanh toán cZAMA mã hoá, phí 5%.
- **Treasury** ~300.000 cZAMA; hũ Boss 2.000 cZAMA; Hall of Keepers + Chronicle.

### Điểm yếu tìm được (xếp theo mức nghiêm trọng)

| # | Vấn đề | Bằng chứng / con số | Hệ quả |
|---|---|---|---|
| W1 | **Chiến đấu không có quyết định** | Chọn sinh vật → bấm → chờ KMS → thắng/thua | Yếu nhất ở tiêu chí "fun". Mọi trận giống nhau |
| W2 | **XP lạm phát** | Đánh Boss mỗi 10 phút = 12 XP → 72 lượt/ngày/sinh vật → LV10 (550 XP) trong ~8 giờ | Hệ cấp độ mất ý nghĩa, ai "cày" cũng max ngay ngày đầu |
| W3 | **Phần thưởng > chỗ tiêu** | Một người chơi tích cực: quests tối đa ~38/ngày + expedition ~60–90/ngày. Chỗ tiêu chủ yếu là **một lần** (train tối đa 120 cZAMA/sinh vật, lai tạo) | Đúng "bệnh Axie": vòi > cống. Treasury cạn sau ~2.500 ngày-người chơi |
| W4 | **Lạm phát sinh vật** | Thắng thú hoang = có sinh vật mới miễn phí, không có cách "đốt" | Market không có giá trị, sinh vật vô giá |
| W5 | **Chỉ có 1 trục nâng cấp** (train level) | Không có trang bị / vật phẩm | Ít mục tiêu dài hạn, ít lý do quay lại |
| W6 | **Thế giới vắng** | Hall of Keepers hiện chỉ 2 ví; arena không có defender thật | Giám khảo vào thấy "game chết" |
| W7 | **Kiểm chứng chưa đủ nổi bật** | Có trang Verify cho genome, nhưng trận đấu / loot / Boss chưa có "bằng chứng" hiển thị | Mất điểm "Fairness" dù kỹ thuật đã đúng |
| W8 | **Nhiều bước chờ KMS thủ công** | Lai → trứng → bấm nở; train → bấm hoàn tất; đấu → bấm settle | Người mới rối, dễ bỏ dở giữa chừng |

---

## 3. Bài học GameFi áp dụng vào CHIMERA

| Bài học từ ngành | Ví dụ | Áp dụng |
|---|---|---|
| Vòi phát thưởng phải ≤ cống tiêu thụ | SLP của Axie mất ~99% giá trị vì phát nhiều hơn đốt | Bảng nguồn/cống (mục 4.D), phần thưởng **tự co lại** theo mức dự trữ Treasury |
| Thưởng cho **kỹ năng**, không phải thời gian cày | Ngành chuyển từ P2E sang "skill-based earning"; Axie 2026 gắn thưởng với điểm uy tín | Blind Tactics + Riddle thưởng cho người đọc đối thủ / suy luận giỏi; giới hạn XP theo ngày |
| Giới hạn chống bot / farm | Pixels chuyển từ đếm ví hoạt động sang "chất lượng hoạt động", có trần và cống chống bot | Trần XP/ngày, phí nhỏ cho mỗi lượt đoán, năng lượng |
| Giới hạn số lần lai tạo | Axie: mỗi con lai tối đa 7 lần | CHIMERA đã có (7 lần, phí tăng dần) ✔ |
| Kinh tế không được dựa vào "người mới vào liên tục" | Mô hình scholarship sụp khi người mới chậm lại | Hũ thưởng chỉ đến từ phí người chơi trả (đã đúng), thêm cống: relic, riddle, fusion |
| Vui trước, kiếm tiền sau | Đồng thuận chung của các game sống sót 2025–2026 | Ưu tiên P0 là gameplay (Tactics, Riddle), không phải thêm token |

---

## 4. Thiết kế chi tiết

### A. ⚔️ Blind Tactics — Chiến đấu 2.0 (P0)

**Ý tưởng:** mỗi trận gồm **3 hiệp**. Trước trận, mỗi bên chọn 3 chiêu theo thứ tự, tất cả **mã hoá**:

- 🗡 **Strike** thắng 🎭 **Feint**
- 🎭 **Feint** thắng 🛡 **Guard**
- 🛡 **Guard** thắng 🗡 **Strike**

**Điểm mỗi hiệp** = sức mạnh gen + bonus luyện tập + bonus relic + khắc hệ + **d32 ngẫu nhiên mã hoá** + **30 nếu chiêu thắng chiêu** (hoà chiêu: +0).
Thắng 2/3 hiệp là thắng trận.

**Vì sao FHE là bắt buộc (câu trả lời cho giám khảo):**
- Defender đăng ký kế hoạch 3 chiêu **trước** và để đó hàng ngày. Nếu kế hoạch công khai, mọi challenger sẽ khắc chế cả 3 hiệp → defender luôn thua → chế độ chết. Đây là đúng kiểu "bài úp" của poker.
- Thú hoang chọn chiêu bằng `FHE.randEuint8` → không ai đoán trước, kể cả nhà phát triển.

**Lộ gì sau trận (thiết kế có chủ đích):** chỉ giải mã **3 bit** (ai thắng mỗi hiệp) để làm hoạt cảnh từng hiệp. Không lộ chiêu, không lộ điểm. Defender được **đổi kế hoạch miễn phí** bất cứ lúc nào (vì kết quả hiệp có thể giúp đối thủ đoán dần) → tạo meta "đọc tâm lý".

**Trải nghiệm:**
- Màn hình chọn 3 thẻ chiêu (kéo thả / bấm), có gợi ý "đối thủ thắng 3 trận gần nhất bằng hiệp 1" (thông tin công khai).
- Hoạt cảnh pixel: hiệp 1 → 2 → 3, thanh "?" lật dần.
- Ở chế độ luyện tập (không ví), vẫn chơi được với AI ngẫu nhiên.

**Kỹ thuật:**
- Contract mới `ChimeraColosseum` dùng `Lab.battleProfile` qua `Lab.setCombat` (đã có) → **không cần deploy lại Lab, giữ nguyên toàn bộ sinh vật**.
- Đầu vào mã hoá: `externalEuint8 ×3` + input proof (relayer SDK `createEncryptedInput`). Gói 3 chiêu vào **1 số 6 bit** (2 bit × 3) để chỉ cần 1 lần mã hoá, 1 chữ ký.
- Ngân sách HCU (giới hạn 20M / tx, độ sâu 5M): 3 hiệp × (so sánh chiêu + cộng + so sánh điểm) trên euint16 ước tính ~3–5M → an toàn; **phải đo bằng test HCU** trước khi chốt.
- Giữ cơ chế cược ẩn `min(A,B)` và rake 5% như Arena hiện tại; Arena cũ vẫn chạy "Quick fight" cho người muốn nhanh.

### B. 🎁 Relic Caches + Trang bị (P0, Fusion là P1)

**Hộp bí ẩn:** mua `Relic Cache` = **25 cZAMA** (60% hũ Boss / 40% Treasury).

| Độ hiếm | Tỉ lệ (công khai, hằng số trong contract) | Sức mạnh ẩn |
|---|---|---|
| Common | 60% | +2..5 |
| Rare | 28% | +6..10 |
| Epic | 10% | +11..16 |
| Legendary | 2% | +18..25 |

- **Bảo hiểm (pity):** cứ 20 hộp chưa ra Epic+ thì hộp thứ 20 chắc chắn Epic. Bộ đếm pity **cũng mã hoá**, đối thủ không biết bạn sắp "nổ" hũ.
- **Kết quả riêng tư:** độ hiếm + chỉ số chỉ chủ nhân giải mã được. Người khác thấy "Sealed Relic".
- **Thẩm định (appraise):** chủ có thể chọn công khai relic (public decrypt) để khoe hoặc bán giá cao.
- **Trang bị:** mỗi sinh vật 1 ô relic, mở ô thứ 2 khi tiến hoá LV5. Bonus relic cộng vào sức mạnh ẩn → đối thủ **không biết bạn mang gì**. Đây là lý do FHE quan trọng: loadout công khai = meta bị "giải" ngay.
- **Fusion (P1):** đốt 3 relic → 1 relic, độ hiếm = cao nhất trong 3, có 35% lên 1 bậc (ngẫu nhiên mã hoá). Cống tiêu relic thừa.
- **Kiểm chứng:** trang Proof hiển thị tỉ lệ hằng số đọc trực tiếp từ contract, giao dịch mở hộp, nguồn ngẫu nhiên `FHE.randEuint8`, thống kê công khai "đã mở N hộp, X relic được thẩm định là Legendary".

**Kỹ thuật:** contract `ChimeraRelics`. Để relic được cộng vào **mọi** chế độ (Ashlands, Boss, Expeditions): Lab hiện gọi `training.bonusOf(id)`. Ta deploy `ChimeraTraining v2` + `PowerHub` (tổng bonus luyện tập + relic) và trỏ `Lab.setTraining(hub)`.
→ Không động vào Lab. Chi phí: trên Sepolia mới có vài cấp được luyện, nên chạy script chuyển cấp độ công khai, còn bonus ẩn thì roll lại (ghi chú trong changelog).

### C. 🧩 Oracle's Riddle — giải đố gen hằng ngày (P0)

**Luật:** mỗi ngày Oracle giữ 1 "genome bí ẩn" gồm 4 gen, mỗi gen 0–15, sinh bằng `FHE.randEuint8`.
- Mỗi lượt đoán: gửi 4 số, trả **2 cZAMA** (vào hũ Riddle) + tối đa 5 lượt/ngày.
- Phản hồi **chỉ bạn thấy**: số gen trúng chính xác, số gen lệch ±1.
- Người đầu tiên đoán trúng 4/4 → bấm "Claim" → contract kiểm tra bằng phép so sánh mã hoá rồi giải mã công khai đúng 1 bit "trúng" → nhận **hũ Riddle + 1 Relic Cache miễn phí**.
- Hết ngày không ai trúng: hũ cộng dồn sang ngày sau (jackpot tăng dần → kịch tính).

**Vì sao FHE là bắt buộc:** nếu phản hồi công khai, người chơi chỉ cần đọc phản hồi của người khác là giải được mà không tốn lượt → game vỡ. Nếu đáp án nằm on-chain dạng thường → ai cũng đọc được. **Đây là ví dụ "would break if public" mạnh nhất để đưa vào video.**

**Chi phí:** rẻ (4 phép so sánh + đếm / lượt). Rất hợp để demo trong 30 giây.

### D. 💰 Kinh tế: cân bằng nguồn/cống (P0)

**Bản đồ dòng tiền cZAMA sau update:**

```
VÒI (tiền ra)                        CỐNG (tiền vào / bị giữ lại)
Quests (Treasury)        ─┐      ┌─ Phí lai tạo (60% Boss / 40% Treasury)
Expedition loot (Treas.) ─┤      ├─ Phí luyện tập (60/40)
Chia hũ Boss (phí ng.chơi)┤      ├─ Relic Cache 25 (60/40)          [mới]
Hũ Riddle (phí ng.chơi)  ─┤      ├─ Lượt đoán Riddle 2 → hũ Riddle  [mới]
Thưởng mùa (Treasury)    ─┘      ├─ Fusion 5 / lần                  [mới]
                                 ├─ Market 5%, rake duel 5%
                                 └─ Ascension 3 / lần                [mới]
```

**Thay đổi thông số (đa phần chỉnh bằng hàm admin có sẵn, không cần deploy lại):**

| Thông số | Hiện tại | Đề xuất | Cách làm |
|---|---|---|---|
| Hồi chiêu đánh Boss | 10 phút | **2 giờ** | `Raid.setStrikeCooldown` (có sẵn) |
| XP nhận/ngày/sinh vật | không giới hạn | **trần 120 XP/ngày** | Training v2 |
| Thời gian lên LV10 (chơi chăm) | ~8 giờ | **~7–10 ngày** | kết hợp 2 dòng trên |
| Loot expedition | cố định | **co giãn theo dự trữ Treasury** (dự trữ < 50% ban đầu → loot ×0,75; < 25% → ×0,5) | `Expeditions.setZone` (có sẵn) + công thức công khai trên trang Economy |
| Thưởng thắng thú hoang | bắt về miễn phí | giữ nguyên, nhưng có **Ascension** để đốt | mục E |

**Trang Economy nâng cấp:**
- Biểu đồ vòi/cống 7 ngày, dựng từ sự kiện công khai. Phí công khai thì thấy số chính xác; loot ẩn thì chỉ hiện "sealed", và tổng dự trữ được giải mã công khai theo nhóm.
- Chỉ số "sức khoẻ Treasury" và hệ số loot hiện tại.
- Thông điệp: "tổng thể minh bạch, cá nhân riêng tư". Đây cũng là điểm cộng confidentiality.

**Ghi chú trung thực:** Wishing Well (1.000 cZAMA miễn phí) chỉ tồn tại trên testnet để giám khảo chơi thử. Tài liệu sẽ nói rõ: ở "chế độ mainnet" vòi này bị tắt.

### E. 🔺 Hệ thống nâng cấp mở rộng (P1)

1. **Ascension (hiến tế):** gửi 1 sinh vật thừa vào Đền Ascension (bị khoá vĩnh viễn, coi như đốt) → sinh vật chính nhận XP = 30 + 10 × thế hệ, phí 3 cZAMA, vẫn tuân theo trần XP/ngày. Giải quyết W4: sinh vật hoang bắt được giờ có giá trị.
2. **Bậc sao tiến hoá:** LV5 mở ô relic thứ 2, LV10 cho phép mang relic Legendary và nhận "khung vàng" trên bản đồ. Thưởng nhìn thấy được, sức mạnh vẫn ẩn.
3. **Gene Serum (P2):** tung lại 1 alen ẩn. Cần sửa Lab nên để sau ngày nộp.

### F. 👑 Mùa giải "Ngai vàng" (P1)

- Mùa 14 ngày. Điểm mùa = thắng Tactics ×3, bắt thú ×2, đánh Boss ×1, kết liễu ×10, giải Riddle ×5, Fusion ×1.
- **3 Ngai vàng on-chain (King of the Hill):** ai có điểm cao hơn người đang giữ ngai thì bấm "Claim throne" → contract so sánh O(1), không cần sắp xếp cả bảng. Cuối mùa, 3 người giữ ngai nhận thưởng (2.000 / 1.000 / 500 cZAMA từ Treasury) và huy hiệu soulbound.
- Dữ liệu Arena cũ (`wins`, `captures` công khai) dùng làm mốc cơ sở khi tham gia → không cần deploy lại Arena.
- Hall of Keepers thêm tab "Season", đếm ngược, nút giành ngai.

### G. 🔍 Proof Center — mọi kết quả đều kiểm chứng được (P0)

Mỗi trận đấu, lần mở hộp, lượt expedition, đòn Boss, lần giải Riddle có nút **"How was this decided?"** mở ra ngăn kéo:
1. **Nguồn ngẫu nhiên:** hàm `FHE.rand…` nào, trong giao dịch nào (link Etherscan).
2. **Những gì vẫn bí mật:** chiêu, điểm, loot, relic…, kèm handle mã hoá.
3. **Những gì được công khai:** bit kết quả + **bằng chứng KMS đã được contract kiểm tra on-chain** (`FHE.checkSignatures`) trong giao dịch settle.
4. **"Nếu công khai thì sao?"**: 1 câu giải thích cho từng chế độ.

Đồng thời thêm 1 trang `/fairness` tổng hợp: bảng "Cái gì được mã hoá – vì sao – nếu công khai thì hỏng thế nào". Bảng này đưa thẳng vào README và video.

### H. 🌍 Thế giới sống & UX (P0)

1. **Thế giới sống:** bản hiện tại dùng các cuộc săn không cần người chơi khác online và [Living Xenos](living-nft-mvp.md) cho sự kiện NFT hằng ngày. Các công cụ QA vận hành riêng không phải tính năng của sản phẩm nộp bài.
2. **Hộp thư "Việc đang chờ":** gom mọi thứ cần bấm hoàn tất (trứng chờ nở, training chờ xác nhận, trận chờ chốt, loot chờ nhận) vào 1 nút "Finish all" ở thanh trên.
3. **Tự chốt kết quả:** khi trình duyệt đang mở, tự gọi giải mã công khai và gửi giao dịch settle sau khi hỏi 1 lần ("tự hoàn tất các bước chờ").
4. **Tour 3 phút cho giám khảo:** nút "Judge mode" trên bản đồ đi qua 1 vòng đầy đủ: nhận cZAMA → mở hộp relic → đấu Tactics với NPC → đoán Riddle → xem Proof.

---

## 5. Kiến trúc & triển khai

| Contract | Trạng thái | Ghi chú |
|---|---|---|
| ChimeraLab | **giữ nguyên** | Sinh vật, gen, lịch sử được bảo toàn. Chỉ gọi `setCombat` và `setTraining(hub)` |
| ChimeraColosseum | **mới** | Blind Tactics + duel cược ẩn |
| ChimeraRelics | **mới** | Hộp, pity mã hoá, trang bị, appraise, fusion |
| ChimeraOracle | **mới** | Riddle hằng ngày + hũ cộng dồn |
| ChimeraTraining v2 + PowerHub | **deploy lại** | Trần XP/ngày, cộng bonus relic; script chuyển cấp độ |
| ChimeraSeason | **mới (P1)** | Ngai vàng, điểm mùa |
| ChimeraAscension | **mới (P1)** | Hiến tế sinh vật |
| Arena, Raid, Expeditions, Quests, Market, Treasury | giữ nguyên | Chỉnh thông số bằng hàm admin; đấu dây (`setGame` / `setEconomy`) tới contract mới |

**Chất lượng:**
- Mỗi contract mới có test Hardhat (mock FHEVM), gồm cả **test đo HCU** cho các hàm nặng.
- Mỗi chế độ có script e2e Sepolia (giống `e2e-sepolia.ts`) chạy một vòng đầy đủ với KMS thật.
- Chạy lại toàn bộ 61 test hiện có. Mục tiêu: 90+ test.

**Chi phí gas:**
- Deploy và đấu dây ước tính ~0,002 ETH.
- NPC keepers cần khoảng **0,05 Sepolia ETH** cho 6 ví trong 3 tuần. Ví deploy hiện còn ~0,0086, **cần bạn nạp thêm**.

---

## 6. Lịch trình (đến ngày nộp 13/12)

| Tuần | Ngày | Việc | Kết quả kiểm tra được |
|---|---|---|---|
| 1 | 13–19/11 | Chốt số liệu bằng simulator; viết Colosseum + Relics + PowerHub/Training v2 + test | Test xanh, HCU đo được < giới hạn |
| 2 | 20–26/11 | Oracle (Riddle) + chỉnh kinh tế; deploy Sepolia; e2e cho từng chế độ; NPC keepers bắt đầu chạy | Mỗi chế độ chơi trọn 1 vòng trên Sepolia |
| 3 | 27/11–3/12 | Frontend: chọn chiêu + hoạt cảnh 3 hiệp, cửa hàng / mở hộp / túi đồ / trang bị, bảng Riddle, Proof drawer + /fairness, Economy v2, hộp thư việc chờ | Duyệt trên máy tính & điện thoại, không lỗi |
| 4 | 4–9/12 | P1 nếu kịp (Season, Ascension, Fusion); cân bằng lần 2; rà lỗi toàn bộ; Judge mode | Danh sách kiểm tra QA đạt |
| — | 10–13/12 | **Đóng băng tính năng**; README + bảng confidentiality; kịch bản & quay video 3' (bạn quay); chuỗi bài X; nộp 13/12 | Nộp bài, còn 1 ngày dự phòng |

**Đường cắt:** nếu đến **3/12** chưa xong P0 thì bỏ toàn bộ P1, dồn sức hoàn thiện P0.

---

## 7. Định nghĩa "xong" & chỉ số

- Người mới (chưa có gì) đi từ bản đồ → trận Tactics đầu tiên trong **≤ 3 phút**, ≤ 4 chữ ký.
- Mỗi hành động có kết quả ngẫu nhiên đều có nút Proof dẫn tới giao dịch kiểm chứng.
- Mọi chế độ mới chạy e2e trên Sepolia với KMS thật; số giao dịch / gas / HCU được ghi trong README.
- Thời gian lên LV10 khi chơi chăm: 7–10 ngày (đo bằng simulator).
- Dự trữ Treasury mô phỏng 30 ngày với 100 người chơi: không cạn (nhờ loot co giãn + cống mới).
- Hall of Keepers có ≥ 8 người chơi hoạt động khi giám khảo vào xem.

## 8. Rủi ro chính

| Rủi ro | Mức | Cách giảm |
|---|---|---|
| Trận Tactics vượt giới hạn HCU | TB | Gói chiêu 2 bit, dùng euint16, đo HCU trong test tuần 1; dự phòng: 2 hiệp thay vì 3 |
| Relayer / KMS Sepolia chậm khi demo | Cao | Tự chốt kết quả + thông báo rõ "đang chờ mạng Zama"; quay video vào giờ thấp điểm, dự phòng cảnh quay |
| Thay Training làm hỏng sức mạnh hiện có | Thấp | Thử trên fork Sepolia trước; dữ liệu testnet hiện rất ít |
| Ôm quá nhiều việc | Cao | P0 / P1 / P2 + đường cắt 3/12 |
| Bot farm thưởng | TB | Trần XP, phí lượt đoán, thưởng co giãn, giới hạn lượt/ngày |

---

*Nguồn tham khảo:*
- [Zama Developer Program Season 5: Confidential Gaming](https://www.zama.org/post/zama-developer-program-mainnet-season-5-confidential-gaming)
- [Zama docs: HCU limits](https://docs.zama.org/protocol/solidity-guides/development-guide/hcu)
- [Plisio: GameFi in 2026](https://plisio.net/education/gamefi)
- [Bex: skill-based earning](https://bex.co/blog/2026/02/13/gamefi-sustainability-player-income-anti-bot-mechanics)
- [BlockEden: GameFi industry overview 2025](https://blockeden.xyz/blog/2025/10/07/gamefi-industry-analysis/)
- [FinDaS: GameFi tokenomics](https://www.findas.org/blogs/gamefi-tokenomics)
