// SQLite qua node:sqlite (có sẵn trong Node 24, không cài gì). 4 bảng: chu_de, video, buoc, doan.
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { GOC } from "./cfg.mjs";

// Bước số → file thực thi + trạng thái video sau khi xong bước đó
export const BUOC = [
  { so: 1, ten: "nghien_cuu",    file: "01-nghien-cuu.mjs",    sau: "nghien_cuu" },
  { so: 2, ten: "kich_ban",      file: "02-kich-ban.mjs",      sau: "CHO_DUYET_KICH_BAN" },
  { so: 3, ten: "kich_ban_hinh", file: "03-kich-ban-hinh.mjs", sau: "kich_ban_hinh" },
  { so: 4, ten: "giong_doc",     file: "04-giong-doc.mjs",     sau: "giong_doc" },
  { so: 5, ten: "hinh_anh",      file: "05-render-hinh.mjs",   sau: "hinh_anh" },
  { so: 6, ten: "dung_video",    file: "06-dung-video.mjs",    sau: "dung_video" },
  { so: 7, ten: "phu_de",        file: "07-phu-de.mjs",        sau: "phu_de" },
  { so: 8, ten: "sieu_du_lieu",  file: "08-sieu-du-lieu.mjs",  sau: "sieu_du_lieu" },
  { so: 9, ten: "thumbnail",     file: "09-thumbnail.mjs",     sau: "thumbnail" },
  { so: 10, ten: "shorts",       file: "10-shorts.mjs",        sau: "CHO_DUYET_VIDEO" },
];

