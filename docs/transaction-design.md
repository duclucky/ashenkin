# Chimera · Giảm chữ ký và gas trên Sepolia

Đề xuất ngày 16/11/2026. Dùng ví hiện tại để vào trận, tự động chốt kết quả bằng bằng chứng Zama và ưu tiên đấu quái hoang đã tồn tại. Sau khi đo chi phí còn lại, thử phiên chơi có quyền giới hạn để bỏ popup giữa các hành động thường xuyên.

## Đo trên Chimera v2

| Luồng | Giao dịch đã quan sát | Gas từ receipt |
| --- | --- | --- |
| Wild Hunt #1 | Khởi trận có tạo quái hoang, rồi chốt ba hiệp | 11.007.430 + 981.598 = 11.989.028 |
| Nursery #8 × #9 | Tạo trứng và ấp trứng, cộng một giao dịch cấp quyền cZAMA lần đầu nằm ngoài số đo | 8.638.270 + 3.064.475 = 11.702.745 |
| Wishing Well | Mint test token, cấp allowance, wrap | 1.082.874 |
| Quest Board | Check-in, nhận một nhiệm vụ | 3.197.254 |

Cùng tài khoản, NFT #8 và input mã hóa từ giao dịch đã ghi trên chain, `eth_estimateGas` trên trạng thái Sepolia lúc đo trả 10.835.071 gas cho `explore` và 4.670.608 gas cho `challengeWild` với quái #10 đang có sẵn. Chênh lệch khoảng 57% ở bước mở trận. Đây là ước tính cho hai nhánh trên cùng trạng thái, không phải số liệu phí đã thanh toán của cả trận. Tái sử dụng #10 chỉ giảm chi phí các trận tiếp theo, còn bổ sung quái mới vẫn có chi phí. Mã và giao dịch gốc nằm trong [audit Sepolia](qa-sepolia-v2-2026-11-16.md).

Đã mô phỏng `settle`, `hatchEgg` và `completeTraining` bằng `eth_call` trên state trước block chốt của từng giao dịch, với caller độc lập với cả chủ NFT và địa chỉ phát giao dịch gốc. Cả ba thành công qua RPC lưu trữ. Đây là xác minh khả năng gọi trên contract đang chạy, chưa có kết quả của một worker gửi giao dịch thật.

## Bước 1. Chốt tự động, ưu tiên quái có sẵn

- Nút `Hunt` mặc định chọn quái đang roaming và chưa bị khóa bởi trận khác. Người chơi có thể đổi mục tiêu và thấy rõ mục tiêu trước khi chốt chiến thuật. `Explore` tách riêng để tạo quái bằng RNG của Zama khi cần. Bắt được quái và chuyển NFT vẫn do contract quyết định. Nếu mục tiêu bị lấy trước khi giao dịch gửi, cập nhật danh sách và cho người chơi chọn lại.
- Worker theo dõi sự kiện mở trận, lay egg và bắt đầu tập luyện. Worker dùng handle công khai của contract để lấy bằng chứng KMS, mô phỏng điều kiện chốt và gửi giao dịch bằng ví chỉ giữ ETH tài trợ. Contract kiểm tra handle từ chính trận/trứng/buổi tập và trả kết quả cho địa chỉ đã lưu. Worker không cần chữ ký, NFT, cZAMA hay dữ liệu riêng của người chơi.
- Sau khi gửi, UI từ hoạt cảnh chuyển sang `Waiting for Zama`, sau đó `Settling` và màn kết quả có bằng chứng. Inbox khôi phục từ trạng thái chain sau khi reload. Nếu tài trợ hoặc worker hết ngân sách, bất kỳ ai có proof có thể chốt qua đường có sẵn, kể cả người chơi. Mọi bộ đếm và phần thưởng dựa vào receipt đã xác nhận. Khóa công việc theo chain, contract, loại và ID, xác minh lại `Pending` trước khi retry để xử lý trùng và cuộc đua với bên chốt khác.
- Mục tiêu kiểm thử là một popup để vào Hunt, hai giao dịch với hai người trả gas. Breed và Train mỗi lần còn một popup khi đã có quyền cZAMA. Lần đầu có thể thêm approval. Lab key là chữ ký đọc riêng khi cần, không tiêu gas và tách khỏi quyền giao dịch.

Bản local gọi backend sau khi trình duyệt nhận receipt mở trận, tạo trứng hoặc bắt đầu luyện. Backend xử lý tiếp nếu trình duyệt rời trang sau khi yêu cầu đã đến. Nếu tab đóng trước lúc gửi yêu cầu hoặc process backend khởi động lại giữa chừng, người chơi có thể chốt từ Inbox. Quét sự kiện để tự nhặt công việc sau khi khởi động lại vẫn là bước tiếp theo.

## Bước 2. Giảm số lần ghi và chi phí thật

