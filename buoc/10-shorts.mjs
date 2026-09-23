// Bước 10 — Shorts: từ kịch bản dài đã duyệt → XV_SHORTS_SO video dọc 1080×1920, mỗi cái 45–58 giây.
//   10a  Claude viết N kịch bản Short (hook số liệu → một ý → một việc làm ngay → mời xem bản dài), ép JSON.
//   10b  Giọng anh (VieNeu) đọc tất cả đoạn của mọi Short trong MỘT tiến trình; quá 58,5s thì tăng tốc vừa đủ.
//   10c  Vẽ tranh dọc 576×1024 có nhân vật kênh (XV_SHORTS_ANH ảnh mỗi Short, đoạn còn lại dùng lại tranh trước).
//   10d  Mỗi đoạn: tranh phóng Ken Burns + lớp chữ (mau/short.html) đứng yên; concat; ghép phụ đề ASS chạy theo lời
//        (chia cụm 2–6 từ, tính theo số ký tự) + nhạc nền → shorts/NN.mp4. Kèm shorts/DAN-VAO-YOUTUBE.txt.
//   Đã có file nào (giọng, tranh, mp4) thì bỏ qua → hết hạn mức giữa chừng, hôm sau chạy tiếp không làm lại.
import { join } from "node:path";
import { existsSync, mkdirSync, statSync, rmSync, unlinkSync, readdirSync } from "node:fs";
import { goi } from "../claude.mjs";
import { cacDoan } from "../db.mjs";
import { thuMucVideo, chayLenh, doDaiGiay, docChu, ghiChu, docJson, ghiJson, pad3, demTu } from "./chung.mjs";
import { veCanh, theNhanVat } from "./anh.mjs";
import { dungHtml, chupMan } from "./05-render-hinh.mjs";
import { docDanhSachVieneu, vanTayGiong } from "./04-giong-doc.mjs";
import { fileNhacNen, tronNhac } from "./06-dung-video.mjs";

const RONG = 1080, CAO = 1920, DEM = 0.25, TOI_DA_GIAY = 58.5;

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["shorts"],
  properties: {
    shorts: {
      type: "array", minItems: 1, maxItems: 6,
      items: {
        type: "object", additionalProperties: false,
        required: ["tieu_de", "nhan", "mo_ta", "binh_luan_ghim", "tags", "doan"],
        properties: {
          tieu_de: { type: "string", description: "Tiêu đề Short ≤ 55 ký tự, mở đầu bằng con số hoặc câu hỏi ngắn, không hashtag, không viết hoa toàn bộ." },
          nhan: { type: "string", description: "Cụm 1–3 từ nằm NGUYÊN VĂN trong tieu_de để tô màu nổi (thường là con số)." },
          mo_ta: { type: "string", description: "Mô tả 2–3 dòng, dòng cuối là đúng 3 hashtag: #Shorts và 2 hashtag tài chính." },
          binh_luan_ghim: { type: "string", description: "Bình luận sẽ ghim dưới Short, 1–2 câu: nhắc lại con số của Short + mời xem bản đầy đủ trên kênh + hỏi lại người xem một câu ngắn để họ trả lời. Không dán link (kênh mới chưa có link), không quá 200 ký tự." },
          tags: { type: "array", minItems: 5, maxItems: 10, items: { type: "string" } },
          doan: {
            type: "array", minItems: 4, maxItems: 6,
            items: {
              type: "object", additionalProperties: false, required: ["loi_doc", "tieu_de", "canh"],
              properties: {
                loi_doc: { type: "string", description: "Lời đọc tiếng Việt của đoạn, 25–45 từ, câu ngắn, số viết bằng chữ khi đọc (mười lăm triệu), không ký hiệu." },
                tieu_de: { type: "string", description: "Dòng chữ to trên màn hình cho đoạn này, ≤ 6 từ, có thể chứa con số (15 triệu)." },
                canh: { type: "string", description: "TIẾNG ANH 15–35 từ: cảnh có nhân vật chính (gọi đúng tên như hệ thống dặn) cho khung DỌC (vertical 9:16, character centered, waist-up or full body), hành động + biểu cảm + bối cảnh + 1 đồ vật. Ưu tiên cảnh chỉ có nhân vật chính; nếu buộc phải có người khác thì tả từng người cụ thể (tóc + trang phục màu khác: grey hoodie, blue shirt, white blouse…), không bao giờ mặc màu đặc trưng của nhân vật chính. Không chữ, không nêu ngoại hình nhân vật chính." },
              },
            },
          },
        },
      },
    },
  },
};

