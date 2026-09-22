// Chạy THẬT trọn dây chuyền qua server đang mở (localhost:5196): thêm chủ đề → chờ cổng 1 →
// tự duyệt kịch bản → chờ cổng 2 → in kết quả. Dùng: node tools/chay-that.mjs ["chủ đề | góc nhìn"] [phút]
const GOC = "http://localhost:5196";
const chuDe = process.argv[2] || "Tại sao lãi suất tăng thì giá vàng giảm? | người đang giữ vàng làm của để dành";
const phut = parseInt(process.argv[3], 10) || 1;

const api = async (m, p, body) => {
  const r = await fetch(GOC + p, { method: m, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json(); if (!r.ok) throw new Error(j.loi || r.status); return j;
};
const cho = (ms) => new Promise(r => setTimeout(r, ms));
const t0 = Date.now();
const gio = () => ((Date.now() - t0) / 1000).toFixed(0).padStart(4) + "s";

let truoc = "";
async function doiToi(id, ...trangThai) {
  for (;;) {
    const td = await api("GET", "/api/tien-do");
    const v = td.video.find(x => x.id === id);
    const dc = td.dang_chay?.videoId === id ? td.dang_chay : null;
    const dong = `${v.trang_thai}${dc ? " · bước " + dc.buoc + (dc.chiTiet ? " · " + dc.chiTiet : "") : ""}`;
    if (dong !== truoc) { console.log(`${gio()}  ${dong}`); truoc = dong; }
    if (trangThai.includes(v.trang_thai)) return v;
    if (v.trang_thai === "loi") throw new Error(v.loi);
    await cho(1500);
  }
}

console.log(`Chủ đề: ${chuDe}  ·  ${phut} phút\n`);
const { video: [v] } = await api("POST", "/api/chu-de", { dong: chuDe, phut, chay_luon: true });
console.log(`video #${v.id} ${v.ma}\n`);

await doiToi(v.id, "CHO_DUYET_KICH_BAN");
const ct = await api("GET", `/api/video/${v.id}`);
const tu = ct.kich_ban.split(/\s+/).filter(Boolean).length;
console.log(`\n⛔ Cổng 1 — kịch bản ${tu} từ ≈ ${(tu / 160).toFixed(1)} phút. Mục: ${ct.buoc.find(b => b.so === 2)?.ket_qua?.muc?.join(" · ")}`);
console.log("   (tự duyệt để chạy thử — thật thì anh đọc & sửa ở tab Bàn duyệt)\n");
await api("PUT", `/api/video/${v.id}/kich-ban`, { kich_ban: ct.kich_ban, duyet: true });

const xong = await doiToi(v.id, "CHO_DUYET_VIDEO");
const ct2 = await api("GET", `/api/video/${v.id}`);
console.log(`\n⛔ Cổng 2 — video ${(xong.thoi_luong_giay / 60).toFixed(2)} phút · ${ct2.doan.length} đoạn · tổng ${gio().trim()}`);
console.log("   tiêu đề:", ct2.sieu_du_lieu?.tieu_de?.join(" | "));
console.log("   thumbnail:", ct2.sieu_du_lieu?.chu_thumbnail, "/", ct2.sieu_du_lieu?.chu_thumbnail_phu);
console.log("\n── Từng bước ──");
for (const b of ct2.buoc) console.log(`  ${String(b.so).padStart(2, "0")} ${b.ten.padEnd(14)} ${b.trang_thai.padEnd(5)} ${String(b.giay?.toFixed(0) ?? "").padStart(4)}s  ${b.usd_quy_doi ? "≈$" + b.usd_quy_doi.toFixed(4) + " quy đổi" : ""}`);
console.log(`\nTiền thật phát sinh: $${xong.chi_phi_usd.toFixed(2)}  ·  Quy đổi API: ≈$${ct2.buoc.reduce((s, b) => s + (b.usd_quy_doi || 0), 0).toFixed(4)}`);
console.log(`Thư mục: ra/${v.ma}/  →  mở tab Bàn duyệt để xem video.`);