- Với **Quest Board**, ghi nhận ngày chơi khi có hành động hợp lệ đã lên chain. Thêm một lượt `Collect` nhận cùng lúc check-in, các nhiệm vụ đủ điều kiện và chest, dùng một lần thanh toán cZAMA mã hóa. Benchmark từ tối đa sáu giao dịch còn tối đa một lượt nhận cho cả ngày nếu người chơi đợi hoàn thành. Contract đánh dấu từng mục đã nhận, áp dụng đúng multiplier, ngân sách Treasury và quy tắc trùng/lỗi. Trạng thái điểm danh cũ cần tính đến nếu triển khai cho thế giới đang hoạt động.
- Với **Wishing Well**, thử cấp từ nguồn test có sẵn hoặc wrap vào địa chỉ người chơi từ kho test đã cấp allowance. Hạn mức mỗi tài khoản và ngân sách do faucet giới hạn. Đo từ ba giao dịch còn một lượt cấp, chọn dựa trên gas thực đo và chi phí nạp kho.
- Thử gộp các ghi độc lập và proof đã sẵn sàng, với batch nhỏ để giữ giới hạn block và FHE. Với `start → KMS → settle`, giữ hai bước theo thời gian. Đo gas, số request KMS, thời gian đợi và tỷ lệ lỗi trước/sau. Không gộp nhiều thao tác đắt vào một giao dịch nếu vượt mức thực thi trên Sepolia.
- Hướng dẫn, đấu tập, chọn đội hình nháp, xem replay và hoạt cảnh dùng trình duyệt. Tiền, XP dùng để tiến cấp, kết quả giải và NFT thuộc chủ nào vẫn do contract quyết định. Phần thưởng mang giá trị của game chỉ phát sinh trong luồng đã xác nhận.

## Bước 3. Phiên chơi do người chơi kiểm soát

Thử trên Sepolia một smart account thuộc người chơi, có module cấp khóa phiên và paymaster theo ERC-4337. Khóa phiên tạo ở client, chỉ được gọi hàm/contract được chỉ định cho lối chơi thường xuyên. Ràng buộc `chainId`, nonce, thời hạn ngắn, NFT được dùng và hạn mức lượt/cZAMA. Soát ownership và quyền ở thời điểm thực hiện. Thu hồi phiên theo quyền ví chính. Bán, chuyển, hiến tế, công khai gen và cấp quyền token tổng quát vẫn phải qua xác nhận của chủ ví.

Ví sẵn có vẫn dùng luồng trực tiếp. Ví hỗ trợ atomic batch theo ERC-5792 có thể gộp các bước đã có đủ dữ liệu như approval và bắt đầu, sau khi kiểm tra capability đúng chain. Trước khi đưa khóa phiên lên luồng chính, cần chứng minh input mã hóa gắn đúng địa chỉ thực gọi contract, owner/cZAMA được nhận diện đúng và giải mã riêng qua Zama chạy với loại tài khoản đã chọn. Ví thông minh mới có thể có địa chỉ khác. Việc chuyển NFT, số dư hoặc quyền sang ví mới cần người chơi chủ động chọn. Trong thư viện đang cài, `FHE.fromExternal` xác minh bằng `msg.sender` thực và phải tương ứng địa chỉ đã dùng để mã hóa input. Gắn forwarder chung vào frontend sẽ không giữ được danh tính hiện tại trong contract.

Paymaster chuyển người trả ETH sang ngân sách tài trợ. Batch và giảm việc ghi mới giảm gas thực dùng. Theo dõi riêng gas Sepolia, phí dịch vụ Zama nếu phát sinh và phí cZAMA trong game.

## Điều kiện kiểm chứng

- Chạy Hunt từ OKX lúc chưa bật phiên, đúng một popup và có hai transaction hash với bên chốt khác bên mở. Kiểm tra cả thua, thắng/capture, tải lại giữa hai bước, gửi chốt trùng, proof của trận khác và kết quả bị sửa. So khớp cả ba hiệp trong Proof Center từ tài khoản khác. So sánh kết quả receipt ở cùng loại đối thủ, có và không tạo quái mới.
- Kiểm tra các cZAMA debit, escrow, trả thưởng, hoàn XP và nhận thưởng ngày khi số dư kho bị hạn chế. Kiểm tra NFT đã đổi chủ không thể bị khóa phiên cũ dùng tiếp. Khóa phiên hết hạn, đã thu hồi, sai phạm vi hoặc replay đều bị từ chối. Có khả năng chốt trực tiếp nếu worker dừng.
- Gen và sức mạnh, chiến thuật, tiền cược và số dư vẫn là ciphertext. Contract tạo ngẫu nhiên bằng `FHE.rand*`; proof và dữ liệu công khai chỉ đủ xác minh kết quả được phép công bố. Luồng mẫu hoàn thành và kiểm chứng được trên Sepolia.

[Tiêu chí Zama Season 5](https://www.zama.org/post/zama-developer-program-mainnet-season-5-confidential-gaming) · [RNG Zama](https://docs.zama.org/protocol/solidity-guides/smart-contract/operations/random) · [Bằng chứng giải mã](https://docs.zama.org/protocol/solidity-guides/smart-contract/oracle) · [Input mã hóa](https://docs.zama.org/protocol/solidity-guides/smart-contract/inputs) · [ERC-4337](https://eips.ethereum.org/EIPS/eip-4337) · [ERC-5792](https://eips.ethereum.org/EIPS/eip-5792)
