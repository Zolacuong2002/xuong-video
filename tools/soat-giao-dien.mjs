// Soát giao diện Studio bằng trình duyệt giả: nạp index.html thật, giả API theo từng tình huống,
// kiểm tiến độ / dòng thời gian / màn hình, rồi bấm thử MỌI nút. Bắt cả lỗi chạy ngầm.
// Dùng: node tools/soat-giao-dien.mjs   (cần: cd tools && npm i jsdom)
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const loi = [], goi = [];
const ok = (dk, ten, them = "") => { if (dk) console.log("  ✓ " + ten + (them ? "  → " + them : "")); else loi.push("✗ " + ten + (them ? "  → " + them : "")); };

// ── dữ liệu giả, đổi được theo tình huống ──
const gioMay = (msTruoc) => { const d = new Date(Date.now() - msTruoc); const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };
const V = (o) => ({ id: 1, ma: "001-thu", tieu_de: "Những khoản chi nhỏ âm thầm", goc_nhin: "người đi làm", phut: 30,
  trang_thai: "moi", buoc_hien_tai: 0, quy_doi_usd: 1.87, chi_phi_usd: 0, thoi_luong_giay: null, loi: null, ...o });
let TH = {};
function tinhHuong(ten) {
  const buocXong = (den) => Array.from({ length: den }, (_, i) => ({ so: i + 1, ten: "b" + (i + 1), trang_thai: "xong", giay: [147, 430, 500, 1900, 400, 600, 1, 60, 20][i], chay_luc: gioMay(3600e3), ket_qua: {}, usd_quy_doi: 0 }));
  const dang = (so, chiTiet, video) => ({
    td: { dang_chay: { videoId: 1, buoc: so, chiTiet }, hang_doi: [], tam_dung: null, video: [V(video)] },
    buoc: [...buocXong(so - 1), { so, ten: "b" + so, trang_thai: "dang_chay", giay: 0, chay_luc: gioMay(17 * 60e3), ket_qua: null }],
  });
  const bang = {
    phan_canh: dang(3, "mục 7–9/14", { trang_thai: "kich_ban_hinh", buoc_hien_tai: 3 }),
    thu_am: dang(4, "giọng 45/147", { trang_thai: "giong_doc", buoc_hien_tai: 4 }),
    ve_tranh: dang(5, "vẽ minh hoạ 12/60", { trang_thai: "hinh_anh", buoc_hien_tai: 5 }),
    ghep_hinh: dang(5, "render 30/147", { trang_thai: "hinh_anh", buoc_hien_tai: 5 }),
    tam_dung: { td: { dang_chay: null, hang_doi: [1], tam_dung: { ly_do: "Hết 10.000 neuron miễn phí hôm nay — mở lại lúc 07:00 sáng." },
      video: [V({ trang_thai: "hinh_anh", buoc_hien_tai: 5 })] }, buoc: buocXong(4) },
    cho_kich_ban: { td: { dang_chay: null, hang_doi: [], tam_dung: null, video: [V({ trang_thai: "CHO_DUYET_KICH_BAN", buoc_hien_tai: 2 })] }, buoc: buocXong(2) },
    loi: { td: { dang_chay: null, hang_doi: [], tam_dung: null, video: [V({ trang_thai: "loi", buoc_hien_tai: 4, loi: "Bước 4 (giong_doc): VieNeu thoát mã 1" })] }, buoc: buocXong(3) },
    cho_video: { td: { dang_chay: null, hang_doi: [], tam_dung: null, video: [V({ trang_thai: "CHO_DUYET_VIDEO", buoc_hien_tai: 9, thoi_luong_giay: 1830 })] }, buoc: buocXong(9) },
    hoan_tat: { td: { dang_chay: null, hang_doi: [], tam_dung: null, video: [V({ trang_thai: "hang_doi", buoc_hien_tai: 10, thoi_luong_giay: 1830, so_kho: 1 }),
      V({ id: 2, ma: "002-hai", tieu_de: "Video thứ hai", trang_thai: "moi" })],
      kho: { thu_muc: "D:\kho-dang", muc: [
        { id: 11, video_id: 1, loai: "dai", so: 0, file: "01 - X/Tien-Di-Dau-01.mp4", tieu_de: "Những khoản chi nhỏ âm thầm", giay: 1830, youtube_id: null },
        { id: 12, video_id: 1, loai: "short", so: 1, file: "01 - X/Tien-Di-Dau-01-Short-1.mp4", tieu_de: "Short một", giay: 48, youtube_id: "zzz999" , dang_luc: "2026-09-14 20:00", tiktok_id: "7300000000000000001", tiktok_luc: "2026-09-16 20:30" },
        { id: 13, video_id: 1, loai: "short", so: 2, file: "01 - X/Tien-Di-Dau-01-Short-2.mp4", tieu_de: "Short hai", giay: 51, youtube_id: null } ] } }, buoc: buocXong(10) },
  };
  TH = bang[ten];
}
const TIEN_DO = () => ({ ...TH.td, chi_phi_thang: { usd: 0, usd_quy_doi: 3.94, so_video: 1 },
  cfg: { model: { kich_ban: "opus", hinh: "sonnet" }, tts: "vieneu", nguon_claude: "cli", co_khoa: true } });