const heThong = (cfg) => `Bạn viết kịch bản YouTube Shorts (video dọc 45–58 giây) cho kênh tiếng Việt "${cfg.XV_TEN_KENH}" về ${cfg.XV_NGACH}, cắt từ một video dài đã có kịch bản.
Người xem: ${cfg.XV_NGUOI_XEM}, xem trên điện thoại, không bật tiếng cũng phải hiểu (mỗi đoạn có dòng chữ to).

MỖI SHORT LÀ MỘT Ý DUY NHẤT lấy từ video dài — không tóm tắt cả video. Chọn những ý có con số cụ thể và gây bất ngờ nhất.
Nhịp đọc 215 từ/phút → TỔNG lời đọc mỗi Short 165–195 từ, không hơn. Chia 4–6 đoạn, mỗi đoạn 25–45 từ.

CẤU TRÚC BẮT BUỘC:
1. Đoạn 1 = HOOK, quan trọng hơn cả phần còn lại cộng lại. Đo trên chính kênh này: Short mở bằng SỐ TIỀN + TÌNH HUỐNG AI CŨNG GẶP đạt 195–905 lượt xem; Short mở bằng khái niệm hoặc thuật ngữ chỉ đạt 1–51 lượt xem. Vì vậy câu đầu ≤ 12 từ và BẮT BUỘC theo khuôn: <một con số tiền cụ thể> + <chuyện quen thuộc của người đi làm> + <câu hỏi ngược>.
   ĐÚNG (đã thắng): "Hai triệu tiền cưới mỗi tháng, bạn lấy ở đâu ra?" · "Bốn trăm bốn mươi nghìn mỗi tháng chỉ để khỏi đi bộ xuống đường?" · "Lương hai mươi triệu, về tay chỉ mười bảy phẩy bảy tám triệu?"
   SAI (đã thua): "Quỹ dự phòng đo sai chỗ" · "Những gói bạn quên huỷ" · "Bảo hiểm thủng bốn chỗ" — mở bằng khái niệm, người xem lướt qua trước khi hiểu.
   Không chào, không giới thiệu kênh, không nói "hôm nay mình nói về".
2. Đoạn giữa = một ý + con số + lý do vì sao xảy ra. Nói như kể cho bạn thân, xưng "mình" – gọi "bạn".
3. Đoạn áp chót = ĐÚNG MỘT việc làm được ngay tối nay.
4. Đoạn cuối ≤ 22 từ, làm ĐÚNG hai việc theo thứ tự: (a) nêu bản dài có bao nhiêu khoản/ý; (b) một lời mời đăng ký NGẮN, tự nhiên, gắn với lợi ích — ví dụ "Đăng ký kênh ${cfg.XV_TEN_KENH} để mỗi tuần bớt một chỗ rò tiền." Chỉ một câu mời, không nài nỉ, không nói "link mô tả", không nói "bấm chuông".
   Dòng chữ to (tieu_de) của đoạn cuối luôn là: "Đăng ký ${cfg.XV_TEN_KENH}".

Quy tắc lời đọc: số viết bằng chữ (mười lăm triệu, ba mươi lăm nghìn), không dùng ký hiệu %, không viết tắt, không gạch đầu dòng, không emoji. Không hứa làm giàu, không khuyên mua mã nào, không nhắc tên ngân hàng/app.
Dòng chữ to (tieu_de mỗi đoạn): ≤ 6 từ, được dùng chữ số (15 triệu, 35k).
Cảnh (canh): tiếng Anh, khung dọc, nhân vật chính "${theNhanVat().goi_en}" (${theNhanVat().ta_vi}) ở giữa khung, mỗi đoạn một cảnh khác nhau, cảnh đầu phải có biểu cảm mạnh. Người phụ (nếu có) không bao giờ mặc ${theNhanVat().dau_hieu_vi}.
Ưu tiên cảnh anh ấy với đồ vật (điện thoại, hoá đơn, hộp cơm, phong bì). Khung GẦN (close-up / medium, low angle), hành động đang diễn ra, biểu cảm mạnh, một chi tiết chuyển động (papers flying, coins rolling, phone glow). KẾT THÚC mọi cảnh bằng "nobody else in frame". Máy vẽ hay mặc áo cam cho cả người xung quanh, nên nếu bắt buộc có người khác phải tả rõ từng người: kiểu tóc + màu áo khác (grey, blue, white, black), tuyệt đối không cam.`;

