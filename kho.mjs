// Kho đăng — nơi DUY NHẤT anh mở để lấy file đăng YouTube. Mỗi video một ngăn, đánh số theo thứ tự xuất bản:
//   kho-dang/
//     DANH-SACH.md                              bảng tổng: cái nào đã đăng, cái nào tới lượt, gợi ý ngày
//     01 - 11 Thói Quen Tiêu Vặt Ăn Hết Lương 15 Triệu/
//       Tien-Di-Dau-01.mp4                      video dài
//       Tien-Di-Dau-01-thumbnail.png
//       Tien-Di-Dau-01-vi.srt
//       Tien-Di-Dau-01-DAN-VAO-YOUTUBE.txt      tiêu đề · mô tả · thẻ · các ô khác, dán từng khối
//       Tien-Di-Dau-01-Short-1.mp4              + Tien-Di-Dau-01-Short-1-DAN-VAO-YOUTUBE.txt  … Short-2, Short-3
// File video là HARD LINK sang ra/<video>/ (không tốn thêm dung lượng, làm lại video là kho tự mới);
// ổ khác thì chép. Trạng thái đã đăng lưu ở bảng muc_dang, bấm trong tab Thư viện.
import { join, isAbsolute } from "node:path";
import { existsSync, mkdirSync, linkSync, copyFileSync, unlinkSync, statSync, readdirSync, rmSync } from "node:fs";
import { GOC } from "./cfg.mjs";
import { layVideo, capSoKho, ghiMucDang, cacMucDang } from "./db.mjs";
import { docJson, ghiChu } from "./buoc/chung.mjs";

export const TEN_KHO = "kho-dang";

export function thuMucKho(cfg) {
  const p = (cfg.XV_KHO_DANG || TEN_KHO).trim();
  const tm = isAbsolute(p) ? p : join(GOC, p);
  mkdirSync(tm, { recursive: true });
  return tm;
}

const pad2 = (n) => String(n).padStart(2, "0");

// Danh sách phát của kênh: mau/loi-kenh.json → "danh_sach_phat": [{ten, tu_khoa: "quỹ|nợ|vay"}, …]. chu_de.tru = số thứ tự (1..n);
// không có tru thì đoán theo từ khoá trong tiêu đề; không khớp gì → danh sách đầu tiên.
function docDanhSachPhat(cfg) {
  const lk = docJson(join(cfg.thuMucMau, "loi-kenh.json")) || {};
  const ds = Array.isArray(lk.danh_sach_phat) && lk.danh_sach_phat.length ? lk.danh_sach_phat : [{ ten: "Video của kênh", tu_khoa: "" }];
  return ds.map(x => typeof x === "string" ? { ten: x, tu_khoa: "" } : x);
}
export function danhSachPhatCua(cfg, video, tieuDe = "") {
  const ds = docDanhSachPhat(cfg);
  if (video?.tru && ds[video.tru - 1]) return ds[video.tru - 1].ten;
  const t = (tieuDe + " " + (video?.tieu_de || "")).toLowerCase();
  for (const x of ds) if (x.tu_khoa && new RegExp(x.tu_khoa, "iu").test(t)) return x.ten;
  return ds[0].ten;
}
export const tenDanhSachPhat = (cfg) => docDanhSachPhat(cfg).map(x => x.ten);
// Tên thư mục: giữ dấu tiếng Việt cho dễ đọc, chỉ bỏ ký tự Windows cấm
const tenSach = (s) => String(s || "").replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim().slice(0, 70);

/** Đặt (hoặc làm mới) một file trong kho bằng hard link; khác ổ thì chép. */
function datFile(nguon, dich) {
  if (!existsSync(nguon)) return false;
  if (existsSync(dich)) {
    // cùng nội dung (cùng inode) thì thôi; khác thì thay
    try { const a = statSync(nguon), b = statSync(dich); if (a.ino === b.ino && a.dev === b.dev && a.ino) return true; } catch {}
    try { unlinkSync(dich); } catch {}
  }
  try { linkSync(nguon, dich); } catch { copyFileSync(nguon, dich); }
  return true;
}

/**
 * Xuất video + Shorts của một video vào kho. Gọi lúc anh duyệt ở cổng 2, và bất cứ lúc nào bấm "Xuất lại kho".
 * @returns { thu_muc, so_kho, muc: [{loai, so, file, tieu_de}] }
 */
