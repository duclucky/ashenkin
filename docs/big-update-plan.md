# Ashenkin: thiết kế trò chơi và kế hoạch phát triển

Ashenkin đã triển khai trên Sepolia với vòng chơi **đăng nhập → gas nếu thiếu →
mint NFT → săn/khám phá → luyện, lai hoặc trang bị → quay lại Colosseum**.
Living Xenos bổ sung sự kiện cho NFT cả khi chủ nhân offline. Chủ dự án đã báo
hoàn tất nộp bài; lịch xây tính năng trước hạn và danh sách contract “sắp deploy”
đã được thay bằng thiết kế đang chạy dưới đây.

## Trải nghiệm và quyền sở hữu

Người chơi đăng nhập bằng ví hoặc email để khôi phục ví game Circle gắn với danh
tính. Phải có NFT mới tham gia chơi, kể cả đấu tập. Khách xem được hướng dẫn,
metadata, replay và proof công khai. Lộ trình khởi đầu là Gas → Hatch → Fight →
Life; Beacon và đấu tập là nhánh tùy chọn. Giao diện dùng khung mobile co giãn,
màu vàng Zama, cảnh pixel, hoạt cảnh hành động và replay theo kết quả đã xác nhận.
[Luồng khởi đầu](first-steps.md) · [Hướng dẫn review](judge-walkthrough.md).

## Các hệ thống đã triển khai

| Hệ thống | Cơ chế |
| --- | --- |
| Lab và Nursery | NFT có ngoại hình công khai, alen và sức mạnh theo ACL FHE. Zama sinh gen và di truyền. Lai giữ bố mẹ; sau trứng mở đầu cần lineage charge từ Ascension tự nguyện. |
| Colosseum | Kế hoạch ba chiêu Strike/Guard/Feint được mã hóa; contract chấm ba hiệp bằng sức mạnh, khắc chế, nguyên tố và roll Zama. Proof công bố ba bit thắng hiệp. |
| Săn thường / rare sightings | Start a hunt dành quái thường theo Keeper, hoặc sinh quái khi cần và còn chỗ. Sighting hiếm chung xét ít nhất hai Rare/Mythic appearance traits; một NFT chỉ được bắt một lần. |
| Dojo và Relics | XP/luyện tập, bonus ẩn, cache, trang bị, fusion và thẩm định; chỉ phần được phép mới công khai. |
| Oracle | Đáp án và gợi ý riêng tư, lượt đoán có phí, proof cho claim jackpot và vòng hết hạn. |
| Expeditions và Depths | Thám hiểm có điều kiện nhận loot; lựa chọn cửa và trạng thái hầm giữ theo quyền đọc của người chơi. |
| Raid, Quests, Raffle và Season | Hoạt động và thưởng theo luật contract; Treasury trả trong ngân sách ngày, Season chia pool thực đủ chi. |
| Market và Ascension | Giá niêm yết công khai, thanh toán cZAMA bí mật; hiến tế NFT tự nguyện là rút vĩnh viễn khỏi lưu thông. |
| Living Xenos | Tối đa một thử thách đủ điều kiện/NFT/ngày UTC. Server tài trợ, Zama chọn sự kiện/luck/loot, FHE xét sức mạnh; thắng có vật phẩm thường, thua không mất gì. |
| Proof Center và Inbox | Kiểm chứng output được phép công khai và tiếp tục hành động pending sau reload. Replay trình diễn kết quả đã có, không sinh lại kết quả. |

Giấu kế hoạch defender khiến đối thủ phải chọn trước khi biết cách khắc chế;
Oracle cần giữ đáp án và gợi ý riêng tư. Những phần này xử lý trên FHE. Cốt truyện,
đấu tập và crafting cosmetic chạy ở trình duyệt/backend. Quyền sở hữu và ngoại
hình NFT công khai có chủ đích. [Thiết kế bảo mật](confidentiality.md).

## Kinh tế và gas

- Lai giữ bố mẹ; charge từ retirement giới hạn vòng sinh sản sau lượt mở đầu.
  NFT chờ sinh và quái hoang đều tính trong trần dân số 10000.
- Treasury chốt ngân sách ngày `min(1% reserve, 3000 cZAMA)` và trả số thực có thể
  chi. Season chia theo pool thực, không ưu tiên người nhận trước khi thiếu quỹ.
- ETH Sepolia trả gas; cZAMA trả phí/thưởng contract; đồ Living là vật phẩm backend.
  Lantern đầu dùng 3 Ash thread hoặc 1 thread + 1 Archive fragment, không tăng
  sức chiến đấu và không có token yield.
- Faucet riêng cấp 0.002 Sepolia ETH/tài khoản/24 giờ khi có tiền, không có trần
  tổng toàn server. Circle ký lời gọi hosted trên server; không tạo popup ví
  ngoài cho mỗi hành động, nhưng giao dịch chain vẫn có gas.

[Luật kinh tế](economy-v2.md) · [Cân bằng vật phẩm](living-item-balance.md).

## Hạ tầng đang dùng

Bộ Ashenkin có 16 application contracts đã verify source trên Etherscan, Sourcify
và Blockscout. Các tên nội bộ `Chimera*` giữ cho ABI/deployment. URL mặc định mở
Ashenkin; `?world=original` và `?world=v2` dành cho NFT/proof cũ. Không có migration
ngầm giữa các thế giới. [Địa chỉ contract](../README.md#sepolia-deployment).

Backend có ba vai trò signer tách biệt: chốt tương tác, sự kiện offline và faucet.
Chốt tương tác lưu signed transaction trước broadcast, cấp nonce riêng và cho
tối đa tám giao dịch pending. Không chờ một receipt trước mới gửi trận tiếp theo.
Khởi động lại hoặc mất ACK khôi phục cùng hash; receipt và KMS proof vẫn quyết
định kết quả. [Giao dịch và khôi phục](transaction-design.md).

Build, test, browser QA và dịch vụ hosted chạy trên VPS. SQLite, signer và thông
tin xác thực được giữ ngoài Git. Circle game wallets do operator kiểm soát; không
được mô tả là riêng tư với chính operator. [Cấu hình](configuration.md).

## Kiểm chứng và phần còn giới hạn

[Bằng chứng kiểm thử](verification.md) ghi test, CI, receipt Sepolia và giới hạn
của từng lượt kiểm tra. Full suite ngày 20/11 đạt 107 test backend, 114 frontend
và 131 contract; mock FHEVM không thay thế kiểm thử Sepolia.

Nhánh nhận danh hiệu hiếm thành công mới được fixture-test, chưa có NFT production
tự sinh đủ điều kiện để claim thành công. Độ trễ còn phụ thuộc Circle/RPC/Zama và
block Sepolia. Living phụ thuộc snapshot và ngân sách sponsor; số dư Treasury,
retention và cân bằng dài hạn cần được đo từ dữ liệu thực. Bản Sepolia chưa phải
nền kinh tế mainnet được audit. Các mục này cần bằng chứng riêng trước khi tuyên
bố đã hoàn tất; không mở thêm tính năng hoặc deploy contract chỉ từ tài liệu này.