export async function chay({ cfg, video, baoTienDo }) {
  const tm = thuMucVideo(cfg, video);
  const soShort = Math.max(0, parseInt(cfg.XV_SHORTS_SO, 10) || 0);
  if (!soShort) return { ket_qua: { so_short: 0, ghi_chu: "XV_SHORTS_SO=0 → không làm Shorts" }, usd: 0 };

  const thuMuc = join(tm, "shorts");
  mkdirSync(thuMuc, { recursive: true });

  // 10a · kịch bản (giữ lại nếu đã có — chạy lại không tốn lượt Claude)
  const fileKb = join(thuMuc, "shorts.json");
  let kb = docJson(fileKb);
  let usage, usd = 0, usdQuyDoi = 0;
  if (!kb?.shorts?.length || kb.shorts.length !== soShort) {
    baoTienDo?.("viết kịch bản Shorts");
    const kichBan = docChu(join(tm, "kich-ban.md"));
    const sdl = docJson(join(tm, "sieu-du-lieu.json"));
    const nguon = kichBan || cacDoanThanhKichBan(tm, video);
    if (!nguon) throw new Error("Chưa có kich-ban.md để cắt Shorts");
    const kq = await goi({
      cfg, model: cfg.XV_MODEL_SHORTS, system: heThong(cfg), maxTokens: 8000,
      user: `Video dài: "${sdl?.tieu_de_chon || video.tieu_de}"\n${video.goc_nhin ? "Người xem: " + video.goc_nhin + "\n" : ""}` +
        `Viết đúng ${soShort} Short, mỗi Short một ý KHÁC NHAU, ưu tiên ý có số liệu gây bất ngờ nhất.\n\nKịch bản video dài:\n\n${nguon}`,
      jsonTool: { name: "ghi_shorts", description: "Ghi kịch bản các Short.", schema: SCHEMA },
    });
    const s = kq.toolInput;
    if (!s?.shorts?.length) throw new Error("Không nhận được kịch bản Shorts (stop=" + kq.stop + ")");
    kb = { shorts: s.shorts.slice(0, soShort).map(chuanHoaShort), luc: new Date().toISOString(), model: cfg.XV_MODEL_SHORTS };
    ghiJson(fileKb, kb);
    usage = kq.usage; usd = kq.usd ?? 0; usdQuyDoi = kq.usd_quy_doi ?? 0;
  }

  // Đổi giọng/tốc độ → đọc lại toàn bộ
  const dauVan = vanTayGiong(cfg);
  const fileDau = join(thuMuc, ".engine");
  if (docChu(fileDau).trim() !== dauVan) {
    for (let i = 1; i <= kb.shorts.length; i++) {
      const g = join(thuMuc, pad3(i), "giong");
      if (existsSync(g)) for (const f of readdirSync(g)) try { unlinkSync(join(g, f)); } catch {}
      try { unlinkSync(join(thuMuc, `${pad3(i)}.mp4`)); } catch {}
    }
    ghiChu(fileDau, dauVan);
  }

  // 10b · giọng: một tiến trình cho mọi đoạn của mọi Short
  const danhSach = [];
  kb.shorts.forEach((sh, i) => {
    const goc = join(thuMuc, pad3(i + 1));
    for (const con of ["giong", "minh-hoa", "lop", "hinh", "tam"]) mkdirSync(join(goc, con), { recursive: true });
    sh.doan.forEach((d, j) => danhSach.push({ text: d.loi_doc, out: join(goc, "giong", `${pad3(j + 1)}.wav`) }));
  });
  if (cfg.XV_TTS !== "vieneu") throw new Error("Shorts hiện chỉ đọc bằng giọng anh (XV_TTS=vieneu)");
  if (danhSach.some(d => !(existsSync(d.out) && statSync(d.out).size > 1000))) {
    await docDanhSachVieneu(cfg, join(thuMuc, "giong-job.json"), danhSach, (chu) => baoTienDo?.("Shorts · " + chu));
  }

  // 10c · tranh dọc
  const soAnh = Math.max(1, parseInt(cfg.XV_SHORTS_ANH, 10) || 2);
  const ketQua = [];
  for (let i = 0; i < kb.shorts.length; i++) {
    const sh = kb.shorts[i];
    const so = pad3(i + 1);
    const goc = join(thuMuc, so);
    const mp4 = join(thuMuc, `${so}.mp4`);

    // đoạn được vẽ mới: rải đều, đoạn đầu luôn có
    const chon = new Set();
    for (let k = 0; k < Math.min(soAnh, sh.doan.length); k++) chon.add(Math.floor((k * sh.doan.length) / Math.min(soAnh, sh.doan.length)));
    const fileAnh = (j) => join(goc, "minh-hoa", `${pad3(j + 1)}.jpg`);
    for (const j of chon) {
      if (existsSync(fileAnh(j)) && statSync(fileAnh(j)).size > 2000) continue;
      if (!cfg.XV_ANH_URL) break;
      baoTienDo?.(`Shorts ${i + 1}/${kb.shorts.length} · vẽ tranh ${j + 1}`);
      try {
        await veCanh(cfg, { canh: sh.doan[j].canh + ` Vertical 9:16 composition, ${theNhanVat().goi_en} centered in frame, close or medium shot. Any other people in the scene wear grey, blue, white or black clothes, never ${theNhanVat().mau_en}, never ${theNhanVat().dau_hieu_en}.`, out: fileAnh(j),
          rong: 576, cao: 1024, seed: (video.id * 100000 + (i + 1) * 100 + j) % 2147483647 });
      } catch (e) {
        if (e.hetHanMuc) throw e; // treo hàng đợi, mai chạy tiếp — tranh đã vẽ giữ nguyên
        console.warn(`[shorts ${so}] tranh ${j + 1} lỗi: ${e.message}`);
      }
    }
    // bản đồ tranh cho từng đoạn: của nó, không thì gần nhất phía trước, không thì phía sau
    const coAnh = sh.doan.map((_, j) => j).filter(j => existsSync(fileAnh(j)));
    const anhCua = (j) => {
      if (coAnh.includes(j)) return fileAnh(j);
      const truoc = [...coAnh].reverse().find(x => x < j), sau = coAnh.find(x => x > j);
      const lay = truoc ?? sau;
      return lay == null ? null : fileAnh(lay);
    };

    if (existsSync(mp4) && statSync(mp4).size > 50000) {
      ketQua.push({ so: i + 1, file: `shorts/${so}.mp4`, tieu_de: sh.tieu_de, giay: await doDaiGiay(cfg, mp4), da_co: true });
      continue;
    }

    // 10d · đo giọng, ép ≤ 58,5 giây
    let giay = [];
    for (let j = 0; j < sh.doan.length; j++) giay.push(await doDaiGiay(cfg, join(goc, "giong", `${pad3(j + 1)}.wav`)));
    let tong = giay.reduce((s, g) => s + g + DEM, 0);
    let epNhanh = 1;
    if (tong > TOI_DA_GIAY) {
      epNhanh = Math.min(1.15, tong / (TOI_DA_GIAY - 0.5));
      for (let j = 0; j < sh.doan.length; j++) {
        const w = join(goc, "giong", `${pad3(j + 1)}.wav`), w2 = join(goc, "tam", `${pad3(j + 1)}-nhanh.wav`);
        await chayLenh(cfg.XV_FFMPEG, ["-y", "-loglevel", "error", "-i", w, "-af", `atempo=${epNhanh.toFixed(3)}`, w2]);
        giay[j] = await doDaiGiay(cfg, w2);
      }
      tong = giay.reduce((s, g) => s + g + DEM, 0);
    }
    const wavCua = (j) => epNhanh > 1 ? join(goc, "tam", `${pad3(j + 1)}-nhanh.wav`) : join(goc, "giong", `${pad3(j + 1)}.wav`);

    // lớp chữ + dựng từng đoạn
    const profile = join(goc, "tam", "edge-profile");
    const danhSachSeg = [];
    const moc = [];
    let batDau = 0;
    for (let j = 0; j < sh.doan.length; j++) {
      const d = sh.doan[j];
      const cuoi = j === sh.doan.length - 1;
      const lop = join(goc, "lop", `${pad3(j + 1)}.png`);
      const html = join(goc, "tam", `${pad3(j + 1)}.html`);
      baoTienDo?.(`Shorts ${i + 1}/${kb.shorts.length} · dựng đoạn ${j + 1}/${sh.doan.length}`);
      ghiChu(html, dungHtml(cfg, "short.html", {
        lop_phu: true, tieu_de: d.tieu_de, nhan: j === 0 ? sh.nhan : "", thu_tu: j + 1, tong: sh.doan.length,
        goi: cuoi ? "Bản đầy đủ trên kênh" : "",
      }));
      await chupMan(cfg, html, lop, RONG, CAO, profile, true);

      const anh = anhCua(j);
      const dai = giay[j] + DEM;
      const frames = Math.ceil(dai * cfg.XV_FPS);
      const z = j % 2 === 0 ? `1+0.07*on/${frames}` : `1.07-0.07*on/${frames}`;
      const zoom = `zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${RONG}x${CAO}:fps=${cfg.XV_FPS}`;
      const seg = join(goc, "tam", `seg${pad3(j + 1)}.mp4`);
      const vao = anh
        ? ["-i", anh, "-loop", "1", "-i", lop, "-i", wavCua(j)]
        : ["-f", "lavfi", "-i", `color=c=0x0F1720:s=${RONG}x${CAO}:r=${cfg.XV_FPS}`, "-loop", "1", "-i", lop, "-i", wavCua(j)];
      const loc = anh
        ? `[0:v]scale=${RONG * 2}:${CAO * 2}:force_original_aspect_ratio=increase,crop=${RONG * 2}:${CAO * 2},${zoom}[bg];[bg][1:v]overlay=0:0:format=auto,format=yuv420p[v]`
        : `[0:v][1:v]overlay=0:0:format=auto,format=yuv420p[v]`;
      await chayLenh(cfg.XV_FFMPEG, [
        "-y", "-loglevel", "error", ...vao,
        "-filter_complex", loc, "-map", "[v]", "-map", "2:a",
        "-af", `apad=pad_dur=${DEM}`,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-profile:v", "high", "-level", "4.1",
        "-c:a", "aac", "-b:a", "160k", "-ar", "48000",
        "-t", dai.toFixed(3), "-movflags", "+faststart", seg,
      ]);
      danhSachSeg.push(`file '${seg.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`);
      moc.push({ thu_tu: j + 1, bat_dau: batDau, giay: giay[j] });
      // bản xem trước một khung
      await chayLenh(cfg.XV_FFMPEG, ["-y", "-loglevel", "error", "-ss", "0.5", "-i", seg, "-frames:v", "1", join(goc, "hinh", `${pad3(j + 1)}.png`)], { boQuaLoi: true });
      batDau += dai;
    }
    try { rmSync(profile, { recursive: true, force: true }); } catch {}

    const list = join(goc, "tam", "danh-sach.txt");
    ghiChu(list, danhSachSeg.join("\n") + "\n");
    const ghep = join(goc, "tam", "ghep.mp4");
    await chayLenh(cfg.XV_FFMPEG, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", ghep]);

    // phụ đề chạy theo lời (ASS) + nhạc nền → mp4 cuối
    const ass = join(goc, "phu-de.ass");
    ghiChu(ass, dungAss(sh, moc));
    const coAss = join(goc, "tam", "co-chu.mp4");
    // ffmpeg đọc đường dẫn ass rất kén dấu ":" của Windows → chạy trong thư mục Short, truyền tên tương đối
    await chayLenh(cfg.XV_FFMPEG, ["-y", "-loglevel", "error", "-i", ghep, "-vf", "ass=phu-de.ass",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-profile:v", "high", "-level", "4.1", "-pix_fmt", "yuv420p",
      "-c:a", "copy", "-movflags", "+faststart", coAss], { cwd: goc });
    const nhac = fileNhacNen(cfg);
    if (nhac) await tronNhac(cfg, coAss, nhac, mp4, await doDaiGiay(cfg, coAss));
    else await chayLenh(cfg.XV_FFMPEG, ["-y", "-loglevel", "error", "-i", coAss, "-c", "copy", "-movflags", "+faststart", mp4]);

    const giayMp4 = await doDaiGiay(cfg, mp4);
    ketQua.push({ so: i + 1, file: `shorts/${so}.mp4`, tieu_de: sh.tieu_de, giay: +giayMp4.toFixed(1), ep_nhanh: +epNhanh.toFixed(3), tu: sh.doan.reduce((s, d) => s + demTu(d.loi_doc), 0) });
  }

  ghiJson(join(thuMuc, "ket-qua.json"), { shorts: ketQua, luc: new Date().toISOString() });
  ghiChu(join(thuMuc, "DAN-VAO-YOUTUBE.txt"), dungBanDan(kb, ketQua, video));
  return {
    ket_qua: { so_short: ketQua.length, giay: ketQua.map(k => k.giay), ep_nhanh: ketQua.map(k => k.ep_nhanh ?? 1) },
    usage, usd, usd_quy_doi: usdQuyDoi,
  };
}

function chuanHoaShort(sh) {
  const tieuDe = String(sh.tieu_de || "").trim().replace(/#\S+/g, "").trim();
  const nhan = String(sh.nhan || "").trim();
  return {
    tieu_de: tieuDe,
    nhan: nhan && tieuDe.includes(nhan) ? nhan : "",
    mo_ta: String(sh.mo_ta || "").trim(),
    tags: (sh.tags || []).map(t => String(t).trim()).filter(Boolean),
    doan: (sh.doan || []).map(d => ({
      loi_doc: String(d.loi_doc || "").trim(),
      tieu_de: String(d.tieu_de || "").trim(),
      canh: String(d.canh || "").trim(),
    })).filter(d => d.loi_doc),
  };
}

// Không có kich-ban.md (video thử) → ghép lời đọc các đoạn trong db thành kịch bản tạm
function cacDoanThanhKichBan(tm, video) {
  return cacDoan(video.id).map(d => d.loi_doc).filter(Boolean).join("\n\n");
}

// ── phụ đề ASS: cụm 2–6 từ, thời gian chia theo số ký tự trong đoạn; số tô cam ──
export function dungAss(sh, moc) {
  const dong = [];
  sh.doan.forEach((d, j) => {
    const m = moc[j];
    const cum = chiaCum(d.loi_doc);
    const tong = cum.reduce((s, c) => s + c.length, 0) || 1;
    let t = m.bat_dau + 0.05;
    for (const c of cum) {
      const dai = Math.max(0.45, (m.giay - 0.1) * c.length / tong);
      dong.push({ bd: t, kt: t + dai, chu: c });
      t += dai;
    }
  });
  const escAss = (s) => s.replace(/\\/g, "\\\\").replace(/\{/g, "(").replace(/\}/g, ")");
  const toSo = (s) => escAss(s).replace(/(\d[\d.,]*\s?(?:triệu|nghìn|ngàn|tỷ|k|%)?)/gi, "{\\c&H0B9EF5&}$1{\\c&HFFFFFF&}");
  const tg = (s) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), g = (s % 60);
    return `${h}:${String(m).padStart(2, "0")}:${g.toFixed(2).padStart(5, "0")}`;
  };
  return [
    "[Script Info]", "ScriptType: v4.00+", `PlayResX: ${RONG}`, `PlayResY: ${CAO}`, "WrapStyle: 0", "ScaledBorderAndShadow: yes", "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    // chữ to giữa-dưới, viền đậm, nằm trên vùng YouTube che (MarginV 560 từ đáy)
    "Style: Chu,Segoe UI,74,&H00FFFFFF,&H000000FF,&H00101820,&H80000000,-1,0,0,0,100,100,0,0,1,7,2,2,80,180,560,1", "",
    "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...dong.map(d => `Dialogue: 0,${tg(d.bd)},${tg(d.kt)},Chu,,0,0,0,,${toSo(d.chu)}`),
    "",
  ].join("\n");
}

