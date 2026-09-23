// Đọc config.env thành object. Thiếu file thì dùng mặc định, thiếu khoá thì báo rõ lúc gọi API.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const GOC = dirname(fileURLToPath(import.meta.url));

const MAC_DINH = {
  XV_PORT: "5196",
  // Kênh của bạn — sửa trong config.env. Tên hiện trên slide lấy ở mau/thuong-hieu.css (--ten-kenh).
  XV_TEN_KENH: "Kênh Của Bạn",
  XV_TIEN_TO_FILE: "Kenh",           // tên file trong kho đăng: Kenh-01.mp4, Kenh-01-Short-1.mp4
  XV_NGACH: "tài chính cá nhân của người đi làm",   // một cụm mô tả ngách, dùng trong prompt nghiên cứu và Shorts
  XV_NGUOI_XEM: "người đi làm lương 10–40 triệu",  // người xem mục tiêu, dùng trong prompt
  ANTHROPIC_API_KEY: "",
  XV_CLAUDE: "cli",
  XV_CLAUDE_BIN: "",
  XV_MODEL_NGHIEN_CUU: "opus",
  XV_MODEL_KICH_BAN: "opus",
  XV_MODEL_HINH: "sonnet",
  XV_MODEL_SIEU_DU_LIEU: "opus",
  XV_MODEL_SHORTS: "opus",
  // Đọc ngách bằng Apify ở bước 01 (video cùng chủ đề đang ăn view). 0 = tắt. ~$0,05/video dài.
  XV_NGANH: "1",
  XV_NGANH_SO: "12",
  XV_APIFY_TOKEN: "",
  // Đăng thẳng lên YouTube (YouTube Data API v3). Lấy ở Google Cloud Console → OAuth client ID → Desktop app.
  // Cấp quyền một lần: node tools/yt-dang-nhap.mjs → lưu .yt-token.json. Để trống = đăng tay như cũ.
  XV_YT_CLIENT_ID: "",
  XV_YT_CLIENT_SECRET: "",
  // Shorts cắt từ mỗi video dài: số Short (0 = tắt) và số tranh dọc vẽ mới cho mỗi Short (~110 neuron/tranh)
  XV_SHORTS_SO: "3",
  XV_SHORTS_ANH: "2",
  XV_TTS: "vieneu",
  XV_TTS_MAU: "giong/mau-giong.wav",
  XV_TTS_PYTHON: ".venv-giong/Scripts/python.exe",
  XV_TTS_NHIET: "0.8",
  // Tăng tốc giọng sau khi đọc (ffmpeg atempo, giữ cao độ). 1.0 = giữ nguyên. Anh muốn "nhanh một tí" → 1.08
  XV_TTS_NHANH: "1.08",
  XV_TTS_GIONG: "vi-VN-NamMinhNeural",
  XV_TTS_TOC_DO: "+8%",
  // Nhịp đọc THẬT, đo trên âm thanh ra — đổi engine/mẫu giọng thì phải đo lại:
  //   edge +8%        : 208 từ/phút (5.363 từ → 25,73 phút, video hoàn chỉnh)
  //   vieneu mẫu cũ   : 195 từ/phút (đo trong dây chuyền thật, 6 đoạn, RTF 1,33)
  //   vieneu mẫu 14/09: 214 từ/phút trên đoạn thử × 1,08 tốc độ × 0,93 (hệ số dây chuyền thật) ≈ 215 — đo lại sau video #2
  XV_TU_MOI_PHUT: "215",
  // Nhạc nền: file trong nhac/ (tải từ Thư viện âm thanh YouTube, xem nhac/README.md). Không có file → video không nhạc.
  XV_NHAC_NEN: "nhac/nen.mp3",
  XV_NHAC_DB: "-22",
  XV_PHU_DE: "tts",
  XV_WHISPER_MODEL: "small",
  XV_WHISPER_SCRIPT: "",   // chỉ khi XV_PHU_DE=whisper: đường dẫn transcribe.py (faster-whisper); vieneu/edge không cần
  XV_MSEDGE: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  XV_FFMPEG: "ffmpeg",
  XV_FFPROBE: "ffprobe",
  XV_PYTHON: "python",
  XV_RONG: "1920",
  XV_CAO: "1080",
  XV_FPS: "30",
  XV_ANH_URL: "",
  XV_ANH_KHOA: "",
  // ~110 neuron/ảnh (1024×576 + 2 ảnh tham chiếu) → 60 ảnh ≈ 6.600 neuron, chừa ~3.000/ngày cho thumbnail + vẽ lại
  XV_ANH_TOI_DA: "60",
  XV_ANH_SONG: "3",
  XV_ANH_THAM_CHIEU_TOAN_THAN: "nhan-vat/chuan/tham-chieu-toan-than.png",
  XV_ANH_THAM_CHIEU_MAT: "nhan-vat/chuan/tham-chieu-mat.png",
};

function docEnv(duongDan) {
  const ra = {};
  if (!existsSync(duongDan)) return ra;
  for (const dong of readFileSync(duongDan, "utf8").split(/\r?\n/)) {
    const d = dong.trim();
    if (!d || d.startsWith("#")) continue;
    const i = d.indexOf("=");
    if (i < 0) continue;
    ra[d.slice(0, i).trim()] = d.slice(i + 1).trim();
  }
  return ra;
}

export function napCfg() {
  const env = { ...MAC_DINH, ...docEnv(join(GOC, "config.env")), ...process.env };
  const cfg = {};
  for (const k of Object.keys(MAC_DINH)) cfg[k] = env[k] ?? MAC_DINH[k];
  cfg.XV_PORT = parseInt(cfg.XV_PORT, 10) || 5196;
  cfg.XV_RONG = parseInt(cfg.XV_RONG, 10) || 1920;
  cfg.XV_CAO = parseInt(cfg.XV_CAO, 10) || 1080;
  cfg.XV_FPS = parseInt(cfg.XV_FPS, 10) || 30;
  cfg.XV_TU_MOI_PHUT = parseInt(cfg.XV_TU_MOI_PHUT, 10) || 195;
  cfg.thuMucRa = join(GOC, "ra");
  cfg.thuMucMau = join(GOC, "mau");
  cfg.thuMucGiong = join(GOC, "giong");
  return cfg;
}
