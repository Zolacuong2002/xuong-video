// Thử 4 bước gọi Claude (01, 02, 03, 08) với API GIẢ — không tốn tiền, không cần khoá.
// Kiểm: hình dạng request theo dòng model, chia lượt cho video dài, ghép kịch bản, ghi db, tính tiền.
// Dùng: node tools/thu-claude-gia.mjs
import { napCfg } from "../cfg.mjs";
import { themChuDe, layVideo, cacDoan, xoaVideo } from "../db.mjs";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PHUT = 5; // → 4 mục, đủ để kiểm cơ chế chia lượt mà chạy nhanh
const cfg = {
  ...napCfg(), XV_CLAUDE: "api", ANTHROPIC_API_KEY: "sk-ant-gia-de-thu",
  XV_MODEL_NGHIEN_CUU: "claude-haiku-4-5", XV_MODEL_KICH_BAN: "claude-haiku-4-5",
  XV_MODEL_HINH: "claude-haiku-4-5", XV_MODEL_SIEU_DU_LIEU: "claude-haiku-4-5",
};
const loi = [];
const ok = (dk, ten, them = "") => { if (dk) console.log("  ✓ " + ten + (them ? "  → " + them : "")); else loi.push("✗ " + ten + (them ? "  → " + them : "")); };
const yeuCau = [];

const MUC = [
  { ten: "Ngừng mua cà phê mang đi", y_chinh: "Thói quen nhỏ lặp hằng ngày ăn mòn tiền lớn.", vi_du: "35 nghìn mỗi sáng là 12,8 triệu một năm" },
  { ten: "Tự động hoá khoản để dành", y_chinh: "Chuyển tiền ngay ngày lương, đừng đợi cuối tháng.", vi_du: "2 triệu tự động vào ngày 5" },
  { ten: "Bỏ gói cước không dùng hết", y_chinh: "Rà lại các khoản trừ tự động.", vi_du: "gói 180 nghìn/tháng" },
  { ten: "Đặt một khoản đệm nhỏ", y_chinh: "Có đệm thì không phải vay nóng.", vi_du: "10 triệu để riêng" },
];