export function xuatKho(cfg, videoId) {
  const video = layVideo(videoId);
  if (!video) throw new Error("Không có video #" + videoId);
  const tmRa = join(cfg.thuMucRa, video.ma);
  if (!existsSync(join(tmRa, "video.mp4"))) throw new Error("Video #" + videoId + " chưa có video.mp4");

  const sdl = docJson(join(tmRa, "sieu-du-lieu.json")) || {};
  const tieuDe = (sdl.tieu_de_chon || sdl.tieu_de?.[0] || video.tieu_de || "").trim();
  const soKho = capSoKho(videoId);
  const nn = pad2(soKho);
  const kho = thuMucKho(cfg);

  // Ngăn của video — nếu tiêu đề đổi (chọn lại ở cổng duyệt) thì dọn ngăn cũ cùng số
  const tenNgan = `${nn} - ${tenSach(tieuDe) || video.ma}`;
  const ngan = join(kho, tenNgan);
  for (const t of readdirSync(kho)) {
    if (t.startsWith(nn + " - ") && t !== tenNgan) {
      try { rmSync(join(kho, t), { recursive: true, force: true }); } catch {}
    }
  }
  mkdirSync(ngan, { recursive: true });

  const muc = [];
  const goc = `${(cfg.XV_TIEN_TO_FILE || "Kenh").replace(/[^A-Za-z0-9-]/g, "")}-${nn}`;

  // Video dài
  datFile(join(tmRa, "video.mp4"), join(ngan, `${goc}.mp4`));
  datFile(join(tmRa, "thumbnail.png"), join(ngan, `${goc}-thumbnail.png`));
  datFile(join(tmRa, "phu-de.srt"), join(ngan, `${goc}-vi.srt`));
  const dsp = danhSachPhatCua(cfg, video, tieuDe);
  ghiChu(join(ngan, `${goc}-DAN-VAO-YOUTUBE.txt`), banDanDai(cfg, sdl, tieuDe, goc, video, dsp));
  const mDai = { loai: "dai", so: 0, file: `${tenNgan}/${goc}.mp4`, tieu_de: tieuDe, giay: video.thoi_luong_giay, danh_sach_phat: dsp };
  ghiMucDang(videoId, mDai); muc.push(mDai);

  // Shorts (nếu bước 10 đã chạy)
  const kq = docJson(join(tmRa, "shorts", "ket-qua.json"));
  const kb = docJson(join(tmRa, "shorts", "shorts.json"));
  if (kq?.shorts?.length && kb?.shorts?.length) {
    kq.shorts.forEach((sh, i) => {
      const nguon = join(tmRa, sh.file);
      if (!existsSync(nguon)) return;
      const tenFile = `${goc}-Short-${sh.so}.mp4`;
      datFile(nguon, join(ngan, tenFile));
      ghiChu(join(ngan, `${goc}-Short-${sh.so}-DAN-VAO-YOUTUBE.txt`), banDanShort(kb.shorts[i], sh, tieuDe, goc, dsp));
      const m = { loai: "short", so: sh.so, file: `${tenNgan}/${tenFile}`, tieu_de: kb.shorts[i]?.tieu_de || sh.tieu_de, giay: sh.giay, danh_sach_phat: dsp };
      ghiMucDang(videoId, m); muc.push(m);
    });
  }

  ghiDanhSach(cfg);
  return { thu_muc: ngan, so_kho: soKho, muc };
}

// ── bản dán ──
function banDanDai(cfg, sdl, tieuDe, goc, video, dsp) {
  const duPhong = (sdl.tieu_de || []).filter(t => t !== tieuDe);
  return [
    `VIDEO DÀI ${goc}  ·  ${Math.round((video.thoi_luong_giay || 0) / 60)} phút`,
    ``,
    `TIÊU ĐỀ  (dán vào ô Tiêu đề)`,
    `──────────────────────────────────────────`,
    tieuDe,
    ``,
    `MÔ TẢ  (dán vào ô Mô tả)`,
    `──────────────────────────────────────────`,
    (sdl.mo_ta || "").trim(),
    ``,
    `TAG  (Hiện thêm → Thẻ; đã có dấu phẩy sẵn)`,
    `──────────────────────────────────────────`,
    (sdl.tags || []).join(", "),
    ``,
    `CÁC Ô KHÁC`,
    `──────────────────────────────────────────`,
    `Hình thu nhỏ      : ${goc}-thumbnail.png`,
    `Phụ đề            : ${goc}-vi.srt  (Hiện thêm → Phụ đề → Thêm → Tải tệp lên → Có mã thời gian → Tiếng Việt)`,
    `Danh sách phát    : ${dsp}  (chưa có thì tạo mới đúng tên này; danh sách của kênh: ${tenDanhSachPhat(cfg).join(" · ")})`,
    `Đối tượng         : Không, video này không dành cho trẻ em`,
    `Nội dung chỉnh sửa: Có — giọng và tranh do AI tạo (khai cho đúng luật, không ảnh hưởng đề xuất)`,
    `Danh mục          : Giáo dục · Ngôn ngữ: Tiếng Việt · Giấy phép: YouTube tiêu chuẩn`,
    `Chế độ hiển thị   : Riêng tư → xem lại một lượt → đổi Công khai (hoặc Lên lịch 19:30)`,
    duPhong.length ? `Tiêu đề dự phòng  : ${duPhong.join("  |  ")}` : ``,
    ``,
  ].join("\n");
}

