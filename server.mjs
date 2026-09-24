// Xưởng Video — server Node zero-dependency, cổng 5196.
// Quản lý hàng chờ chủ đề, chạy dây chuyền từng video (một lúc một video), hai cổng duyệt người,
// đếm tiền thật theo usage API trả về. Giao diện: index.html cùng thư mục.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, createReadStream, writeFileSync, readdirSync, unlinkSync, rmSync } from "node:fs";
import { join, extname, normalize } from "node:path";
import { napCfg, GOC } from "./cfg.mjs";
import { soatKichBan } from "./buoc/chung.mjs";
import { xuatKho, ghiDanhSach, thuMucKho, duLieuDang, goiYLich } from "./kho.mjs";
import { dangYouTube, coDangNhapYouTube } from "./yt.mjs";
import {
  BUOC, moDb, themChuDe, layVideo, danhSachVideo, capNhatVideo, congChiPhi, xoaVideo,
  cacMucDang, layMucDang, danhDauMucDang, boDanhDauMucDang,
  ghiBuoc, cacBuoc, cacDoan, chiPhiThang,
} from "./db.mjs";

const cfg = napCfg();
moDb();

// Server không được chết âm thầm giữa một video: ghi log rồi đứng dậy chạy tiếp.
process.on("uncaughtException", (e) => {
  console.error("[!] uncaughtException:", e?.stack || e);
  if (dangChay) { try { ghiBuoc(dangChay.videoId, dangChay.buoc, "?", "loi", { ket_qua: { loi: String(e?.message || e) } }); capNhatVideo(dangChay.videoId, { trang_thai: "loi", loi: "Server vấp: " + String(e?.message || e).slice(0, 200) }); } catch {} dangChay = null; setImmediate(chayTiep); }
});
process.on("unhandledRejection", (e) => {
  console.error("[!] unhandledRejection:", e?.stack || e);
});

// ── bộ chạy: một video một lúc, còn lại xếp hàng ──
const hangDoi = [];
let dangChay = null;  // { videoId, buoc, chiTiet }
let tamDung = null;   // { ly_do, mo_lai_luc, luc } — hết hạn mức gói Claude Code
let henChayTiep = null;

// Gói Pro có hạn mức theo phiên: hết giữa chừng thì máy giữ nguyên bước đang đứng (các bước đã lưu từng cụm/đoạn/ảnh)
// và TỰ chạy tiếp khi hạn mức mở lại — anh không cần ngồi canh. Không đọc được giờ mở → thử lại mỗi 30 phút.
function henTiepTuc(moLaiLuc) {
  if (henChayTiep) clearTimeout(henChayTiep);
  let cho = 30 * 60000;
  const t = docGioMoLai(moLaiLuc);
  if (t) cho = Math.max(60000, t - Date.now() + 90000);
  henChayTiep = setTimeout(() => { henChayTiep = null; if (tamDung) { console.log("⏵ tự chạy tiếp (hạn mức mở lại)"); tamDung = null; chayTiep(); } }, cho);
  return new Date(Date.now() + cho);
}
// "12:30am", "3pm", "14:00", "2:30pm (Asia/Saigon)" → mốc thời gian kế tiếp trong 24 giờ tới
function docGioMoLai(chu) {
  if (!chu) return null;
  const m = String(chu).match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return null;
  let h = parseInt(m[1], 10), ph = parseInt(m[2] || "0", 10);
  const ap = (m[3] || "").toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  const t = new Date(); t.setHours(h, ph, 0, 0);
  if (t.getTime() <= Date.now()) t.setDate(t.getDate() + 1);
  return t.getTime();
}

