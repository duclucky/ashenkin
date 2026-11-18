# Ashenkin

Ashenkin là game sưu tập, lai tạo và đưa Xenos vào đấu trường trên Sepolia. Zama FHEVM cho phép hợp đồng xử lý gen, chỉ số và cZAMA ngay trên dữ liệu mã hóa. Bản đồ, Judge Mode và chế độ luyện tập mở được khi chưa kết nối ví.

This project is not audited, endorsed or operated by Zama. Use at your own risk.

## Chạy local

Cài dependency với Node.js 22 trở lên và Bun. Chạy các lệnh từ thư mục gốc của dự án.

```powershell
bun install --cwd frontend --frozen-lockfile
bun install --cwd backend --frozen-lockfile
```

Mở hai terminal. Chạy `npm --prefix backend run dev` trong terminal thứ nhất và `npm --prefix frontend run dev` trong terminal thứ hai.

- Game tại [127.0.0.1:5173](http://127.0.0.1:5173/). Vite chuyển tiếp `/api` sang Express tại `127.0.0.1:3001`.
- [API health](http://127.0.0.1:5173/api/health) trả về `{"status":"ok"}`. [Metadata Ashenkin #1](http://127.0.0.1:5173/api/ashenkin-nft/1) đọc dữ liệu công khai từ Sepolia và trả liên kết ảnh SVG.
- Khi đổi `BACKEND_PORT`, đặt cùng giá trị ở hai terminal. Backend dùng RPC Sepolia công khai mặc định. Có thể cấu hình `SEPOLIA_RPC_URL` trong môi trường backend hoặc `backend/.env`.

Frontend và API chạy trên máy. Các tính năng on-chain dùng hợp đồng Sepolia và Zama Relayer, nên cần Internet. Giao dịch trong game cần ví Sepolia. Các địa chỉ và ABI frontend sử dụng nằm trong [contracts.json](frontend/src/chimera/contracts.json).

Để bật chốt tự động cho trận đấu, trứng và Dojo, đặt `CHIMERA_SETTLEMENT_PRIVATE_KEY` cho **process backend** bằng khóa của một ví riêng đã nạp Sepolia ETH. `CHIMERA_SETTLEMENT_MAX_GWEI` giới hạn `maxFeePerGas` theo gwei, mặc định 3. Dùng một process tài trợ cho mỗi ví đó. Backend chỉ gửi giao dịch chốt đã mô phỏng vào các contract Sepolia của Ashenkin. Nếu chưa cấu hình khóa, game tiếp tục chốt qua ví người chơi. Inbox có đường chốt trực tiếp nếu backend hoặc ngân sách tài trợ tạm thời không khả dụng.

`npm --prefix backend run demo` cũng đọc `backend/.env.sponsor` nếu có. Để dùng lại một tệp ký cục bộ chứa trường `pk`, đặt `CHIMERA_SETTLEMENT_KEY_FILE` (đường dẫn tính từ `backend`) và `CHIMERA_SETTLEMENT_EXPECTED_ADDRESS` để backend kiểm tra đúng địa chỉ trước khi chạy.

## Chạy bản demo production

Build frontend với `BASE_PATH=/` (mặc định), rồi dùng Express để phục vụ game, WASM và metadata cùng địa chỉ.

```powershell
npm --prefix frontend run build
npm --prefix backend run demo
```

Bản demo Ashenkin mở tại [127.0.0.1:4173](http://127.0.0.1:4173/). Production có thể đặt `BACKEND_HOST`, `PORT` hoặc `BACKEND_PORT`, và `PUBLIC_ORIGIN` theo địa chỉ HTTPS mà người chơi truy cập. `PUBLIC_ORIGIN` là origin gốc, ví dụ `https://ashenkin.xyz`, để các liên kết trong JSON NFT dùng đúng địa chỉ phía ngoài proxy.

Từ terminal khác, kiểm tra bản build, API, WASM, metadata và ảnh của NFT #1, đồng thời đọc `tokenURI` trên Sepolia.

```powershell
npm --prefix backend run check:demo -- http://127.0.0.1:4173 1
```

Metadata trả bảy đặc điểm ngoại hình công khai, cấp độ, ngày nở và phả hệ. Khi Zama chưa trả đủ đặc điểm, API trả `503` kèm `Retry-After` để ví thử lại. Nếu sửa hình sprite, chạy `npm --prefix frontend run build:nft-art` để cập nhật bộ dựng ảnh phía backend.

Khi địa chỉ HTTPS công khai đã hoạt động, thêm `--prepare-uri` sau ID để mô phỏng `setTraining` với địa chỉ Training hiện tại và in dữ liệu giao dịch cho chủ Lab xem trước. Sau khi chủ Lab cập nhật, chạy với `--require-uri` để xác nhận `tokenURI` trỏ tới JSON đã kiểm tra. Lệnh kiểm tra chỉ dùng `eth_call` và đọc API. Xem [checklist nộp bài](docs/submission.md) để kiểm chứng từ phiên khách.

URL gốc dùng bộ hợp đồng Ashenkin trên Sepolia. Các NFT test của hai bộ Chimera cũ có URL hồ sơ với `?world=original` hoặc `?world=v2` để giữ đúng địa chỉ hợp đồng cho từng ID.

Trên VPS, Docker Compose chạy game và Cloudflare Tunnel trong dự án `/opt/ashenkin`. Tệp `.env` trên VPS chọn image đang chạy qua `ASHENKIN_IMAGE`. Cấu hình và thông tin xác thực Tunnel nằm trong thư mục `tunnel` trên VPS. Tunnel chuyển `ashenkin.xyz` đến `http://game:4173` qua mạng Docker. Để kiểm tra tại máy chủ, chạy `sudo docker compose ps` từ `/opt/ashenkin` và truy cập `http://127.0.0.1:4173/api/health`.

## Kiểm tra

```powershell
npm --prefix frontend run type-check
npm --prefix frontend run build
bun test --cwd frontend
node --test backend/lib/settlement.test.js
npm --prefix contracts install --no-package-lock
npm --prefix contracts test
```

Frontend build ra `frontend/dist`. Bộ test hợp đồng chạy mặc định trên Hardhat local với FHEVM mock.

Luồng demo ấp hai phôi → lai → đấu Colosseum → bán có test xuyên suốt trong [SeasonOfMasks.ts](contracts/test/SeasonOfMasks.ts). Lượt chạy local dùng 10 giao dịch, tính từ lúc ấp phôi và với cZAMA đã được cấp quyền trước. Các bước FHE chính đo được khoảng 2,94 triệu gas khi tạo trứng và 4,11 triệu gas khi bắt đầu trận. Bộ test HCU đo khoảng 5,79 triệu HCU cho Breed và 12,97 triệu HCU cho Colosseum Explore, dưới giới hạn 20 triệu HCU mỗi giao dịch.

Để kiểm tra với Zama KMS trên Sepolia, chuẩn bị hai ví test có Sepolia ETH và cZAMA. Đặt `E2E_SELLER_PRIVATE_KEY` và `E2E_BUYER_PRIVATE_KEY` trong môi trường terminal, rồi chạy lệnh sau từ `contracts`.

```powershell
npx hardhat run scripts/e2e-sepolia.ts --network sepolia
```

Script ký giao dịch trên Sepolia. Ví mua cần ít nhất 15 cZAMA. Ví bán cần đủ phí của cặp bố mẹ, từ 10 cZAMA cho hai con chưa lai. Nếu dừng giữa chừng sau khi tạo trứng, bắt đầu trận hoặc gửi tiền mua, dùng hộp thư trong game để hoàn tất bước đang chờ trước khi thử lượt mới. Có thể đặt `ONLY_MARKET` bằng ID sinh vật của ví bán để kiểm tra riêng việc bán.

## Dữ liệu mã hóa

| Chế độ | Dữ liệu mã hóa và quyền đọc | Dữ liệu công khai |
| --- | --- | --- |
| Lab và Nursery | Bộ gen ở dạng mã hóa. Chủ sinh vật được đọc nguyên tố và các locus đã giải trình tự. | Ngoại hình, phả hệ và bộ gen nếu chủ sinh vật chọn chứng nhận. |
| Colosseum | Kế hoạch ra chiêu, sức mạnh và mức cược được tính trên dữ liệu mã hóa. | Kết quả từng hiệp. Người chơi có thể mở kế hoạch của thú hoang sau trận. |
| Relic Forge | Chủ sở hữu đọc được độ hiếm và sức mạnh relic của mình. Bộ đếm pity cũng được mã hóa. | Tỉ lệ mở hộp và kết quả relic nếu chủ chọn thẩm định. |
| Oracle | Đáp án được giữ kín trong vòng. Chỉ người đoán đọc được gợi ý của mình. | Jackpot, kết quả xác nhận người thắng và đáp án khi vòng kết thúc. |
| Raffle và Depths | Raffle giấu số vé và hũ đang tích lũy. Depths giữ kín máu, túi đồ và nội dung cửa; người chơi xem được cửa đã chiếu đèn. | Raffle công bố người thắng và tiền thưởng khi chốt vòng. Depths công bố bằng chứng sống sót khi người chơi chọn đăng kỷ lục. |

Các kết quả cần chốt công khai sử dụng bằng chứng từ Zama KMS. Xem [Proof Center](http://127.0.0.1:5173/#/fairness) khi game đang chạy và [kế hoạch Season of Masks](plan.md) để theo dõi tiến độ.

Kịch bản quay và bản nháp bài giới thiệu nằm trong [tài liệu nộp bài](docs/submission.md).