// ── API giả ───────────────────────────────────────────────────
globalThis.fetch = async (url, o) => {
  const body = JSON.parse(o.body);
  yeuCau.push({ url, headers: o.headers, body });
  const usage = {
    input_tokens: 1200, output_tokens: 300, cache_creation_input_tokens: 800, cache_read_input_tokens: 0,
    server_tool_use: { web_search_requests: body.tools?.some(t => t.name === "web_search") ? 2 : 0 },
  };
  const tool = body.tools?.find(t => t.input_schema);
  const chu = body.messages[0].content.map(c => c.text || "").join("\n");
  let content;

  if (tool?.name === "ghi_dan_y") {
    content = [{ type: "tool_use", id: "t0", name: tool.name, input: {
      tieu_de: "4 Thói Quen Giữ Lại 20 Triệu Mỗi Năm (Không Cắt Gì Vui)",
      hook: "Bạn không tiêu hoang. Bạn chỉ đang rò rỉ. Và chỗ rò thì nhỏ tới mức không ai để ý.",
      mo: "Nếu lương bạn quanh 15 triệu mà cuối tháng vẫn trống túi, video này dành cho bạn. Mình sẽ đi qua bốn thói quen.",
      muc: MUC,
      chot: "Chọn đúng một thói quen, làm ngay tối nay. Video sau mình nói về quỹ dự phòng.",
    } }];
  } else if (tool?.name === "ghi_kich_ban_hinh") {
    // Trả 3 đoạn cho mỗi cụm, kèm 1 biểu đồ thiếu số để kiểm nhánh hạ bố cục
    content = [{ type: "tool_use", id: "t1", name: tool.name, input: { doan: [
      { loi_doc: "Đây là đoạn mở của cụm này, nói về thói quen tiền bạc.", bo_cuc: "tieu_de", tieu_de: "Thói quen thứ nhất", y: [], bieu_do: { loai: "khong", nhan: [], gia_tri: [], don_vi: "", nguon: "" }, so_sanh: { trai_ten: "", trai_y: [], phai_ten: "", phai_y: [] }, trich_dan: { cau: "", nguoi: "" } },
      { loi_doc: "Ba mươi lăm nghìn mỗi sáng, nhân ba trăm sáu lăm ngày, ra mười hai phẩy tám triệu [nguồn 1].", bo_cuc: "bieu_do", tieu_de: "Cà phê mỗi sáng", y: [], bieu_do: { loai: "cot", nhan: ["1 ngày", "1 tháng", "1 năm"], gia_tri: [35, 1050, 12775], don_vi: "nghìn đồng", nguon: "tự tính" }, so_sanh: { trai_ten: "", trai_y: [], phai_ten: "", phai_y: [] }, trich_dan: { cau: "", nguoi: "" } },
      { loi_doc: "Đoạn này đáng lẽ là biểu đồ nhưng không có số, phải bị hạ về y_chinh.", bo_cuc: "bieu_do", tieu_de: "Trống", y: ["một dòng"], bieu_do: { loai: "cot", nhan: [], gia_tri: [], don_vi: "", nguon: "" }, so_sanh: { trai_ten: "", trai_y: [], phai_ten: "", phai_y: [] }, trich_dan: { cau: "", nguoi: "" } },
    ] } }];
  } else if (tool?.name === "ghi_sieu_du_lieu") {
    content = [{ type: "tool_use", id: "t2", name: tool.name, input: {
      tieu_de: ["4 Thói Quen Giữ Lại 20 Triệu Mỗi Năm (Không Cắt Gì Vui)", "12 Khoản Rò Rỉ Âm Thầm (Bạn Đang Mất Mà Không Biết)", "5 Thói Quen Tiền Bạc Giúp Bạn Dư 20 Triệu"],
      mo_ta: "#taichinhcanhan #thoiquen #tietkiem\nBạn không tiêu hoang. Bạn chỉ đang rò rỉ.\nTrong video này mình đi qua bốn thói quen cụ thể.\nBạn đang mắc thói quen nào?",
      tags: ["tài chính cá nhân", "thói quen", "tiết kiệm", "quản lý tiền", "để dành", "lương 15 triệu", "chi tiêu", "tự do tài chính"],
      chu_thumbnail: "RÒ RỈ 20 TRIỆU", chu_thumbnail_phu: "mỗi năm, không ai để ý",
    } }];
  } else if (body.tools?.some(t => t.name === "web_search")) {
    content = [
      { type: "server_tool_use", id: "s1", name: "web_search", input: { query: "thói quen tiết kiệm" } },
      { type: "web_search_tool_result", tool_use_id: "s1", content: [
        { type: "web_search_result", url: "https://sbv.gov.vn/x", title: "NHNN — lãi suất", page_age: "June 2026" },
        { type: "web_search_result", url: "https://gso.gov.vn/y", title: "GSO — CPI", page_age: null },
      ] },
      { type: "text", text: "# Tóm tắt nghiên cứu\n## Các con số dùng được\n- 35.000đ — ly cà phê — 09/2026 [nguồn 1]\n## Nguồn\n1. NHNN — https://sbv.gov.vn/x" },
    ];
  } else {
    // lượt viết lời đọc cho một cụm mục → bóc số mục ra khỏi yêu cầu
    const m = chu.match(/mục (\d+) đến (\d+)/);
    const tu = m ? +m[1] : 1, den = m ? +m[2] : 1;
    let t = "Đây là lời dẫn thừa phải bị cắt bỏ.\n\n";
    for (let i = tu; i <= den; i++) {
      t += `## ${i}. ${MUC[i - 1]?.ten ?? "Mục " + i}\nĐây là lời đọc của mục ${i}. ${MUC[i - 1]?.vi_du ?? ""}. Nói thêm vài câu cho đủ dài để đếm từ có ý nghĩa và kiểm được phần ghép nối.\n\n`;
    }
    content = [{ type: "text", text: t }];
  }
  return { ok: true, status: 200, json: async () => ({ id: "msg", type: "message", role: "assistant", model: body.model, content, stop_reason: tool ? "tool_use" : "end_turn", usage }) };
};

const video = themChuDe("Thói quen tiền bạc giữ lại 20 triệu mỗi năm", null, "người đi làm lương 15 triệu", PHUT);
const tm = join(cfg.thuMucRa, video.ma);
console.log("video thử:", video.ma, "·", PHUT, "phút");

for (const [f, ten] of [["01-nghien-cuu", "01"], ["02-kich-ban", "02"], ["03-kich-ban-hinh", "03"], ["08-sieu-du-lieu", "08"]]) {
  const m = await import(`../buoc/${f}.mjs`);
  try { const kq = await m.chay({ cfg, video: layVideo(video.id), baoTienDo: () => {} }); console.log(`\n▶ bước ${ten} ✓`, JSON.stringify(kq.ket_qua)); }
  catch (e) { console.log(`\n▶ bước ${ten} ✗`, e.message); loi.push("bước " + ten + ": " + e.message); }
}

console.log("\n── Hình dạng request (Haiku 4.5) ──");
const r1 = yeuCau[0];
ok(r1.headers["anthropic-version"] === "2023-06-01" && r1.headers["x-api-key"] === cfg.ANTHROPIC_API_KEY, "header version + khoá");
ok(r1.body.system?.[0]?.cache_control?.type === "ephemeral", "system prompt có cache_control");
ok(r1.body.thinking?.type === "enabled" && r1.body.thinking.budget_tokens < r1.body.max_tokens, "Haiku: thinking budget_tokens < max_tokens");
ok(!("output_config" in r1.body), "Haiku: KHÔNG gửi output_config.effort");
ok(r1.body.tools?.[0]?.type === "web_search_20250305", "Haiku: web_search bản 20250305");
const coTool = (t) => yeuCau.find(r => r.body.tools?.some(x => x.name === t));
for (const t of ["ghi_dan_y", "ghi_kich_ban_hinh", "ghi_sieu_du_lieu"]) {
  const r = coTool(t);
  ok(!!r && r.body.tool_choice?.name === t && r.body.tools[0].strict === true && r.body.tools[0].input_schema.additionalProperties === false,
     `${t}: ép tool + strict + additionalProperties=false`);
}

