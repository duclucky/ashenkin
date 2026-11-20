# Ashenkin: chữ ký, gas và chốt kết quả

Bản hosted dùng ví Circle gắn với đăng nhập ví hoặc email. Máy chủ chỉ ký các lời
gọi game được cho phép cho ví này. Ví đăng nhập xác thực danh tính; ví game giữ
NFT và trả phí các hành động do người chơi khởi tạo. Bản standalone có thể dùng
ví ngoài và yêu cầu chủ ví ký trực tiếp. Quyền đọc FHE tuân theo địa chỉ thực gọi
contract; khóa Lab dùng để đọc riêng, không phải quyền gửi giao dịch.

## Hành động nào lên chain và ai trả gas

| Hoạt động | Thực thi và chữ ký |
| --- | --- |
| Đăng nhập hosted | Ví ký SIWE một lần cho phiên đăng nhập hoặc email xác nhận bằng mã; khôi phục cùng ví game Circle. |
| Mint NFT, mở trận, tạo trứng, bắt đầu luyện và các lời gọi contract khác | Ví game Circle ký trên server và dùng ETH của ví game; ví ngoài tự ký khi chơi standalone. Approval có thể cần trước lời gọi dùng cZAMA. |
| Chốt trận, nở trứng, hoàn tất luyện | Sponsor tương tác gửi proof Zama bằng signer riêng khi dịch vụ được cấu hình và còn ngân sách. |
| Sự kiện Living Xenos | Worker offline dùng signer và ngân sách riêng; không cần người chơi ký hay claim từng kết quả. |
| Faucet gas | Ví faucet riêng cấp 0.002 ETH Sepolia mỗi tài khoản mỗi 24 giờ khi có tiền, không có trần tổng ngày toàn server. |
| Đấu tập, cốt truyện, replay, craft/equip đồ cosmetic | Xử lý trình duyệt/backend, không gửi giao dịch gameplay; phải có NFT mới tham gia chơi. Xem proof/replay công khai không cần NFT. |

Giảm popup không xóa giao dịch hay gas. Một trận săn vẫn gồm giao dịch mở trận,
FHE/Zama tạo proof và giao dịch chốt. Sponsor trả gas chốt thay người chơi, không
thay quyền sở hữu hay tự quyết định kết quả. [Ranh giới tin cậy](confidentiality.md).

## Cấp cuộc săn

`Start a hunt` dành một quái thường đang rảnh cho từng Keeper; khi không có cá thể
phù hợp và còn chỗ, `explore` tạo quái mới bằng RNG Zama. Người chơi không phải
chọn cùng một quái thường rồi đợi nhau. Danh sách shared rare sightings dành cho
cá thể có ít nhất hai trong bảy đặc điểm ngoại hình Rare/Mythic; đây là tiêu chí
ngoại hình công khai, không tiết lộ gen ẩn hoặc bảo đảm sức mạnh.

Reservation gắn với Keeper, NFT tham chiến và calldata cố định. Reservation chưa
bind hết hạn sau năm phút. Yêu cầu đã bind nhưng chưa rõ trạng thái không tự hết
hạn để tạo lượt gửi mới; backend tiếp tục đối soát. Cơ chế này điều phối đường
chơi hosted, không ngăn người khác gọi public contract trực tiếp. Contract vẫn
chặn bắt cùng một NFT hai lần; một sighting chung có thể đang giao chiến.

Colosseum hosted đặt `maxRoaming = 10000`, cooldown 180 giây; Lab vẫn giới hạn
10000 NFT trong dân số. Giá trị mặc định trong source Colosseum là 24 roaming,
nên deployment mới cần cấu hình owner rõ ràng. Giới hạn dân số và hồi chiêu của
champion vẫn được áp dụng.

## Gửi chốt song song

Signer chốt tương tác tách khỏi signer Living và faucet. SQLite journal lưu job
key, nonce, calldata, signed bytes và hash trước broadcast. Job key gồm chain,
contract, loại tác vụ, ID và handles. Tối đa tám giao dịch tương tác đang chờ;
chỉ cấp nonce/ký theo thứ tự, không chờ receipt trước mới gửi tác vụ tiếp theo.
Raw payload và key chỉ lưu trong dữ liệu riêng trên VPS.

