# Ashenkin — xác nhận các nhánh thưởng ngày 18/11/2026

**Raffle, kết mùa, jackpot Oracle và Oracle hết hạn đã hoàn thành trên Sepolia thật.** Đối chiếu 31 receipt thành công, kiểm tra lại các khoản chuyển cZAMA bằng giải mã FHE từ event token và kiểm tra kết quả trên giao diện. Riêng danh hiệu hiếm: nhánh thành công đã qua fixture FHEVM cục bộ; chưa có NFT tự sinh đủ điều kiện để xác nhận một lần nhận danh hiệu thật trên Sepolia.

Theo yêu cầu kiểm thử, các hạn đang mở được chuyển về **07:37:12 ngày 18/11, UTC+7**. Tiến trình hoàn tất các nhánh lúc **07:40:45**, khôi phục cấu hình xong lúc **07:41:52**. Kiểm tra lại sau đó xác nhận các chu kỳ gốc vẫn đúng.

## Kết quả thực tế

| Nhánh | Kết quả đã xác nhận |
| --- | --- |
| Raffle vòng 1 | Ba ví đã trả phí, tổng pot **10 cZAMA**. Ví QA số 6 thắng, nhận **9 cZAMA + Relic #6**. Treasury tăng **1 cZAMA**. Vòng 2 mở, proof vòng trước không được dùng để thanh toán lại. |
| Mùa giải 1 | Ba holder có điểm **17, 11, 8**. Tổng ngân sách được cấp **2.999,326474 cZAMA**, chia hết đúng tỷ trọng và phần dư làm tròn. Cấp đủ ba vương miện và ba Relic Cache; mùa 2 bắt đầu, có thể join lại với điểm mới bằng 0. |
| Jackpot Oracle vòng 1 | QA số 5 dùng gợi ý riêng tư, giải đúng sau bốn lượt bổ sung. Nhận **10 cZAMA + Relic #5**. Số dư tăng đúng jackpot; đáp án công khai sau kết thúc là **[9, 4, 1, 0]**, khớp lời đoán thắng. |
| Oracle hết hạn vòng 2 | Đóng đúng sau hạn rút ngắn, không có solver. Công khai đáp án **[13, 15, 14, 11]**; bảo toàn pot **2 cZAMA**. Một guess trả phí mở vòng 3 với pot **4 cZAMA**. Không cho claim lời đoán của vòng đã đóng. |
| Danh hiệu hiếm | Quét **30 NFT**, không NFT nào có đủ năm nét hiếm; cao nhất là hai. Bốn bài kiểm tra fixture cục bộ xác nhận điều kiện nhận danh hiệu, ngưỡng 11/12, proof giả/proof NFT khác, nhận trùng và chủ hiện tại sau chuyển NFT. Không sửa gene hay ngưỡng hiếm của production. |

Các khoản cuối mùa:

| Hạng | Ví QA | cZAMA thực nhận | Vương miện / Relic |
| --- | --- | ---: | --- |
| 1 | `0x56937336f0EdE4a2884E8F55C7e4847F039A820a` | 1.713,900842 | Đã cấp |
| 2 | `0x8F31c1EB2F6c093bFd56Da119d2573F9683bf2dc` | 856,950421 | Đã cấp |
| 3 | `0x8D2A94a3038628dDcE15FFD3771735DC08f4B0b7` | 428,475211 | Đã cấp |

Tổng mục tiêu của ba ghế là 3.500 cZAMA. Contract trả theo **ngân sách Treasury thực cấp**, thay vì hứa trả đủ mức mục tiêu. Lần này hạn mức còn dùng được là 2.999,326474 cZAMA. Ba khoản trên cộng đúng số đó, không mất phần lẻ.

## Cấu hình đã khôi phục

| Cấu hình | Sau kiểm thử |
| --- | --- |
| Raffle duration | 259.200 giây — 3 ngày |
| Oracle roundLength | 259.200 giây — 3 ngày |
| Oracle dailyGuesses | 6 — giữ nguyên trong kiểm thử production |
| Season length | 1.209.600 giây — 14 ngày |

Đã khôi phục chu kỳ của các vòng mới. Các vòng thử đã đóng và khoản thưởng đã trả vẫn được giữ trong lịch sử on-chain; không hoàn tác phần thưởng hay khôi phục ID mùa/vòng cũ. Tiến trình một lần đã thoát, không còn chạy chờ để sửa hạn thêm.

## Quyền riêng tư và chống nhận thưởng sai

