# Nhạc nền của kênh

Máy tự trộn nhạc nền vào mọi video ở bước 06 nếu có file `nhac/nen.mp3` (đổi đường dẫn bằng
`XV_NHAC_NEN` trong `config.env`). Không có file → video không nhạc, không báo lỗi.

Cách trộn: nhạc lặp hết video, hạ `XV_NHAC_DB` (mặc định −22 dB), **tự nhỏ đi khi có giọng**
(nén sidechain), fade vào 2 giây, fade ra 4 giây cuối. Giọng đọc luôn nổi hơn nhạc.

## Hai bản nhạc có sẵn (máy tự tổng hợp, không dính bản quyền)

Tạo bằng ffmpeg từ sóng sine + hợp âm, không lấy từ đâu cả:

- `nen-tu-tao-1-pad-am.mp3` — pad ấm, 4 hợp âm Am–F–C–G, không nhịp, rất nền.
- `nen-tu-tao-2-lofi.mp3` — lo-fi nhẹ, có bass gảy 72 BPM, có nhịp hơn.

Ưng bản nào thì **copy đổi tên thành `nen.mp3`**.

## Lấy nhạc ở đâu để không dính bản quyền

**Thư viện âm thanh YouTube** (miễn phí, YouTube tự cấp phép, không bao giờ bị Content ID):
YouTube Studio → menu trái **Thư viện âm thanh** → tab **Nhạc**.

| Bộ lọc | Chọn |
|---|---|
| Thể loại | Ambient, Cinematic, hoặc Hip-hop & Rap (lo-fi) |
| Tâm trạng | Bình tĩnh hoặc Truyền cảm hứng |
| Thời lượng | ≥ 2:30 (nhạc ngắn lặp nhiều nghe rõ mối nối) |
| Ghi công | **Không bắt buộc ghi công** |
| Có lời? | Không — lời hát đè lên giọng đọc |

Chọn **một** bài dùng cho mọi video (khán giả nhận ra kênh qua nhạc). Bấm **Tải xuống**, đổi tên thành
`nen.mp3`, chép vào thư mục này. Ghi lại tên bài + nghệ sĩ để sau còn nhớ.

## Muốn nhạc to/nhỏ hơn

Sửa `XV_NHAC_DB`: −18 to hơn, −26 nhỏ hơn. Nghe lại `ra/<video>/video.mp4` bằng tai nghe trước khi công khai.
