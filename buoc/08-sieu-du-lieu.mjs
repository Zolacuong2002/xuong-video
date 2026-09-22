// Bước 08 — Tiêu đề, mô tả, tag, chữ thumbnail. Ép JSON qua strict tool → sieu-du-lieu.json
import { join } from "node:path";
import { goi } from "../claude.mjs";
import { thuMucVideo, docChu, docJson, ghiJson } from "./chung.mjs";
import { cacDoan } from "../db.mjs";

// Mốc thời gian (chapters) cho mô tả: 0:00 + mỗi mục một dòng, lấy từ moc.json (bước 06) và đoạn tieu_de (bước 03).
// YouTube cần ≥ 3 mốc, mốc đầu 0:00, mỗi mốc ≥ 10 giây. Người xem nhảy mục thay vì rời video → giữ chân.
export function mocThoiGian(tm, videoId) {
  const moc = docJson(join(tm, "moc.json"));
  if (!moc?.doan?.length) return "";
  const doan = cacDoan(videoId);
  const batDau = new Map(moc.doan.map(m => [m.thu_tu, m.bat_dau]));
  const dong = [{ t: 0, ten: "Mở đầu" }];
  for (const d of doan) {
    if (d.bo_cuc !== "tieu_de" || d.thu_tu === 1) continue;
    const ten = String(d.du_lieu?.tieu_de || "").replace(/^\d+[.)]\s*/, "").trim();
    const t = batDau.get(d.thu_tu);
    // tên mục chung chung của model ("Mở", "Chốt", "Hook") không thành mốc
    if (!ten || /^(mở|mở đầu|hook|chốt|kết|tóm lại|giới thiệu)$/i.test(ten) || t == null || t - dong[dong.length - 1].t < 10) continue;
    dong.push({ t, ten });
  }
  const chot = doan.find(d => d.bo_cuc === "chot");
  if (chot && batDau.get(chot.thu_tu) - dong[dong.length - 1].t >= 10) dong.push({ t: batDau.get(chot.thu_tu), ten: "Tóm lại" });
  if (dong.length < 3) return "";
  const dd = (s) => { const g = Math.floor(s); return `${Math.floor(g / 60)}:${String(g % 60).padStart(2, "0")}`; };
  return "Mốc thời gian:\n" + dong.map(d => `${dd(d.t)} ${d.ten}`).join("\n");
}

const SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["tieu_de", "mo_ta", "tags", "chu_thumbnail", "chu_thumbnail_phu", "chu_nhan", "canh_thumbnail"],
  properties: {
    tieu_de: { type: "array", minItems: 3, maxItems: 3, items: { type: "string" }, description: "3 phương án, mỗi cái ≤ 60 ký tự, BẮT BUỘC mở đầu bằng con số; ít nhất 2 phương án có ngoặc đơn bổ nghĩa ở cuối." },
    mo_ta: { type: "string", description: "Mô tả YouTube 600–1200 ký tự: dòng đầu là 3 hashtag, rồi 2 dòng hook, rồi tóm nội dung nêu số mục, cuối là một câu hỏi mời bình luận. Không link giả, không mốc thời gian giả." },
    tags: { type: "array", minItems: 8, maxItems: 15, items: { type: "string" } },
    chu_thumbnail: { type: "string", description: "Dòng chữ to trên thumbnail, ≤ 5 từ, viết hoa được." },
    chu_thumbnail_phu: { type: "string", description: "Dòng nhỏ dưới, ≤ 8 từ. Có thể trống." },
    chu_nhan: { type: "string", description: "MỘT từ hoặc cụm ngắn nằm TRONG chu_thumbnail sẽ tô màu đỏ nổi bật — thường là con số hoặc từ gây sốc. Phải trùng khớp nguyên văn một phần của chu_thumbnail." },
    canh_thumbnail: { type: "string", description: "TIẾNG ANH, 12–30 từ: biểu cảm + cử chỉ của nhân vật chính (gọi là 'the main character') cho thumbnail, cường độ MẠNH (shocked, wide eyes, open mouth / pointing / facepalm / grinning), có thể cầm MỘT đồ vật liên quan chủ đề (phone, wallet, receipt, coin). Không tả ngoại hình, không chữ, không nền." },
  },
};

