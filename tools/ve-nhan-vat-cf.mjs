// Vẽ các phương án nhân vật qua Worker Cloudflare (FLUX.2 klein, miễn phí 10.000 neuron/ngày).
// Dùng: node tools/ve-nhan-vat-cf.mjs [4b|9b]
import { napCfg, GOC } from "../cfg.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const cfg = napCfg();
const MODEL = process.argv[2] || "4b";
const RA = join(GOC, "nhan-vat");
mkdirSync(RA, { recursive: true });

// Nét vẽ chung theo thể loại kênh tài chính dạng truyện tranh — KHÔNG sao chép nhân vật của kênh nào.
const NET_VE =
  "Comic book webtoon illustration style: bold clean black ink outlines, flat colors with soft cel shading, " +
  "expressive friendly face, appealing proportions. Plain pure white background. Full body, standing, centered, " +
  "slight three-quarter angle toward the viewer. No text, no letters, no logo, no watermark, no border.";

const PHUONG_AN = [
  ["1-nang-dong", "Năng động",
    "A young Vietnamese male office worker around 28 years old, short black undercut hair, light blue dress shirt with sleeves rolled up to the elbows, mustard amber-orange tie, dark navy slim trousers, brown leather shoes, a blue employee ID badge on a lanyard, confident warm smile, giving a thumbs up."],
  ["2-chin-chu", "Chỉn chu",
    "A Vietnamese male office worker around 32 years old, neat side-parted black hair, black rectangular glasses, crisp white shirt under a grey knit sweater vest, dark chinos, holding a small notebook in one hand, the other hand raised as if explaining, calm reassuring smile."],
  ["3-gan-gui", "Gần gũi",
    "A young Vietnamese male office worker around 27 years old, slightly messy short black hair, white shirt with a warm amber-orange cardigan, one backpack strap over his shoulder, holding a plastic cup of Vietnamese iced coffee, relaxed cheerful grin."],
  ["4-hien-dai", "Hiện đại",
    "A Vietnamese male office worker around 30 years old, short textured black hair, light grey blazer over a white open-collar shirt with no tie, dark jeans, white sneakers, holding a smartphone in one hand, pointing toward the viewer with the other hand, friendly confident smile."],
];

async function ve(ma, ten, moTa) {
  const t0 = Date.now();
  const form = new FormData();
  form.append("prompt", `${moTa} ${NET_VE}`);
  form.append("width", "768");
  form.append("height", "1024");
  form.append("seed", "20260913");
  form.append("model", MODEL);
  const r = await fetch(cfg.XV_ANH_URL + "/ve", { method: "POST", headers: { "x-khoa": cfg.XV_ANH_KHOA }, body: form });
  const giay = ((Date.now() - t0) / 1000).toFixed(1);
  if (!r.ok) return { ma, ten, loi: `HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`, giay };
  const buf = Buffer.from(await r.arrayBuffer());
  const duoi = (r.headers.get("content-type") || "").includes("png") ? "png" : "jpg";
  const file = join(RA, `cf-${MODEL}-${ma}.${duoi}`);
  writeFileSync(file, buf);
  return { ma, ten, file, kb: Math.round(buf.length / 1024), giay, model: r.headers.get("x-model") };
}

if (!cfg.XV_ANH_URL || !cfg.XV_ANH_KHOA) { console.log("Thiếu XV_ANH_URL / XV_ANH_KHOA trong config.env"); process.exit(1); }
const kq = await Promise.all(PHUONG_AN.map((a) => ve(...a)));
for (const k of kq) console.log(k.loi ? `  ✗ ${k.ten}: ${k.loi}` : `  ✓ ${k.ten.padEnd(10)} ${k.kb} KB · ${k.giay}s · ${k.file.split(/[\\/]/).pop()}`);