function banDanShort(sh, kq, tieuDeDai, goc, dsp) {
  return [
    `SHORT ${goc}-Short-${kq.so}  ·  ${Math.round(kq.giay || 0)} giây  ·  cắt từ "${tieuDeDai}"`,
    ``,
    `TIÊU ĐỀ  (YouTube tự nhận là Shorts vì video dọc dưới 60 giây)`,
    `──────────────────────────────────────────`,
    sh?.tieu_de || kq.tieu_de || "",
    ``,
    `MÔ TẢ`,
    `──────────────────────────────────────────`,
    (sh?.mo_ta || "").trim(),
    ``,
    `THẺ  (đã có dấu phẩy)`,
    `──────────────────────────────────────────`,
    (sh?.tags || []).join(", "),
    ``,
    `CÁC Ô KHÁC`,
    `──────────────────────────────────────────`,
    `Video liên quan   : chọn "${tieuDeDai}"  ← nút này đưa người xem Short sang video dài`,
    `Danh sách phát    : ${dsp}  (cùng danh sách với video dài)`,
    `Hình thu nhỏ      : chọn khung hình ở giây 0 (tiêu đề to + nhân vật biểu cảm, chưa có phụ đề chạy)`,
    `Đối tượng         : Không dành cho trẻ em`,
    `Nội dung chỉnh sửa: Có — giọng và tranh do AI tạo`,
    `Giờ đăng          : 11:45 hoặc 20:00, mỗi ngày MỘT Short`,
    ``,
  ].join("\n");
}



// ── DANH-SACH.md: bảng tổng + hôm nay đăng gì ──
const NGAY_DAI = new Set([1, 3, 5]); // T2 · T4 · T6

export function goiYLich(muc, tuNgay = new Date()) {
  // video dài chưa đăng → các T2/T4/T6 kế tiếp; Short chưa đăng → mỗi ngày một cái từ ngày mai
  const ra = new Map();
  let d = new Date(tuNgay); d.setHours(0, 0, 0, 0);
  const dai = muc.filter(m => m.loai === "dai" && !m.youtube_id);
  let nd = new Date(d);
  for (const m of dai) {
    do { nd.setDate(nd.getDate() + 1); } while (!NGAY_DAI.has(nd.getDay()));
    ra.set(m.id, `${fmt(nd)} 19:30`);
  }
  const shorts = muc.filter(m => m.loai === "short" && !m.youtube_id);
  let ns = new Date(d);
  for (const m of shorts) { ns.setDate(ns.getDate() + 1); ra.set(m.id, `${fmt(ns)} 20:00`); }
  return ra;
}
const fmt = (x) => `${pad2(x.getDate())}/${pad2(x.getMonth() + 1)}`;

export function ghiDanhSach(cfg) {
  const kho = thuMucKho(cfg);
  const muc = cacMucDang();
  const lich = goiYLich(muc);
  const daDang = muc.filter(m => m.youtube_id).length;
  const shorts = muc.filter(m => m.loai === "short");
  const dong = muc.map(m => {
    const ten = m.loai === "dai" ? `**Video dài**` : `Short ${m.so}`;
    const tt = m.youtube_id
      ? `✅ ${m.dang_luc ? m.dang_luc.slice(0, 10) : ""} · https://youtu.be/${m.youtube_id}`
      : `⬜ chưa · gợi ý ${lich.get(m.id) || ""}`;
    return `| ${pad2(m.so_kho)} | ${ten} | ${m.tieu_de || ""} | \`${m.file}\` | ${m.giay ? Math.round(m.giay) + "s" : ""} | ${m.danh_sach_phat || ""} | ${tt} |`;
  });
  const tiep = muc.filter(m => !m.youtube_id);
  const tiepShort = tiep.find(m => m.loai === "short"), tiepDai = tiep.find(m => m.loai === "dai");
  const md = [
    `# Kho đăng — ${cfg.XV_TEN_KENH}`,
    ``,
    `Cập nhật ${new Date().toLocaleString("vi-VN")} · đã đăng ${daDang}/${muc.length} mục.`,
    `Mỗi ngăn một video dài + các Short cắt từ nó. Mở file \`…-DAN-VAO-YOUTUBE.txt\` cạnh video, dán từng khối.`,
    `Đăng xong → tab **Thư viện** trong Xưởng → bấm "Đã đăng" và dán link, bảng này tự cập nhật.`,
    ``,
    `## Tới lượt`,
    ``,
    tiepShort ? `- **Short kế tiếp:** ${tiepShort.tieu_de} → \`${tiepShort.file}\`` : `- Short: hết hàng — chạy video dài mới để có thêm.`,
    tiepDai ? `- **Video dài kế tiếp:** ${tiepDai.tieu_de} → \`${tiepDai.file}\` (T2 · T4 · T6, 19:30)` : `- Video dài: hết hàng.`,
    ``,
    `## Tất cả`,
    ``,
    `| # | Loại | Tiêu đề | File trong kho | Dài | Danh sách phát | YouTube |`,
    `|---|---|---|---|---|---|---|`,
    ...dong,
    ``,
    `Nhịp: 1 Short mỗi ngày (11:45 hoặc 20:00) · video dài T2 · T4 · T6 lúc 19:30. Chi tiết và 3 số cần nhìn: \`nhan-vat/kenh/thong-tin-kenh.md\`.`,
    ``,
  ].join("\n");
  ghiChu(join(kho, "DANH-SACH.md"), md);
  return md;
}