const HE_THONG = `Bạn viết tiêu đề, mô tả, tag cho video YouTube tiếng Việt về tài chính cá nhân, dạng video dài 20–35 phút, nội dung evergreen (không phải tin tức).

CÔNG THỨC TIÊU ĐỀ — đo trên 40 video của một kênh cùng ngách 42.000 sub. So với bài không dùng:
- Có chữ "thói quen" .................. +52% view
- Ngoặc đơn bổ nghĩa cuối, dạng (Không Tốn 1 Đồng) ... +45%
- Hứa số tiền cụ thể, dạng "Giữ Lại Hàng Chục Triệu Mỗi Tháng" ... +38%
- Mở đầu bằng con số .................. +35%
- Nói "người giàu / người nghèo" ...... ±0 (vé vào cửa, không phải lợi thế)
- Chữ "dấu hiệu" ...................... −29% → TRÁNH
- Câu hỏi / "Vì sao" .................. ±0

Gộp lại: <số> + <thói quen/thứ/cách> + <lợi ích hoặc đối tượng> + (ngoặc đơn nghịch lý).
Ví dụ bài thắng nhất của ngách: "12 Thói Quen Nâng Cấp Cuộc Sống Lên Hạng Thương Gia (Không Tốn 1 Đồng)".

Cả 3 phương án tiêu đề đều phải mở đầu bằng con số. Ít nhất 2 phương án có ngoặc đơn cuối.
Không giật tít sai sự thật, không hứa làm giàu, không nhắc tên phần mềm hay mã chứng khoán.
Chữ thumbnail: ít chữ, gợi tò mò, đọc được trên điện thoại.`;

export async function chay({ cfg, video }) {
  const tm = thuMucVideo(cfg, video);
  const kichBan = docChu(join(tm, "kich-ban.md"));
  if (!kichBan) throw new Error("Chưa có kich-ban.md");

  const kq = await goi({
    cfg,
    model: cfg.XV_MODEL_SIEU_DU_LIEU,
    system: HE_THONG,
    user: `Chủ đề: "${video.tieu_de}"\n${video.goc_nhin ? "Người xem: " + video.goc_nhin + "\n" : ""}\nKịch bản đầy đủ:\n\n${kichBan}`,
    maxTokens: 3000,
    jsonTool: { name: "ghi_sieu_du_lieu", description: "Ghi tiêu đề, mô tả, tag, chữ thumbnail.", schema: SCHEMA },
  });
  const s = kq.toolInput;
  if (!s?.tieu_de?.length) throw new Error("Không nhận được siêu dữ liệu (stop=" + kq.stop + ")");

  const moc = mocThoiGian(tm, video.id);
  const ra = {
    tieu_de: s.tieu_de.map(t => t.trim()),
    tieu_de_chon: s.tieu_de[0].trim(),
    mo_ta: s.mo_ta.trim() + (moc ? "\n\n" + moc : ""),
    moc_thoi_gian: moc,
    tags: s.tags.map(t => t.trim()).filter(Boolean),
    chu_thumbnail: s.chu_thumbnail.trim(),
    chu_thumbnail_phu: (s.chu_thumbnail_phu || "").trim(),
    chu_nhan: (s.chu_nhan || "").trim(),
    canh_thumbnail: (s.canh_thumbnail || "").trim(),
    luc: new Date().toISOString(),
  };
  ghiJson(join(tm, "sieu-du-lieu.json"), ra);
  return { ket_qua: { tieu_de: ra.tieu_de, tags: ra.tags.length }, usage: kq.usage, usd: kq.usd, usd_quy_doi: kq.usd_quy_doi, };
}
