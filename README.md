# Xưởng Video

Dây chuyền tự sản xuất video YouTube dài (20–35 phút, slide + tranh minh hoạ + giọng đọc nhân bản + phụ đề)
và Shorts cắt từ đó — chạy **trên máy tính cá nhân Windows**, không máy chủ thuê, **0 đồng chi phí biến đổi**.
Bạn nhập một dòng chủ đề → máy nghiên cứu, viết kịch bản, dừng cho bạn duyệt → phân cảnh, thu âm, vẽ tranh,
dựng phim, phụ đề, tiêu đề/mô tả/tag, thumbnail, 3 Shorts → dừng cho bạn duyệt lần hai → đổ vào **kho đăng**
kèm bản dán từng ô cho YouTube.

```
01 Nghiên cứu ─ Claude + tìm web (+ Apify đọc ngách) ─▶ nghien-cuu.md
02 Kịch bản ─── Claude, dàn ý rồi từng cụm 3 mục ──────▶ kich-ban.md      ⛔ cổng duyệt 1
03 Phân cảnh ── Claude cắt đoạn + tả tranh ─────────────▶ ~180 đoạn
04 Thu âm ───── VieNeu-TTS, giọng bạn nhân bản (CPU) ───▶ wav từng đoạn
05 Minh hoạ ─── Cloudflare FLUX vẽ tranh + Edge render ─▶ tranh + lớp chữ
06 Dựng phim ── ffmpeg Ken Burns + ghép chữ + nhạc nền ─▶ video.mp4
07 Phụ đề ───── mốc thời gian từ giọng ──────────────────▶ phu-de.srt
08 Tiêu đề ──── Claude: 3 tiêu đề, mô tả, tag, chapters
09 Thumbnail ── Edge render nhân vật + chữ ──────────────▶ thumbnail.png
10 Shorts ───── Claude viết 3 Short, giọng, tranh dọc, phụ đề chạy ─▶ 3 mp4   ⛔ cổng duyệt 2
```

Hết hạn mức Claude giữa chừng? Máy tự tạm dừng, đúng giờ mở lại chạy tiếp, **không mất bước** — mọi bước
đều lưu phần đã làm (từng cụm kịch bản, từng đoạn giọng, từng tranh).

## Cần gì trên máy

| Thứ | Vai trò | Lấy ở đâu |
|---|---|---|
| Windows 10/11, 16 GB RAM | chạy mọi thứ | — |
| **Node.js ≥ 24** | máy chủ Xưởng, không cài thêm gói nào | nodejs.org |
| **Claude Code** đã đăng nhập (gói Pro/Max) | bộ não, không cần API key | `npm i -g @anthropic-ai/claude-code` rồi `claude` |
| **ffmpeg + ffprobe** trên PATH | dựng phim, trộn nhạc, phụ đề | gyan.dev/ffmpeg/builds (bản full) |
| **Microsoft Edge** | render slide từ HTML | có sẵn trên Windows |
| **Python ≥ 3.11** | VieNeu-TTS + đổi số thành chữ | python.org (tick "Add to PATH") |
| Tài khoản **Cloudflare** miễn phí | vẽ tranh (10.000 neuron/ngày ≈ 90 tranh) | cloudflare.com |
| Tài khoản **Apify** miễn phí (tuỳ chọn) | đọc ngách: video cùng chủ đề đang ăn view | apify.com |

## Cài đặt (một lần, ~30 phút)

```bat
git clone https://github.com/Zolacuong2002/xuong-video.git
cd xuong-video
copy config.env.mau config.env
```

**1. Giọng đọc** — tạo môi trường Python riêng và cài VieNeu:

```bat
python -m venv .venv-giong
.venv-giong\Scripts\pip install vieneu soundfile
```

Thu 30 giây giọng bạn bằng điện thoại, cắt 5–8 giây hay nhất thành `giong/mau-giong.wav` — xem `giong/README.md`.

**2. Vẽ tranh** — deploy Worker Cloudflare (thư mục `cf-anh/`):

```bat
cd cf-anh
npx wrangler login
```
Mở `wrangler.toml`, dán `account_id` của bạn (dash.cloudflare.com → Workers & Pages → cột phải), rồi:
```bat
npx wrangler secret put KHOA        ← gõ một chuỗi bí mật bất kỳ, ví dụ 24 ký tự ngẫu nhiên
npx wrangler deploy                 ← in ra https://xuong-anh.<tên>.workers.dev
cd ..
```
Điền `XV_ANH_URL` và `XV_ANH_KHOA` (chuỗi vừa đặt) vào `config.env`.

**3. Nhân vật kênh** — vẽ nhân vật, chọn, tạo hai ảnh tham chiếu, điền thẻ `nhan-vat/nhan-vat.json`
— xem `nhan-vat/README.md`. Rồi `node tools/ve-kenh.mjs` để có avatar + banner kênh.

**4. Thương hiệu** — ba file trong `mau/`, sửa chữ, không sửa mã:

| File | Sửa gì |
|---|---|
| `thuong-hieu.css` | tên kênh hiện trên slide (`--ten-kenh`), màu nhấn, font |
| `loi-kenh.json` | câu giới thiệu kênh sau hook, câu kêu gọi cuối video, khẩu hiệu, tên các danh sách phát |
| `giong-thuong-hieu.md` | system prompt viết kịch bản: kênh là gì, ai nói, nói với ai, luật viết. Điền các chỗ `<…>` |