const CHI_TIET = (id) => ({
  video: TH.td.video.find((v) => v.id === id), buoc: TH.buoc, doan: [],
  nghien_cuu: "# Tóm tắt\n- 35.000đ một ly [nguồn 1]",
  kich_ban: "# Tiêu đề\n\n## Hook\nMột câu mở đầu đủ dài.\n\n## 1. Cà phê\nNội dung mục một đủ dài để qua ngưỡng kiểm tra năm mươi ký tự.\n\n## Chốt\nXong.",
  canh_bao: [{ loai: "xung_ho", chu: '"tôi" 4 lần lẫn với "mình" 14 lần', ghi: 'Giọng kênh dùng "mình"' }, { loai: "ngan", chu: "74% đích", ghi: "2944/4000 từ" }],
  sieu_du_lieu: { tieu_de: ["11 Thói Quen A (Âm Thầm)", "11 Khoản B (Không Nhịn Ăn)", "11 Thói Quen C"], mo_ta: "Mô tả", tags: ["a", "b"] },
  phu_de: "", co: { video: true, thumbnail: true },
});

tinhHuong("phan_canh");
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => loi.push("jsdomError: " + (e.detail?.stack || e.message).split("\n").slice(0, 3).join(" | ")));
vc.on("error", (m) => loi.push("console.error: " + m));
let tlHoi = "", xacNhan = true;
const dom = new JSDOM(html, {
  runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost:5196/",
  beforeParse(w) {
    w.alert = (m) => goi.push("alert: " + m);
    w.confirm = () => xacNhan;
    w.prompt = () => tlHoi;
    w.fetch = async (url, o = {}) => {
      const m = (o.method || "GET").toUpperCase();
      if (m !== "GET") goi.push(m + " " + url + (o.body ? " " + o.body.slice(0, 400) : ""));
      const tra = (j) => ({ ok: true, status: 200, json: async () => j });
      if (url === "/api/tien-do") return tra(TIEN_DO());
      let x; if ((x = url.match(/^\/api\/video\/(\d+)$/)) && m === "GET") return tra(CHI_TIET(+x[1]));
      return tra({ ok: true, xep: true });
    };
  },
});
const { window } = dom; const d = window.document;
const cho = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (id) => d.getElementById(id);
const bam = (el) => el && el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
const qa = (s) => [...d.querySelectorAll(s)];
const chu = (s) => (d.querySelector(s)?.textContent || "").trim();
async function sang(ten) { tinhHuong(ten); await cho(3300); } // poll 1,5s + chi tiết làm mới 2,5s

await cho(600);

console.log("\n── 1. Đang phân cảnh — tiến độ trong công đoạn ──");
await cho(900);
ok(/Đang sản xuất/.test(chu("#denChu")) && $("denTrangThai").classList.contains("song"), "đèn đỏ ĐANG SẢN XUẤT");
ok(/3,94/.test(chu("#tienThang")) && /0đ/.test(chu("#tienThang")), "tiền quy đổi + thật 0đ", chu("#tienThang"));
ok(chu(".ht-cong-doan") === "Phân cảnh", "tên công đoạn to", chu(".ht-cong-doan"));
ok(chu("#htPhanTram") === "43%", "mục 7–9/14 → 43% (đã xong 6)", chu("#htPhanTram"));
ok(/mục 7–9 trên 14/.test(chu("#htChiTiet")), "câu chi tiết dễ hiểu", chu("#htChiTiet"));
ok(/^00:1[67]:\d\d$/.test(chu("#htDaChay")), "đồng hồ đã chạy ≈ 17 phút từ chay_luc", chu("#htDaChay"));
ok(/Thu âm.*Minh hoạ.*anh duyệt video/.test(chu(".ht-tiep")), "dòng tiếp theo tới cổng duyệt", chu(".ht-tiep").slice(0, 70));

