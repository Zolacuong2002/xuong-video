// Đọc ngách bằng Apify (actor streamers~youtube-scraper, ~$0,004/video, gói miễn phí $5/tháng ≈ 1.200 video):
//   timVideoNgach(cfg, từ khoá)  → video cùng chủ đề đang ăn view (bước 01 nạp vào bản nghiên cứu)
//   quetKenh(cfg, [url kênh])     → video gần nhất của các kênh đối chiếu
//   khamPha(cfg, [từ khoá])       → tìm kênh trong ngách theo tổng view
// Token: XV_APIFY_TOKEN trong config.env, hoặc file .apify.env (APIFY_TOKEN=…) ở thư mục dự án / thư mục ông.
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { GOC } from "./cfg.mjs";

const ACTOR = "streamers~youtube-scraper";

export function docApifyToken(cfg = {}) {
  if (cfg.XV_APIFY_TOKEN) return cfg.XV_APIFY_TOKEN;
  if (process.env.APIFY_TOKEN) return process.env.APIFY_TOKEN;
  for (const f of [join(GOC, ".apify.env"), join(dirname(dirname(GOC)), ".apify.env")]) {
    if (!existsSync(f)) continue;
    const m = readFileSync(f, "utf8").match(/APIFY_TOKEN\s*=\s*(\S+)/);
    if (m) return m[1].trim();
  }
  return "";
}

/** Chạy actor đồng bộ, trả về mảng item (tối đa ~4 phút). */
async function chayActor(cfg, input, { timeoutGiay = 240 } = {}) {
  const token = docApifyToken(cfg);
  if (!token) throw new Error("Chưa có token Apify: điền XV_APIFY_TOKEN trong config.env (apify.com → Settings → API tokens)");
  const url = `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${token}&timeout=${timeoutGiay}&memory=1024&clean=1`;
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
  if (!r.ok) throw new Error(`Apify ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return await r.json();
}

const giay = (d) => { const p = String(d || "0").split(":").map(Number); return p.reduce((s, x) => s * 60 + x, 0); };
const so = (x) => parseInt(String(x ?? "0").replace(/[^\d]/g, ""), 10) || 0;

function gon(v) {
  const ngay = v.date ? new Date(v.date) : null;
  const tuoiNgay = ngay ? Math.max(1, (Date.now() - ngay.getTime()) / 86400000) : null;
  const views = so(v.viewCount);
  return {
    tieu_de: v.title || "", url: v.url || "", kenh: v.channelName || "", kenh_url: v.channelUrl || "",
    sub: so(v.numberOfSubscribers), views, likes: so(v.likes), binh_luan: so(v.commentsCount),
    ngay: ngay ? ngay.toISOString().slice(0, 10) : "", phut: +(giay(v.duration) / 60).toFixed(1),
    view_moi_ngay: tuoiNgay ? Math.round(views / tuoiNgay) : null,
    mo_ta: String(v.text || "").slice(0, 600),
    phu_de: v.subtitles ? String(v.subtitles).slice(0, 4000) : "",
  };
}

/** Video cùng chủ đề (tìm kiếm YouTube) — xếp theo view/ngày. */
export async function timVideoNgach(cfg, tuKhoa, { toiDa = 12, phuDe = false } = {}) {
  const items = await chayActor(cfg, {
    searchQueries: [tuKhoa], maxResults: toiDa, maxResultsShorts: 0, maxResultStreams: 0,
    sortVideosBy: "NEWEST",
    transcriptionAndSubtitle: phuDe ? "SUBTITLES" : "NONE", subtitlesLanguage: "any", subtitlesFormat: "plaintext",
    aiVideoDescription: false, aiVideoSummary: false,
  });
  return items.filter(v => v.title && so(v.viewCount) > 0).map(gon).sort((a, b) => (b.view_moi_ngay ?? 0) - (a.view_moi_ngay ?? 0));
}

/** Video gần nhất của các kênh. */
export async function quetKenh(cfg, urls, { toiDa = 40 } = {}) {
  const items = await chayActor(cfg, {
    startUrls: urls.map(u => ({ url: u.endsWith("/videos") ? u : u.replace(/\/$/, "") + "/videos" })),
    maxResults: toiDa, maxResultsShorts: 0, maxResultStreams: 0, sortVideosBy: "NEWEST",
    transcriptionAndSubtitle: "NONE", aiVideoDescription: false, aiVideoSummary: false,
  }, { timeoutGiay: 280 });
  return items.filter(v => v.title).map(gon);
}

/** Tìm kênh trong ngách: gom video từ nhiều từ khoá, xếp kênh theo tổng view/ngày. */
export async function khamPha(cfg, tuKhoas, { moiTuKhoa = 20 } = {}) {
  const items = await chayActor(cfg, {
    searchQueries: tuKhoas, maxResults: moiTuKhoa, maxResultsShorts: 0, maxResultStreams: 0,
    transcriptionAndSubtitle: "NONE", aiVideoDescription: false, aiVideoSummary: false,
  }, { timeoutGiay: 280 });
  const video = items.filter(v => v.title).map(gon);
  const kenh = new Map();
  for (const v of video) {
    const k = kenh.get(v.kenh_url || v.kenh) || { kenh: v.kenh, url: v.kenh_url, sub: v.sub, so_video: 0, view_moi_ngay: 0, vi_du: [] };
    k.so_video++; k.view_moi_ngay += v.view_moi_ngay || 0; if (k.vi_du.length < 3) k.vi_du.push(v.tieu_de);
    kenh.set(v.kenh_url || v.kenh, k);
  }
  return { video, kenh: [...kenh.values()].sort((a, b) => b.view_moi_ngay - a.view_moi_ngay) };
}

/** Bảng markdown ngắn để nhét vào prompt nghiên cứu. */
export function tomTatNgach(ds, toiDa = 12) {
  if (!ds?.length) return "";
  return ds.slice(0, toiDa).map((v, i) =>
    `${i + 1}. "${v.tieu_de}" — ${v.views.toLocaleString("vi-VN")} lượt (${v.view_moi_ngay ?? "?"}/ngày), ${v.phut} phút, đăng ${v.ngay}, kênh ${v.kenh} (${v.sub.toLocaleString("vi-VN")} sub)`
  ).join("\n");
}
