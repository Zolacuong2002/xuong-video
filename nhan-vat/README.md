# Nhân vật kênh — tạo một lần, dùng cho mọi tranh

Máy vẽ tranh minh hoạ bằng FLUX.2 klein (Cloudflare Workers AI) và giữ đúng MỘT nhân vật xuyên suốt
bằng hai ảnh tham chiếu. Thư mục này chứa nhân vật của kênh bạn — **không có sẵn trong repo**, bạn tạo theo 4 bước dưới.

## Bước 1 — Vẽ vài phương án để chọn

```
node tools/ve-nhan-vat-cf.mjs
```

Script vẽ 4 phương án (mô tả trong `PHUONG_AN` của file, sửa tuỳ ý: giới tính, tuổi, trang phục, màu đặc trưng)
ra `nhan-vat/cf-4b-*.jpg`. Chọn một. Mẹo đã đo: cho nhân vật **một món đồ màu đặc trưng** (áo len cam,
khăn xanh, mũ đỏ…) trùng màu nhấn của kênh (`--nhan` trong `mau/thuong-hieu.css`) — người xem nhận ra ngay.

## Bước 2 — Vẽ bộ ảnh chuẩn từ phương án đã chọn

Sửa `tools/ve-mau-chuan.mjs`: dòng `mau = readFileSync(...)` trỏ tới ảnh đã chọn, `NHAN_VAT` tả lại
đúng nhân vật đó. Rồi:

```
node tools/ve-mau-chuan.mjs
```

Ra `nhan-vat/chuan/ung-vien-toan-than-*.jpg` và `ung-vien-mat-*.jpg`. Chọn mỗi loại một ảnh đẹp nhất, lưu thành:

| File | Khổ | Vai trò |
|---|---|---|
| `chuan/nhan-vat-goc-toan-than.jpg` | gốc | bản gốc để làm banner / in ấn |
| `chuan/nhan-vat-goc-mat.jpg` | gốc | bản gốc — `tools/ve-kenh.mjs` dùng để làm avatar + banner |
| `chuan/tham-chieu-toan-than.png` | **360×480** | ảnh tham chiếu 0 cho máy vẽ (dáng, trang phục) |
| `chuan/tham-chieu-mat.png` | **480×480** | ảnh tham chiếu 1 cho máy vẽ (khuôn mặt) |

Model chỉ nhận ảnh tham chiếu **nhỏ hơn 512×512** — thu nhỏ bằng ffmpeg:

```
ffmpeg -i nhan-vat/chuan/nhan-vat-goc-toan-than.jpg -vf scale=360:480 nhan-vat/chuan/tham-chieu-toan-than.png
ffmpeg -i nhan-vat/chuan/nhan-vat-goc-mat.jpg -vf scale=480:480 nhan-vat/chuan/tham-chieu-mat.png
```

Ảnh mẫu **để tay không** (không balo, không ly cà phê) — có thì model bê theo vào mọi cảnh.

## Bước 3 — Điền thẻ nhân vật `nhan-vat.json`

Máy đọc file này để viết lệnh vẽ và dặn Claude tả cảnh. Các trường `*_en` là tiếng Anh (lệnh cho máy vẽ),
`*_vi` là tiếng Việt (lệnh cho Claude):

```json
{
  "goi_en": "the man",                       ← cách gọi nhân vật trong lệnh vẽ (the man / the woman / the girl)
  "ta_vi": "một anh văn phòng trẻ người Việt",
  "giu_en": "same face, same short black hair, same white shirt and amber-orange cardigan, dark trousers",
  "dau_hieu_en": "the amber-orange cardigan",  ← món đồ đặc trưng
  "dau_hieu_vi": "áo len cam",
  "mau_en": "orange",                         ← màu đặc trưng, người phụ KHÔNG được mặc màu này
  "mau_vi": "cam",
  "khong_them_en": "a backpack or a coffee cup",
  "thumbnail_mac_dinh_en": "The man looks shocked with wide eyes and an open mouth, pointing to the left with one hand."
}
```

## Bước 4 — Avatar và banner kênh

```
node tools/ve-kenh.mjs
```

Sửa chữ trong `kenh/banner.html` trước (tên kênh, câu mô tả). Ra `kenh/avatar.png` (800×800) và
`kenh/banner.png` (2560×1440, chữ nằm trong vùng an toàn 1546×423) → tải lên YouTube Studio → Tuỳ chỉnh kênh.
`avatar.png` cũng được dùng trên slide giới thiệu kênh sau hook.

## Luật vẽ người phụ — đo thật, đã nhúng vào prompt

Ảnh tham chiếu kéo rất mạnh: người phụ tả chung chung ("a bank teller") bị vẽ mặc **y hệt** trang phục đặc trưng
của nhân vật chính. Dặn chung "only the main character wears orange" không thắng được ảnh mẫu. Viết "alone" thì
model lại **tự thêm đám đông**. Cách duy nhất ăn: mỗi người phụ tả **giới tính + tuổi + tóc + trang phục màu khác**,
và kết mọi cảnh bằng "nobody else in frame". Máy đã viết luật này vào system prompt của bước 03 và 10 — bạn không
phải nhớ, chỉ cần điền đúng `mau_en`/`dau_hieu_en` ở thẻ nhân vật.
