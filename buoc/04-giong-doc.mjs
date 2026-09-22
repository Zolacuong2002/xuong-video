// Bước 04 — Giọng đọc. Mỗi đoạn → một wav. Độ dài wav = độ dài slide.
//   vieneu : GIỌNG ANH nhân bản bằng VieNeu-TTS v3 Turbo (CPU, miễn phí, Apache 2.0) — mặc định
//            chạy MỘT tiến trình cho cả video, đứt giữa chừng chạy lại không mất đoạn đã đọc
//   edge   : Microsoft neural qua edge-tts (miễn phí, cần mạng), trả mốc thời gian từng câu
//   sapi   : giọng Windows có sẵn (không mạng, không mốc)
import { join, isAbsolute } from "node:path";
import { existsSync, unlinkSync, readdirSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { thuMucVideo, chayLenh, doDaiGiay, ghiChu, ghiJson, docChu, pad3 } from "./chung.mjs";
import { cacDoan, capNhatDoan } from "../db.mjs";
import { GOC } from "../cfg.mjs";

export function vanTayGiong(cfg) { return vanTay(cfg); }

export async function chay({ cfg, video, baoTienDo }) {
  const tm = thuMucVideo(cfg, video);
  const doan = cacDoan(video.id);
  if (!doan.length) throw new Error("Chưa có đoạn nào — chạy bước 03 trước");

  // Đổi engine hoặc đổi mẫu giọng → xoá sạch wav/srt cũ, không thì trộn hai giọng trong một video
  // (và bước 07 sẽ lấy nhầm mốc thời gian của giọng cũ).
  const dauVan = vanTay(cfg);
  const fileDau = join(tm, "giong", ".engine");
  if (docChu(fileDau).trim() !== dauVan) {
    for (const f of readdirSync(join(tm, "giong"))) {
      if (/\.(wav|srt)$/.test(f)) try { unlinkSync(join(tm, "giong", f)); } catch {}
    }
    ghiChu(fileDau, dauVan);
  }

  let rtf = null;
  if (cfg.XV_TTS === "vieneu") {
    rtf = await docBangVieneu(cfg, tm, doan, baoTienDo);
  } else {
    await docTungDoan(cfg, tm, doan, baoTienDo);
  }

  // Đo độ dài thật từng wav — đây là độ dài slide ở bước 06
  let tongGiay = 0;
  const thieu = [];
  for (const d of doan) {
    const so = pad3(d.thu_tu);
    const wav = join(tm, "giong", `${so}.wav`);
    if (!existsSync(wav) || statSync(wav).size < 1000) { thieu.push(d.thu_tu); continue; }
    const giay = await doDaiGiay(cfg, wav);
    capNhatDoan(d.id, { wav: `giong/${so}.wav`, giay });
    tongGiay += giay;
  }
  if (thieu.length) throw new Error(`Đoạn ${thieu.slice(0, 12).join(", ")}${thieu.length > 12 ? "…" : ""} chưa đọc được giọng — chạy lại bước 04 (đoạn đã xong được giữ nguyên)`);

  const tu = doan.reduce((s, d) => s + (d.loi_doc.match(/\S+/g) || []).length, 0);
  return {
    ket_qua: {
      so_doan: doan.length, tong_giay: +tongGiay.toFixed(1), phut: +(tongGiay / 60).toFixed(2),
      nhip_doc: Math.round(tu / (tongGiay / 60)) + " từ/phút",
      engine: cfg.XV_TTS, giong: cfg.XV_TTS === "vieneu" ? cfg.XV_TTS_MAU : cfg.XV_TTS_GIONG,
      ...(rtf != null ? { rtf } : {}),
    },
    usd: 0,
  };
}

function vanTay(cfg) {
  if (cfg.XV_TTS !== "vieneu") return `${cfg.XV_TTS}:${cfg.XV_TTS_GIONG}:${cfg.XV_TTS_TOC_DO}`;
  const mau = duongDanMau(cfg);
  const bam = existsSync(mau) ? createHash("sha1").update(readFileSync(mau)).digest("hex").slice(0, 12) : "khong-co";
  return `vieneu:${bam}:${cfg.XV_TTS_NHIET}:${cfg.XV_TTS_NHANH}`;
}

function duongDanMau(cfg) {
  return isAbsolute(cfg.XV_TTS_MAU) ? cfg.XV_TTS_MAU : join(GOC, cfg.XV_TTS_MAU);
}

// ── VieNeu: một tiến trình Python cho cả video ──────────────────
function docBangVieneu(cfg, tm, doan, baoTienDo) {
  return docDanhSachVieneu(cfg, join(tm, "tam", "giong-job.json"),
    doan.map(d => ({ text: d.loi_doc, out: join(tm, "giong", `${pad3(d.thu_tu)}.wav`) })), baoTienDo);
}

/** Đọc một danh sách {text, out} bằng giọng anh trong MỘT tiến trình (bước 04 và bước 10 Shorts cùng dùng). Trả RTF. */
export function docDanhSachVieneu(cfg, jobFile, danhSach, baoTienDo) {
  const mau = duongDanMau(cfg);
  if (!existsSync(mau)) throw new Error("Không thấy mẫu giọng XV_TTS_MAU=" + cfg.XV_TTS_MAU);
  const py = isAbsolute(cfg.XV_TTS_PYTHON) ? cfg.XV_TTS_PYTHON : join(GOC, cfg.XV_TTS_PYTHON);
  if (!existsSync(py)) throw new Error("Chưa cài môi trường giọng: không thấy " + py);

  const job = jobFile;
  ghiJson(job, {
    mau,
    nhiet: Number(cfg.XV_TTS_NHIET) || 0.8,
    nhanh: Number(cfg.XV_TTS_NHANH) || 1,
    ffmpeg: cfg.XV_FFMPEG,
    doan: danhSach,
  });

  return new Promise((ok, hong) => {
    const p = spawn(py, [join(GOC, "buoc", "giong_vieneu.py"), job], {
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: "utf-8", HF_HUB_DISABLE_SYMLINKS_WARNING: "1" },
    });
    let dem = "", err = "", rtf = null;
    const loiDoan = [];
    p.stdout.on("data", (c) => {
      dem += c.toString("utf8");
      let i;
      while ((i = dem.indexOf("\n")) >= 0) {
        const dong = dem.slice(0, i).trim(); dem = dem.slice(i + 1);
        if (!dong.startsWith("{")) continue;
        let m; try { m = JSON.parse(dong); } catch { continue; }
        if (m.loai === "san_sang") baoTienDo?.(`nạp giọng xong (${m.giay_nap}s)`);
        else if (m.loai === "xong_doan" || m.loai === "bo_qua") baoTienDo?.(`giọng ${m.i}/${m.tong}`);
        else if (m.loai === "loi_doan") loiDoan.push(`đoạn ${m.i}: ${m.loi}`);
        else if (m.loai === "het") rtf = m.rtf;
      }
    });
    p.stderr.on("data", (c) => { err += c.toString("utf8"); if (err.length > 20000) err = err.slice(-8000); });
    p.on("error", (e) => hong(new Error("Không chạy được VieNeu: " + e.message)));
    p.on("close", (code) => {
      if (code !== 0) return hong(new Error(`VieNeu thoát mã ${code}: ${err.split("\n").filter(Boolean).slice(-6).join(" | ")}`));
      if (loiDoan.length) console.warn("[giọng] đoạn lỗi:", loiDoan.join(" ; "));
      ok(rtf);
    });
  });
}