Và trong `config.env`: `XV_TEN_KENH`, `XV_TIEN_TO_FILE`, `XV_NGACH`, `XV_NGUOI_XEM`.

**5. Kiểm tra máy** (không gọi Claude, không tốn hạn mức): `node tools/thu-may.mjs` — tạo 6 đoạn giả rồi chạy
thu âm → render → dựng → phụ đề → thumbnail. Ra `ra/<thu-may>/video.mp4` là máy ổn.

## Dùng hằng ngày

1. Bấm đôi `Chay-Xuong-Video.bat` → mở http://localhost:5196. (Muốn tự bật khi đăng nhập Windows: tạo file
   `.vbs` trong thư mục Startup gọi file bat này.)
2. Tab **Hàng chờ**: dán chủ đề, mỗi dòng một video, sau `|` là góc nhìn — *"12 thói quen tiêu tiền khiến bạn
   mãi không dư | người đi làm lương 15 triệu"* → **Thêm & chạy luôn**. Lần đầu chọn **1 phút** để thử.
3. Máy chạy bước 01–02 rồi dừng ở **⛔ cổng duyệt 1**. Tab **Bàn duyệt**: đọc kịch bản cạnh nguồn số liệu và
   bảng cảnh báo của bộ soát (lặp từ, câu dài, số chưa viết thành chữ, bịa trải nghiệm, chữ vi phạm chính sách).
   Sửa ngay trong ô, bấm **Duyệt & chạy tiếp**.
4. Máy chạy bước 03–10 (video 30 phút mất ~3 giờ, phần lớn là thu âm) rồi dừng ở **⛔ cổng duyệt 2**:
   xem thử mp4, 3 Shorts, chọn tiêu đề → **Duyệt**.
5. Tab **Thư viện** = **kho đăng**: mỗi video một ngăn, file `…-DAN-VAO-YOUTUBE.txt` có tiêu đề, mô tả với
   mốc thời gian, thẻ, danh sách phát — dán từng khối vào YouTube Studio. Đăng xong bấm **Đã đăng tay**, dán link.
   Hoặc cấp quyền YouTube một lần (`node tools/yt-dang-nhap.mjs`) rồi bấm **Đăng YouTube**: máy tải lên, đặt hình
   thu nhỏ, phụ đề, danh sách phát, khai nội dung AI và hẹn giờ. Lưu ý: dự án API chưa qua audit thì YouTube khoá
   video ở chế độ riêng tư — xem `tai-lieu/huong-dan-dang-youtube.pdf`.

Hết hạn mức Claude: đèn góc phải chuyển hổ phách, ghi giờ mở lại; máy tự chạy tiếp, không cần làm gì.
Muốn làm lại một bước: thẻ video → **Chạy lại từ bước N**.

## Công cụ phụ

| Lệnh | Làm gì |
|---|---|
| `node tools/yt-dang-nhap.mjs` | cấp quyền YouTube một lần → tab Thư viện có nút **Đăng YouTube** (tải video + hình thu nhỏ + phụ đề + danh sách phát + hẹn giờ). Xem `tai-lieu/huong-dan-dang-youtube.pdf` |
| `node tools/do-kenh.mjs` | đo lượt xem thật của mọi mục đã đăng (Apify) → `nganh/<ngày>-do-kenh.md` |
| `node tools/nganh.mjs kham-pha "từ khoá" …` | tìm kênh trong ngách theo tổng view (Apify) |
| `node tools/nganh.mjs kenh <url kênh> …` | quét video gần nhất của kênh đối chiếu, bảng mẫu tiêu đề đang thắng |
| `node tools/nganh.mjs chu-de "từ khoá"` | video cùng chủ đề đang ăn view |
| `node tools/thu-may.mjs` | thử phần máy không tốn hạn mức |
| `node tools/chay-that.mjs "chủ đề" 1` | chạy trọn dây chuyền qua API, tự duyệt, để thử |
| `node tools/soat-giao-dien.mjs` | soát giao diện Studio bằng trình duyệt giả (cần `cd tools && npm i`) |

## Cấu trúc

```
server.mjs      máy chủ + hàng đợi + tự chờ hạn mức + tự thử lại khi mất mạng
db.mjs          SQLite (node:sqlite): chủ đề, video, bước, đoạn, mục đăng
claude.mjs      gọi Claude Code CLI headless, nhận diện hết hạn mức
kho.mjs         kho đăng: ngăn, bản dán, DANH-SACH.md, lịch gợi ý
nganh.mjs       Apify đọc ngách
buoc/01…10      mười bước, mỗi file một bước; anh.mjs gọi Worker vẽ; chung.mjs có bộ soát kịch bản
mau/            slide.html · short.html · thumbnail.html · thuong-hieu.css · loi-kenh.json · giong-thuong-hieu.md
nhan-vat/       thẻ nhân vật + ảnh tham chiếu (của bạn, không lên git)
giong/          mẫu giọng (của bạn, không lên git)
cf-anh/         Worker Cloudflare vẽ tranh
tai-lieu/       hướng dẫn cài đặt & sử dụng (PDF)
ra/  kho-dang/  máy tự sinh
```

Hướng dẫn chi tiết có hình: `tai-lieu/huong-dan-cai-dat-va-su-dung.pdf`.

## Giấy phép

MIT. VieNeu-TTS (Apache 2.0), FLUX.2 klein qua Cloudflare Workers AI theo điều khoản của Cloudflare.
Nội dung, giọng, nhân vật bạn tạo ra là của bạn.