console.log("\n── Chia lượt cho video dài ──");
const luot02 = yeuCau.filter(r => r.body.system?.[0]?.text?.includes("Giọng thương hiệu")).length;
const cumHinh = yeuCau.filter(r => r.body.tools?.some(x => x.name === "ghi_kich_ban_hinh")).length;
ok(luot02 === 3, "bước 02 gọi 3 lượt (1 dàn ý + 2 cụm mục)", luot02 + " lượt");
ok(cumHinh >= 2, "bước 03 chia nhiều cụm, không nhét một lượt", cumHinh + " lượt");
ok(existsSync(join(tm, "dan-y.json")), "có dan-y.json để soi lại dàn ý");

console.log("\n── Kịch bản ghép ──");
const kb = readFileSync(join(tm, "kich-ban.md"), "utf8");
ok(kb.startsWith("# 4 Thói Quen"), "mở bằng '# ' + tiêu đề từ dàn ý", kb.split("\n")[0]);
ok(!kb.includes("lời dẫn thừa"), "cắt sạch lời dẫn thừa của model");
const tenMuc = [...kb.matchAll(/^## (.+)$/gm)].map(m => m[1]);
ok(tenMuc[0] === "Hook" && tenMuc[1] === "Mở" && tenMuc[tenMuc.length - 1] === "Chốt", "đủ Hook / Mở / … / Chốt", tenMuc.join(" · "));
ok(tenMuc.filter(t => /^\d+\./.test(t)).length === 4, "đủ 4 mục đánh số liên tục", tenMuc.filter(t => /^\d+\./.test(t)).join(" · "));

console.log("\n── Đoạn vào db ──");
const doan = cacDoan(video.id);
ok(doan.length >= 6, "nhiều đoạn từ nhiều cụm gộp lại", doan.length + " đoạn");
ok(doan.every((d, i) => d.thu_tu === i + 1), "thu_tu đánh lại liên tục sau khi gộp");
ok(!doan.some(d => /\[nguồn/.test(d.loi_doc)), "đã bỏ [nguồn N] khỏi lời đọc");
ok(doan.some(d => d.bo_cuc === "bieu_do" && d.du_lieu.bieu_do?.gia_tri.length >= 2), "giữ biểu đồ có số");
ok(!doan.some(d => d.bo_cuc === "bieu_do" && !(d.du_lieu.bieu_do?.gia_tri.length >= 2)), "biểu đồ thiếu số bị hạ về y_chinh");
ok(doan[doan.length - 1].bo_cuc === "chot", "đoạn cuối luôn là chot", doan[doan.length - 1].bo_cuc);

console.log("\n── Siêu dữ liệu theo công thức đã đo ──");
const sdl = JSON.parse(readFileSync(join(tm, "sieu-du-lieu.json"), "utf8"));
ok(sdl.tieu_de.length === 3 && sdl.tieu_de_chon === sdl.tieu_de[0], "3 phương án, chọn mặc định cái đầu");
ok(sdl.tieu_de.every(t => /^\d+\s/.test(t)), "cả 3 tiêu đề mở đầu bằng con số");
ok(sdl.tieu_de.filter(t => /\(.+\)/.test(t)).length >= 2, "≥ 2 tiêu đề có ngoặc đơn bổ nghĩa");
ok(sdl.chu_thumbnail.length > 0 && sdl.tags.length >= 8, "có chữ thumbnail + ≥ 8 tag");

console.log("\n── Tiền ──");
const { tinhUsd } = await import("../claude-api.mjs");
ok(Math.abs(tinhUsd("claude-haiku-4-5", { input_tokens: 1200, output_tokens: 300, cache_creation_input_tokens: 800, server_tool_use: { web_search_requests: 2 } }) - 0.0237) < 1e-9, "công thức tiền Haiku đúng");
ok(Math.abs(tinhUsd("claude-opus-5", { input_tokens: 47000, output_tokens: 8300 }) - 0.4425) < 1e-9, "Opus 5: 47k/8,3k = $0,4425");

xoaVideo(video.id);
console.log("\n" + "─".repeat(52));
if (loi.length) { console.log("❌ CÓ " + loi.length + " LỖI:\n"); loi.forEach(l => console.log("   " + l)); process.exitCode = 1; }
else console.log("✅ 4 bước Claude (API giả): soát xong, không lỗi.");
