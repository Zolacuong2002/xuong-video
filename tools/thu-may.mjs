// Thử phần MÁY (không gọi Claude, không tốn tiền): tạo 6 đoạn giả đủ 6 bố cục
// rồi chạy bước 04 → 05 → 06 → 07 → 09. Dùng: node tools/thu-may.mjs
import { napCfg } from "../cfg.mjs";
import { themChuDe, xoaDoan, themDoan, cacDoan, layVideo, xoaVideo } from "../db.mjs";

const cfg = napCfg();
const video = themChuDe("Thử máy — lãi suất và giá vàng", null, "người đang giữ vàng", 1);
console.log("video thử:", video.ma);

xoaDoan(video.id);
const DOAN = [
  { loai: "tieu_de", bo_cuc: "tieu_de", loi_doc: "Lãi suất tăng một phần trăm, vàng mất bao nhiêu? Câu trả lời không như bạn nghĩ.", du_lieu: { tieu_de: "Lãi suất tăng, vàng đi đâu?", y: ["Ba phút để hiểu cơ chế"], canh: "The man stands in a Vietnamese gold shop looking puzzled at a glass display case of gold bars, scratching his head." } },
  { loai: "y_chinh", bo_cuc: "y_chinh", loi_doc: "Vàng không sinh lãi. Khi tiền gửi trả lãi cao hơn, người ta bán vàng để gửi tiết kiệm.", du_lieu: { tieu_de: "Vàng không trả lãi", y: ["Tiền gửi có lãi, vàng thì không", "Lãi cao → bán vàng, gửi ngân hàng", "Cầu giảm → giá giảm"], canh: "The man sits at a bank counter handing over a small gold bar to a smiling bank teller, looking thoughtful." } },
  { loai: "bieu_do", bo_cuc: "bieu_do", loi_doc: "Nhìn vào số liệu bốn quý gần nhất, lãi suất huy động đi lên còn giá vàng đi xuống.", du_lieu: { tieu_de: "Lãi suất huy động 12 tháng", bieu_do: { loai: "duong", nhan: ["Q3/25", "Q4/25", "Q1/26", "Q2/26"], gia_tri: [4.7, 5.1, 5.6, 6.0], don_vi: "% / năm", nguon: "NHNN 06/2026" } } },
  { loai: "so_sanh", bo_cuc: "so_sanh", loi_doc: "Đặt cạnh nhau: một trăm triệu gửi tiết kiệm và một trăm triệu mua vàng sau một năm.", du_lieu: { tieu_de: "100 triệu, sau 12 tháng", so_sanh: { trai_ten: "Gửi tiết kiệm", trai_y: ["Lãi 6%: +6 triệu", "Rút được ngay", "Không lo giá"], phai_ten: "Mua vàng", phai_y: ["Không sinh lãi", "Giá lên xuống theo USD", "Chênh mua–bán 1–2 triệu"] } } },
  { loai: "trich_dan", bo_cuc: "trich_dan", loi_doc: "Có một câu trong ngành mình rất thích: vàng là bảo hiểm, không phải khoản đầu tư.", du_lieu: { trich_dan: { cau: "Vàng là bảo hiểm, không phải khoản đầu tư.", nguoi: "Câu nói quen trong giới quản lý quỹ" } } },
  { loai: "chot", bo_cuc: "chot", loi_doc: "Vậy nên đừng hỏi vàng lên hay xuống. Hãy hỏi tiền của bạn đang làm gì. Xem tiếp video về quỹ dự phòng.", du_lieu: { tieu_de: "Đừng hỏi vàng, hỏi tiền của bạn", y: ["Xem tiếp: quỹ dự phòng 6 tháng"], canh: "The man sits at home in the evening writing in a notebook with a calm confident smile, a piggy bank on the table." } },
];
DOAN.forEach((d, i) => themDoan(video.id, { ...d, thu_tu: i + 1 }));
console.log("đã tạo", cacDoan(video.id).length, "đoạn giả\n");

const cacBuoc = ["04-giong-doc", "05-render-hinh", "06-dung-video", "07-phu-de", "09-thumbnail"];
for (const ten of cacBuoc) {
  const t0 = Date.now();
  process.stdout.write(`▶ ${ten} … `);
  try {
    const m = await import(`../buoc/${ten}.mjs`);
    const kq = await m.chay({ cfg, video: layVideo(video.id), baoTienDo: () => {} });
    console.log(`✓ ${((Date.now() - t0) / 1000).toFixed(1)}s`, JSON.stringify(kq.ket_qua));
  } catch (e) {
    console.log(`✗ ${((Date.now() - t0) / 1000).toFixed(1)}s\n   ${e.message}`);
    process.exitCode = 1; break;
  }
}
console.log("\nThư mục ra:", `${cfg.thuMucRa}\\${video.ma}`);
if (process.argv.includes("--xoa")) { xoaVideo(video.id); console.log("(đã xoá bản ghi thử trong db)"); }
