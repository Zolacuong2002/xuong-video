// Bước 06 — Dựng video: mỗi đoạn → segment mp4 có zoompan (Ken Burns nhẹ), rồi concat.
//   Đoạn có tranh (anh + lop): tranh phóng Ken Burns, LỚP CHỮ trong suốt ghép lên đứng yên → chữ luôn sắc.
//   Đoạn không tranh: phóng cả slide như cũ.
// Mỗi đoạn đệm thêm 0,35s im lặng để lời không dính vào slide kế.
// Có nhạc nền (XV_NHAC_NEN, mặc định nhac/nen.mp3 nếu tồn tại) thì trộn sau khi concat:
//   nhạc lặp hết video, hạ XV_NHAC_DB, tự nhỏ đi khi có giọng (sidechain), fade vào/ra.
import { join, isAbsolute } from "node:path";
import { existsSync } from "node:fs";
import { thuMucVideo, chayLenh, doDaiGiay, docJson, ghiChu, ghiJson, pad3 } from "./chung.mjs";
import { cacDoan, capNhatVideo } from "../db.mjs";
import { GOC } from "../cfg.mjs";

const DEM = 0.35;

/** Đường dẫn file nhạc nền, hoặc null nếu không cấu hình / không có file. */
export function fileNhacNen(cfg) {
  const p = (cfg.XV_NHAC_NEN || "").trim();
  if (!p) return null;
  const duong = isAbsolute(p) ? p : join(GOC, p);
  return existsSync(duong) ? duong : null;
}

