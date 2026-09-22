// Thử độ đồng nhất nhân vật: đưa ảnh nhân vật làm tham chiếu, vẽ vào nhiều cảnh khác nhau.
import { napCfg, GOC } from "../cfg.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const cfg = napCfg();
const mau = readFileSync(join(GOC, process.argv[2] || "nhan-vat/mau-tham-chieu-3.png"));

const GIU = "Keep the exact same character from image 0: same face, same messy black hair, same white shirt and amber-orange cardigan. " +
  "Comic book webtoon illustration style, bold clean black ink outlines, flat colors with soft cel shading. Wide 16:9 scene. No text, no letters, no watermark.";
const CANH = [
  ["a-van-phong", "He sits at an office desk, staring worried at his smartphone showing a low bank balance, a stack of receipts beside the laptop."],
  ["b-quan-ca-phe", "He stands at a busy Vietnamese coffee shop counter, paying for an iced coffee, looking slightly guilty."],
  ["c-o-nha", "At home in the evening, he sits at a small table writing monthly expenses in a notebook, looking relieved and smiling."],
];
const kq = await Promise.all(CANH.map(async ([ma, canh]) => {
  const t = Date.now();
  const f = new FormData();
  f.append("prompt", `${canh} ${GIU}`);
  f.append("width", "1024"); f.append("height", "576"); f.append("seed", "20260913");
  f.append("input_image_0", new Blob([mau], { type: "image/png" }), "mau.png");
  const r = await fetch(cfg.XV_ANH_URL + "/ve", { method: "POST", headers: { "x-khoa": cfg.XV_ANH_KHOA }, body: f });
  if (!r.ok) return `  ✗ ${ma}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`;
  const out = join(GOC, "nhan-vat", `canh-${ma}.jpg`);
  writeFileSync(out, Buffer.from(await r.arrayBuffer()));
  return `  ✓ ${ma} · ${((Date.now() - t) / 1000).toFixed(1)}s`;
}));
kq.forEach(x => console.log(x));