console.log("\n── 2. Dòng thời gian sản xuất ──");
ok(qa(".clip").length === 10, "đủ 10 clip", qa(".clip").length);
ok(qa(".clip.xong").length === 2 && qa(".clip.dang").length === 1 && qa(".clip.cho").length === 7, "2 xong · 1 đang · 7 chờ");
ok(!!d.querySelector(".clip.dang .dau-phat"), "đầu phát đỏ nằm trong clip đang chạy");
ok(qa(".ky-ten").map((x) => x.textContent).join("|") === "Tiền kỳ|Sản xuất|Hậu kỳ", "ba kỳ đúng tên nghề");
ok(d.querySelector(".ky.xong .ky-ten")?.textContent === "Tiền kỳ" && d.querySelector(".ky.dang .ky-ten")?.textContent === "Sản xuất", "Tiền kỳ xanh, Sản xuất sáng");
const moc = qa(".moc");
ok(moc.length === 2 && moc[0].classList.contains("da") && moc[1].classList.contains("sap"), "cờ duyệt kịch bản đã qua, duyệt video chưa tới");
const thuAm = qa(".clip")[3];
ok(+thuAm.style.flexGrow > +qa(".clip")[6].style.flexGrow * 20, "clip Thu âm rộng gấp nhiều lần Phụ đề (theo thời gian thật)", thuAm.style.flexGrow + " vs " + qa(".clip")[6].style.flexGrow);
ok(/′|″/.test(chu(".clip.xong .clip-tg")), "thời lượng gọn kiểu clapper ′ ″", chu(".clip.xong .clip-tg"));
ok(!!d.querySelector("#mhNoiDung .clapper") && /03/.test(chu(".clapper-luoi")), "màn hình hiện bảng clapper công đoạn 03");

console.log("\n── 3. Đồng hồ nhảy mà không vẽ lại khối (thanh sọc không giật) ──");
const thanhTruoc = $("htThanh");
await cho(1200);
ok($("htThanh") === thanhTruoc, "cùng một phần tử thanh tiến độ sau 1 giây");

console.log("\n── 4. Đang thu âm ──");
await sang("thu_am");
ok(chu(".ht-cong-doan") === "Thu âm" && chu("#htPhanTram") === "31%", "giọng 45/147 → 31%", chu("#htPhanTram"));
ok(!!d.querySelector("#mhNoiDung .thu-am") && qa(".thu-am-cot i").length >= 10, "màn hình hiện đồng hồ mức âm");
ok(/đang thu đoạn 45 \/ 147/.test(chu("#htChiTiet")), "câu chi tiết thu âm");

console.log("\n── 5. Minh hoạ: vẽ tranh rồi ghép hình ──");
await sang("ve_tranh");
ok(chu("#htPhanTram") === "12%", "vẽ 12/60 chiếm 60% công đoạn → 12%", chu("#htPhanTram"));
await sang("ghep_hinh");
ok(chu("#htPhanTram") === "68%", "ghép 30/147 → 60% + 40%×30/147 = 68%", chu("#htPhanTram"));
const img = d.querySelector("#mhNoiDung img");
ok(img && /\/ra\/001-thu\/hinh\/030\.png/.test(img.getAttribute("src")), "màn hình hiện khung hình vừa ghép", img?.getAttribute("src"));
ok(chu("#mhNguon") === "khung 30 / 147", "nhãn nguồn khung hình");

console.log("\n── 6. Tạm dừng vì hết hạn mức ──");
await sang("tam_dung");
ok(!$("tamDung").hidden && /07:00/.test(chu("#tamDungChu")), "băng tạm dừng có giờ mở lại");
ok(/Tạm dừng/.test(chu("#denChu")) && $("denTrangThai").classList.contains("cho"), "đèn hổ phách TẠM DỪNG");
ok(qa(".clip.dung").length === 1 && qa(".clip")[4].classList.contains("dung"), "clip Minh hoạ viền đứt tạm dừng");
bam($("nutTiepTuc")); await cho(60);
ok(goi.some((g) => g === "POST /api/tiep-tuc"), "Chạy tiếp → POST /api/tiep-tuc");

