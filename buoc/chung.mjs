// Việc dùng chung cho các bước: thư mục ra, chạy tiến trình ngoài, đo độ dài âm thanh, đọc/ghi JSON.
import { spawn } from "node:child_process";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function thuMucVideo(cfg, video) {
  const tm = join(cfg.thuMucRa, video.ma);
  for (const con of ["", "hinh", "giong", "tam", "minh-hoa"]) mkdirSync(join(tm, con), { recursive: true });
  return tm;
}

export function docJson(duongDan, macDinh = null) {
  if (!existsSync(duongDan)) return macDinh;
  return JSON.parse(readFileSync(duongDan, "utf8"));
}
export function ghiJson(duongDan, du) { writeFileSync(duongDan, JSON.stringify(du, null, 2), "utf8"); }
export function docChu(duongDan) { return existsSync(duongDan) ? readFileSync(duongDan, "utf8") : ""; }
export function ghiChu(duongDan, chu) { writeFileSync(duongDan, chu, "utf8"); }

/** Chạy lệnh ngoài, gom stdout/stderr. Ném lỗi kèm đuôi stderr khi exit ≠ 0. */
export function chayLenh(lenh, args, o = {}) {
  return new Promise((ok, hong) => {
    const p = spawn(lenh, args, { windowsHide: true, ...o });
    let out = "", err = "";
    p.stdout?.on("data", d => { out += d; });
    p.stderr?.on("data", d => { err += d; });
    p.on("error", e => hong(new Error(`Không chạy được "${lenh}": ${e.message}`)));
    p.on("close", code => {
      if (code === 0 || o.boQuaLoi) ok({ code, out, err });
      else hong(new Error(`${lenh} thoát mã ${code}\n${err.split("\n").slice(-12).join("\n")}`));
    });
  });
}

export async function doDaiGiay(cfg, file) {
  const { out } = await chayLenh(cfg.XV_FFPROBE, [
    "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file,
  ]);
  const s = parseFloat(out.trim());
  if (!Number.isFinite(s)) throw new Error("ffprobe không đọc được độ dài: " + file);
  return s;
}

export function pad3(n) { return String(n).padStart(3, "0"); }

export function apiKey(cfg) {
  if (!cfg.ANTHROPIC_API_KEY) throw new Error("Chưa điền ANTHROPIC_API_KEY trong config.env");
  return cfg.ANTHROPIC_API_KEY;
}

