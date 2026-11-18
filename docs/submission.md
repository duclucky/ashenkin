# Ashenkin · Kịch bản nộp bài

## Điều kiện của Season 5

- **Confidential Gaming** là hạng mục duy nhất. Ban giám khảo chấm gameplay và UX, cách mã hóa tạo ra luật chơi, công bằng có thể kiểm chứng, một vòng chơi hoàn chỉnh trên Sepolia, chất lượng video và chất lượng mã nguồn. Hạn chót là **14/12/2026, 23:59 AoE** (15/12, 18:59 giờ Việt Nam). Giữ mốc nộp nội bộ 13/12 theo [kế hoạch](../plan.md). [Bài công bố chính thức](https://www.zama.org/post/zama-developer-program-mainnet-season-5-confidential-gaming)
- Hồ sơ cần mã nguồn hợp đồng và frontend, tài liệu rõ ràng, **website demo hoạt động**, video pitch **3 phút do người thật trình bày** và một thread hoặc bài viết đã đăng trên X. Form yêu cầu dùng token bí mật ERC-7984 khi phù hợp. cZAMA trong game là wrapper thử nghiệm `cZAMAMock` trên Sepolia; cUSDT là đơn vị trao giải. [Form](https://forms.zama.org/zama-developer-program-mainnet-season-5-confidential-gaming) · [Registry Sepolia](https://docs.zama.org/protocol/protocol-apps/addresses/testnet/sepolia)
- Form yêu cầu tên dự án không chứa “Zama” và hiện đúng câu sau **cả trong game lẫn README**: “This project is not audited, endorsed or operated by Zama. Use at your own risk.” Tên **Ashenkin** phù hợp. Mỗi email nộp một dự án, một lần; bài đã gửi không sửa được. Email phải trùng với email dùng để xin API key. Trang đăng ký bắt buộc email, hồ sơ GitHub và hồ sơ X; hai trang cuối chỉ mở sau khi điền các trường bắt buộc. [Form nộp bài](https://forms.zama.org/zama-developer-program-mainnet-season-5-confidential-gaming)

## Trục demo

Lộ trình người chơi bắt đầu bằng thử thách của Lumen. Người chơi đánh ba hiệp khi chưa biết chiêu, rồi thử lại với cùng đối thủ sau khi mở kế hoạch. Bản thử dùng luật khắc chế trong trình duyệt. Trận Sepolia còn tính sức mạnh, nguyên tố và số ngẫu nhiên trên dữ liệu mã hóa. Sau trận Sepolia đầu, nhiệm vụ dẫn người chơi giải trình tự, gửi và đón quái thám hiểm, rồi dùng XP và cZAMA để luyện hoặc lai.

Đưa **Colosseum → ba hiệp → Proof Center** lên trước. Nếu kế hoạch của người giữ cổng hiện công khai, đối thủ có thể chọn chiêu khắc chế trước khi vào trận. Hợp đồng tính từng hiệp từ kế hoạch và sức mạnh mã hóa, dùng số ngẫu nhiên sinh trong giao dịch, rồi kiểm tra chữ ký KMS trên ba bit kết quả. Quay rõ người xem có thể tự đối chiếu ba bit với giao dịch chốt trận. Ấp và lai gen cho thấy cách một con quái được xây dựng trước trận; Market, Relics và Depths bổ sung chiều sâu nếu còn thời gian. [Tài liệu ngẫu nhiên mã hóa](https://docs.zama.org/protocol/solidity-guides/smart-contract/operations/random)

Ở Depths, quay cùng một tầng hai lần trong **The lantern trial**. Lần đầu chỉ biết nội dung một cửa. Lần hai xem đủ ba cửa rồi chọn lại trên đúng tầng đó. Bản thử dùng ngẫu nhiên trình duyệt với cùng ngưỡng xác suất tầng 1. Trên Sepolia, hợp đồng gieo và mã hóa cả ba cửa khi tạo tầng, cấp quyền đọc cửa có đèn cho người đi hầm. Nếu người chơi chọn đăng kỷ lục, Proof Center đối chiếu bit sống sót KMS trả về với sự kiện đã được hợp đồng chấp nhận. Nhật ký, máu và loot vẫn riêng tư. [Quyền giải mã trong FHEVM](https://docs.zama.org/protocol/solidity-guides/smart-contract/acl)

Ngày 17/11/2026, trên website công khai của Ashenkin, ví thử dùng Keliakor #1 mở Wild Hunt #1 và gặp quái hoang #2. Sau khi giao dịch mở trận xác nhận, tải lại Battle Log. Trận hiện `Awaiting reveal` và hoàn tất qua `Reveal rounds`. Keliakor thắng hiệp 1 và 2, thua hiệp 3, bắt được quái hoang. Từ cửa sổ khách, bấm `Verify the rounds` rồi `Verify all three rounds`. Game báo cả ba kết quả KMS khớp dữ liệu đã chốt trên Sepolia. [Trận và Proof Center](https://ashenkin.xyz/#/arena/log/1) · [Giao dịch ấp Keliakor](https://sepolia.etherscan.io/tx/0x0a0c550cd9e6e174b4056dfdadc2073ecb0d0ea3edd9301b804841bf3efbd62a) · [Mở trận](https://sepolia.etherscan.io/tx/0xdd102d9b3391f71ee5539ab71d9d0324823e5e3c9ccd1446ae05d8440f1aeddd) · [Chốt trận](https://sepolia.etherscan.io/tx/0xab52e10d32f2b05bd0b3b4dc09fd58bd72a47bc869b1f02cddcc90b13c4e9d1e)

Lần đo trên Chrome với ví thử tự ký mất 38,6 giây từ nút mở trận đến xác nhận và 24,6 giây từ nút chốt đến xác nhận. Thời gian này gồm xử lý của ứng dụng, Zama và Sepolia. [Ảnh xác minh từ phiên khách](../tmpshots/ashenkin-release-hunt/guest-proof.png)

Bản hiện tại dùng Relayer SDK cũ và phép kiểm tra trên vẫn chạy. Tài liệu Zama giới thiệu SDK mới làm mặc định. Chỉ đưa việc đổi SDK vào luồng phát hành nếu có vấn đề tương thích hoặc lỗi thực tế khi kiểm tra demo. [Tổng quan Zama SDK](https://docs.zama.org/protocol/sdk)

## Video 3 phút

Chuẩn bị một ví Sepolia đã có cZAMA, hai sinh vật đã hết hồi chiêu và một ví mua riêng. Mở sẵn Judge Mode và Proof Center. Quay người thật nói, dùng cảnh giao dịch Sepolia thật và cắt đoạn chờ ví hoặc KMS khi dựng.

| Thời gian | Cảnh quay | Lời dẫn |
| --- | --- | --- |
| 0:00–0:20 | Bản đồ, mở Colosseum, hiện ba thẻ chiêu | “Nếu biết trước ba chiêu của người giữ đấu trường, đối thủ chỉ cần chọn ba chiêu khắc chế. Trong Ashenkin, hai bên chốt kế hoạch bằng dữ liệu mã hóa và hợp đồng tính kết quả trên Sepolia.” |
| 0:20–0:55 | Ấp phôi ở Lab, mở hồ sơ và giải trình tự một locus | “Mỗi sinh vật có tám locus, mỗi locus có hai alen. Ngoại hình hiện công khai. Chủ sinh vật có thể giải trình tự để xem locus có alen hiếm hay không, rồi quyết định giữ con đó hay mang đi lai.” |
| 0:55–1:25 | Chọn hai bố mẹ, tạo trứng, mở trứng và xem phả hệ | “Con nhận một alen từ mỗi bố mẹ ở từng locus. Hợp đồng chọn các alen trên dữ liệu mã hóa. Khi nở, ta thấy ngoại hình và phả hệ, còn các alen ẩn vẫn được giữ kín.” |
| 1:25–2:20 | Chọn ba chiêu, chốt trận, mở bảng Proof và giao dịch settle | “Mình chọn Strike, Guard và Feint. Hợp đồng kết hợp chiêu, chỉ số ẩn và ngẫu nhiên on-chain. Khi chốt trận, bằng chứng Zama xác nhận ai thắng từng hiệp. Đối thủ vẫn giữ kín kế hoạch và chỉ số.” |
| 2:20–2:45 | Niêm yết con mới, đổi sang ví mua, hoàn tất giao dịch | “Giá niêm yết hiện công khai. Người mua trả bằng cZAMA và hợp đồng xác minh khoản thanh toán qua một bit. Khi thanh toán hợp lệ, sinh vật chuyển sang ví mua.” |
| 2:45–3:00 | Mở Judge Mode và hiện URL bản demo | “Judge Mode dẫn bạn qua Lab, Colosseum và Proof Center. Nursery và Market có trên bản đồ. Proof Center ghi rõ dữ liệu nào được mở và cách kiểm tra kết quả.” |

## Bản nháp chuỗi bài X

1. Trong Ashenkin, bạn nuôi, lai và đưa Xenos vào đấu trường trên Sepolia. Gen ẩn và ba chiêu đã chọn được giữ kín bằng Zama FHEVM. Đó là luật chơi của Colosseum.
2. Mỗi sinh vật có tám locus, mỗi locus có hai alen. Chủ sinh vật có thể giải trình tự để phát hiện alen hiếm ẩn sau ngoại hình rồi chọn cặp bố mẹ cho lần lai tiếp theo.
3. Hai bên chọn ba chiêu trước trận. Hợp đồng tính từng hiệp từ chiêu, chỉ số ẩn và ngẫu nhiên on-chain. Kết quả từng hiệp có bằng chứng Zama KMS để kiểm tra trong Proof Center.
4. Thử Judge Mode để ấp phôi, vào Colosseum và mở Proof Center. Demo `<DEMO_URL>`. Mã nguồn và test `<REPO_URL>`.

## Trước khi nộp

- [x] Thêm đúng tuyên bố miễn trừ trách nhiệm ở chân trang game và trong README.
- [ ] Dùng chế độ `npm --prefix backend run demo` để phục vụ bản build và API cùng origin. Chạy `npm --prefix backend run check:demo -- <PUBLIC_ORIGIN> 1` với URL HTTPS triển khai. Mở URL gốc của demo cùng link repo từ cửa sổ ẩn danh, trên máy tính và điện thoại.
- [x] Xác nhận `tokenURI(1)` của Ashenkin trỏ tới JSON công khai dưới `/api/ashenkin-nft/`.
- [x] Chơi Wild Hunt #1 trên demo công khai với NFT đã ấp trên Sepolia. Tải lại sau khi mở trận và chốt tiếp từ Battle Log.
- [x] Mở trực tiếp Wild Hunt #1 từ phiên khách và đối chiếu ba kết quả KMS với giao dịch chốt.
- [ ] Chạy vòng ấp → lai → đấu → bán nếu các cảnh này sẽ xuất hiện trong video. Ghi lại giao dịch Breed, Hatch, Settle và Finalize sale. Kiểm tra trạng thái xác minh mã nguồn của hợp đồng trên explorer và gắn các liên kết cần thiết vào README.
- [ ] Quay video 3 phút với người trình bày thật. Điền URL demo và mã nguồn vào bài X. Khi đủ liên kết, dùng email đã xin API key để mở hai trang cuối, kiểm tra toàn bộ hồ sơ rồi mới gửi.
