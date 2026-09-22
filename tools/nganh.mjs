// Đọc ngách bằng Apify — chạy tay khi cần chọn chủ đề mới. Kết quả vào nganh/<ngày>-*.md
//   node tools/nganh.mjs kham-pha "tài chính cá nhân" "tiết kiệm lương" …   → kênh nào đang dẫn ngách (theo view/ngày)
//   node tools/nganh.mjs kenh https://www.youtube.com/@OngChuTaiChinh-vn …   → 40 video gần nhất mỗi kênh, cái nào ăn view
//   node tools/nganh.mjs chu-de "quỹ dự phòng"                                  → video cùng chủ đề đang ăn view
// Mỗi video ~$0,004 trên gói Apify miễn phí $5/tháng.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { napCfg, GOC } from "../cfg.mjs";
import { khamPha, quetKenh, timVideoNgach, tomTatNgach } from "../nganh.mjs";

const cfg = napCfg();
const [, , lenh, ...doi] = process.argv;
const ngay = new Date().toISOString().slice(0, 10);
const thuMuc = join(GOC, "nganh"); mkdirSync(thuMuc, { recursive: true });
const ghi = (ten, chu) => { const f = join(thuMuc, `${ngay}-${ten}.md`); writeFileSync(f, chu, "utf8"); console.log("→", f); };
const n = (x) => Number(x || 0).toLocaleString("vi-VN");

// Mẫu tiêu đề thắng: đếm các từ khoá công thức trong nhóm top so với nhóm còn lại
function mauTieuDe(ds) {
  const luat = { "thói quen": /thói quen/i, "số ở đầu": /^\s*\d+/, "ngoặc đơn cuối": /\([^)]+\)\s*$/, "số tiền cụ thể": /\d+\s*(triệu|tỷ|nghìn|k)\b/i, "câu hỏi": /\?/, "người giàu/nghèo": /giàu|nghèo/i, "dấu hiệu": /dấu hiệu/i, "sai lầm": /sai lầm/i, "cách": /\bcách\b/i, "bí mật": /bí mật/i };
  const sx = [...ds].sort((a, b) => (b.view_moi_ngay ?? 0) - (a.view_moi_ngay ?? 0));
  const top = sx.slice(0, Math.max(5, Math.floor(sx.length / 4))), con = sx.slice(top.length);
  const tb = (arr) => arr.length ? arr.reduce((s, v) => s + (v.view_moi_ngay || 0), 0) / arr.length : 0;
  const dong = [];
  for (const [ten, re] of Object.entries(luat)) {
    const co = ds.filter(v => re.test(v.tieu_de)), khong = ds.filter(v => !re.test(v.tieu_de));
    if (co.length < 3 || khong.length < 3) continue;
    const hs = tb(co) / Math.max(1, tb(khong));
    dong.push(`| ${ten} | ${co.length} | ${n(Math.round(tb(co)))} | ${n(Math.round(tb(khong)))} | ${hs >= 1 ? "+" : ""}${Math.round((hs - 1) * 100)}% |`);
  }
  return dong.length ? `| Mẫu tiêu đề | Số video | View/ngày có | View/ngày không | Chênh |\n|---|---|---|---|---|\n${dong.join("\n")}` : "(chưa đủ video để so)";
}

function bangVideo(ds, toiDa = 40) {
  return `| # | Tiêu đề | View/ngày | Lượt xem | Phút | Đăng | Kênh |\n|---|---|---|---|---|---|---|\n` +
    ds.slice(0, toiDa).map((v, i) => `| ${i + 1} | [${v.tieu_de.replace(/\|/g, "/")}](${v.url}) | ${n(v.view_moi_ngay)} | ${n(v.views)} | ${v.phut} | ${v.ngay} | ${v.kenh} |`).join("\n");
}

