// Vẽ ảnh đại diện (800×800) và ảnh bìa (2560×1440) cho kênh YouTube từ nhan-vat/kenh/avatar.html + banner.html.
// Cần: nhan-vat/chuan/nhan-vat-goc-mat.jpg (ảnh mặt nhân vật gốc) và mau/thuong-hieu.css.
// Dùng: node tools/ve-kenh.mjs   → nhan-vat/kenh/avatar.png, banner.png (tải lên YouTube Studio → Tuỳ chỉnh kênh)
import { napCfg, GOC } from "../cfg.mjs";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { chupMan } from "../buoc/05-render-hinh.mjs";

const cfg = napCfg();
const TM = join(GOC, "nhan-vat", "kenh");
const css = readFileSync(join(cfg.thuMucMau, "thuong-hieu.css"), "utf8");
const mat = join(GOC, "nhan-vat", "chuan", "nhan-vat-goc-mat.jpg");
if (!existsSync(mat)) { console.error("Thiếu " + mat + " — chạy node tools/ve-mau-chuan.mjs trước, rồi chép ảnh mặt đẹp nhất thành file này."); process.exit(1); }
const profile = join(GOC, "ra", ".edge-kenh"); mkdirSync(profile, { recursive: true });

for (const [ten, rong, cao] of [["avatar", 800, 800], ["banner", 2560, 1440]]) {
  const html = join(TM, `${ten}.html`);
  const tam = join(TM, `.${ten}.tam.html`);
  writeFileSync(tam, readFileSync(html, "utf8").replace("/*THUONG_HIEU*/", css), "utf8");
  await chupMan(cfg, tam, join(TM, `${ten}.png`), rong, cao, profile);
  console.log("✓ nhan-vat/kenh/" + ten + ".png  " + rong + "×" + cao);
}