let db;
export function moDb() {
  if (db) return db;
  db = new DatabaseSync(join(GOC, "xuong.db"));
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS chu_de (
      id INTEGER PRIMARY KEY,
      tieu_de TEXT NOT NULL,
      tru INTEGER,
      goc_nhin TEXT,
      phut INTEGER DEFAULT 30,
      uu_tien INTEGER DEFAULT 0,
      tao_luc TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS video (
      id INTEGER PRIMARY KEY,
      chu_de_id INTEGER REFERENCES chu_de(id),
      ma TEXT UNIQUE,
      trang_thai TEXT NOT NULL DEFAULT 'moi',
      buoc_hien_tai INTEGER DEFAULT 0,
      loi TEXT,
      chi_phi_usd REAL DEFAULT 0,
      thoi_luong_giay REAL,
      youtube_id TEXT,
      tao_luc TEXT DEFAULT (datetime('now','localtime')),
      xong_luc TEXT
    );
    CREATE TABLE IF NOT EXISTS buoc (
      id INTEGER PRIMARY KEY,
      video_id INTEGER REFERENCES video(id),
      so INTEGER, ten TEXT,
      trang_thai TEXT,
      ket_qua TEXT,
      token_vao INTEGER DEFAULT 0, token_ra INTEGER DEFAULT 0,
      cache_doc INTEGER DEFAULT 0, cache_ghi INTEGER DEFAULT 0,
      usd REAL DEFAULT 0,
      usd_quy_doi REAL DEFAULT 0,
      giay REAL,
      chay_luc TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS doan (
      id INTEGER PRIMARY KEY,
      video_id INTEGER REFERENCES video(id),
      thu_tu INTEGER,
      loai TEXT,
      loi_doc TEXT,
      bo_cuc TEXT,
      du_lieu TEXT,
      wav TEXT, png TEXT,
      giay REAL
    );
    CREATE INDEX IF NOT EXISTS ix_buoc_video ON buoc(video_id, so);
    CREATE INDEX IF NOT EXISTS ix_doan_video ON doan(video_id, thu_tu);
  `);
  // db cũ chưa có cột → thêm, có rồi thì bỏ qua
  try { db.exec("ALTER TABLE buoc ADD COLUMN usd_quy_doi REAL DEFAULT 0"); } catch {}
  // 14/09: slide có tranh tách làm hai lớp — tranh (anh) phóng Ken Burns, chữ (lop) đứng yên
  try { db.exec("ALTER TABLE doan ADD COLUMN anh TEXT"); } catch {}
  try { db.exec("ALTER TABLE doan ADD COLUMN lop TEXT"); } catch {}
  // 14/09: Kho đăng — số thứ tự xuất bản của video + từng mục (video dài / Short) đã đăng chưa
  try { db.exec("ALTER TABLE video ADD COLUMN so_kho INTEGER"); } catch {}
  db.exec(`
    CREATE TABLE IF NOT EXISTS muc_dang (
      id INTEGER PRIMARY KEY,
      video_id INTEGER REFERENCES video(id),
      loai TEXT NOT NULL,          -- 'dai' | 'short'
      so INTEGER NOT NULL,         -- 0 = video dài, 1.. = Short thứ mấy
      file TEXT, tieu_de TEXT, giay REAL,
      youtube_id TEXT, dang_luc TEXT,
      xuat_luc TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(video_id, loai, so)
    );
  `);
  try { db.exec("ALTER TABLE muc_dang ADD COLUMN danh_sach_phat TEXT"); } catch {}
  // 16/09: đăng song song TikTok (chỉ Short) — trạng thái riêng
  try { db.exec("ALTER TABLE muc_dang ADD COLUMN tiktok_id TEXT"); } catch {}
  try { db.exec("ALTER TABLE muc_dang ADD COLUMN tiktok_luc TEXT"); } catch {}
  return db;
}

// ── chủ đề ──
export function themChuDe(tieuDe, tru = null, gocNhin = null, phut = 30) {
  const d = moDb();
  const r = d.prepare("INSERT INTO chu_de(tieu_de, tru, goc_nhin, phut) VALUES(?,?,?,?)").run(tieuDe, tru, gocNhin, phut);
  const chuDeId = Number(r.lastInsertRowid);
  const ma = sinhMa(tieuDe, chuDeId);
  const v = d.prepare("INSERT INTO video(chu_de_id, ma) VALUES(?,?)").run(chuDeId, ma);
  return layVideo(Number(v.lastInsertRowid));
}

function sinhMa(tieuDe, id) {
  const slug = tieuDe.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return `${String(id).padStart(3, "0")}-${slug || "video"}`;
}

// ── video ──
export function layVideo(id) {
  return moDb().prepare(`
    SELECT v.*, c.tieu_de, c.tru, c.goc_nhin, c.phut,
      (SELECT COALESCE(SUM(usd_quy_doi),0) FROM buoc WHERE video_id = v.id) AS quy_doi_usd
    FROM video v JOIN chu_de c ON c.id = v.chu_de_id WHERE v.id = ?`).get(id) ?? null;
}
export function danhSachVideo() {
  return moDb().prepare(`
    SELECT v.*, c.tieu_de, c.tru, c.goc_nhin, c.phut,
      (SELECT COUNT(*) FROM doan WHERE video_id = v.id) AS so_doan,
      (SELECT COALESCE(SUM(usd_quy_doi),0) FROM buoc WHERE video_id = v.id) AS quy_doi_usd
    FROM video v JOIN chu_de c ON c.id = v.chu_de_id
    ORDER BY v.id DESC`).all();
}
export function capNhatVideo(id, cot) {
  const keys = Object.keys(cot);
  if (!keys.length) return;
  const set = keys.map(k => `${k} = ?`).join(", ");
  moDb().prepare(`UPDATE video SET ${set} WHERE id = ?`).run(...keys.map(k => cot[k]), id);
}
export function congChiPhi(id, usd) {
  moDb().prepare("UPDATE video SET chi_phi_usd = chi_phi_usd + ? WHERE id = ?").run(usd, id);
}
export function xoaVideo(id) {
  const d = moDb();
  d.prepare("DELETE FROM doan WHERE video_id = ?").run(id);
  d.prepare("DELETE FROM buoc WHERE video_id = ?").run(id);
  const v = d.prepare("SELECT chu_de_id FROM video WHERE id = ?").get(id);
  d.prepare("DELETE FROM video WHERE id = ?").run(id);
  if (v) d.prepare("DELETE FROM chu_de WHERE id = ?").run(v.chu_de_id);
}

// ── bước ──
// Mỗi (video, số bước) giữ một dòng; chạy lại thì ghi đè để log luôn phản ánh lần cuối.
export function ghiBuoc(videoId, so, ten, trangThai, extra = {}) {
  const d = moDb();
  const cot = {
    trang_thai: trangThai,
    ket_qua: extra.ket_qua != null ? JSON.stringify(extra.ket_qua) : null,
    token_vao: extra.token_vao ?? 0, token_ra: extra.token_ra ?? 0,
    cache_doc: extra.cache_doc ?? 0, cache_ghi: extra.cache_ghi ?? 0,
    usd: extra.usd ?? 0, usd_quy_doi: extra.usd_quy_doi ?? 0, giay: extra.giay ?? null,
  };
  const cu = d.prepare("SELECT id FROM buoc WHERE video_id = ? AND so = ?").get(videoId, so);
  if (cu) {
    const keys = Object.keys(cot);
    d.prepare(`UPDATE buoc SET ${keys.map(k => `${k} = ?`).join(", ")}, chay_luc = datetime('now','localtime') WHERE id = ?`)
      .run(...keys.map(k => cot[k]), cu.id);
    return cu.id;
  }
  const r = d.prepare(`INSERT INTO buoc(video_id, so, ten, trang_thai, ket_qua, token_vao, token_ra, cache_doc, cache_ghi, usd, usd_quy_doi, giay)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(videoId, so, ten, cot.trang_thai, cot.ket_qua, cot.token_vao, cot.token_ra, cot.cache_doc, cot.cache_ghi, cot.usd, cot.usd_quy_doi, cot.giay);
  return Number(r.lastInsertRowid);
}
export function cacBuoc(videoId) {
  return moDb().prepare("SELECT * FROM buoc WHERE video_id = ? ORDER BY so").all(videoId)
    .map(b => ({ ...b, ket_qua: b.ket_qua ? JSON.parse(b.ket_qua) : null }));
}

// ── đoạn ──
export function xoaDoan(videoId) { moDb().prepare("DELETE FROM doan WHERE video_id = ?").run(videoId); }
export function themDoan(videoId, d) {
  moDb().prepare(`INSERT INTO doan(video_id, thu_tu, loai, loi_doc, bo_cuc, du_lieu) VALUES(?,?,?,?,?,?)`)
    .run(videoId, d.thu_tu, d.loai, d.loi_doc, d.bo_cuc, d.du_lieu != null ? JSON.stringify(d.du_lieu) : null);
}
export function cacDoan(videoId) {
  return moDb().prepare("SELECT * FROM doan WHERE video_id = ? ORDER BY thu_tu").all(videoId)
    .map(d => ({ ...d, du_lieu: d.du_lieu ? JSON.parse(d.du_lieu) : null }));
}
export function capNhatDoan(id, cot) {
  const keys = Object.keys(cot);
  moDb().prepare(`UPDATE doan SET ${keys.map(k => `${k} = ?`).join(", ")} WHERE id = ?`).run(...keys.map(k => cot[k]), id);
}

// ── thống kê tiền ──
// ── kho đăng ──
export function capSoKho(videoId) {
  const d = moDb();
  const v = d.prepare("SELECT so_kho FROM video WHERE id = ?").get(videoId);
  if (v?.so_kho) return v.so_kho;
  const max = d.prepare("SELECT COALESCE(MAX(so_kho), 0) AS m FROM video").get().m;
  d.prepare("UPDATE video SET so_kho = ? WHERE id = ?").run(max + 1, videoId);
  return max + 1;
}
export function ghiMucDang(videoId, m) {
  moDb().prepare(`INSERT INTO muc_dang(video_id, loai, so, file, tieu_de, giay, danh_sach_phat) VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(video_id, loai, so) DO UPDATE SET file = excluded.file, tieu_de = excluded.tieu_de, giay = excluded.giay,
      danh_sach_phat = excluded.danh_sach_phat, xuat_luc = datetime('now','localtime')`)
    .run(videoId, m.loai, m.so, m.file, m.tieu_de, m.giay ?? null, m.danh_sach_phat ?? null);
}
export function cacMucDang(videoId = null) {
  const d = moDb();
  const sql = `SELECT m.*, v.ma, v.so_kho, c.tieu_de AS tieu_de_video FROM muc_dang m JOIN video v ON v.id = m.video_id LEFT JOIN chu_de c ON c.id = v.chu_de_id` +
    (videoId ? " WHERE m.video_id = ?" : "") + " ORDER BY v.so_kho, m.loai = 'short', m.so";
  return videoId ? d.prepare(sql).all(videoId) : d.prepare(sql).all();
}
export function layMucDang(id) { return moDb().prepare("SELECT * FROM muc_dang WHERE id = ?").get(id); }
export function danhDauMucDang(id, youtubeId) {
  moDb().prepare("UPDATE muc_dang SET youtube_id = ?, dang_luc = datetime('now','localtime') WHERE id = ?").run(youtubeId ?? null, id);
}
export function boDanhDauMucDang(id) {
  moDb().prepare("UPDATE muc_dang SET youtube_id = NULL, dang_luc = NULL WHERE id = ?").run(id);
}


export function chiPhiThang() {
  return moDb().prepare(`
    SELECT COALESCE(SUM(usd),0) AS usd, COALESCE(SUM(usd_quy_doi),0) AS usd_quy_doi, COUNT(DISTINCT video_id) AS so_video
    FROM buoc WHERE strftime('%Y-%m', chay_luc) = strftime('%Y-%m','now','localtime')`).get();
}
