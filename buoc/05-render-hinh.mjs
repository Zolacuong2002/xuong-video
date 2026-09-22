// Bước 05 — Vẽ minh hoạ + render slide.
//   5a  Vẽ cảnh có nhân vật kênh cho các đoạn kể chuyện (tieu_de, y_chinh, chot) qua Worker Cloudflare.
//       Giới hạn XV_ANH_TOI_DA ảnh mới mỗi video để nằm trong 10.000 neuron miễn phí/ngày;
//       đoạn không được vẽ mới thì DÙNG LẠI ảnh gần nhất phía trước (bước 06 zoom khác nên nhìn vẫn khác).
//       Ảnh đã có trên đĩa thì bỏ qua → hết neuron giữa chừng, hôm sau chạy tiếp không vẽ lại.
//   5b  mau/slide.html + thuong-hieu.css + dữ liệu đoạn → Edge headless → PNG 1920×1080.
//       Đoạn có tranh: tranh phủ toàn màn hình, chữ nằm dải mờ dưới. Xuất HAI lớp:
//         lop/NNN.png  = chữ + dải mờ trên nền trong suốt (bước 06 ghép lên tranh đang phóng Ken Burns)
//         hinh/NNN.png = bản ghép sẵn để xem trước trong giao diện
//   Đoạn số liệu (bieu_do, so_sanh, trich_dan) giữ slide sạch không tranh — số phải đúng, máy vẽ số sai.
import { join } from "node:path";
import { existsSync, statSync, rmSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { thuMucVideo, chayLenh, docChu, docJson, ghiChu, ghiJson, pad3 } from "./chung.mjs";
import { GOC } from "../cfg.mjs";
import { cacDoan, capNhatDoan, layVideo } from "../db.mjs";
import { veCanh } from "./anh.mjs";

const MUON_ANH = new Set(["tieu_de", "y_chinh", "chot"]);

export function dungHtml(cfg, mauFile, duLieu) {
  const mau = docChu(join(cfg.thuMucMau, mauFile));
  const css = docChu(join(cfg.thuMucMau, "thuong-hieu.css"));
  if (!mau) throw new Error("Thiếu mau/" + mauFile);
  return mau.replace("/*THUONG_HIEU*/", css)
            .replace("__DU_LIEU__", JSON.stringify(duLieu).replace(/</g, "\\u003c"));
}

/** Chụp trang HTML thành PNG. trongSuot=true → PNG có kênh alpha (lớp phủ chữ cho bước 06). */
export async function chupMan(cfg, htmlPath, pngPath, rong, cao, profileDir, trongSuot = false) {
  if (!existsSync(cfg.XV_MSEDGE)) throw new Error("Không thấy Edge tại XV_MSEDGE=" + cfg.XV_MSEDGE);
  await chayLenh(cfg.XV_MSEDGE, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check",
    "--disable-extensions", "--mute-audio", "--force-device-scale-factor=1", "--allow-file-access-from-files",
    ...(trongSuot ? ["--default-background-color=00000000"] : []),
    `--user-data-dir=${profileDir}`,
    `--window-size=${rong},${cao}`,
    `--screenshot=${pngPath}`,
    "--virtual-time-budget=2500",
    pathToFileURL(htmlPath).href,
  ], { boQuaLoi: true });
  if (!existsSync(pngPath) || statSync(pngPath).size < 2000) {
    throw new Error("Edge không xuất được ảnh: " + pngPath);
  }
}

/** Chọn đoạn nào được vẽ ảnh MỚI: mở đầu mục + chốt trước, còn lại rải đều các đoạn ý chính. */
export function chonDoanVe(doan, toiDa) {
  const ung = doan.filter((d) => MUON_ANH.has(d.bo_cuc) && d.du_lieu?.canh);
  if (ung.length <= toiDa) return new Set(ung.map((d) => d.thu_tu));
  const chon = new Set(ung.filter((d) => d.bo_cuc !== "y_chinh").map((d) => d.thu_tu).slice(0, toiDa));
  const yc = ung.filter((d) => d.bo_cuc === "y_chinh");
  const con = toiDa - chon.size;
  for (let k = 0; k < con && yc.length; k++) chon.add(yc[Math.floor((k * yc.length) / con)].thu_tu);
  return chon;
}

async function veMinhHoa(cfg, video, tm, doan, baoTienDo) {
  const thuMuc = join(tm, "minh-hoa");
  mkdirSync(thuMuc, { recursive: true });
  const toiDa = Math.max(0, parseInt(cfg.XV_ANH_TOI_DA, 10) || 70);
  const chon = chonDoanVe(doan, toiDa);
  const fileCua = (so) => join(thuMuc, `${pad3(so)}.jpg`);

  const canVe = doan.filter((d) => chon.has(d.thu_tu) && !(existsSync(fileCua(d.thu_tu)) && statSync(fileCua(d.thu_tu)).size > 2000));
  const daCo = chon.size - canVe.length;
  let xong = 0, loiHetHanMuc = null;
  const hangDoi = [...canVe];
  const song = Math.max(1, parseInt(cfg.XV_ANH_SONG, 10) || 3);

  async function luong() {
    while (hangDoi.length && !loiHetHanMuc) {
      const d = hangDoi.shift();
      try {
        await veCanh(cfg, {
          canh: d.du_lieu.canh, out: fileCua(d.thu_tu),
          seed: (video.id * 1000 + d.thu_tu) % 2147483647,
        });
        baoTienDo?.(`vẽ minh hoạ ${daCo + ++xong}/${chon.size}`);
      } catch (e) {
        if (e.hetHanMuc) { loiHetHanMuc = e; return; }
        // Một cảnh hỏng không giết cả video: đoạn đó sẽ dùng lại ảnh phía trước
        console.warn(`[minh hoạ] đoạn ${d.thu_tu} lỗi: ${e.message}`);
      }
    }
  }
  if (canVe.length) await Promise.all(Array.from({ length: song }, luong));
  if (loiHetHanMuc) throw loiHetHanMuc;

  // Bản đồ: mỗi đoạn muốn ảnh → file ảnh của chính nó, hoặc ảnh gần nhất phía trước (không có thì phía sau)
  const coAnh = doan.filter((d) => chon.has(d.thu_tu) && existsSync(fileCua(d.thu_tu))).map((d) => d.thu_tu);
  const banDo = {};
  let dungLai = 0;
  for (const d of doan) {
    if (!MUON_ANH.has(d.bo_cuc)) continue;
    if (coAnh.includes(d.thu_tu)) { banDo[d.thu_tu] = pad3(d.thu_tu); continue; }
    const truoc = [...coAnh].reverse().find((s) => s < d.thu_tu);
    const sau = coAnh.find((s) => s > d.thu_tu);
    const lay = truoc ?? sau;
    if (lay != null) { banDo[d.thu_tu] = pad3(lay); dungLai++; }
  }
  ghiJson(join(thuMuc, "ban-do.json"), banDo);
  return { banDo, soMoi: xong, soDaCo: daCo, soDungLai: dungLai, toiDa };
}