Backend đọc trạng thái pending và handles trên chain, lấy proof KMS rồi đọc lại
trước khi gửi. Contract kiểm tra proof với handles đã lưu của chính trận, trứng
hoặc lượt luyện. Gọi lại cùng job đã lưu trả về hash đó trước khi tính proof mới.
Nếu nonce đang chờ không thuộc journal, thiếu nonce, hết cửa sổ hoặc không đủ
ngân sách, yêu cầu bị chặn trước khi ký.

Worker đối soát mỗi ba giây. Khi ACK bị mất hoặc process khởi động lại, worker
phát lại đúng signed bytes với cùng hash, không tạo chữ ký mới. Journal kiểm tra
sender, destination, nonce, calldata, value và receipt; hoàn tất sau block chứa
giao dịch cộng thêm hai block. UI đọc receipt và event mong đợi trước khi báo
kết quả. Thời gian lấy proof, mạng Circle/RPC, ngân sách và block Sepolia vẫn có
thể làm chậm một hành động.

## Khôi phục và thử lại

`GET /api/settlement?world=ashenkin&kind=battle&id=<id>&handles=<h1,h2,h3>` là phép
đọc để lấy hash/state đã biết. `unknown` không chứng minh rằng được phép ký lại.
POST của cùng job dùng hash bền vững; các payload không khớp bị từ chối.

Trình duyệt thử lại tối đa ba lần khi nhận HTTP 429 báo từ chối trước khi ký,
trong cùng hoạt cảnh. Timeout hoặc lỗi mạng chưa rõ kết quả phải đối soát thay
vì gửi một hành động mới. Sau reload, dùng Inbox hoặc Battle log để tiếp tục
việc đang chờ. Backend khôi phục những giao dịch đã có trong journal; điều này
không đồng nghĩa tự quét mọi sự kiện mở trận chưa được gửi tới dịch vụ chốt.

Nếu không có key tương tác riêng, backend giữ cơ chế signer chung thận trọng.
Nếu chưa cấu hình sponsor hoặc sponsor tạm không khả dụng, người chơi có thể
chốt bằng ví qua Inbox. [Cấu hình signer và lưu trữ](configuration.md#optional-funding-services).

## Kiểm chứng

- [Test pipeline backend](../backend/lib/settlement-pipeline.test.js) kiểm tra
  nonce riêng, giới hạn pending/ngân sách, chống trùng calldata, restart và mất ACK.
- [Test tích hợp hợp đồng](../contracts/test/SettlementPipeline.ts) gửi ba trận
  trước khi mining rồi đối chiếu từng receipt, kết quả và journal.
- [Bằng chứng Sepolia và phạm vi kiểm thử](verification.md#november-20-hunts-and-pipelined-settlement)
  ghi các settlement cùng block. Khoảng 4–10 giây đã đo chỉ tính từ ký/phát tới
  mining, không phải toàn bộ hành động hay cam kết độ trễ.
- Proof Center so khớp ba bit thắng hiệp với kết quả KMS và bản ghi đã chốt.
  Gen, sức mạnh, kế hoạch và roll vẫn theo ACL FHE; ngẫu nhiên từ `FHE.rand*`
  trong contract, không thay bằng RNG backend.

## Số đo gas tham chiếu ngày 16/11/2026

Các số sau thuộc thế giới Chimera v2 tại thời điểm đo, không phải quote phí cho
bản Ashenkin hoặc trạng thái chain hôm nay.

| Luồng | Giao dịch đã quan sát | Gas từ receipt |
| --- | --- | --- |
| Wild Hunt #1 | Mở có tạo quái hoang, rồi chốt ba hiệp | 11007430 + 981598 = 11989028 |
| Nursery #8 × #9 | Tạo trứng và nở, chưa gồm approval lần đầu | 8638270 + 3064475 = 11702745 |
| Wishing Well | Mint test token, allowance, wrap | 1082874 |
| Quest Board | Check-in và nhận một nhiệm vụ | 3197254 |

Trên cùng snapshot đó, `eth_estimateGas` trả 10835071 cho `explore` và 4670608
cho `challengeWild` với quái có sẵn. Chênh lệch khoảng 57% chỉ ở bước mở trận;
không phải mức giảm đã thanh toán của toàn trận. [Receipt và bối cảnh gốc](qa-sepolia-v2-2026-11-16.md).