if (lenh === "kham-pha") {
  const tuKhoa = doi.length ? doi : ["tài chính cá nhân người đi làm", "tiết kiệm tiền lương", "quản lý chi tiêu"];
  console.log("Apify: tìm", tuKhoa.join(" · "));
  const { video, kenh } = await khamPha(cfg, tuKhoa, { moiTuKhoa: 15 });
  const sx = video.sort((a, b) => (b.view_moi_ngay ?? 0) - (a.view_moi_ngay ?? 0));
  ghi("kham-pha", [
    `# Khám phá ngách — ${ngay}`, ``, `Từ khoá: ${tuKhoa.join(" · ")} · ${video.length} video · ${kenh.length} kênh`, ``,
    `## Kênh dẫn ngách (tổng view/ngày của video tìm thấy)`, ``,
    `| # | Kênh | Sub | Video | View/ngày | Ví dụ tiêu đề |`, `|---|---|---|---|---|---|`,
    ...kenh.slice(0, 20).map((k, i) => `| ${i + 1} | [${k.kenh}](${k.url}) | ${n(k.sub)} | ${k.so_video} | ${n(k.view_moi_ngay)} | ${k.vi_du.join(" · ").replace(/\|/g, "/")} |`),
    ``, `## Mẫu tiêu đề đang thắng`, ``, mauTieuDe(video), ``,
    `## Video ăn view nhất`, ``, bangVideo(sx, 40), ``,
  ].join("\n"));
  console.log(kenh.slice(0, 8).map((k, i) => `${i + 1}. ${k.kenh} (${n(k.sub)} sub) — ${n(k.view_moi_ngay)} view/ngày`).join("\n"));
} else if (lenh === "kenh") {
  if (!doi.length) { console.error("Cần ít nhất một URL kênh"); process.exit(1); }
  console.log("Apify: quét", doi.length, "kênh");
  const video = await quetKenh(cfg, doi, { toiDa: 40 });
  const sx = [...video].sort((a, b) => (b.view_moi_ngay ?? 0) - (a.view_moi_ngay ?? 0));
  const phut = video.map(v => v.phut).filter(Boolean).sort((a, b) => a - b);
  const trungVi = phut.length ? phut[Math.floor(phut.length / 2)] : 0;
  ghi("kenh", [
    `# Quét kênh — ${ngay}`, ``, doi.map(u => `- ${u}`).join("\n"), ``,
    `${video.length} video · độ dài trung vị ${trungVi} phút · top 25% đạt ≥ ${n(sx[Math.floor(sx.length / 4)]?.view_moi_ngay)} view/ngày`, ``,
    `## Mẫu tiêu đề đang thắng`, ``, mauTieuDe(video), ``,
    `## Video theo view/ngày`, ``, bangVideo(sx, 60), ``,
    `## Gợi ý chủ đề cho ${cfg.XV_TEN_KENH} (đừng chép, lấy góc)`, ``,
    ...sx.slice(0, 10).map((v, i) => `${i + 1}. Góc của "${v.tieu_de}" → viết lại cho ${cfg.XV_NGUOI_XEM}, có việc làm tối nay`),
    ``,
  ].join("\n"));
  console.log(sx.slice(0, 10).map((v, i) => `${i + 1}. ${v.tieu_de} — ${n(v.view_moi_ngay)}/ngày (${v.phut} phút)`).join("\n"));
} else if (lenh === "chu-de") {
  const tuKhoa = doi.join(" ");
  if (!tuKhoa) { console.error("Cần từ khoá"); process.exit(1); }
  const ds = await timVideoNgach(cfg, tuKhoa, { toiDa: 15 });
  ghi("chu-de-" + tuKhoa.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 40),
    [`# Chủ đề "${tuKhoa}" — ${ngay}`, ``, `## Mẫu tiêu đề`, ``, mauTieuDe(ds), ``, `## Video`, ``, bangVideo(ds, 30), ``].join("\n"));
  console.log(tomTatNgach(ds, 15));
} else {
  console.log("Dùng: node tools/nganh.mjs kham-pha [từ khoá…] | kenh <url…> | chu-de <từ khoá>");
}
