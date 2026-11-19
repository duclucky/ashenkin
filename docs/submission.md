# Ashenkin · Kịch bản nộp bài

## Điều kiện của Season 5

- **Confidential Gaming** là hạng mục duy nhất. Ban giám khảo chấm gameplay và UX, cách mã hóa tạo ra luật chơi, công bằng có thể kiểm chứng, một vòng chơi hoàn chỉnh trên Sepolia, chất lượng video và chất lượng mã nguồn. Hạn chót là **14/12/2026, 23:59 AoE** (15/12, 18:59 giờ Việt Nam). Giữ mốc chuẩn bị nội bộ trước hạn công bố. [Bài công bố chính thức](https://www.zama.org/post/zama-developer-program-mainnet-season-5-confidential-gaming)
- Hồ sơ cần mã nguồn hợp đồng và frontend, tài liệu rõ ràng, **website demo hoạt động**, video pitch **3 phút do người thật trình bày** và một thread hoặc bài viết đã đăng trên X. Form yêu cầu dùng token bí mật ERC-7984 khi phù hợp. cZAMA trong game là wrapper thử nghiệm `cZAMAMock` trên Sepolia; cUSDT là đơn vị trao giải. [Form](https://forms.zama.org/zama-developer-program-mainnet-season-5-confidential-gaming) · [Registry Sepolia](https://docs.zama.org/protocol/protocol-apps/addresses/testnet/sepolia)
- Form yêu cầu tên dự án không chứa “Zama” và hiện đúng câu sau **cả trong game lẫn README**: “This project is not audited, endorsed or operated by Zama. Use at your own risk.” Tên **Ashenkin** phù hợp. Mỗi email nộp một dự án, một lần; bài đã gửi không sửa được. Email phải trùng với email dùng để xin API key. Trang đăng ký bắt buộc email, hồ sơ GitHub và hồ sơ X; hai trang cuối chỉ mở sau khi điền các trường bắt buộc. [Form nộp bài](https://forms.zama.org/zama-developer-program-mainnet-season-5-confidential-gaming)

## Trục demo

Lộ trình mới là **đăng nhập ví/email → gas nếu thiếu → mint NFT → hoàn tất trận săn đầu → Living Xenos**. Danh tính đăng nhập liên kết với ví game do Circle quản lý; phải có NFT mới vào hoạt động chơi. Faucet gas cấp 0.002 ETH Sepolia mỗi tài khoản mỗi 24 giờ khi có tiền. Đấu tập và cốt truyện Beacon là nhánh tùy chọn sau khi có NFT, không tốn gas và không dùng Zama để sinh kết quả.

Living Xenos là điểm nhấn mới: máy chủ tài trợ tối đa một thử thách đủ điều kiện/NFT/ngày UTC. Zama sinh loại sự kiện, mức khó, luck và loot; FHE kiểm tra sức mạnh và lợi thế nguyên tố mà không công khai các giá trị này. Backend kiểm chứng proof qua hàm đọc của hợp đồng trước khi cộng vật phẩm thông thường. Người chơi không ký claim; thắng nhận đồ, thua không mất gì. Đèn Trail đầu tiên dùng 3 Ash thread hoặc 1 Ash thread + 1 Archive fragment, không tăng sức chiến đấu và không phải đèn đọc cửa Depths.

Đưa **Colosseum → ba hiệp → Proof Center** lên trước. Nếu kế hoạch của người giữ cổng hiện công khai, đối thủ có thể chọn chiêu khắc chế trước khi vào trận. Hợp đồng tính từng hiệp từ kế hoạch và sức mạnh mã hóa, dùng số ngẫu nhiên sinh trong giao dịch, rồi kiểm tra chữ ký KMS trên ba bit kết quả. Quay rõ người xem có thể tự đối chiếu ba bit với giao dịch chốt trận. Ấp và lai gen cho thấy cách một con quái được xây dựng trước trận; Market, Relics và Depths bổ sung chiều sâu nếu còn thời gian. [Tài liệu ngẫu nhiên mã hóa](https://docs.zama.org/protocol/solidity-guides/smart-contract/operations/random)

Ở Depths, quay cùng một tầng hai lần trong **The lantern trial**. Lần đầu chỉ biết nội dung một cửa. Lần hai xem đủ ba cửa rồi chọn lại trên đúng tầng đó. Bản thử dùng ngẫu nhiên trình duyệt với cùng ngưỡng xác suất tầng 1. Trên Sepolia, hợp đồng gieo và mã hóa cả ba cửa khi tạo tầng, cấp quyền đọc cửa có đèn cho người đi hầm. Nếu người chơi chọn đăng kỷ lục, Proof Center đối chiếu bit sống sót KMS trả về với sự kiện đã được hợp đồng chấp nhận. Nhật ký, máu và loot vẫn riêng tư. [Quyền giải mã trong FHEVM](https://docs.zama.org/protocol/solidity-guides/smart-contract/acl)

Ngày 17/11/2026, trên website công khai của Ashenkin, ví thử dùng Keliakor #1 mở Wild Hunt #1 và gặp quái hoang #2. Sau khi giao dịch mở trận xác nhận, tải lại Battle Log. Trận hiện `Awaiting reveal` và hoàn tất qua `Reveal rounds`. Keliakor thắng hiệp 1 và 2, thua hiệp 3, bắt được quái hoang. Từ cửa sổ khách, bấm `Verify the rounds` rồi `Verify all three rounds`. Game báo cả ba kết quả KMS khớp dữ liệu đã chốt trên Sepolia. [Trận và Proof Center](https://ashenkin.xyz/#/arena/log/1) · [Giao dịch ấp Keliakor](https://sepolia.etherscan.io/tx/0x0a0c550cd9e6e174b4056dfdadc2073ecb0d0ea3edd9301b804841bf3efbd62a) · [Mở trận](https://sepolia.etherscan.io/tx/0xdd102d9b3391f71ee5539ab71d9d0324823e5e3c9ccd1446ae05d8440f1aeddd) · [Chốt trận](https://sepolia.etherscan.io/tx/0xab52e10d32f2b05bd0b3b4dc09fd58bd72a47bc869b1f02cddcc90b13c4e9d1e)

Lần đo trên Chrome với ví thử tự ký mất 38,6 giây từ nút mở trận đến xác nhận và 24,6 giây từ nút chốt đến xác nhận. Thời gian này gồm xử lý của ứng dụng, Zama và Sepolia. [Ảnh xác minh từ phiên khách](proof-center.png)

Bản hiện tại dùng Relayer SDK cũ và phép kiểm tra trên vẫn chạy. Tài liệu Zama giới thiệu SDK mới làm mặc định. Chỉ đưa việc đổi SDK vào luồng phát hành nếu có vấn đề tương thích hoặc lỗi thực tế khi kiểm tra demo. [Tổng quan Zama SDK](https://docs.zama.org/protocol/sdk)

## Video 3 phút — bản cập nhật 18/11

Video mới quay chuyển động thực từ giao diện hiện tại và dữ liệu Sepolia đã có.
Không gửi giao dịch mới chỉ để quay. Phần đấu thật ghi rõ là replay; phần thực
hành ghi rõ là local, không gas và không thưởng. Xác minh gọi relayer/KMS và RPC
thật. Không thay kết quả, không bịa phần thưởng và không dùng ảnh tĩnh làm gameplay.

| Mốc | Cảnh |
| --- | --- |
| 0:00–0:10 | Thế giới Arkhive đang chuyển động |
| 0:10–0:30 | Đăng nhập, ví game Circle, chính sách faucet và bộ sưu tập NFT |
| 0:30–0:48 | Ngoại hình NFT công khai, gen và sức mạnh ẩn |
| 0:48–1:12 | Bài tập local: kế hoạch ẩn rồi lộ; cùng các lượt roll |
| 1:12–1:32 | Phát lại Wild Hunt #1 trên Sepolia |
| 1:32–2:00 | Đối chiếu ba kết quả KMS với bản ghi đã chốt |
| 2:00–2:30 | Living Xenos: phát lại sự kiện, phần thưởng thật và Verify |
| 2:30–2:50 | Túi đồ và hai công thức đèn đầu tiên; không hứa thưởng chắc chắn |
| 2:50–3:00 | URL game và repo |

Xuất bản nhạc nền + phụ đề tiếng Anh và tệp SRT, kèm kịch bản đọc có mốc thời
gian để chủ dự án thu giọng thật. Theo thông báo chính thức, pitch phải do người
thật trình bày; bản nhạc/phụ đề chưa có giọng người thật là bản để lồng tiếng,
không tự được coi là bài pitch hoàn chỉnh đủ điều kiện nộp.

## Bản nháp chuỗi bài X

1. Trong Ashenkin, bạn nuôi, lai và đưa Xenos vào đấu trường trên Sepolia. Gen ẩn và ba chiêu đã chọn được giữ kín bằng Zama FHEVM. Đó là luật chơi của Colosseum.
2. Mỗi sinh vật có tám locus, mỗi locus có hai alen. Chủ sinh vật có thể giải trình tự để phát hiện alen hiếm ẩn sau ngoại hình rồi chọn cặp bố mẹ cho lần lai tiếp theo.
3. Hai bên chọn ba chiêu trước trận. Hợp đồng tính từng hiệp từ chiêu, chỉ số ẩn và ngẫu nhiên on-chain. Kết quả từng hiệp có bằng chứng Zama KMS để kiểm tra trong Proof Center.
4. Thử Judge Mode để ấp phôi, vào Colosseum và mở Proof Center. Demo https://ashenkin.xyz/. Mã nguồn và test https://github.com/duclucky/ashenkin.

## Trước khi nộp

- [x] Thêm đúng tuyên bố miễn trừ trách nhiệm ở chân trang game và trong README.
- [x] Đã kiểm tra clone sạch trên VPS ngày 19/11: build, API, WASM và metadata đạt. Dùng chế độ `npm --prefix backend run demo` để phục vụ bản build và API cùng origin. Chạy `npm --prefix backend run check:demo -- <PUBLIC_ORIGIN> 1` với URL HTTPS triển khai. Mở URL gốc của demo cùng link repo từ cửa sổ ẩn danh, trên máy tính và điện thoại.
- [x] Xác nhận `tokenURI(1)` của Ashenkin trỏ tới JSON công khai dưới `/api/ashenkin-nft/`.
- [x] Chơi Wild Hunt #1 trên demo công khai với NFT đã ấp trên Sepolia. Tải lại sau khi mở trận và chốt tiếp từ Battle Log.
- [x] Mở trực tiếp Wild Hunt #1 từ phiên khách và đối chiếu ba kết quả KMS với giao dịch chốt.
- [x] Luồng ấp → lai → đấu → bán đã chạy trên Sepolia trong [QA ngày 18/11](qa-2026-11-18.md). Bộ kiểm thử clone sạch ngày 19/11 đạt 312 ca trước đợt sửa tài liệu; xem [bằng chứng hiện tại](verification.md).
- [ ] Xác nhận trạng thái verify source trên explorer; đối chiếu runtime bytecode không thay thế việc verify source.
- [ ] Quay video 3 phút với người trình bày thật. Điền URL demo và mã nguồn vào bài X. Khi đủ liên kết, dùng email đã xin API key để mở hai trang cuối, kiểm tra toàn bộ hồ sơ rồi mới gửi.

## Tài liệu dành cho giám khảo

[Thiết kế FHE và ranh giới tin cậy](confidentiality.md) · [Cấu hình để chạy lại](configuration.md) · [Bằng chứng kiểm thử](verification.md). Video nộp cuối và URL bài X vẫn do chủ dự án hoàn thiện; không coi bản nháp là bài đã đăng.