// Từ nối/giới từ: cụm mới nên BẮT ĐẦU bằng những từ này, không kết thúc bằng chúng ("mười lăm triệu vì" là xấu)
const TU_NOI = new Set(["vì", "mà", "nhưng", "và", "để", "khi", "nếu", "thì", "là", "của", "với", "cho", "trong", "từ", "đến", "tới", "rồi", "nên", "hay", "hoặc", "còn", "nhé", "bởi", "do", "về", "theo", "bằng", "sau", "trước", "lúc"]);

/** Chia lời đọc thành cụm 2–6 từ: cắt ở dấu câu; câu dài bẻ ~5 từ, ưu tiên ngắt ngay TRƯỚC từ nối. */
export function chiaCum(loi) {
  const manh = loi.replace(/\s+/g, " ").trim().split(/(?<=[,.;:!?…])\s+/).filter(Boolean);
  const ra = [];
  for (const m of manh) {
    const tu = m.split(" ");
    if (tu.length <= 6) { ra.push(m); continue; }
    const soCum = Math.ceil(tu.length / 5);
    const moi = tu.length / soCum;
    let bd = 0;
    for (let k = 1; k <= soCum; k++) {
      let cat = k === soCum ? tu.length : Math.round(moi * k);
      if (k < soCum) {
        // trong cửa sổ ±2, chọn chỗ ngắt mà từ kế tiếp là từ nối (gần chỗ lý tưởng nhất)
        let tot = null;
        for (const lech of [0, -1, 1, -2, 2]) {
          const i = cat + lech;
          if (i - bd >= 2 && tu.length - i >= 2 && TU_NOI.has(tu[i].toLowerCase().replace(/[^\p{L}]/gu, ""))) { tot = i; break; }
        }
        if (tot != null) cat = tot;
        cat = Math.max(bd + 2, Math.min(cat, tu.length - 2));
      }
      ra.push(tu.slice(bd, cat).join(" "));
      bd = cat;
    }
  }
  // cụm 1 từ lẻ loi thì dính vào cụm trước
  for (let i = ra.length - 1; i > 0; i--) if (ra[i].split(" ").length === 1) { ra[i - 1] += " " + ra[i]; ra.splice(i, 1); }
  return ra.map(c => c.replace(/[,;:]$/, ""));
}

function dungBanDan(kb, ketQua, video) {
  const khoi = kb.shorts.map((sh, i) => {
    const k = ketQua[i] || {};
    return [
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `SHORT ${i + 1}  ·  file: ${pad3(i + 1)}.mp4  ·  ${k.giay ?? "?"} giây`,
      ``,
      `TIÊU ĐỀ (dán vào ô Tiêu đề — YouTube tự nhận Shorts vì video dọc < 60s)`,
      sh.tieu_de,
      ``,
      `MÔ TẢ`,
      sh.mo_ta,
      ``,
      `THẺ (đã có dấu phẩy)`,
      sh.tags.join(", "),
      ``,
      `Đối tượng: Không dành cho trẻ em · Video liên quan: chọn video dài "${video.tieu_de}"`,
      ``,
    ].join("\n");
  });
  return [
    `SHORTS CẮT TỪ VIDEO: ${video.tieu_de}`,
    `Đăng mỗi ngày MỘT Short vào khung 11:30–12:30 hoặc 19:30–21:00, cách nhau ≥ 20 giờ. Bấm "Video liên quan" trỏ về bản dài.`,
    ``,
    ...khoi,
  ].join("\n");
}