export async function chay({ cfg, video, baoTienDo }) {
  const tm = thuMucVideo(cfg, video);
  const doan = cacDoan(video.id);
  if (!doan.length) throw new Error("Chưa có đoạn nào");
  const thieu = doan.filter(d => !d.wav || !d.png || !d.giay);
  if (thieu.length) throw new Error(`Đoạn ${thieu.map(d => d.thu_tu).join(", ")} thiếu wav/png — chạy bước 04 và 05 trước`);

  const fps = cfg.XV_FPS, kho = `${cfg.XV_RONG}x${cfg.XV_CAO}`;
  const danhSach = [];
  const moc = [];
  let batDau = 0, i = 0, soHaiLop = 0;

  // Màn kết giữ thêm giu_man_ket_giay (mặc định 12s) im lặng — chỗ YouTube đặt end screen (video tiếp theo + đăng ký)
  const loiKenh = docJson(join(cfg.thuMucMau, "loi-kenh.json")) || {};
  const giuKet = Math.max(0, Number(loiKenh.giu_man_ket_giay) || 12);
  for (const d of doan) {
    const so = pad3(d.thu_tu);
    const dem = d.bo_cuc === "ket_thuc" ? DEM + giuKet : DEM;
    const dai = d.giay + dem;
    const frames = Math.ceil(dai * fps);
    const seg = join(tm, "tam", `seg${so}.mp4`);
    // Chẵn phóng vào, lẻ lùi ra — đổi nhịp cho mắt khỏi quen
    const z = d.thu_tu % 2 === 0
      ? `1+0.06*on/${frames}`
      : `1.06-0.06*on/${frames}`;
    const zoom = `zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${kho}:fps=${fps}`;

    const haiLop = d.anh && d.lop && existsSync(join(tm, d.anh)) && existsSync(join(tm, d.lop));
    const vao = haiLop
      ? ["-i", join(tm, d.anh), "-loop", "1", "-i", join(tm, d.lop), "-i", join(tm, d.wav)]
      : ["-i", join(tm, d.png), "-i", join(tm, d.wav)];
    const loc = haiLop
      // tranh 1024×576 → phủ 2× khung (cover) rồi zoompan; lớp chữ 1920×1080 ghép lên, không phóng
      ? `[0:v]scale=${cfg.XV_RONG * 2}:${cfg.XV_CAO * 2}:force_original_aspect_ratio=increase,crop=${cfg.XV_RONG * 2}:${cfg.XV_CAO * 2},${zoom}[bg];[bg][1:v]overlay=0:0:format=auto,format=yuv420p[v]`
      : `[0:v]scale=${cfg.XV_RONG * 2}:-2,${zoom},format=yuv420p[v]`;
    const amThanh = haiLop ? "2:a" : "1:a";
    if (haiLop) soHaiLop++;

    await chayLenh(cfg.XV_FFMPEG, [
      "-y", "-loglevel", "error",
      ...vao,
      "-filter_complex", loc,
      "-map", "[v]", "-map", amThanh,
      "-af", `apad=pad_dur=${dem}`,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-profile:v", "high", "-level", "4.1",
      "-c:a", "aac", "-b:a", "160k", "-ar", "48000",
      "-t", dai.toFixed(3),
      "-movflags", "+faststart",
      seg,
    ]);
    danhSach.push(`file '${seg.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`);
    moc.push({ thu_tu: d.thu_tu, bat_dau: +batDau.toFixed(3), giay: d.giay, dai });
    batDau += dai;
    baoTienDo?.(`dựng ${++i}/${doan.length}`);
  }

  const list = join(tm, "tam", "danh-sach.txt");
  ghiChu(list, danhSach.join("\n") + "\n");
  const ra = join(tm, "video.mp4");
  const nhac = fileNhacNen(cfg);
  const khongNhac = nhac ? join(tm, "tam", "video-khong-nhac.mp4") : ra;
  await chayLenh(cfg.XV_FFMPEG, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", khongNhac]);

  let nhacKq = null;
  if (nhac) {
    baoTienDo?.("trộn nhạc nền");
    const tong = await doDaiGiay(cfg, khongNhac);
    nhacKq = await tronNhac(cfg, khongNhac, nhac, ra, tong);
  }

  const tong = await doDaiGiay(cfg, ra);
  ghiJson(join(tm, "moc.json"), { fps, dem: DEM, tong, doan: moc, nhac: nhacKq });
  capNhatVideo(video.id, { thoi_luong_giay: tong });
  return {
    ket_qua: {
      so_doan: doan.length, tong_giay: +tong.toFixed(1), phut: +(tong / 60).toFixed(2),
      doan_hai_lop: soHaiLop, nhac_nen: nhacKq ? nhacKq.file : "không",
    },
    usd: 0,
  };
}

/**
 * Trộn nhạc nền vào video đã dựng (chỉ mã hoá lại âm thanh, video copy nguyên).
 * Nhạc lặp vô hạn, hạ XV_NHAC_DB dB, nén sidechain theo giọng (giọng lên là nhạc tự lùi), fade 2s đầu / 4s cuối.
 */
export async function tronNhac(cfg, vaoVideo, nhac, ra, tongGiay) {
  const db = Number(cfg.XV_NHAC_DB);
  const haDb = Number.isFinite(db) ? db : -22;
  const fadeRa = Math.max(0, tongGiay - 4);
  const loc =
    `[0:a]aformat=sample_rates=48000:channel_layouts=stereo,asplit=2[g][gkey];` +
    `[1:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${haDb}dB,afade=t=in:d=2,afade=t=out:st=${fadeRa.toFixed(2)}:d=4[n];` +
    // sidechaincompress: đầu vào 1 = tín hiệu bị nén (nhạc), đầu vào 2 = tín hiệu điều khiển (giọng)
    `[n][gkey]sidechaincompress=threshold=0.03:ratio=5:attack=120:release=900:makeup=1[nd];` +
    `[g][nd]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[a]`;
  await chayLenh(cfg.XV_FFMPEG, [
    "-y", "-loglevel", "error",
    "-i", vaoVideo,
    "-stream_loop", "-1", "-i", nhac,
    "-filter_complex", loc,
    "-map", "0:v", "-map", "[a]",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
    "-t", tongGiay.toFixed(3),
    "-movflags", "+faststart",
    ra,
  ]);
  return { file: nhac.replace(/\\/g, "/").split("/").pop(), ha_db: haDb };
}
