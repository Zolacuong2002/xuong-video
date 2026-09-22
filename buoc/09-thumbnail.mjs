// Bước 09 — Thumbnail 1280×720 có nhân vật kênh.
//   1. Vẽ nhân vật nửa người trên NỀN TRẮNG, biểu cảm mạnh theo chủ đề (canh_thumbnail ở bước 08)
//      → nền trắng trùng nền thumbnail nên đặt thẳng vào, không cần tách nền.
//   2. mau/thumbnail.html: chữ đen đậm bên trái, một từ tô đỏ, nhân vật chiếm nửa phải — đúng thể loại
//      kênh tài chính dạng truyện tranh (nhân vật + chữ to là thứ quyết định người xem có bấm không).
//   Không có Worker tạo ảnh / hết neuron → vẫn ra thumbnail chữ, không làm hỏng bước.
import { join } from "node:path";
import { rmSync, existsSync, statSync } from "node:fs";
import { thuMucVideo, docJson, ghiChu } from "./chung.mjs";
import { dungHtml, chupMan } from "./05-render-hinh.mjs";
import { veCanh, theNhanVat } from "./anh.mjs";

const tuThe = () => `Upper body of ${theNhanVat().goi_en} from the waist up, large in frame, centered, plain pure white background, nothing else in the background.`;

export async function chay({ cfg, video }) {
  const tm = thuMucVideo(cfg, video);
  const sdl = docJson(join(tm, "sieu-du-lieu.json"), {});
  const chu = sdl.chu_thumbnail || video.tieu_de;
  const phu = sdl.chu_thumbnail_phu || "";
  const nhan = sdl.chu_nhan || "";

  let anh = null, ghiChuAnh = "không vẽ nhân vật";
  if (cfg.XV_ANH_URL && (parseInt(cfg.XV_ANH_TOI_DA, 10) || 0) > 0) {
    const out = join(tm, "minh-hoa", "thumbnail-nhan-vat.jpg");
    const canh = `${(sdl.canh_thumbnail || theNhanVat().thumbnail_mac_dinh_en).replace(/\bthe main character\b/gi, theNhanVat().goi_en)} ${tuThe()}`;
    try {
      if (!(existsSync(out) && statSync(out).size > 2000)) {
        await veCanh(cfg, { canh, out, rong: 768, cao: 960, seed: (video.id * 7919) % 2147483647 });
      }
      anh = "../minh-hoa/thumbnail-nhan-vat.jpg";
      ghiChuAnh = "có nhân vật";
    } catch (e) {
      // Thumbnail không được chặn cả video — thiếu nhân vật thì ra bản chữ, ghi rõ lý do để chạy lại sau
      ghiChuAnh = "không vẽ được nhân vật: " + e.message.slice(0, 120);
    }
  }

  const html = join(tm, "tam", "thumbnail.html");
  const png = join(tm, "thumbnail.png");
  const profile = join(tm, "tam", "edge-profile");
  ghiChu(html, dungHtml(cfg, "thumbnail.html", { chu, phu, nhan, anh, tieu_de: video.tieu_de }));
  await chupMan(cfg, html, png, 1280, 720, profile);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
  return { ket_qua: { chu, nhan, phu, kho: "1280x720", nhan_vat: ghiChuAnh }, usd: 0 };
}
