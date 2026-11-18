# Chẩn đoán danh hiệu hiếm — 18/11/2026

**Nguyên nhân chính là thiết kế xác suất quá khắt khe.** Chưa thấy lỗi mint, lỗi đồng bộ điều kiện giữa UI/contract hay lỗi kiểm tra proof giải thích cho việc 30 NFT chưa có danh hiệu.

## Bằng chứng từ contract đang chạy

- Bytecode Lab trên Sepolia khớp bản build cục bộ sau khi chuẩn hóa bảy vị trí immutable của constructor.
- Hằng số live: `RARE_THRESHOLD = 12`, `CHIMERA_RARE_TRAITS = 5`, `VISIBLE_LOCI = 7`.
- Cả 30 NFT hiện tại: **21 con có 0 trait hiếm, 6 con có 1, 3 con có 2**. Không có con đủ 5; `chimeraCount = 0`.
- Trong đó 29 NFT sinh bằng genome ngẫu nhiên, một NFT là con lai. Không đánh đồng xác suất sinh ngẫu nhiên với xác suất con lai có chọn bố mẹ.
- NFT #13 đã được chủ công bố genome từ lượt kiểm thử trước. Giải mã dữ liệu vốn đã công khai cho thấy các phenotype đúng bằng **min của hai allele**. Lượt chẩn đoán này không công bố thêm genome, không ký ví và không gửi giao dịch.

[Snapshot live và đối chiếu runtime](qa-rewards-2026-11-18/rarity-diagnosis.json).

## Vì sao tỷ lệ thấp

`_randomGenome` sinh một byte cho mỗi locus, tách thành hai allele 0–15. `_store` chọn `min(alleleA, alleleB)` làm trait biểu hiện. Muốn trait đạt ít nhất 12 thì **cả hai allele** phải nằm trong 12–15.

Với byte ngẫu nhiên đều, duyệt chính xác toàn bộ 256 cặp allele cho kết quả:

```
P(một trait hiếm) = (4 / 16)² = 1 / 16 = 6,25%
P(ít nhất 5 trong 7 trait hiếm)
  = 4831 / 268435456
  ≈ 0,0017997%
  ≈ 1 / 55.565 lần sinh ngẫu nhiên
```

Đây là tỷ lệ mỗi lần sinh, không phải bảo đảm phải mint đúng 55.565 con mới có một con. Với 30 lần sinh ngẫu nhiên độc lập, khả năng **không có con nào đủ chuẩn là khoảng 99,946%**. Vì thế mẫu hiện tại chưa xuất hiện danh hiệu là điều hoàn toàn phù hợp với công thức. Mẫu 30 NFT không đủ để kiểm định chất lượng thống kê của RNG; không dùng nó để tuyên bố đã chứng minh RNG không thiên lệch.

| Điều kiện | Tỷ lệ lý thuyết ở lần sinh ngẫu nhiên | Trung bình một con đủ chuẩn trên |
| --- | ---: | ---: |
| ≥2/7 trait hiếm | 6,6466% | 15 lần sinh |
| ≥3/7 | 0,70588% | 142 lần sinh |
| ≥4/7 | 0,045805% | 2.183 lần sinh |
| ≥5/7 — hiện tại | 0,0017997% | 55.565 lần sinh |

[Kết quả tính chính xác](qa-rewards-2026-11-18/rarity-probabilities.json).

## Giao diện có hai điểm cần lưu ý

1. UI và contract cùng xét ≥12 và cần 5/7 trait; không có lỗi lệch ngưỡng. Nút xác minh bị khóa khi chưa đủ trait là đúng điều kiện hiện tại.
2. Formatter `pct()` gom xác suất dương dưới 0,5% thành **`<1%`**. Nó che mất khác biệt giữa một kết quả khoảng 1/200 và khoảng 1/55.565. Mô hình xác suất frontend đã được chạy đối chiếu với phép đếm chính xác và cho cùng kết quả.

## Lai có giúp được không?

Có, nếu chọn lọc allele của bố mẹ. Con nhận một allele từ mỗi bên; chỉ allele phía A có cơ hội đột biến 1/32. Vì vậy, lai ngẫu nhiên không tự tăng độ hiếm chỉ vì generation cao hơn. Con số 1/55.565 phía trên không áp dụng cố định cho mọi cặp bố mẹ. Đặc biệt, nếu bố/mẹ ở phía B không mang allele ≥12 ở đủ năm locus thì cặp đó không thể sinh con đạt danh hiệu này theo cơ chế đột biến hiện tại.

## Đề xuất, chưa triển khai

Giữ điều kiện 5/7 cho hạng huyền thoại, thêm mốc danh hiệu 2/7 và 3/7 để người chơi có tiến độ nhìn thấy được. Hiển thị phần trăm chi tiết hoặc “khoảng 1 trên N” cho xác suất nhỏ. Không nên đổi `min` thành `max` chỉ để có kết quả QA, vì đó là thay đổi luật di truyền, diện mạo và sức mạnh.

Lượt này chỉ chẩn đoán. **Chưa đổi RNG, điều kiện danh hiệu, gene NFT hoặc contract production.**