console.log("\n── 7. Chờ duyệt kịch bản ──");
await sang("cho_kich_ban");
ok(/Chờ anh duyệt/.test(chu("#denChu")) && chu("#demDuyet") === "1", "đèn CHỜ ANH DUYỆT + số 1 trên tab");
ok(qa(".moc")[0].classList.contains("cho"), "cờ duyệt kịch bản nhấp nháy hổ phách");
bam(d.querySelector("[data-mo-duyet]")); await cho(300);
ok(!$("tab-duyet").hidden && $("tab-studio").hidden, "nút Mở kịch bản nhảy sang tab Duyệt");
ok(qa(".soat li").length === 2 && /74% đích/.test(chu(".soat")), "băng máy soát 2 điểm");
ok(/35\.000đ/.test(chu(".doc")), "bản nghiên cứu cạnh kịch bản");
$("oKichBan").value += "\nThêm vài chữ nữa cho đếm từ.";
$("oKichBan").dispatchEvent(new window.Event("input", { bubbles: true }));
ok(+chu("#demTu") > 25, "đếm từ khi gõ", chu("#demTu"));
bam($("nutLuuKb")); await cho(60);
ok(goi.some((g) => g.startsWith("PUT /api/video/1/kich-ban") && /"duyet":false/.test(g)), "Lưu bản sửa → PUT duyet=false");
bam($("nutDuyetKb")); await cho(80);
ok(goi.some((g) => g.startsWith("PUT /api/video/1/kich-ban") && /"duyet":true/.test(g)), "Duyệt · sản xuất tiếp → PUT duyet=true");
ok(!$("tab-studio").hidden, "duyệt xong quay về Studio");

console.log("\n── 8. Viết lại kịch bản (hỏi xác nhận) ──");
bam(d.querySelector('.tabs button[data-tab="duyet"]')); await cho(700);
xacNhan = false; bam(d.querySelector("[data-cl]")); await cho(60);
ok(!goi.some((g) => g === "POST /api/video/1/chay-lai/2"), "bấm Huỷ ở hộp xác nhận → không gọi");
xacNhan = true; bam(d.querySelector("[data-cl]")); await cho(60);
ok(goi.some((g) => g === "POST /api/video/1/chay-lai/2"), "đồng ý → POST chay-lai/2");

console.log("\n── 9. Lỗi giữa chừng ──");
bam(d.querySelector('.tabs button[data-tab="studio"]'));
await sang("loi");
ok(qa(".clip.loi").length === 1 && qa(".clip")[3].classList.contains("loi"), "clip Thu âm đỏ lỗi");
ok(/VieNeu thoát mã 1/.test(chu("#hienTai")), "hiện nguyên văn lỗi");
bam(d.querySelector("#hienTai [data-chay]")); await cho(60);
ok(goi.some((g) => g === "POST /api/video/1/chay"), "Chạy lại công đoạn 4 → POST /chay");
ok(/Lỗi ở Thu âm/.test(chu("#dsVideo")), "chip lỗi trong danh sách");

console.log("\n── 10. Chờ duyệt video ──");
await sang("cho_video");
bam(d.querySelector("#dsVideo [data-a='duyet']")); await cho(400);
ok(!!d.querySelector("#khungDuyet video") && qa("#khungDuyet input[name=td]").length === 3, "trình phát + 3 tiêu đề");
qa("#khungDuyet input[name=td]")[1].checked = true;
bam($("nutDuyetVideo")); await cho(80);
ok(goi.some((g) => g.startsWith("POST /api/video/1/duyet") && /Không Nhịn Ăn/.test(g)), "Duyệt video → gửi đúng tiêu đề đã chọn");

