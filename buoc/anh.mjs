// Gọi Worker Cloudflare "xuong-anh" (FLUX.2 klein, miễn phí 10.000 neuron/ngày) để vẽ một cảnh có nhân vật kênh.
// Mọi cảnh đều đính kèm hai ảnh tham chiếu chuẩn (toàn thân + khuôn mặt) để giữ đúng một nhân vật.
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { GOC } from "../cfg.mjs";
import { docJson } from "./chung.mjs";

// Thẻ nhân vật kênh (nhan-vat/nhan-vat.json). Thiếu file thì dùng nhân vật mặc định.
const THE_MAC_DINH = {
  goi_en: "the man", ta_vi: "một nhân vật chính của kênh",
  giu_en: "same face, same hairstyle, same outfit as in the reference images",
  dau_hieu_en: "the main character's signature outfit", dau_hieu_vi: "trang phục đặc trưng",
  mau_en: "the main character's signature color", mau_vi: "màu đặc trưng của nhân vật chính",
  khong_them_en: "a backpack or a coffee cup",
  thumbnail_mac_dinh_en: "The main character looks shocked with wide eyes and an open mouth, pointing to the left with one hand.",
};
let theNV = null;
export function theNhanVat() {
  if (theNV) return theNV;
  const f = join(GOC, "nhan-vat", "nhan-vat.json");
  theNV = { ...THE_MAC_DINH, ...(docJson(f) || {}) };
  return theNV;
}

// Hạn mức miễn phí reset lúc 00:00 UTC = 07:00 sáng giờ Việt Nam.
const GIO_MO_LAI = "07:00 sáng";

// Đo thật 17/09: khung rộng + bối cảnh chung chung → máy tự vẽ thêm 3–5 người đứng quanh; khung gần + hành động mạnh +
// đồ vật kể chuyện + "nobody else in frame" → sạch người lạ và sinh động hơn hẳn. ("alone" thì ngược lại, càng đông.)
export const NET_VE =
  "Comic book webtoon illustration style, bold clean black ink outlines, flat colors with soft cel shading, " +
  "cinematic dramatic lighting, dynamic composition, expressive face and gesture, props and small motion details that tell the story. " +
  "No text, no letters, no numbers, no words, no captions, no logo, no watermark, no border, no speech bubbles. " +
  "Any paper, bill, receipt, screen or notebook in the scene is blank — ruled lines or empty fields only, never written words.";

export function giuNhanVat() {
  const nv = theNhanVat();
  return `The main character is exactly ${nv.goi_en} shown in image 0 (full body) and image 1 (face): ${nv.giu_en}. Keep the identity identical. ` +
    `Do not add ${nv.khong_them_en} unless the scene asks for it. ` +
    // Đo thật: không dặn câu này thì model mặc trang phục đặc trưng cho CẢ người khác trong cảnh (nhân viên ngân hàng…)
    `ONLY the main character wears ${nv.dau_hieu_en}. Every other person in the scene must look clearly different: ` +
    `different face, different hairstyle, and different clothes such as a uniform, a t-shirt, a blouse or a suit — never ${nv.mau_en}, never ${nv.dau_hieu_en}. ` +
    `Unless the scene explicitly names another person, nobody else is in frame: no bystanders, no coworkers in the background, no crowd.`;
}

let thamChieu = null;
function napThamChieu(cfg) {
  if (thamChieu) return thamChieu;
  const duong = (p) => (isAbsolute(p) ? p : join(GOC, p));
  const tt = duong(cfg.XV_ANH_THAM_CHIEU_TOAN_THAN);
  const mat = duong(cfg.XV_ANH_THAM_CHIEU_MAT);
  for (const p of [tt, mat]) if (!existsSync(p)) throw new Error("Thiếu ảnh tham chiếu nhân vật: " + p);
  thamChieu = [readFileSync(tt), readFileSync(mat)];
  return thamChieu;
}

/**
 * Vẽ một cảnh. Ném lỗi có cờ hetHanMuc khi hết neuron trong ngày → server tạm dừng hàng đợi.
 * @returns số byte đã ghi
 */
export async function veCanh(cfg, { canh, out, rong = 1024, cao = 576, seed, nhanVat = true, thuLai = 2 }) {
  if (!cfg.XV_ANH_URL || !cfg.XV_ANH_KHOA) throw new Error("Chưa cấu hình XV_ANH_URL / XV_ANH_KHOA trong config.env");

  const form = new FormData();
  form.append("prompt", nhanVat ? `${canh} ${giuNhanVat()} ${NET_VE}` : `${canh} ${NET_VE}`);
  form.append("width", String(rong));
  form.append("height", String(cao));
  if (seed != null) form.append("seed", String(seed));
  if (nhanVat) {
    const [tt, mat] = napThamChieu(cfg);
    form.append("input_image_0", new Blob([tt], { type: "image/png" }), "toan-than.png");
    form.append("input_image_1", new Blob([mat], { type: "image/png" }), "mat.png");
  }

  let r, chu = "";
  for (let lan = 0; lan <= thuLai; lan++) {
    try {
      r = await fetch(cfg.XV_ANH_URL + "/ve", { method: "POST", headers: { "x-khoa": cfg.XV_ANH_KHOA }, body: form });
    } catch (e) {
      if (lan === thuLai) throw new Error("Không gọi được Worker tạo ảnh: " + e.message);
      await new Promise((x) => setTimeout(x, 2000 * (lan + 1)));
      continue;
    }
    if (r.ok) break;
    chu = await r.text();
    let j = {}; try { j = JSON.parse(chu); } catch {}
    if (r.status === 429 || j.het_han_muc) {
      const e = new Error(`Hết 10.000 neuron miễn phí hôm nay của Cloudflare — mở lại lúc ${GIO_MO_LAI}. Máy đã tạm dừng hàng đợi, ảnh đã vẽ được giữ nguyên.`);
      e.hetHanMuc = true;
      e.moLaiLuc = GIO_MO_LAI;
      throw e;
    }
    if (r.status === 401) throw new Error("Worker tạo ảnh từ chối khoá — XV_ANH_KHOA không khớp secret KHOA của Worker");
    if (lan === thuLai || r.status < 500) throw new Error(`Worker tạo ảnh lỗi ${r.status}: ${(j.loi || chu).slice(0, 240)}`);
    await new Promise((x) => setTimeout(x, 2000 * (lan + 1)));
  }

  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 2000) throw new Error("Worker trả ảnh rỗng");
  writeFileSync(out, buf);
  return buf.length;
}
