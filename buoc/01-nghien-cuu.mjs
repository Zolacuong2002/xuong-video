// Bước 01 — Nghiên cứu + đối chiếu số liệu. Claude + web search → nghien-cuu.md + nguon.json
//   Kèm "đọc ngách" bằng Apify (XV_NGANH=1): video cùng chủ đề đang ăn view trên YouTube → người viết biết góc nào
//   đã bão hoà, tiêu đề/hứa hẹn nào thắng, chỗ nào còn trống. Lỗi Apify không chặn bước — chỉ thiếu mục Thị trường.
import { join } from "node:path";
import { goi } from "../claude.mjs";
import { thuMucVideo, ghiChu, ghiJson, docJson } from "./chung.mjs";
import { timVideoNgach, tomTatNgach, docApifyToken } from "../nganh.mjs";

const heThong = (cfg) => `Bạn là trợ lý nghiên cứu cho kênh YouTube tiếng Việt "${cfg.XV_TEN_KENH}" về ${cfg.XV_NGACH}, người xem là ${cfg.XV_NGUOI_XEM}.
Nhiệm vụ: tra cứu và lập một bản tóm tắt nghiên cứu ĐÚNG SỐ để người viết kịch bản dùng.

Quy tắc bắt buộc:
- Chỉ ghi con số nào bạn tìm thấy trong nguồn thật. Không có nguồn thì viết rõ "không tìm được số liệu tin cậy".
- Mỗi con số đi kèm [nguồn N] và ngày của số liệu. Ưu tiên nguồn gốc: ngân hàng trung ương, tổng cục thống kê, báo cáo chính thức, báo kinh tế lớn.
- Với chủ đề tài chính, ưu tiên số liệu Việt Nam; số liệu quốc tế ghi rõ là quốc tế.
- Ghi lại các luận điểm trái chiều nếu có — người viết cần biết chỗ nào đang tranh cãi.

Nếu được cấp danh sách "video cùng chủ đề đang ăn view": phân tích ngắn (không bịa thêm số): góc nào nhiều người đã làm
(tránh lặp), tiêu đề/hứa hẹn nào ăn view, độ dài phổ biến, và 2–3 góc còn trống mà kênh nên chiếm. Đây là mục Thị trường.

Định dạng trả về (markdown):
# Tóm tắt nghiên cứu
## Thị trường: người xem đang xem gì về chủ đề này (bỏ mục này nếu không có danh sách video)
## Câu trả lời một đoạn
## Các con số dùng được
- <số> — <ý nghĩa> — <ngày> [nguồn N]
## Cơ chế / lý do (giải thích cho người không chuyên)
## Ví dụ đời thường có thể dùng
## Chỗ cần cẩn trọng / trái chiều
## Nguồn
1. <tiêu đề> — <url>
2. ...`;

// Video cùng chủ đề đang ăn view (Apify) — lưu tam/nganh.json để chạy lại không tốn tiền
async function docNgach(cfg, tm, video) {
  if (String(cfg.XV_NGANH ?? "1") === "0" || !docApifyToken(cfg)) return "";
  const file = join(tm, "tam", "nganh.json");
  let ds = docJson(file);
  if (!ds) {
    const tuKhoa = video.tieu_de.replace(/[()"]/g, "").split(/\s+/).slice(0, 8).join(" ");
    try { ds = await timVideoNgach(cfg, tuKhoa, { toiDa: parseInt(cfg.XV_NGANH_SO, 10) || 12 }); ghiJson(file, ds); }
    catch (e) { console.warn("[01] đọc ngách lỗi:", e.message.slice(0, 160)); return ""; }
  }
  if (!ds.length) return "";
  ghiChu(join(tm, "nganh.md"), `# Video cùng chủ đề đang ăn view (Apify, ${new Date().toISOString().slice(0, 10)})

${tomTatNgach(ds, 30)}
`);
  return `
=== VIDEO CÙNG CHỦ ĐỀ ĐANG ĂN VIEW TRÊN YOUTUBE (xếp theo lượt xem mỗi ngày) ===
${tomTatNgach(ds, 12)}`;
}

export async function chay({ cfg, video }) {
  const tm = thuMucVideo(cfg, video);
  const yeuCau = [
    `Chủ đề video: "${video.tieu_de}"`,
    video.goc_nhin ? `Góc nhìn / người xem mục tiêu: ${video.goc_nhin}` : "",
    `Độ dài video dự kiến: ${video.phut ?? 25} phút — kịch bản sẽ có khoảng ${Math.max(4, Math.round(((video.phut ?? 25) * 160 - 600) / 300))} mục, cần đủ số liệu và ví dụ cho từng mục.`,
    `Hôm nay: ${new Date().toISOString().slice(0, 10)}. Ưu tiên số liệu trong 12 tháng gần nhất.`,
  ].filter(Boolean).join("\n");

  const kq = await goi({
    cfg,
    model: cfg.XV_MODEL_NGHIEN_CUU,
    system: heThong(cfg),
    user: yeuCau,
    maxTokens: 6000,
    thinking: true,
    webSearch: 6,
  });

  if (!kq.text) throw new Error("Bước nghiên cứu không trả về nội dung (stop=" + kq.stop + ")");
  ghiChu(join(tm, "nghien-cuu.md"), kq.text);
  ghiJson(join(tm, "nguon.json"), { nguon: kq.nguon, model: kq.model, luc: new Date().toISOString() });

  return {
    ket_qua: { so_nguon: kq.nguon.length, tim_kiem: kq.usage.tim_kiem, ky_tu: kq.text.length, nganh: (docJson(join(tm, "tam", "nganh.json")) || []).length + " video đối chiếu" },
    usage: kq.usage,
    usd: kq.usd, usd_quy_doi: kq.usd_quy_doi,
  };
}
