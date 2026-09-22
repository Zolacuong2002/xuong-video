// Vẽ bộ ảnh mẫu CHUẨN cho nhân vật kênh (phương án 3 · Gần gũi), lấy ảnh đã chọn làm tham chiếu.
// Mỗi loại vẽ vài ứng viên để chọn bằng mắt. Dùng: node tools/ve-mau-chuan.mjs
import { napCfg, GOC } from "../cfg.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const cfg = napCfg();
const RA = join(GOC, "nhan-vat", "chuan");
mkdirSync(RA, { recursive: true });
const mau = readFileSync(join(GOC, "nhan-vat", "mau-tham-chieu-3.png"));

const NHAN_VAT =
  "Keep the exact same character from image 0: same face, same messy short black hair, same white shirt and warm amber-orange cardigan. " +
  "Remove the backpack and the coffee cup — his hands are empty.";
const NET = "Comic book webtoon illustration style, bold clean black ink outlines, flat colors with soft cel shading. " +
  "Plain pure white background. No text, no letters, no logo, no watermark, no border.";

const LOAI = [
  ["toan-than", 768, 1024, 3,
    "Full body character reference sheet pose: standing straight facing the viewer, arms relaxed at his sides, friendly warm smile, " +
    "dark trousers and brown shoes fully visible, whole body from head to feet inside the frame with margin."],
  ["mat", 768, 768, 2,
    "Head and shoulders close-up portrait facing the viewer, friendly warm smile, face large and clearly detailed."],
];

const viec = [];
for (const [loai, w, h, n, moTa] of LOAI) {
  for (let i = 1; i <= n; i++) {
    viec.push((async () => {
      const f = new FormData();
      f.append("prompt", `${moTa} ${NHAN_VAT} ${NET}`);
      f.append("width", String(w)); f.append("height", String(h));
      f.append("seed", String(7000 + i * 13));
      f.append("input_image_0", new Blob([mau], { type: "image/png" }), "mau.png");
      const t = Date.now();
      const r = await fetch(cfg.XV_ANH_URL + "/ve", { method: "POST", headers: { "x-khoa": cfg.XV_ANH_KHOA }, body: f });
      if (!r.ok) return `  ✗ ${loai}-${i}: HTTP ${r.status} ${(await r.text()).slice(0, 160)}`;
      const out = join(RA, `ung-vien-${loai}-${i}.jpg`);
      writeFileSync(out, Buffer.from(await r.arrayBuffer()));
      return `  ✓ ${loai}-${i} · ${((Date.now() - t) / 1000).toFixed(1)}s`;
    })());
  }
}
(await Promise.all(viec)).forEach((x) => console.log(x));
