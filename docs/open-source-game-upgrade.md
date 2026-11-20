# Chimera: học từ game mã nguồn mở và áp dụng

> Historical design / QA record. Dates, test counts, images, balances and open
> branches below describe that run. For the current player flow, deployment and
> sponsor behavior, see [Current Ashenkin release](current-state.md).

## Nguồn đã kiểm tra ngày 13/11/2026

Số liệu đọc trực tiếp từ GitHub API; star/fork là tín hiệu chọn nguồn tham khảo, không chứng minh thiết kế phù hợp hay sản phẩm thành công.

| Repo | Stars / forks | Phần đã đọc | Áp dụng cho Chimera |
|---|---:|---|---|
| [Phaser](https://github.com/phaserjs/phaser) | 40.706 / 7.185 | `src/scene/SceneManager.js` | Cảnh có vòng đời rõ; kết thúc cảnh không được bị callback cũ mở lại. |
| [boardgame.io](https://github.com/boardgameio/boardgame.io) | 12.489 / 833 | `docs/documentation/phases.md`, `secret-state.md`, `src/core/flow.ts` | Phân tách chọn lệnh, chờ xác nhận, kết quả; không đoán trước bước dùng trạng thái bí mật. |
| [Pokémon Showdown](https://github.com/smogon/pokemon-showdown) | 6.025 / 3.596 | `sim/SIM-PROTOCOL.md` | Tách sự kiện kết quả khỏi phần trình diễn; báo cáo từng hiệp và phát lại cùng một kết quả. |
| [Showdown client](https://github.com/smogon/pokemon-showdown-client) | 725 / 1.102 | README và ranh giới client/protocol | Tham khảo vai trò trình diễn, không lấy assets/nhân vật hay mã client AGPL. |
| [PixiJS](https://github.com/pixijs/pixijs) | 48.696 / 5.146 | `src/ticker/Ticker.ts` | Đồng hồ hoạt ảnh tách khỏi kết quả; không thay kết quả khi khung hình chậm. Chưa cần thêm renderer. |
| [Sunflower Land](https://github.com/sunflower-land/sunflower-land) | 1.647 / 666 | `tutorialNudge.ts`, `gameMachine.ts` | Một chỉ dẫn ưu tiên theo trạng thái; sau trận có bước tiếp theo để tiếp tục vòng chơi. |
| [MUD](https://github.com/latticexyz/mud) | 872 / 220 | README | Tham khảo ranh giới client/on-chain. Không di chuyển hợp đồng FHE sang framework khác. |

Đây là áp dụng nguyên tắc bằng mã viết riêng cho Chimera; không nhập engine, sao chép tài sản hoặc tái sử dụng RNG phía client cho kết quả Sepolia.

## Quyết định sản phẩm

Vòng chơi chính: chọn sinh vật → soạn ba chiêu bí mật → ký và đấu → xem ba hiệp → dùng XP để luyện, hoặc điều chỉnh kế hoạch và săn tiếp. FHE phải thể hiện qua việc đối thủ không đọc được kế hoạch/sức mạnh, nhưng kết quả vẫn kiểm chứng được.

Nâng cấp lần này giới hạn ở một lát cắt chiến đấu hoàn chỉnh:

1. **Soạn lệnh:** ba thẻ hiệp + một bộ ba lệnh dùng chung, tự chuyển sang hiệp kế tiếp sau khi chọn. Hiển thị khắc chế ngay tại nơi chọn; bớt lặp chín nút.
2. **Báo cáo trận:** cùng dữ liệu hiệp cho kết quả mới và replay; chỉ hiện chiêu thực sự có trong máy người chơi hoặc đã được phép giải mã. Không quy kết thắng/thua hoàn toàn cho khắc chế, không công bố sức mạnh hay lần roll.
3. **Phần thưởng và bước tiếp:** XP lấy từ receipt, không phát thưởng giả khi replay; đi tiếp tới Dojo/Colosseum, kiểm chứng là hành động tùy chọn.
4. **Vòng đời cảnh:** callback tiến độ sau done/fail không được đưa cảnh về chờ ký hay chờ block.

## Tiêu chí chấp nhận

- Đổi ba lệnh bằng chuột hoặc bàn phím; luôn có ba giá trị hợp lệ và có thể quay lại sửa một hiệp.
- Đấu tập còn phát đủ ba hiệp, có thể thắng 3–0 khi đọc kế hoạch và chọn đúng khắc chế.
- Replay #19 cho kết quả giống Sepolia; không hiển thị XP mới. Chiêu không được biết vẫn là sealed.
- Capped XP dùng sự kiện `XpGranted` đúng sinh vật/hợp đồng; không lấy 15/8 XP mặc định.
- Cảnh terminal không nhận cập nhật tiến độ muộn; hành động mới tạo một cảnh mới.
- Frontend tests, type-check và build đạt; kiểm tra Chrome desktop/mobile. Không ký giao dịch hay triển khai hợp đồng mới trong lượt nâng cấp này.

## Đã triển khai và kiểm chứng

- `Tactics.tsx`: bảng ba thẻ hiệp + bộ ba lệnh chung, tự chuyển hiệp, quay lại sửa bằng bàn phím, chú thích khắc chế; đấu tập ghi rõ local practice.
- `BattleDebrief.tsx` và `battle-report.ts`: báo cáo từ ba bit kết quả xác nhận. Không suy diễn chiêu đối thủ từ kết quả; dữ liệu không đủ không tạo báo cáo giả.
- `Arena.tsx`/`pending.ts`: đưa kế hoạch người chơi thực sự có và XP thực nhận vào báo cáo, kể cả khi chốt qua Inbox. Replay chỉ dùng kế hoạch của người đang có quyền xem trong phiên này.
- `Stage.tsx`: sau trận ưu tiên đi luyện khi đủ XP hoặc chuẩn bị săn tiếp; kiểm chứng là lựa chọn phụ. Combat/Boss không còn hiện XP mặc định trước khi biết phần thưởng thật. Sửa lời thoại Boss còn sót hồi chiêu 10 phút và mô tả sai việc công bố damage.
- `store.ts`: done/fail là trạng thái kết thúc; tiến độ mạng đến muộn không đưa cảnh trở về chờ ký/block.
- 25 test frontend đạt (có test hồi quy thất bại trước khi sửa vòng đời cảnh), type-check và production build đạt.
- Chrome: sửa ba lệnh bằng Enter; đấu tập mù rồi đọc kế hoạch Guard/Guard/Strike, chọn Feint/Feint/Guard và thắng 3–0. Replay #19 hiện Strike/Guard/Feint của người chơi, ba chiêu đối thủ vẫn sealed, tỉ số 3–0 và nhãn “Replay · no new rewards”.
- Viewport 390 px (nội dung 375 px sau scrollbar): bảng lệnh và báo cáo không tràn ngang. Không thấy console error trong lượt kiểm tra.
- Bằng chứng: `tmpshots/combat-command-board.jpg`, `combat-debrief-desktop.jpg`, `combat-debrief-mobile.jpg`.

Chưa kiểm thử lại một trận mới có ký ví thật; nhánh XP bị cap được kiểm tra bằng dữ liệu receipt trong test. Đây là lượt nâng cấp vòng chiến đấu, không phải xác nhận toàn bộ game đã sẵn sàng nộp bài.