console.log("\n── 11. Hoàn tất + hàng chờ + thư viện ──");
bam(d.querySelector('.tabs button[data-tab="studio"]'));
await sang("hoan_tat");
ok(chu(".ht-cong-doan") === "Sẵn sàng đăng", "bảng hiện Sẵn sàng đăng", chu(".ht-cong-doan"));
ok(qa(".clip.xong").length === 9 && qa(".moc.da").length === 2, "9 clip xanh + 2 cờ đã qua");
ok(qa("#dsVideo li").length === 2, "hàng chờ 2 video");
bam(d.querySelector("#dsVideo [data-a='chay'][data-id='2']")); await cho(60);
ok(goi.some((g) => g === "POST /api/video/2/chay"), "Sản xuất video #2 → POST");
const sel = d.querySelector("#dsVideo select[data-a='chay-lai'][data-id='1']");
sel.value = "5"; sel.dispatchEvent(new window.Event("change", { bubbles: true })); await cho(60);
ok(goi.some((g) => g === "POST /api/video/1/chay-lai/5"), "Làm lại từ Minh hoạ → POST chay-lai/5");
xacNhan = false; bam(d.querySelector("#dsVideo [data-a='xoa'][data-id='2']")); await cho(60);
ok(!goi.some((g) => g === "DELETE /api/video/2"), "Xoá mà bấm Huỷ → không xoá");
xacNhan = true; bam(d.querySelector("#dsVideo [data-a='xoa'][data-id='2']")); await cho(60);
ok(goi.some((g) => g === "DELETE /api/video/2"), "Xoá đồng ý → DELETE");
bam(d.querySelector("#hienTai [data-tab-mo='thuvien']")); await cho(200);
ok(!$("tab-thuvien").hidden && qa(".the").length === 1, "nút Mở thư viện → 1 thẻ video");
ok(/\/ra\/001-thu\/thumbnail\.png/.test(d.querySelector(".the-anh img").getAttribute("src")), "thẻ có thumbnail");
ok(/Short kế tiếp/.test($("khoDau").textContent) && /Short hai/.test($("khoDau").textContent), "kho: Short kế tiếp = cái chưa đăng đầu tiên");
ok(qa(".muc-kho .dong").length === 3 && qa(".muc-kho [data-dd]").length === 2 && qa(".muc-kho [data-cd]").length === 1, "kho: 3 mục, 2 nút Đã đăng YT, 1 đã xong");
ok(qa(".muc-kho [data-td]").length === 1 && qa(".muc-kho [data-tc]").length === 1 && /TikTok kế tiếp/.test($("khoDau").textContent) && /Short hai/.test($("khoDau").textContent), "kho: TikTok — 1 Short chưa đăng, 1 đã đăng, gợi ý kế tiếp đúng");
tlHoi = "https://www.tiktok.com/@kenh/video/7312345678901234567"; bam(d.querySelector("[data-td='13']")); await cho(60);
ok(goi.some((g) => g.startsWith("POST /api/kho/13/tiktok-da-dang") && /7312345678901234567/.test(g)), "Đã đăng TikTok → POST + bóc ID từ link");
tlHoi = "https://youtu.be/abc123xyz"; bam(d.querySelector("[data-dd='11']")); await cho(60);
ok(goi.some((g) => g.startsWith("POST /api/kho/11/da-dang") && /abc123xyz/.test(g)), "Đã đăng video dài → POST kho + bóc ID từ link");
tlHoi = "https://youtube.com/shorts/sh0rt1d"; bam(d.querySelector("[data-dd='13']")); await cho(60);
ok(goi.some((g) => g.startsWith("POST /api/kho/13/da-dang") && /sh0rt1d/.test(g)), "Đã đăng Short → bóc ID từ link shorts/");
bam(d.querySelector("[data-xk='1']")); await cho(60);
ok(goi.some((g) => g.startsWith("POST /api/video/1/xuat-kho")), "Xuất lại kho → POST");

console.log("\n── 12. Thêm chủ đề ──");
bam(d.querySelector('.tabs button[data-tab="studio"]')); await cho(100);
$("oChuDe").value = ""; bam($("nutThem")); await cho(40);
ok(goi.some((g) => g.startsWith("alert: Chưa có chủ đề")), "để trống → nhắc, không gửi");
$("oChuDe").value = "12 thói quen | người đi làm"; bam($("nutThemChay")); await cho(80);
ok(goi.some((g) => g.startsWith("POST /api/chu-de") && /"chay_luon":true/.test(g) && /"phut":"30"/.test(g)), "Thêm & sản xuất ngay → chay_luon + 30 phút mặc định");
ok($("oChuDe").value === "", "ô nhập được xoá");

window.close();
console.log("\n" + "─".repeat(56));
if (loi.length) { console.log("❌ CÓ " + loi.length + " LỖI:\n"); loi.forEach((l) => console.log("   " + l)); process.exitCode = 1; }
else console.log("✅ Giao diện Studio: soát xong, không lỗi.");