/** "24/09 20:00" (giờ máy) hoặc chuỗi ISO → Date; rỗng/hỏng → null. Quá khứ thì hiểu là năm sau. */
function docGioHen(chu) {
  if (!chu) return null;
  const s = String(chu).trim();
  const m = s.match(/^(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{4}))?[ ,]+(\d{1,2}):(\d{2})$/);
  if (m) {
    const nam = m[3] ? parseInt(m[3], 10) : new Date().getFullYear();
    const d = new Date(nam, parseInt(m[2], 10) - 1, parseInt(m[1], 10), parseInt(m[4], 10), parseInt(m[5], 10), 0, 0);
    if (!m[3] && d <= new Date()) d.setFullYear(d.getFullYear() + 1);
    return d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

const thuLai = new Map();  // "videoId:buoc" → số lần đã tự thử lại

function xepHang(videoId, tuBuoc) {
  if (tamDung) tamDung = null;  // người dùng chủ động bấm chạy = coi như hạn mức đã mở lại
  if (henChayTiep) { clearTimeout(henChayTiep); henChayTiep = null; }
  if (dangChay?.videoId === videoId || hangDoi.some(h => h.videoId === videoId)) return false;
  hangDoi.push({ videoId, tuBuoc });
  capNhatVideo(videoId, { loi: null });
  setImmediate(chayTiep);
  return true;
}

async function chayTiep() {
  if (dangChay || !hangDoi.length || tamDung) return;
  const { videoId, tuBuoc } = hangDoi.shift();
  dangChay = { videoId, buoc: tuBuoc, chiTiet: "" };
  try {
    await chayDayChuyen(videoId, tuBuoc);
  } catch (e) {
    console.error(`[video ${videoId}] lỗi:`, e.message);
  } finally {
    dangChay = null;
    setImmediate(chayTiep);
  }
}

async function chayDayChuyen(videoId, tuBuoc) {
  for (const b of BUOC) {
    if (b.so < tuBuoc) continue;
    const video = layVideo(videoId);
    if (!video) return;
    dangChay.buoc = b.so; dangChay.chiTiet = "";
    ghiBuoc(videoId, b.so, b.ten, "dang_chay");
    capNhatVideo(videoId, { buoc_hien_tai: b.so, trang_thai: b.ten });
    const t0 = Date.now();
    try {
      const mod = await import(`./buoc/${b.file}`);
      const kq = await mod.chay({ cfg, video, baoTienDo: (chu) => { if (dangChay) dangChay.chiTiet = chu; } });
      const giay = (Date.now() - t0) / 1000;
      ghiBuoc(videoId, b.so, b.ten, "xong", {
        ket_qua: kq.usd_quy_doi != null ? { ...kq.ket_qua, quy_doi_usd: +kq.usd_quy_doi.toFixed(4) } : kq.ket_qua,
        giay, usd: kq.usd ?? 0, usd_quy_doi: kq.usd_quy_doi ?? 0,
        token_vao: kq.usage?.token_vao, token_ra: kq.usage?.token_ra,
        cache_doc: kq.usage?.cache_doc, cache_ghi: kq.usage?.cache_ghi,
      });
      if (kq.usd) congChiPhi(videoId, kq.usd);
      capNhatVideo(videoId, { trang_thai: b.sau, buoc_hien_tai: b.so });
      console.log(`[${video.ma}] ✓ bước ${b.so} ${b.ten} ${giay.toFixed(1)}s${kq.usd_quy_doi ? " ≈$" + kq.usd_quy_doi.toFixed(4) + " quy đổi" : ""}`);
      if (b.sau.startsWith("CHO_DUYET")) {
        if (b.sau === "CHO_DUYET_VIDEO") capNhatVideo(videoId, { xong_luc: new Date().toISOString() });
        return; // dừng ở cổng duyệt người
      }
    } catch (e) {
      if (e.hetHanMuc) {
        // Không phải lỗi của video — treo hàng đợi, giữ nguyên chỗ đang đứng để chạy lại đúng bước này.
        tamDung = { ly_do: e.message, mo_lai_luc: e.moLaiLuc ?? null, luc: new Date().toISOString() };
        ghiBuoc(videoId, b.so, b.ten, "cho", { ket_qua: { cho: e.message }, giay: (Date.now() - t0) / 1000 });
        capNhatVideo(videoId, { buoc_hien_tai: b.so, loi: e.message });
        hangDoi.unshift({ videoId, tuBuoc: b.so });
        const luc = henTiepTuc(e.moLaiLuc);
        tamDung.tu_chay_luc = luc.toISOString();
        console.log(`[${video.ma}] ⏸ ${e.message} → tự chạy tiếp lúc ${luc.toLocaleTimeString("vi-VN")}`);
        return;
      }
      // CLI treo / quá giờ / lỗi mạng: không phải lỗi nội dung → xếp lại đúng bước này, tối đa 2 lần
      if (/quá \d+ phút|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|Can't reach the API server|fetch failed|Không gọi được Worker|thoát mã \d+: $/.test(e.message) && (thuLai.get(`${videoId}:${b.so}`) || 0) < 5) {
        thuLai.set(`${videoId}:${b.so}`, (thuLai.get(`${videoId}:${b.so}`) || 0) + 1);
        ghiBuoc(videoId, b.so, b.ten, "cho", { ket_qua: { thu_lai: e.message }, giay: (Date.now() - t0) / 1000 });
        capNhatVideo(videoId, { buoc_hien_tai: b.so, loi: `Thử lại bước ${b.so} (lần ${thuLai.get(`${videoId}:${b.so}`)}): ${e.message}` });
        console.log(`[${video.ma}] ↻ thử lại bước ${b.so}: ${e.message.slice(0, 120)}`);
        // mất mạng thì đợi lâu hơn giữa các lần thử (2 → 4 → 8 → 16 → 32 phút)
        const lan = thuLai.get(`${videoId}:${b.so}`);
        setTimeout(() => xepHang(videoId, b.so), /ENOTFOUND|EAI_AGAIN|Can't reach/.test(e.message) ? 60000 * Math.pow(2, lan) : 60000);
        return;
      }
      ghiBuoc(videoId, b.so, b.ten, "loi", { ket_qua: { loi: e.message }, giay: (Date.now() - t0) / 1000 });
      capNhatVideo(videoId, { trang_thai: "loi", loi: `Bước ${b.so} (${b.ten}): ${e.message}` });
      throw e;
    }
  }
}

// ── tiện ích HTTP ──
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json; charset=utf-8", ".png": "image/png", ".mp4": "video/mp4", ".wav": "audio/wav", ".srt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8", ".txt": "text/plain; charset=utf-8" };

function json(res, ma, du) {
  res.writeHead(ma, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(du));
}
function docBody(req) {
  return new Promise((ok, hong) => {
    let s = ""; req.on("data", d => { s += d; if (s.length > 5e6) hong(new Error("body quá lớn")); });
    req.on("end", () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { hong(new Error("JSON hỏng")); } });
  });
}
function guiFile(req, res, duongDan) {
  if (!existsSync(duongDan) || !statSync(duongDan).isFile()) return json(res, 404, { loi: "không có file" });
  const size = statSync(duongDan).size, kieu = MIME[extname(duongDan).toLowerCase()] ?? "application/octet-stream";
  const range = req.headers.range;
  if (range && kieu.startsWith("video/")) {
    const [a, b] = range.replace("bytes=", "").split("-");
    const bd = parseInt(a, 10), kt = b ? parseInt(b, 10) : Math.min(bd + 2e6, size - 1);
    res.writeHead(206, { "content-type": kieu, "content-range": `bytes ${bd}-${kt}/${size}`, "accept-ranges": "bytes", "content-length": kt - bd + 1 });
    return createReadStream(duongDan, { start: bd, end: kt }).pipe(res);
  }
  res.writeHead(200, { "content-type": kieu, "content-length": size, "cache-control": "no-store" });
  createReadStream(duongDan).pipe(res);
}
function anToan(ma) { return /^[a-z0-9-]+$/.test(ma); }
// Phần lưu dở của từng bước (để chạy tiếp sau khi hết hạn mức) — xoá khi anh cố ý làm lại bước đó
function xoaLuuDo(tm, so) {
  // Bước 10: "chạy lại" = muốn bộ Shorts MỚI (kịch bản, giọng, tranh, mp4) → dọn cả thư mục.
  // Chỉ xoá shorts.json thì giọng cũ còn nguyên, máy sẽ ghép lời mới với tiếng đọc cũ.
  if (so === 10) { try { rmSync(join(tm, "shorts"), { recursive: true, force: true }); } catch {} return; }
  // bước 3 khoá theo nội dung kịch bản nên làm lại vẫn ra y vậy → giữ, không xoá
  const mau = { 2: /^kb-cum-.*\.md$|^dan-y\.json$/ }[so];
  if (!mau) return;
  for (const thu of [join(tm, "tam"), tm]) {
    if (!existsSync(thu)) continue;
    for (const f of readdirSync(thu)) if (mau.test(f)) { try { unlinkSync(join(thu, f)); } catch {} }
  }
}

// ── định tuyến ──
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const p = url.pathname;
  try {
    if (req.method === "GET" && (p === "/" || p === "/index.html")) {
      res.writeHead(200, { "content-type": MIME[".html"], "cache-control": "no-store" });
      return res.end(readFileSync(join(GOC, "index.html")));
    }

    // Kho đăng: đánh dấu từng mục (video dài / Short) đã đăng
    // Đăng thẳng lên YouTube (cần cấp quyền một lần: node tools/yt-dang-nhap.mjs)
    const mu = p.match(/^\/api\/kho\/(\d+)\/dang-youtube$/);
    if (req.method === "POST" && mu) {
      const m = layMucDang(parseInt(mu[1], 10));
      if (!m) return json(res, 404, { loi: "không có mục" });
      if (m.youtube_id) return json(res, 400, { loi: "mục này đã đăng rồi" });
      if (!coDangNhapYouTube()) return json(res, 400, { loi: "Chưa cấp quyền YouTube — chạy: node tools/yt-dang-nhap.mjs" });
      const b = await docBody(req);
      // "24/09 20:00" hoặc ISO; bỏ trống = để riêng tư, chủ kênh tự bật
      const hen = docGioHen(b.hen) ?? (b.theo_lich ? docGioHen(goiYLich(cacMucDang()).get(m.id)) : null);
      try {
        dangChay = { videoId: m.video_id, buoc: 0, chiTiet: `đăng YouTube: ${m.tieu_de || ""}` };
        const kq = await dangYouTube({ ...duLieuDang(cfg, m), hen, bao: (c) => { dangChay.chiTiet = c; } });
        danhDauMucDang(m.id, kq.videoId);
        if (m.loai === "dai") capNhatVideo(m.video_id, { trang_thai: "da_dang", youtube_id: kq.videoId });
        ghiDanhSach(cfg);
        return json(res, 200, { ok: true, ...kq });
      } catch (e) {
        return json(res, 400, { loi: e.message });
      } finally { dangChay = null; }
    }

    const mk = p.match(/^\/api\/kho\/(\d+)\/(da-dang|chua-dang)$/);
    if (req.method === "POST" && mk) {
      const m = layMucDang(parseInt(mk[1], 10));
      if (!m) return json(res, 404, { loi: "không có mục" });
      if (mk[2] === "da-dang") {
        const b = await docBody(req);
        danhDauMucDang(m.id, b.youtube_id ?? null);
        if (m.loai === "dai") capNhatVideo(m.video_id, { trang_thai: "da_dang", youtube_id: b.youtube_id ?? null });
      } else {
        boDanhDauMucDang(m.id);
      }
      ghiDanhSach(cfg);
      return json(res, 200, { ok: true });
    }

    // GET /api/tien-do — poll 1,5s
    if (req.method === "GET" && p === "/api/tien-do") {
      const th = chiPhiThang();
      return json(res, 200, {
        dang_chay: dangChay, hang_doi: hangDoi.map(h => h.videoId), tam_dung: tamDung,
        video: danhSachVideo(), chi_phi_thang: th,
        kho: (() => { const muc = cacMucDang(), lich = goiYLich(muc);
          return { thu_muc: thuMucKho(cfg), muc: muc.map(m => ({ ...m, goi_y: lich.get(m.id) || null })) }; })(),
        cfg: { model: { nghien_cuu: cfg.XV_MODEL_NGHIEN_CUU, kich_ban: cfg.XV_MODEL_KICH_BAN, hinh: cfg.XV_MODEL_HINH, sieu_du_lieu: cfg.XV_MODEL_SIEU_DU_LIEU },
               tts: cfg.XV_TTS, giong: cfg.XV_TTS_GIONG, phu_de: cfg.XV_PHU_DE, nguon_claude: cfg.XV_CLAUDE || "cli",
               co_khoa: (cfg.XV_CLAUDE || "cli") === "cli" ? true : !!cfg.ANTHROPIC_API_KEY,
               yt: coDangNhapYouTube() },
      });
    }

    // POST /api/tiep-tuc — gỡ tạm dừng khi hạn mức đã mở lại
    if (req.method === "POST" && p === "/api/tiep-tuc") {
      tamDung = null;
      if (henChayTiep) { clearTimeout(henChayTiep); henChayTiep = null; }
      setImmediate(chayTiep);
      return json(res, 200, { ok: true, hang_doi: hangDoi.length });
    }

    // POST /api/chu-de — dán nhiều dòng
    if (req.method === "POST" && p === "/api/chu-de") {
      const b = await docBody(req);
      const dong = String(b.dong ?? "").split(/\r?\n/).map(x => x.trim()).filter(Boolean);
      if (!dong.length) return json(res, 400, { loi: "chưa có chủ đề" });
      const phut = Math.max(1, Math.min(40, parseInt(b.phut, 10) || 30));
      const ra = dong.map(d => {
        // "Tiêu đề | góc nhìn" — phần sau dấu | là tuỳ chọn
        const [tieuDe, gocNhin] = d.split("|").map(x => x.trim());
        return themChuDe(tieuDe, b.tru ?? null, gocNhin ?? null, phut);
      });
      if (b.chay_luon) ra.forEach(v => xepHang(v.id, 1));
      return json(res, 200, { them: ra.length, video: ra });
    }

    const m = p.match(/^\/api\/video\/(\d+)(?:\/(.+))?$/);
    if (m) {
      const id = parseInt(m[1], 10), hanhDong = m[2] ?? "";
      const video = layVideo(id);
      if (!video) return json(res, 404, { loi: "không có video" });
      const tm = join(cfg.thuMucRa, video.ma);

      if (req.method === "GET" && !hanhDong) {
        const doc = (f) => existsSync(join(tm, f)) ? readFileSync(join(tm, f), "utf8") : null;
        return json(res, 200, {
          video, buoc: cacBuoc(id), doan: cacDoan(id),
          nghien_cuu: doc("nghien-cuu.md"), kich_ban: doc("kich-ban.md"),
          canh_bao: doc("kich-ban.md") ? soatKichBan(doc("kich-ban.md"), (video.phut ?? 25) * 160) : [],
          sieu_du_lieu: doc("sieu-du-lieu.json") ? JSON.parse(doc("sieu-du-lieu.json")) : null,
          phu_de: doc("phu-de.srt"),
          shorts: doc("shorts/ket-qua.json") ? JSON.parse(doc("shorts/ket-qua.json")).shorts : [],
          shorts_dan: doc("shorts/DAN-VAO-YOUTUBE.txt"),
          co: { video: existsSync(join(tm, "video.mp4")), thumbnail: existsSync(join(tm, "thumbnail.png")) },
        });
      }
      if (req.method === "POST" && hanhDong === "chay") {
        // Bước đang đứng chưa "xong" (lỗi, đang chạy dở lúc server tắt, chờ hạn mức) → chạy lại đúng bước đó; xong rồi → bước kế
        const hienTai = video.buoc_hien_tai || 0;
        const banGhi = cacBuoc(id).filter(b => b.so === hienTai).pop();
        const chuaXong = hienTai > 0 && (video.trang_thai === "loi" || !banGhi || banGhi.trang_thai !== "xong");
        const tu = Math.max(1, chuaXong ? hienTai : hienTai + 1);
        const cuoi = BUOC[BUOC.length - 1].so;
        return json(res, 200, { xep: xepHang(id, Math.min(tu, cuoi)), tu_buoc: Math.min(tu, cuoi) });
      }
      const cl = hanhDong.match(/^chay-lai\/(\d{1,2})$/);
      if (req.method === "POST" && cl) {
        const so = parseInt(cl[1], 10);
        if (!BUOC.some(b => b.so === so)) return json(res, 400, { loi: "không có bước " + so });
        // Anh chủ động "làm lại từ bước N" = muốn kết quả MỚI → xoá phần lưu dở của bước đó
        // (tự chạy tiếp sau hết hạn mức thì KHÔNG đi qua đây nên vẫn giữ)
        xoaLuuDo(tm, so);
        return json(res, 200, { xep: xepHang(id, so), tu_buoc: so });
      }
      // ⛔ cổng duyệt 1: lưu kịch bản anh đã sửa rồi chạy tiếp từ bước 3
      if (req.method === "PUT" && hanhDong === "kich-ban") {
        const b = await docBody(req);
        if (typeof b.kich_ban !== "string" || b.kich_ban.trim().length < 50) return json(res, 400, { loi: "kịch bản quá ngắn" });
        writeFileSync(join(tm, "kich-ban.md"), b.kich_ban.trim() + "\n", "utf8");
        if (b.duyet) { capNhatVideo(id, { trang_thai: "kich_ban_duyet" }); xepHang(id, 3); }
        return json(res, 200, { ok: true, duyet: !!b.duyet });
      }
      // ⛔ cổng duyệt 2: đưa vào hàng đợi đăng
      if (req.method === "POST" && hanhDong === "duyet") {
        const b = await docBody(req);
        if (b.tieu_de_chon && existsSync(join(tm, "sieu-du-lieu.json"))) {
          const s = JSON.parse(readFileSync(join(tm, "sieu-du-lieu.json"), "utf8"));
          s.tieu_de_chon = b.tieu_de_chon; writeFileSync(join(tm, "sieu-du-lieu.json"), JSON.stringify(s, null, 2), "utf8");
        }
        capNhatVideo(id, { trang_thai: "hang_doi" });
        let kho = null;
        try { kho = xuatKho(cfg, id); } catch (e) { console.warn(`[video ${id}] xuất kho lỗi: ${e.message}`); }
        return json(res, 200, { ok: true, kho });
      }
      if (req.method === "POST" && hanhDong === "xuat-kho") {
        try { return json(res, 200, { ok: true, kho: xuatKho(cfg, id) }); }
        catch (e) { return json(res, 400, { loi: e.message }); }
      }
      if (req.method === "POST" && hanhDong === "da-dang") {
        const b = await docBody(req);
        capNhatVideo(id, { trang_thai: "da_dang", youtube_id: b.youtube_id ?? null });
        // mục video dài trong kho cũng đánh dấu theo
        const mDai = cacMucDang(id).find(m => m.loai === "dai");
        if (mDai) { danhDauMucDang(mDai.id, b.youtube_id ?? null); ghiDanhSach(cfg); }
        return json(res, 200, { ok: true });
      }
      if (req.method === "DELETE" && !hanhDong) {
        if (dangChay?.videoId === id) return json(res, 409, { loi: "đang chạy, không xoá được" });
        xoaVideo(id);
        return json(res, 200, { ok: true });
      }
    }

    // GET /ra/<ma>/<file> — mp4, png, srt, md để xem thử
    const r = p.match(/^\/ra\/([a-z0-9-]+)\/(.+)$/);
    if (req.method === "GET" && r && anToan(r[1])) {
      const f = normalize(join(cfg.thuMucRa, r[1], decodeURIComponent(r[2])));
      if (!f.startsWith(normalize(join(cfg.thuMucRa, r[1])))) return json(res, 403, { loi: "cấm" });
      return guiFile(req, res, f);
    }

    json(res, 404, { loi: "không có đường dẫn " + p });
  } catch (e) {
    console.error(e);
    json(res, 500, { loi: e.message });
  }
});

server.listen(cfg.XV_PORT, "127.0.0.1", () => {
  console.log(`\n  🎬 Xưởng Video  →  http://localhost:${cfg.XV_PORT}\n`);
  console.log(`  Claude: ${cfg.XV_CLAUDE || "cli"} · model: ${cfg.XV_MODEL_NGHIEN_CUU} · giọng: ${cfg.XV_TTS}/${cfg.XV_TTS_GIONG} · phụ đề: ${cfg.XV_PHU_DE}`);
  if ((cfg.XV_CLAUDE || "cli") === "api" && !cfg.ANTHROPIC_API_KEY) console.log("  ⚠  XV_CLAUDE=api nhưng chưa có ANTHROPIC_API_KEY — bước 01/02/03/08 sẽ báo lỗi.");
  console.log("");
});
