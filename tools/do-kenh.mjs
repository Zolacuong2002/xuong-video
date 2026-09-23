// Đo kênh: lấy lượt xem thật của MỌI mục đã đánh dấu "đã đăng" trong kho, qua Apify.
// Dùng: node tools/do-kenh.mjs            → bảng ra màn hình + nganh/<ngày>-do-kenh.md
// Cần XV_APIFY_TOKEN trong config.env. ~$0,004/mục, 20 mục ≈ $0,08.
import { napCfg, GOC } from "../cfg.mjs";
import { docApifyToken } from "../nganh.mjs";
import { cacMucDang } from "../db.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const cfg = napCfg();
const token = docApifyToken(cfg);
if (!token) { console.error("Chưa có XV_APIFY_TOKEN trong config.env"); process.exit(1); }

const muc = cacMucDang().filter(m => m.youtube_id && m.youtube_id !== "x");
if (!muc.length) { console.error("Chưa có mục nào đánh dấu đã đăng."); process.exit(1); }
console.log(`Đo ${muc.length} mục đã đăng…`);

async function doApify(ids) {
  const r = await fetch(`https://api.apify.com/v2/acts/streamers~youtube-scraper/run-sync-get-dataset-items?token=${token}&timeout=420&memory=2048&clean=1`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ startUrls: ids.map(id => ({ url: `https://www.youtube.com/watch?v=${id}` })), maxResults: ids.length + 5, downloadSubtitles: false }),
  });
  if (!r.ok) throw new Error(`Apify ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).filter(v => v.id);
}
// Mục Apify không trả về = chưa xem được công khai: thường là ĐANG HẸN GIỜ (bình thường), đôi khi là riêng tư.
async function coCongKhai(id) {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`);
    return r.ok;
  } catch { return null; }
}

const ds = await doApify(muc.map(m => m.youtube_id));
const theo = new Map(ds.map(v => [v.id, v]));
const soNgay = (s) => Math.max(1, Math.round((Date.now() - new Date(s)) / 86400000));

const hang = [];
for (const m of muc) {
  const v = theo.get(m.youtube_id);
  const ngay = v?.date ? soNgay(v.date) : (m.dang_luc ? soNgay(m.dang_luc) : null);
  hang.push({
    so_kho: m.so_kho, loai: m.loai, so: m.so, tieu_de: m.tieu_de, id: m.youtube_id,
    dang: (v?.date || m.dang_luc || "").slice(0, 10), ngay,
    view: v?.viewCount ?? null, like: v?.likes ?? 0, cmt: v?.commentsCount ?? 0,
    cong_khai: v ? true : await coCongKhai(m.youtube_id),
  });
}
hang.sort((a, b) => (b.view ?? -1) - (a.view ?? -1));

const sub = ds.find(v => v.numberOfSubscribers != null)?.numberOfSubscribers ?? null;
const an = hang.filter(h => h.cong_khai === false);
const dai = hang.filter(h => h.loai === "dai" && h.view != null);
const sho = hang.filter(h => h.loai === "short" && h.view != null);
const tong = (xs) => xs.reduce((a, b) => a + (b.view || 0), 0);
const tb = (xs) => xs.length ? Math.round(tong(xs) / xs.length) : 0;
const tongView = tong(dai) + tong(sho);

const dong = (h) => `| ${String(h.so_kho ?? "").padStart(2, "0")} | ${h.loai === "dai" ? "**Video dài**" : "Short " + h.so} | ${h.tieu_de || ""} | ${h.cong_khai === false ? "⏳ chờ lên sóng" : (h.view ?? "?")} | ${h.ngay ?? "?"} | ${h.like} | ${h.cmt} | https://youtu.be/${h.id} |`;
const md = [
  `# Đo kênh — ${new Date().toISOString().slice(0, 10)}`, ``,
  `Người đăng ký: **${sub ?? "?"}** · đã tải lên: ${muc.length} · đang công khai: ${dai.length + sho.length} · chờ lên sóng: ${an.length}`,
  `Tổng lượt xem (mục công khai): **${tongView}** · video dài ${tong(dai)} (trung bình ${tb(dai)}) · Shorts ${tong(sho)} (trung bình ${tb(sho)})`,
  sub != null && tongView ? `Đổi lượt xem thành người đăng ký: **${(sub / tongView * 1000).toFixed(1)} sub / 1.000 view**` : ``,
  ``, `| # | Loại | Tiêu đề | Lượt xem | Ngày | ♥ | 💬 | Link |`, `|---|---|---|---|---|---|---|---|`,
  ...hang.map(dong), ``,
  an.length ? `## ⏳ Chưa xem được công khai (${an.length} mục)\n\nBình thường nếu đang hẹn giờ — chỉ kiểm tra lại nếu ngày lên sóng đã qua.\n\n${an.map(h => `- ${h.tieu_de} → https://youtu.be/${h.id}`).join("\n")}\n` : ``,
  `## Ba số chỉ Studio mới có (tự mở, máy không lấy được)`, ``,
  `- **Tỷ lệ nhấp (CTR)** — Nội dung → chọn video → Số liệu phân tích → Phạm vi tiếp cận. Dưới 4% thì đổi tiêu đề/thumbnail.`,
  `- **Thời gian xem trung bình** — cùng trang, tab Mức độ tương tác. Dưới 30% độ dài video thì hook hoặc nhịp đang hỏng.`,
  `- **Người đăng ký đến từ đâu** — Số liệu phân tích kênh → Đối tượng → Người đăng ký. Biết Shorts hay video dài kéo sub.`,
  ``,
].filter(x => x !== ``).join("\n");

mkdirSync(join(GOC, "nganh"), { recursive: true });
const f = join(GOC, "nganh", `${new Date().toISOString().slice(0, 10)}-do-kenh.md`);
writeFileSync(f, md, "utf8");
console.log(`\nSub: ${sub} · tổng view: ${tongView} · dài ${tong(dai)} (tb ${tb(dai)}) · Shorts ${tong(sho)} (tb ${tb(sho)})`);
if (an.length) console.log(`⏳ ${an.length} mục chưa công khai (hẹn giờ hoặc riêng tư): ${an.map(h => h.id).join(" ")}`);
for (const h of hang) console.log(`${h.loai === "dai" ? "DÀI " : "short"} ${String(h.cong_khai === false ? "⏳" : h.view ?? "?").padStart(5)} · ${h.dang} · ${(h.tieu_de || "").slice(0, 46)}`);
console.log("→ " + f);
