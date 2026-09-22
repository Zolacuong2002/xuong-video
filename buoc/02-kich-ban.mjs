// Bước 02 — Viết kịch bản. Video dài (20–35 phút ≈ 4.000 từ) KHÔNG viết được trong một lượt:
// model sẽ bị cắt cụt hoặc viết loãng. Nên chia hai chặng:
//   02a  dàn ý  → hook, mở, N mục (tên + ý chính + ví dụ), chốt
//   02b  viết từng CỤM mục (3 mục/lượt), ghép lại
// System prompt = mau/giong-thuong-hieu.md, giữ nguyên mọi lượt nên ăn prompt caching.
import { join } from "node:path";
import { createHash } from "node:crypto";
import { goi } from "../claude.mjs";
import { thuMucVideo, docChu, docJson, ghiChu, ghiJson, demTu, tachMuc, soatKichBan, chayLenh } from "./chung.mjs";
import { GOC } from "../cfg.mjs";

const MUC_MOI_LUOT = 3;
const TU_MOI_MUC = 400;   // ~1,9 phút đọc mỗi mục
// Model viết ngắn/dài khác nhau so với mức được yêu cầu. Đo thật trên CÙNG một chủ đề,
// cùng bản nghiên cứu, cùng prompt — xin 420 từ/mục:
//   haiku  trả ~213 từ = 71% mức xin  → phải nhân bù mạnh
//   opus   trả ~403 từ = 96% mức xin  → gần như xin sao trả vậy
// Thiếu số đo cho model lạ thì lấy 1.15 (giữa hai mốc, nghiêng về an toàn).
const BU_THEO_MODEL = { haiku: 1.4, sonnet: 1.15, opus: 1.05, fable: 1.05 };
function heSoBu(model) {
  const m = String(model || "").toLowerCase();
  for (const [k, v] of Object.entries(BU_THEO_MODEL)) if (m.includes(k)) return v;
  return 1.15;
}

const SCHEMA_DAN_Y = {
  type: "object", additionalProperties: false,
  required: ["tieu_de", "hook", "mo", "muc", "chot"],
  properties: {
    tieu_de: { type: "string", description: "Tiêu đề làm việc, ≤ 60 ký tự, theo công thức trong hướng dẫn." },
    hook: { type: "string", description: "Lời đọc NGUYÊN VĂN cho 15–25 giây đầu. 2–4 câu." },
    mo: { type: "string", description: "Lời đọc nguyên văn phần Mở, 4–6 câu, có nêu số mục sắp tới." },
    muc: {
      type: "array", minItems: 4, maxItems: 20,
      items: {
        type: "object", additionalProperties: false,
        required: ["ten", "y_chinh", "vi_du"],
        properties: {
          ten: { type: "string", description: "Tên mục ngắn, ≤ 10 từ, KHÔNG đánh số (máy tự đánh)." },
          y_chinh: { type: "string", description: "1–2 câu tóm ý sẽ nói ở mục này." },
          vi_du: { type: "string", description: "Ví dụ cụ thể bằng tiền Việt sẽ dùng trong mục." },
        },
      },
    },
    chot: { type: "string", description: "Lời đọc nguyên văn phần Chốt: tóm một câu + một hành động cho tối nay + mời xem tiếp." },
  },
};

