// Bước 03 — Kịch bản hình: cắt kịch bản đã duyệt thành từng đoạn, mỗi đoạn một bố cục slide + dữ liệu.
// Video 25 phút ra ~100 đoạn — quá lớn cho một lượt JSON, nên xử lý theo CỤM MỤC (3 mục/lượt).
// Ép JSON qua strict tool. Kết quả vào bảng doan.
import { join } from "node:path";
import { createHash } from "node:crypto";
import { goi } from "../claude.mjs";
import { thuMucVideo, docChu, docJson, ghiJson, tachMuc, demTu } from "./chung.mjs";
import { xoaDoan, themDoan } from "../db.mjs";
import { theNhanVat } from "./anh.mjs";

export const BO_CUC = ["tieu_de", "y_chinh", "bieu_do", "so_sanh", "trich_dan", "chot", "gioi_thieu", "ket_thuc"];

const MUC_MOI_LUOT = 3;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["doan"],
  properties: {
    doan: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["loi_doc", "bo_cuc", "tieu_de", "y", "canh", "bieu_do", "so_sanh", "trich_dan"],
        properties: {
          canh: { type: "string", description: "Mô tả CẢNH MINH HOẠ bằng TIẾNG ANH, 15–45 từ: nhân vật chính (gọi đúng tên như hệ thống dặn) đang làm gì, ở đâu, biểu cảm gì, đồ vật cụ thể liên quan lời đọc. Bối cảnh Việt Nam. Không nhắc chữ viết, con số, logo, tên thương hiệu." },
          loi_doc: { type: "string", description: "Lời đọc NGUYÊN VĂN của đoạn này, cắt từ kịch bản, đã bỏ ký hiệu [nguồn N]. 1–4 câu." },
          bo_cuc: { type: "string", enum: BO_CUC },
          tieu_de: { type: "string", description: "Chữ to trên slide, ≤ 9 từ. Với trich_dan để trống." },
          y: { type: "array", items: { type: "string" }, description: "Gạch đầu dòng cho y_chinh (2–4 dòng, mỗi dòng ≤ 10 từ). Bố cục khác để []." },
          bieu_do: {
            type: "object", additionalProperties: false,
            required: ["loai", "nhan", "gia_tri", "don_vi", "nguon"],
            properties: {
              loai: { type: "string", enum: ["cot", "duong", "khong"] },
              nhan: { type: "array", items: { type: "string" } },
              gia_tri: { type: "array", items: { type: "number" } },
              don_vi: { type: "string" },
              nguon: { type: "string", description: "Tên nguồn ngắn, ví dụ 'NHNN 06/2026'." },
            },
          },
          so_sanh: {
            type: "object", additionalProperties: false,
            required: ["trai_ten", "trai_y", "phai_ten", "phai_y"],
            properties: {
              trai_ten: { type: "string" }, trai_y: { type: "array", items: { type: "string" } },
              phai_ten: { type: "string" }, phai_y: { type: "array", items: { type: "string" } },
            },
          },
          trich_dan: {
            type: "object", additionalProperties: false,
            required: ["cau", "nguoi"],
            properties: { cau: { type: "string" }, nguoi: { type: "string" } },
          },
        },
      },
    },
  },
};