- Đáp án Oracle đang mở bị từ chối cả public decrypt lẫn user decrypt của người chơi.
- **Chính ví deployer/owner**, với chữ ký Lab key được xác minh hợp lệ, cũng không đọc được đáp án đang mở qua ACL. Quyền admin đổi thời hạn là quyền riêng, không phải quyền đọc ciphertext.
- Ví khác không đọc được hint Oracle, vé raffle hoặc chỉ số Relic thưởng của người thắng. Chủ đúng đọc được.
- Raffle giữ kín winner/pot trước draw; sau draw mới mở hai giá trị và contract xác minh KMS proof khi thanh toán.
- API ví game từ chối `setDuration`, `setRules`, `setLength`. Các thay đổi thời hạn QA dùng ví deployer đã được chủ sản phẩm cho phép.
- Trên Sepolia thật, proof có cleartext giả hoặc đem proof sang NFT khác bị KMS từ chối; NFT không đủ nét hiếm bị `NotAChimera` chặn.
- Trong FHEVM cục bộ: hai người đoán đúng chỉ có một jackpot/Relic; biết đáp án nhưng không trả phí không thắng; proof raffle cũ không dùng được dù vòng mới có cùng winner và cùng pot.

## Phạm vi của kiểm thử danh hiệu hiếm

Fixture chỉ chạy trên Hardhat chain 31337. Nó tạo ciphertext hợp lệ với các mức trait đã biết, gắn vào storage của **Lab cục bộ** rồi gọi nguyên hàm `claimChimera`. Không thay mã hàm nhận danh hiệu và không đưa gene có sẵn vào NFT production. Constructor fixture chặn triển khai lên chain khác.

Fixture kiểm tra được nhánh thành công và ranh giới bảo mật, nhưng **không thay thế bằng chứng một NFT hiếm tự sinh đã nhận danh hiệu trên Sepolia**. Nhánh đó vẫn chờ NFT đủ điều kiện. Metadata được kiểm tra riêng: chỉ khi cờ on-chain `chimera` đã bật mới hiển thị `Rare lineage: Verified`; danh hiệu không làm lộ element hay allele bí mật.

## Bằng chứng và log

- [Xác minh cuối](qa-rewards-2026-11-18/reward-final-verification.json): 45 kiểm tra đối chiếu, đọc cấu hình live và giải mã lại các event trả thưởng.
- [Kết quả settlement](qa-rewards-2026-11-18/reward-settlement-result.json): snapshot trước thanh toán, người nhận, khoản chi, phần thưởng và hash.
- [Jackpot Oracle](qa-rewards-2026-11-18/reward-oracle-result.json), [Relic thưởng](qa-rewards-2026-11-18/reward-oracle-cache.json).
- [Nhật ký hạn và khôi phục](qa-rewards-2026-11-18/reward-deadlines.json), [event admin](qa-rewards-2026-11-18/reward-events.jsonl).
- [31 receipt](qa-rewards-2026-11-18/reward-ledger.jsonl), [CSV](qa-rewards-2026-11-18/reward-ledger.csv). Tất cả thành công; tổng gas **0,000266805294799155 ETH Sepolia**. Riêng kết mùa dùng **12.535.761 gas**, dưới trần 16 triệu của ví game.
- Log tiến trình nội bộ (không đưa tệp `.log` vào repo công khai), [trạng thái đã thoát/khôi phục](qa-rewards-2026-11-18/reward-runner-status.json).
- [Kiểm tra riêng tư](qa-rewards-2026-11-18/reward-privacy.json), [owner không vượt ACL](qa-rewards-2026-11-18/reward-owner-privacy.json), [chặn admin/proof sai](qa-rewards-2026-11-18/reward-guards.json).
- [UI trước đóng vòng](qa-rewards-2026-11-18/ui/before.json), [UI sau trả thưởng](qa-rewards-2026-11-18/ui/after.json): jackpot won, raffle winner, vương miện mùa cũ/mùa mới và jackpot rollover đều hiển thị; không ghi nhận pageerror.
- [122 bài contract cục bộ](qa-rewards-2026-11-18/full-contract-tests.txt), [bốn fixture danh hiệu](qa-rewards-2026-11-18/rare-fixture-tests.txt), [kiểm tra metadata](qa-rewards-2026-11-18/rare-metadata-tests.txt).

Hash chính trên Sepolia:

- [Raffle trả thưởng](https://sepolia.etherscan.io/tx/0xaac793237cb8f8522aaee424fe8183c460af6e8da86245c98c5295ac58ff1d1e)
- [Kết mùa và trả ba ghế](https://sepolia.etherscan.io/tx/0x0aceb0b7b53e022570a1d38f2949ba2f1424f7534b63c34bcedc57da7b26e03e)
- [Oracle jackpot](https://sepolia.etherscan.io/tx/0x361dafb00a613a02dbd4cbc91d4ce84fd48975b9e49c483e5057d129a6c1014c)
- [Oracle hết hạn](https://sepolia.etherscan.io/tx/0x36a8d3d7ed2e6b6536e546029b0aed70628f9562b849803da63658c100cea8da)

Provider PublicNode yêu cầu token cho một số truy vấn archive sau nhiều giờ. Lần kiểm tra đầu tại settlement đã đọc số dư ở block thanh toán thành công; lần xác minh sau dùng **ciphertext từ event `ConfidentialTransfer` trong receipt** và giải mã bằng khóa của đúng ví nhận. Không mua thêm dịch vụ RPC và không thay việc đối chiếu bằng dữ liệu giả lập.