/** Tách kịch bản markdown thành các mục theo dòng "## ". Trả [{ten, noi_dung}]. */
export function tachMuc(md) {
  const muc = [];
  let hienTai = null;
  for (const dong of md.split(/\r?\n/)) {
    const m = dong.match(/^##\s+(.+?)\s*$/);
    if (m) { hienTai = { ten: m[1].trim(), noi_dung: "" }; muc.push(hienTai); continue; }
    if (dong.startsWith("# ")) continue;
    if (hienTai) hienTai.noi_dung += dong + "\n";
  }
  return muc.map(x => ({ ...x, noi_dung: x.noi_dung.trim() })).filter(x => x.noi_dung);
}

export function demTu(chu) { return (chu.match(/\S+/g) || []).length; }

/**
 * Soát kịch bản bằng luật máy — không gọi model, không tốn hạn mức.
 * Bắt những lỗi mà cổng duyệt người hay đọc lướt qua nhưng TTS sẽ đọc thành tiếng.
 * Trả mảng cảnh báo dạng { loai, chu, ghi }.
 */
export function soatKichBan(md, tuMucTieu = 0) {
  const canh = [];
  const than = md.replace(/^#.*$/gm, "");

  // 1. Xưng hô lẫn lộn — giọng thương hiệu chốt "mình", không "tôi"
  const toi = (than.match(/\btôi\b/gi) || []).length;
  const minh = (than.match(/\bmình\b/gi) || []).length;
  if (toi && minh) canh.push({ loai: "xung_ho", chu: `"tôi" ${toi} lần lẫn với "mình" ${minh} lần`, ghi: 'Giọng kênh dùng "mình"' });

  // 1b. Tiêu chí kênh: nhân vật không bịa trải nghiệm cá nhân cụ thể ("mình từng mất trắng…", "hồi đó mình…")
  const biaDoiTu = [...than.matchAll(/(?<!\p{L})(m[iì]nh (?:đã )?từng|hồi (?:đó|trước|xưa) mình|mình (?:đã )?(?:mất|trả giá|vay|nợ|thua)(?!\p{L}))[^.!?]{0,60}/giu)]
    .map(m => m[0].trim()).slice(0, 6);
  if (biaDoiTu.length) canh.push({ loai: "su_that", chu: biaDoiTu.join(" · "), ghi: "Tiêu chí kênh: không bịa trải nghiệm cá nhân — đổi thành 'một bạn mình biết…' hoặc ví dụ giả định" });
  // 1b2. Bịa tương tác khán giả — kênh mới chưa có lịch sử bình luận/tin nhắn
  const biaKhanGia = [...than.matchAll(/(?<!\p{L})(c[aâ]u (?:mình|tôi) (?:nh[aậ]n|hay nh[aậ]n|được hỏi) nhi[eề]u nh[aấ]t|nhi[eề]u (?:b[aạ]n|anh em|người) (?:đã )?(?:nh[aắ]n|h[oỏ]i|comment|b[iì]nh lu[aậ]n) (?:cho )?(?:m[iì]nh|t[oô]i)|như m[iì]nh đã n[oó]i ở video trước)[^.!?]{0,60}/giu)]
    .map(m => m[0].trim()).slice(0, 5);
  if (biaKhanGia.length) canh.push({ loai: "su_that", chu: biaKhanGia.join(" · "), ghi: "Kênh mới chưa có lịch sử bình luận — đổi thành 'một câu rất hay gặp' hoặc bỏ" });
  // 1c. Tiêu chí kênh: chữ dễ vi phạm — quy kết, hứa lợi nhuận, kêu gọi đầu tư
  const viPham = [...than.matchAll(/(?<!\p{L})(lừa đảo|cố tình lừa|chắc chắn (?:lãi|thắng|giàu)|cam kết lợi nhuận|đổi đời|x[2-9] tài khoản|mua ngay mã|coin|tiền số|forex|đa cấp|trốn thuế|lách thuế|trốn nợ)(?!\p{L})/giu)]
    .map(m => m[0]).filter((x, i, arr) => arr.indexOf(x) === i);
  if (viPham.length) canh.push({ loai: "chinh_sach", chu: viPham.join(", "), ghi: "Tiêu chí kênh: không quy kết, không hứa lợi nhuận, không kêu gọi đầu tư/lách luật — đọc lại ngữ cảnh" });

  // 2. Lặp từ liền nhau — "lúc lúc", "là là".
  // KHÔNG dùng \b: \b của JS chỉ hiểu chữ ASCII nên cắt sai giữa từ có dấu ("tháng ngày" → "ng ng").
  // Từ láy và cụm lặp hợp lệ trong tiếng Việt — không phải lỗi
  const LAY_HOP_LE = new Set(["lâu", "mãi", "ngày", "đêm", "người", "nhà", "năm", "tháng", "dần", "đều", "nhè", "khe", "xa", "vừa", "thường", "hay", "nhỏ", "từ", "nhanh", "chậm", "nhẹ", "sâu", "cao", "xanh", "đỏ", "ai", "đâu", "gì"]);
  const daThay = new Set();
  for (const m of than.matchAll(/(?<!\p{L})(\p{L}{2,})(\s+)\1(?!\p{L})/giu)) {
    const k = m[1].toLowerCase();
    if (LAY_HOP_LE.has(k) || daThay.has(k)) continue;
    daThay.add(k);
    canh.push({ loai: "lap_tu", chu: m[0].replace(/\s+/g, " "), ghi: "lặp từ liền nhau" });
  }

  // 3. Chữ số Ả Rập còn sót — giọng thương hiệu yêu cầu viết thành chữ để đọc cho tự nhiên
  const so = [...than.matchAll(/\b\d[\d.,]*\s*(nghìn|triệu|tỷ|%|đồng|giờ|phút)\b/gi)].map(m => m[0]);
  if (so.length) canh.push({ loai: "chu_so", chu: so.slice(0, 6).join(" · ") + (so.length > 6 ? ` … (${so.length})` : ""), ghi: "nên viết thành chữ để TTS đọc đúng" });

  // 4. Câu dài — 32 từ là ngưỡng thật cho lời NÓI tiếng Việt; dưới mức đó đọc vẫn trôi.
  const dai = than.split(/(?<=[.!?…])\s+/).filter(c => demTu(c) > 32);
  if (dai.length) canh.push({ loai: "cau_dai", chu: `${dai.length} câu trên 32 từ`, ghi: dai[0].slice(0, 70).trim() + "…" });

  // 5. Mục ngắn bất thường so với các mục khác
  const muc = tachMuc(md).filter(m => /^\d+\./.test(m.ten));
  if (muc.length >= 3) {
    const tu = muc.map(m => demTu(m.noi_dung));
    const tb = tu.reduce((a, b) => a + b, 0) / tu.length;
    muc.forEach((m, i) => {
      if (tu[i] < tb * 0.65) canh.push({ loai: "muc_ngan", chu: m.ten, ghi: `${tu[i]} từ, trung bình ${Math.round(tb)}` });
    });
  }

  // 6. Tổng độ dài hụt đích
  if (tuMucTieu) {
    const dat = Math.round(demTu(md) / tuMucTieu * 100);
    if (dat < 85) canh.push({ loai: "ngan", chu: `${dat}% đích`, ghi: `${demTu(md)}/${tuMucTieu} từ` });
  }
  return canh;
}