const heThong = () => { const nv = theNhanVat(); return `Bạn là đạo diễn hình cho video giải thích dạng slide + giọng đọc, khổ 16:9.
Nhiệm vụ: cắt phần kịch bản được giao thành các ĐOẠN, mỗi đoạn 8–25 giây đọc (khoảng 20–60 từ), và gán cho mỗi đoạn một bố cục hình.

Nguyên tắc:
- loi_doc phải là lời NGUYÊN VĂN từ kịch bản, theo đúng thứ tự, không bỏ câu nào, không thêm câu nào, không tóm tắt. Ghép toàn bộ loi_doc lại phải ra đúng phần kịch bản được giao (trừ ký hiệu [nguồn N] và các dòng tiêu đề "## ").
- Mỗi MỤC được giao phải mở đầu bằng một đoạn bố cục tieu_de mang tên mục đó, rồi mới tới các đoạn nội dung.
- Khi lời đọc nêu 2 con số trở lên có thể so sánh → bieu_do (cot nếu so sánh nhóm, duong nếu theo thời gian). Chỉ dùng số CÓ TRONG lời đọc.
- Khi lời đọc đối chiếu hai phương án / trước–sau → so_sanh.
- Khi có một câu nói đáng nhớ → trich_dan.
- Còn lại → y_chinh với 2–4 gạch đầu dòng tóm ý.
- Đoạn GIỚI THIỆU KÊNH (đoạn bắt đầu bằng "Chào mừng bạn đến với …" ngay sau hook) → đứng RIÊNG một đoạn, bo_cuc = gioi_thieu, tieu_de = tên kênh, y = [].
- Đoạn KÊU GỌI ĐĂNG KÝ ở cuối kịch bản (có "đăng ký kênh") → đứng RIÊNG một đoạn cuối cùng, bo_cuc = chot, tieu_de = "Hẹn gặp bạn ở video sau", y = ["Video tiếp theo đang chờ bạn"], canh vẫn tả nhân vật vẫy tay chào.
- Không quá 3 slide y_chinh liên tiếp; xen bieu_do hoặc so_sanh nếu có số.
- Chữ trên slide phải ngắn: tieu_de ≤ 9 từ, mỗi gạch đầu dòng ≤ 10 từ.
- Các trường không dùng: để chuỗi rỗng, mảng rỗng, hoặc loai="khong".

Trường "canh" — MỌI đoạn đều phải có, viết TIẾNG ANH, đây là lệnh cho máy vẽ tranh minh hoạ:
- Nhân vật chính luôn là "${nv.goi_en}" (${nv.ta_vi}). Không tả ngoại hình nhân vật — máy đã có ảnh mẫu.
- Tả HÀNH ĐỘNG cụ thể khớp đúng lời đọc: đang cầm gì, nhìn gì, ở đâu. Ví dụ tốt:
  "Close-up, low angle: ${nv.goi_en} clutches a phone with both hands, eyes wide, mouth open; receipts fly up around; a single desk lamp, empty kitchen table at night, nobody else in frame."
  "Medium shot: ${nv.goi_en} stands at a convenience store counter holding a basket of snacks, staring surprised at the price on the cashier screen; shelves and a glowing fridge behind, nobody else in frame."
- SINH ĐỘNG (đo thật, khác biệt lớn): mỗi cảnh phải có (1) khung máy — close-up / medium shot / low angle / over-the-shoulder,
  xen kẽ giữa các đoạn, ưu tiên khung GẦN nhân vật; (2) một hành động đang diễn ra với đồ vật (cầm, xé, đếm, chỉ, gõ, đổ);
  (3) biểu cảm mạnh: worried, relieved, shocked, thinking hard, confident, guilty, grinning; (4) một chi tiết chuyển động
  hoặc ánh sáng kể chuyện: coins rolling, papers flying, coffee steam, phone screen glow, sunset through window.
- KHÔNG NGƯỜI LẠ: khung rộng và bối cảnh chung chung làm máy tự vẽ 3–5 người đứng quanh. Mặc định mỗi cảnh chỉ có nhân vật
  chính; KẾT THÚC mọi cảnh bằng "nobody else in frame" trừ khi lời đọc cần đúng một người khác (khi đó tả cụ thể người đó).
- Bối cảnh đời thường Việt Nam: văn phòng vắng, quán cà phê, phòng trọ, bếp, chợ, siêu thị, xe máy, quầy ngân hàng, tiệm điện thoại.
- TUYỆT ĐỐI không đòi chữ, số, bảng biểu, logo, tên app trong tranh — máy vẽ chữ sai. Số liệu để ở trường bieu_do.
- Cảnh có giấy tờ (hoá đơn, sao kê, hợp đồng, sổ) phải tả rõ là GIẤY TRẮNG KHÔNG CHỮ, ví dụ "a blank paper bill with
  only ruled lines", "an unmarked notebook page" — nếu không, máy tự viết chữ tiếng Anh sai chính tả lên đó.
- Hai đoạn liền nhau nên khác cảnh hoặc khác góc máy, đừng lặp y hệt.
- NGƯỜI PHỤ (đo thật, rất quan trọng): máy vẽ có ảnh mẫu nhân vật mặc ${nv.dau_hieu_vi}, nên người phụ nào tả chung chung
  ("a bank teller", "a friend") sẽ bị vẽ mặc Y HỆT ${nv.dau_hieu_vi} — người xem không biết ai là nhân vật chính.
  Vì vậy MỖI người phụ phải tả cụ thể: giới tính, tuổi, kiểu tóc, và trang phục có MÀU KHÁC màu ${nv.mau_vi}. Ví dụ:
  "a middle-aged woman bank teller with hair in a bun, wearing a navy blue uniform blazer and a red scarf"
  "an older man shopkeeper with grey hair wearing a green polo shirt".
- KHÔNG viết "alone" / "by himself": đo thật thì máy lại tự vẽ thêm đám đông và có người mặc ${nv.dau_hieu_vi} nhái nhân vật.
  Muốn cảnh vắng thì tả rõ xung quanh có gì ("only a desk lamp, a fan and a bookshelf") và chốt "nobody else in frame".`; };