// ── edge / sapi: từng đoạn một ──────────────────────────────────
async function docTungDoan(cfg, tm, doan, baoTienDo) {
  let xong = 0;
  for (const d of doan) {
    const so = pad3(d.thu_tu);
    const txt = join(tm, "tam", `${so}.txt`);
    const wav = join(tm, "giong", `${so}.wav`);
    const srt = join(tm, "giong", `${so}.srt`);
    ghiChu(txt, d.loi_doc);

    if (cfg.XV_TTS === "edge") {
      const mp3 = join(tm, "tam", `${so}.mp3`);
      // edge-tts từ chối khi mở nhiều kết nối cùng lúc → tuần tự, hỏng thì thử lại một lần
      const args = ["-m", "edge_tts", "--file", txt, "--voice", cfg.XV_TTS_GIONG, "--rate=" + cfg.XV_TTS_TOC_DO,
        "--write-media", mp3, "--write-subtitles", srt];
      try { await chayLenh(cfg.XV_PYTHON, args); }
      catch (e) {
        if (!/NoAudioReceived|No audio/.test(e.message)) throw e;
        await new Promise(x => setTimeout(x, 2500));
        await chayLenh(cfg.XV_PYTHON, args);
      }
      await chayLenh(cfg.XV_FFMPEG, ["-y", "-loglevel", "error", "-i", mp3, "-ar", "48000", "-ac", "1", wav]);
      try { unlinkSync(mp3); } catch {}
    } else if (cfg.XV_TTS === "sapi") {
      const ps = `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; ` +
        `$s.SetOutputToWaveFile('${wav.replace(/'/g, "''")}'); ` +
        `$s.Speak([IO.File]::ReadAllText('${txt.replace(/'/g, "''")}', [Text.Encoding]::UTF8)); $s.Dispose()`;
      await chayLenh("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps]);
      if (existsSync(srt)) unlinkSync(srt);
    } else {
      throw new Error(`XV_TTS="${cfg.XV_TTS}" chưa hỗ trợ (vieneu | edge | sapi)`);
    }
    baoTienDo?.(`giọng ${++xong}/${doan.length}`);
  }
}
