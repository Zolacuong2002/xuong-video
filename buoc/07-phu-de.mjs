// Bước 07 — Phụ đề .srt
//   tts     : gom mốc từng từ mà edge-tts trả cho mỗi đoạn, dịch theo mốc bắt đầu của đoạn trong moc.json,
//             gộp lại thành dòng phụ đề ≤ 42 ký tự / ≤ 4 giây. Khớp tuyệt đối vì lấy từ chính engine đọc.
//   whisper : gọi transcribe.py của bóc âm lên video.mp4 (dùng khi TTS không trả mốc, vd sapi).
import { join, dirname, isAbsolute } from "node:path";
import { existsSync, copyFileSync } from "node:fs";
import { thuMucVideo, docChu, ghiChu, docJson, chayLenh, pad3 } from "./chung.mjs";
import { cacDoan } from "../db.mjs";
import { GOC } from "../cfg.mjs";

const MAX_KY_TU = 42, MAX_GIAY = 4.0, KHOANG_NGAT = 0.6;

export async function chay({ cfg, video }) {
  const tm = thuMucVideo(cfg, video);
  const moc = docJson(join(tm, "moc.json"));
  if (!moc) throw new Error("Chưa có moc.json — chạy bước 06 trước");

  if (cfg.XV_PHU_DE === "whisper") return await bangWhisper(cfg, tm);

  const doan = cacDoan(video.id);
  const tu = [];
  for (const d of doan) {
    const m = moc.doan.find(x => x.thu_tu === d.thu_tu);
    const srt = join(tm, "giong", `${pad3(d.thu_tu)}.srt`);
    if (!m) continue;
    if (!existsSync(srt)) {
      // Không có mốc từ → một dòng cho cả đoạn, cắt theo câu
      tu.push(...cauThanhTu(d.loi_doc, m.bat_dau, d.giay));
      continue;
    }
    for (const c of docSrt(docChu(srt))) {
      tu.push({ bd: m.bat_dau + c.bd, kt: Math.min(m.bat_dau + c.kt, m.bat_dau + d.giay), chu: c.chu });
    }
  }
  if (!tu.length) return await bangWhisper(cfg, tm);

  const dong = gomDong(tu);
  ghiChu(join(tm, "phu-de.srt"), xuatSrt(dong));
  return { ket_qua: { so_dong: dong.length, nguon: "tts" }, usd: 0 };
}

async function bangWhisper(cfg, tm) {
  const script = cfg.XV_WHISPER_SCRIPT ? (isAbsolute(cfg.XV_WHISPER_SCRIPT) ? cfg.XV_WHISPER_SCRIPT : join(GOC, cfg.XV_WHISPER_SCRIPT))
    : join(dirname(GOC), "hmh-AIOS-boc-am-zoom", "app", "transcribe.py");
  if (!existsSync(script)) throw new Error("Không thấy script whisper (XV_WHISPER_SCRIPT) tại " + script + " — dùng XV_PHU_DE=tts nếu giọng vieneu/edge");
  const mp4 = join(tm, "video.mp4");
  await chayLenh(cfg.XV_PYTHON, [script, mp4, cfg.XV_WHISPER_MODEL, "vi"], { cwd: dirname(script) });
  const raSrt = join(tm, "video.srt");
  if (!existsSync(raSrt)) throw new Error("whisper không sinh được video.srt");
  copyFileSync(raSrt, join(tm, "phu-de.srt"));
  return { ket_qua: { nguon: "whisper", model: cfg.XV_WHISPER_MODEL }, usd: 0 };
}

// ── srt ──
export function docSrt(chu) {
  const ra = [];
  for (const khoi of chu.replace(/\r/g, "").trim().split(/\n\s*\n/)) {
    const dong = khoi.split("\n");
    const iThoi = dong.findIndex(x => x.includes("-->"));
    if (iThoi < 0) continue;
    const [a, b] = dong[iThoi].split("-->").map(x => giay(x.trim()));
    const noiDung = dong.slice(iThoi + 1).join(" ").trim();
    if (noiDung) ra.push({ bd: a, kt: b, chu: noiDung });
  }
  return ra;
}
function giay(t) {
  const m = t.match(/(\d+):(\d+):(\d+)[,.](\d+)/);
  if (!m) return 0;
  return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / Math.pow(10, m[4].length);
}
function dinhDang(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), g = Math.floor(s % 60), ms = Math.round((s - Math.floor(s)) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(g).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}
export function xuatSrt(dong) {
  return dong.map((d, i) => `${i + 1}\n${dinhDang(d.bd)} --> ${dinhDang(d.kt)}\n${d.chu}\n`).join("\n") + "\n";
}

// Gộp mốc từng từ thành dòng: cắt khi quá dài, quá lâu, hết câu, hoặc ngắt hơi rõ.
export function gomDong(tu) {
  const ra = [];
  let hienTai = null;
  for (const t of tu) {
    const chu = t.chu.trim();
    if (!chu) continue;
    if (!hienTai) { hienTai = { bd: t.bd, kt: t.kt, chu }; continue; }
    const thu = hienTai.chu + " " + chu;
    const ngat = t.bd - hienTai.kt > KHOANG_NGAT;
    const hetCau = /[.!?…]$/.test(hienTai.chu);
    if (thu.length > MAX_KY_TU || t.kt - hienTai.bd > MAX_GIAY || ngat || hetCau) {
      ra.push(hienTai);
      hienTai = { bd: t.bd, kt: t.kt, chu };
    } else {
      hienTai.chu = thu; hienTai.kt = t.kt;
    }
  }
  if (hienTai) ra.push(hienTai);
  // edge-tts phát ra mốc GỐI ĐẦU (dòng sau bắt đầu trước khi dòng trước kết thúc) → cắt cho khít
  for (let i = 0; i < ra.length - 1; i++) {
    if (ra[i].kt > ra[i + 1].bd) ra[i].kt = Math.max(ra[i].bd + 0.3, ra[i + 1].bd - 0.04);
  }
  // Dòng quá ngắn (< 0,8s) kéo dài tới sát dòng sau cho dễ đọc
  for (let i = 0; i < ra.length; i++) {
    const sau = ra[i + 1];
    const toiThieu = ra[i].bd + 0.8;
    if (ra[i].kt < toiThieu) ra[i].kt = sau ? Math.max(ra[i].bd + 0.3, Math.min(toiThieu, sau.bd - 0.04)) : toiThieu;
  }
  return ra;
}

// Không có mốc từ: chia đều theo số ký tự của từng câu
function cauThanhTu(loiDoc, batDau, giay) {
  const cau = loiDoc.match(/[^.!?…]+[.!?…]?/g)?.map(x => x.trim()).filter(Boolean) ?? [loiDoc];
  const tong = cau.reduce((s, c) => s + c.length, 0) || 1;
  let t = batDau;
  return cau.map(c => { const d = giay * c.length / tong; const r = { bd: t, kt: t + d, chu: c }; t += d; return r; });
}
