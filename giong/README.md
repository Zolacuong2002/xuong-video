# Giọng đọc — nhân bản giọng bạn từ một mẫu 5–8 giây

Engine mặc định là **VieNeu-TTS v3 Turbo** (Apache 2.0, chạy CPU, không cần GPU, không tốn phí).
Nó nhân bản giọng từ một file mẫu, đọc cả video 30 phút trong ~60–70 phút trên máy tính thường.

## Thu mẫu giọng

1. Ghi âm bằng điện thoại (ứng dụng Ghi âm sẵn có), phòng yên tĩnh, điện thoại cách miệng 20–30 cm.
   Đọc **tự nhiên, có lên xuống giọng** một đoạn 30–60 giây bất kỳ — đọc như đang kể chuyện cho bạn nghe,
   không đọc đều đều như đọc thông báo. Giọng mẫu thế nào, cả kênh sẽ nghe thế ấy.
2. Chép file (m4a/mp3/wav) vào thư mục `giong/`.
3. Cắt lấy đoạn **5–8 giây** hay nhất: một người nói, không nhạc nền, không tiếng ồn, không vỡ tiếng,
   có ít nhất một chỗ nhấn giọng. Lệnh cắt (ví dụ lấy từ giây 21,5, dài 7 giây):

   ```
   ffmpeg -i "giong/ban-ghi.m4a" -ss 21.5 -t 7 -ar 24000 -ac 1 giong/mau-giong.wav
   ```

4. `config.env`: `XV_TTS_MAU=giong/mau-giong.wav`.

## Nghe thử trước khi làm video thật

Trong Studio, thêm chủ đề với thời lượng **1 phút** (thử máy) — ra video ngắn để nghe giọng, nhìn hình.
Không ưng thì cắt đoạn mẫu khác. Mẫu có cảm xúc hơn → giọng đọc có cảm xúc hơn; mẫu đọc đều → giọng đọc đều.

## Chỉnh trong config.env

| Khoá | Ý nghĩa |
|---|---|
| `XV_TTS_NHIET` | 0.6 đều tay, 0.8 mặc định, 1.0 biểu cảm hơn nhưng dễ lệch giọng giữa các đoạn |
| `XV_TTS_NHANH` | tăng tốc sau khi đọc, giữ cao độ. 1.0 giữ nguyên, 1.08 nhanh 8% |
| `XV_TU_MOI_PHUT` | nhịp đọc thật, để máy tính số từ cho video N phút. Sau video đầu: số từ kịch bản ÷ số phút video, điền lại |

## Không muốn dùng giọng mình

`XV_TTS=edge` — giọng Microsoft (vi-VN-NamMinhNeural / vi-VN-HoaiMyNeural), miễn phí, cần mạng,
cài thêm `pip install edge-tts` vào Python hệ thống. Không cần mẫu giọng.

Thư mục này nằm trong `.gitignore` (`giong/*.wav`, `*.m4a`, `*.mp3`) — giọng của bạn không bao giờ lên git.