export async function chay({ cfg, video, baoTienDo }) {
  const tm = thuMucVideo(cfg, video);
  const giong = docChu(join(cfg.thuMucMau, "giong-thuong-hieu.md"));
  if (!giong) throw new Error("Thiếu mau/giong-thuong-hieu.md");
  const nghienCuu = docChu(join(tm, "nghien-cuu.md"));
  if (!nghienCuu) throw new Error("Chưa có nghien-cuu.md — chạy bước 01 trước");

  const phut = video.phut ?? 30;
  const TU_MOI_PHUT = cfg.XV_TU_MOI_PHUT || 208;
  const tuMucTieu = Math.round(phut * TU_MOI_PHUT);
  // Hook + Mở + Chốt ≈ 600 từ; phần còn lại chia đều cho các mục, mỗi mục ~300 từ (~1,9 phút)
  const soMuc = Math.max(4, Math.min(20, Math.round((tuMucTieu - 700) / TU_MOI_MUC)));
  const tuMoiMuc = Math.max(200, Math.round((tuMucTieu - 700) / soMuc));
  const tuXin = Math.round(tuMoiMuc * heSoBu(cfg.XV_MODEL_KICH_BAN));  // con số nói với model
  const tuToiThieu = Math.round(tuMoiMuc * 0.9);    // sàn cứng

  const usage = { token_vao: 0, token_ra: 0, cache_doc: 0, cache_ghi: 0, tim_kiem: 0, luot: 0 };
  let usdQuyDoi = 0, usd = 0;
  const congDon = (kq) => {
    for (const k of Object.keys(usage)) usage[k] += kq.usage?.[k] ?? 0;
    usdQuyDoi += kq.usd_quy_doi ?? 0; usd += kq.usd ?? 0;
  };

  // ── 02a · dàn ý ──────────────────────────────────────────────
  // Hết hạn mức giữa chừng → chạy lại dùng dàn ý và các cụm đã viết (tam/), không tốn lượt lại
  const daCoDan = docJson(join(tm, "dan-y.json"));
  const dungLaiDan = daCoDan?.muc?.length && daCoDan.so_muc_xin === soMuc && daCoDan.tu_xin === tuXin;
  baoTienDo?.(dungLaiDan ? "dàn ý (đã có)" : "dàn ý");
  const kqDan = dungLaiDan ? { toolInput: daCoDan, usage: null, usd: 0, usd_quy_doi: 0 } : await goi({
    cfg,
    model: cfg.XV_MODEL_KICH_BAN,
    system: giong,
    user: `Lập DÀN Ý cho video: "${video.tieu_de}"
${video.goc_nhin ? "Người xem mục tiêu: " + video.goc_nhin : ""}
Độ dài đích: ${phut} phút ≈ ${tuMucTieu} từ. Cần đúng ${soMuc} mục, mỗi mục sẽ viết ~${tuXin} từ.
Mỗi mục phải đủ chất để nói ${(tuXin / TU_MOI_PHUT).toFixed(1)} phút: một ví dụ bằng tiền Việt, một con số, và một cách làm cụ thể.

Dùng ĐÚNG các con số và nguồn trong bản nghiên cứu dưới đây, giữ ký hiệu [nguồn N]. Không bịa số.
Mỗi mục phải là một ý đứng riêng vẫn hiểu, không trùng ý nhau, xếp từ dễ làm tới khó làm.

=== BẢN NGHIÊN CỨU ===
${nghienCuu}`,
    maxTokens: 8000,
    jsonTool: { name: "ghi_dan_y", description: "Ghi dàn ý kịch bản.", schema: SCHEMA_DAN_Y },
    timeoutPhut: 10,
  });
  if (!dungLaiDan) congDon(kqDan);
  const dan = kqDan.toolInput;
  if (!dan?.muc?.length) throw new Error("Không lập được dàn ý (stop=" + kqDan.stop + ")");
  if (!dungLaiDan) ghiJson(join(tm, "dan-y.json"), { ...dan, so_muc_xin: soMuc, tu_xin: tuXin });
  const bamDan = createHash("sha1").update(JSON.stringify(dan.muc)).digest("hex").slice(0, 10);

  // ── 02b · viết từng cụm mục ──────────────────────────────────
  const phan = [];
  for (let i = 0; i < dan.muc.length; i += MUC_MOI_LUOT) {
    const cum = dan.muc.slice(i, i + MUC_MOI_LUOT);
    const tu = i + 1, den = i + cum.length;
    baoTienDo?.(`mục ${tu}–${den}/${dan.muc.length}`);
    const fileCum = join(tm, "tam", `kb-cum-${tu}-${bamDan}.md`);
    const daViet = docChu(fileCum).trim();
    if (daViet.startsWith("## ")) { phan.push(daViet); continue; }

    const kq = await goi({
      cfg,
      model: cfg.XV_MODEL_KICH_BAN,
      system: giong,
      user: `Viết LỜI ĐỌC cho mục ${tu} đến ${den} của video "${dan.tieu_de}".

Mỗi mục phải dài ${tuXin} từ, KHÔNG ĐƯỢC dưới ${tuToiThieu} từ (mỗi mục khoảng ${(tuXin / TU_MOI_PHUT).toFixed(1)} phút đọc).
Viết dài bằng CHẤT chứ đừng lặp ý: nêu hiện tượng, đưa ví dụ bằng tiền Việt có con số, giải thích vì sao nó xảy ra, rồi chỉ cách làm khác đi tối nay.
Trả về ĐÚNG khung sau, không thêm lời dẫn, không viết mục nào khác:

${cum.map((m, k) => `## ${tu + k}. ${m.ten}\n<lời đọc>`).join("\n\n")}

Dàn ý của đúng các mục này:
${cum.map((m, k) => `${tu + k}. ${m.ten}\n   ý: ${m.y_chinh}\n   ví dụ: ${m.vi_du}`).join("\n")}
${i > 0 ? `\nMục trước vừa kết thúc bằng: "${phan[phan.length - 1].slice(-160).trim()}"\nMở mục ${tu} bằng một câu nối tự nhiên từ đó.\n` : ""}
Toàn bộ dàn ý để biết bối cảnh (KHÔNG viết các mục khác):
${dan.muc.map((m, k) => `${k + 1}. ${m.ten}`).join("\n")}

=== BẢN NGHIÊN CỨU (lấy số liệu ở đây, giữ [nguồn N]) ===
${nghienCuu}`,
      maxTokens: 8000,
      timeoutPhut: 12,
    });
    congDon(kq);

    let t = kq.text.trim();
    const iDau = t.indexOf("## ");
    if (iDau > 0) t = t.slice(iDau);
    if (!t.startsWith("## ")) t = `## ${tu}. ${cum[0].ten}\n${t}`;
    phan.push(t);
  }

  // ── ghép ─────────────────────────────────────────────────────
  // Lời cố định của kênh (mau/loi-kenh.json): giới thiệu ngay sau Hook, kêu gọi đăng ký sau Chốt
  const loiKenh = docJson(join(cfg.thuMucMau, "loi-kenh.json")) || {};
  const md = [
    `# ${dan.tieu_de}`, "",
    "## Hook", dan.hook.trim(), "",
    "## Mở", ...(loiKenh.gioi_thieu ? [loiKenh.gioi_thieu.trim(), ""] : []), dan.mo.trim(), "",
    ...phan.map(p => p.trim() + "\n"),
    "## Chốt", dan.chot.trim(), ...(loiKenh.keu_goi ? ["", loiKenh.keu_goi.trim()] : []), "",
  ].join("\n");

  const muc = tachMuc(md);
  if (muc.length < 4) throw new Error(`Kịch bản chỉ có ${muc.length} mục — sai định dạng "## "`);
  ghiChu(join(tm, "kich-ban.md"), md);
  // Chữ số → chữ (12 triệu → mười hai triệu) để giọng đọc đúng nhịp; dòng tiêu đề "#" giữ nguyên
  try { await chayLenh(cfg.XV_PYTHON, [join(GOC, "tools", "so-thanh-chu.py"), join(tm, "kich-ban.md")], { env: { ...process.env, PYTHONIOENCODING: "utf-8" } }); }
  catch (e) { console.warn("[02] không đổi được số thành chữ:", e.message.slice(0, 120)); }

  const mdCuoi = docChu(join(tm, "kich-ban.md")) || md;
  const soTu = demTu(mdCuoi);
  const dat = Math.round(soTu / tuMucTieu * 100);
  const canhBao = soatKichBan(mdCuoi, tuMucTieu);
  return {
    ket_qua: {
      so_tu: soTu, phut_uoc: +(soTu / TU_MOI_PHUT).toFixed(1),
      dat: dat + "% đích" + (dat < 85 ? " ⚠ ngắn" : ""),
      canh_bao: canhBao,
      so_muc: dan.muc.length, luot_goi: 1 + phan.length,
      tieu_de: dan.tieu_de, muc: muc.map(m => m.ten),
    },
    usage, usd, usd_quy_doi: usdQuyDoi,
  };
}