export async function chay({ cfg, video, baoTienDo }) {
  const tm = thuMucVideo(cfg, video);
  const doan = cacDoan(video.id);
  if (!doan.length) throw new Error("Chưa có đoạn nào — chạy bước 03 trước");

  // 5a · minh hoạ (tắt được bằng XV_ANH_TOI_DA=0)
  let mh = { banDo: {}, soMoi: 0, soDaCo: 0, soDungLai: 0, toiDa: 0 };
  const coDuLieuCanh = doan.some((d) => d.du_lieu?.canh);
  if ((parseInt(cfg.XV_ANH_TOI_DA, 10) || 0) > 0 && cfg.XV_ANH_URL && coDuLieuCanh) {
    mh = await veMinhHoa(cfg, video, tm, doan, baoTienDo);
  }

  // 5b · render slide
  const profile = join(tm, "tam", "edge-profile");
  mkdirSync(join(tm, "lop"), { recursive: true });
  const tieuDeVideo = (video.tieu_de || layVideo(video.id)?.tieu_de || "").trim();
  let i = 0;
  for (const d of doan) {
    const so = pad3(d.thu_tu);
    const html = join(tm, "tam", `${so}.html`);
    const png = join(tm, "hinh", `${so}.png`);
    const duLieu = { ...(d.du_lieu || {}) };
    // Model hay đặt tên đoạn mở đầu là "Hook"/"Mở" — lên hình phải là tiêu đề video
    if (d.thu_tu === 1 && tieuDeVideo && /^(hook|mở|mở đầu|intro|giới thiệu)$/i.test(String(duLieu.tieu_de || "").trim())) {
      duLieu.tieu_de = tieuDeVideo;
    }
    const anhFile = mh.banDo[d.thu_tu] ? `minh-hoa/${mh.banDo[d.thu_tu]}.jpg` : null;
    // slide kênh (giới thiệu / màn kết) cần đường dẫn avatar tuyệt đối để Edge nạp được
    if (d.bo_cuc === "gioi_thieu" || d.bo_cuc === "ket_thuc") {
      duLieu.avatar = pathToFileURL(join(GOC, "nhan-vat", "kenh", "avatar.png")).href;
      duLieu.loi_kenh = docJson(join(cfg.thuMucMau, "loi-kenh.json")) || {};
    }
    if (anhFile) {
      // lớp chữ trong suốt → bước 06 ghép lên tranh; bản xem trước ghép bằng ffmpeg
      const lop = join(tm, "lop", `${so}.png`);
      ghiChu(html, dungHtml(cfg, "slide.html", { bo_cuc: d.bo_cuc, thu_tu: d.thu_tu, tong: doan.length, ...duLieu, lop_phu: true }));
      await chupMan(cfg, html, lop, cfg.XV_RONG, cfg.XV_CAO, profile, true);
      await chayLenh(cfg.XV_FFMPEG, ["-y", "-loglevel", "error", "-i", join(tm, anhFile), "-i", lop,
        "-filter_complex", `[0:v]scale=${cfg.XV_RONG}:${cfg.XV_CAO}:force_original_aspect_ratio=increase,crop=${cfg.XV_RONG}:${cfg.XV_CAO}[bg];[bg][1:v]overlay=0:0:format=auto,format=rgb24[v]`,
        "-map", "[v]", "-frames:v", "1", png]);
      capNhatDoan(d.id, { png: `hinh/${so}.png`, anh: anhFile, lop: `lop/${so}.png` });
    } else {
      ghiChu(html, dungHtml(cfg, "slide.html", { bo_cuc: d.bo_cuc, thu_tu: d.thu_tu, tong: doan.length, ...duLieu, anh: null }));
      await chupMan(cfg, html, png, cfg.XV_RONG, cfg.XV_CAO, profile);
      capNhatDoan(d.id, { png: `hinh/${so}.png`, anh: null, lop: null });
    }
    baoTienDo?.(`render ${++i}/${doan.length}`);
  }
  try { rmSync(profile, { recursive: true, force: true }); } catch {}

  return {
    ket_qua: {
      so_hinh: doan.length, kho: `${cfg.XV_RONG}x${cfg.XV_CAO}`,
      minh_hoa: { ve_moi: mh.soMoi, da_co_san: mh.soDaCo, dung_lai: mh.soDungLai, gioi_han: mh.toiDa,
        slide_co_tranh: Object.keys(mh.banDo).length },
    },
    usd: 0,
  };
}