const bamNoiDung = (chu) => createHash("sha1").update(chu).digest("hex").slice(0, 10);

export async function chay({ cfg, video, baoTienDo }) {
  const tm = thuMucVideo(cfg, video);
  const kichBan = docChu(join(tm, "kich-ban.md"));
  if (!kichBan) throw new Error("Chưa có kich-ban.md");

  const muc = tachMuc(kichBan);
  if (!muc.length) throw new Error('Kịch bản không có mục "## " nào');

  const usage = { token_vao: 0, token_ra: 0, cache_doc: 0, cache_ghi: 0, tim_kiem: 0, luot: 0 };
  let usdQuyDoi = 0, usd = 0;
  const tatCa = [];

  for (let i = 0; i < muc.length; i += MUC_MOI_LUOT) {
    const cum = muc.slice(i, i + MUC_MOI_LUOT);
    baoTienDo?.(`mục ${i + 1}–${i + cum.length}/${muc.length}`);

    const phan = cum.map(m => `## ${m.ten}\n${m.noi_dung}`).join("\n\n");
    // Cụm đã cắt xong thì giữ lại (khoá theo nội dung cụm) → CLI treo giữa chừng, chạy lại không mất cụm trước
    const fileCum = join(tm, "tam", `kb-hinh-cum-${i + 1}-${bamNoiDung(phan)}.json`);
    const cu = docJson(fileCum);
    if (cu?.doan?.length) { tatCa.push(...cu.doan); continue; }
    const kq = await goi({
      cfg,
      model: cfg.XV_MODEL_HINH,
      system: heThong(),
      user: `Video: "${video.tieu_de}" — đây là mục ${i + 1} đến ${i + cum.length} trong tổng ${muc.length} mục.
Cắt ĐÚNG phần dưới đây, không đụng tới mục khác. Phần này dài ${demTu(phan)} từ, dự kiến ra khoảng ${Math.max(1, Math.round(demTu(phan) / 40))} đoạn.

${phan}`,
      maxTokens: 12000,
      jsonTool: { name: "ghi_kich_ban_hinh", description: "Ghi danh sách đoạn kèm bố cục hình.", schema: SCHEMA },
      timeoutPhut: 12,
    });
    for (const k of Object.keys(usage)) usage[k] += kq.usage?.[k] ?? 0;
    usdQuyDoi += kq.usd_quy_doi ?? 0; usd += kq.usd ?? 0;

    if (!kq.toolInput?.doan?.length) throw new Error(`Mục ${i + 1}–${i + cum.length}: không nhận được đoạn nào (stop=${kq.stop})`);
    ghiJson(fileCum, { doan: kq.toolInput.doan });
    tatCa.push(...kq.toolInput.doan);
  }

  const doan = tatCa
    .map((d, i) => ({
      thu_tu: i + 1,
      loai: d.bo_cuc,
      loi_doc: (d.loi_doc || "").replace(/\s*\[nguồn\s*\d+\]/gi, "").replace(/\s+/g, " ").trim(),
      bo_cuc: BO_CUC.includes(d.bo_cuc) ? d.bo_cuc : "y_chinh",
      du_lieu: {
        tieu_de: d.tieu_de || "",
        canh: (d.canh || "").trim(),
        y: (d.y || []).slice(0, 4),
        bieu_do: d.bieu_do?.loai && d.bieu_do.loai !== "khong" ? d.bieu_do : null,
        so_sanh: d.so_sanh?.trai_ten ? d.so_sanh : null,
        trich_dan: d.trich_dan?.cau ? d.trich_dan : null,
      },
    }))
    .filter(d => d.loi_doc.length > 0)
    .map((d, i) => ({ ...d, thu_tu: i + 1 }));

  // Bố cục thiếu dữ liệu → hạ về y_chinh, đừng render slide trống
  for (const d of doan) {
    if (d.bo_cuc === "bieu_do" && !(d.du_lieu.bieu_do?.gia_tri?.length >= 2)) d.bo_cuc = "y_chinh";
    if (d.bo_cuc === "so_sanh" && !d.du_lieu.so_sanh) d.bo_cuc = "y_chinh";
    if (d.bo_cuc === "trich_dan" && !d.du_lieu.trich_dan) d.bo_cuc = "y_chinh";
  }
  // Lời kênh (mau/loi-kenh.json): giới thiệu → gioi_thieu, kêu gọi đăng ký → ket_thuc (đứng cuối), dù model có gán gì
  const loiKenh = docJson(join(cfg.thuMucMau, "loi-kenh.json")) || {};
  const chuaLoi = (d, loi) => loi && d.loi_doc.includes(loi.trim().slice(0, 40));
  // Màn kết có hình đăng ký chỉ khi anh bật man_ket_hinh_dang_ky (15/09 anh tắt) → câu kêu gọi thành slide chot có tranh
  const manKet = loiKenh.man_ket_hinh_dang_ky ? "ket_thuc" : "chot";
  for (const d of doan) {
    if (chuaLoi(d, loiKenh.gioi_thieu)) d.bo_cuc = "gioi_thieu";
    else if (chuaLoi(d, loiKenh.keu_goi)) d.bo_cuc = manKet;
    else if (d.bo_cuc === "gioi_thieu" || d.bo_cuc === "ket_thuc") d.bo_cuc = "y_chinh";
  }
  // Mỗi cụm hay tự đẻ một slide "chot" ở cuối cụm → video 25 phút ra 8 cái chốt.
  // Chỉ đoạn cuối phần nội dung mới được là chot; sau nó là ket_thuc (nếu có).
  const iKet = doan.findIndex(d => d.bo_cuc === "ket_thuc");
  const iChot = iKet > 0 ? iKet - 1 : doan.length - 1;
  doan.forEach((d, i) => { if (d.bo_cuc === "chot" && i !== iChot) d.bo_cuc = "y_chinh"; });
  if (doan.length && iChot >= 0 && doan[iChot].bo_cuc !== "gioi_thieu") doan[iChot].bo_cuc = "chot";

  xoaDoan(video.id);
  for (const d of doan) themDoan(video.id, d);
  ghiJson(join(tm, "kich-ban-hinh.json"), doan);

  const thongKe = {};
  for (const d of doan) thongKe[d.bo_cuc] = (thongKe[d.bo_cuc] || 0) + 1;
  const tuGoc = demTu(kichBan), tuDoan = doan.reduce((s, d) => s + demTu(d.loi_doc), 0);
  return {
    ket_qua: {
      so_doan: doan.length, so_muc: muc.length, luot_goi: Math.ceil(muc.length / MUC_MOI_LUOT),
      bo_cuc: thongKe, giu_duoc: Math.round(tuDoan / tuGoc * 100) + "% lời gốc",
    },
    usage, usd, usd_quy_doi: usdQuyDoi,
  };
}
