// Đăng video lên YouTube bằng YouTube Data API v3, dùng OAuth CỦA CHÍNH CHỦ KÊNH.
// Máy không đụng vào phiên trình duyệt của ai: chủ kênh cấp quyền một lần bằng `node tools/yt-dang-nhap.mjs`,
// token lưu ở .yt-token.json (nằm trong .gitignore) và tự làm mới khi hết hạn.
//
// Một lần đăng làm đủ 5 việc: tải video → đặt hình thu nhỏ → tải phụ đề → thêm vào danh sách phát → hẹn giờ.
//
// ⚠ Dự án API chưa qua audit của YouTube thì MỌI video tải lên bằng API bị khoá ở chế độ riêng tư
//   (chính sách từ 28/07/2020). Máy vẫn tải lên đủ dữ liệu, chủ kênh chỉ việc vào Studio bật công khai.
//   Nộp đơn audit rồi thì hẹn giờ (publishAt) mới chạy thật.
import { readFileSync, existsSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { GOC } from "./cfg.mjs";

export const FILE_TOKEN = join(GOC, ".yt-token.json");
export const PHAM_VI = [
  "https://www.googleapis.com/auth/youtube.upload",   // tải video lên
  "https://www.googleapis.com/auth/youtube.force-ssl", // phụ đề + danh sách phát
].join(" ");

const DANH_MUC_GIAO_DUC = "27";
let boNhoToken = null;  // { access_token, het_luc }

export function coDangNhapYouTube() { return existsSync(FILE_TOKEN); }

export function docToken() {
  if (!existsSync(FILE_TOKEN)) {
    throw new Error("Chưa cấp quyền YouTube. Chạy: node tools/yt-dang-nhap.mjs (xem tai-lieu/huong-dan-dang-youtube.pdf)");
  }
  return JSON.parse(readFileSync(FILE_TOKEN, "utf8"));
}

/** Đổi refresh_token lấy access_token, nhớ trong bộ nhớ tới khi gần hết hạn. */
async function layAccessToken() {
  if (boNhoToken && boNhoToken.het_luc - Date.now() > 60000) return boNhoToken.access_token;
  const t = docToken();
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: t.client_id, client_secret: t.client_secret,
      refresh_token: t.refresh_token, grant_type: "refresh_token",
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) {
    throw new Error(`Không làm mới được quyền YouTube (${r.status}): ${j.error_description || j.error || ""}. Chạy lại node tools/yt-dang-nhap.mjs`);
  }
  boNhoToken = { access_token: j.access_token, het_luc: Date.now() + (j.expires_in || 3600) * 1000 };
  return boNhoToken.access_token;
}

/** Gọi API, ném lỗi kèm đúng câu YouTube trả về (bằng tiếng Anh) để còn biết đường sửa. */
async function goi(url, { method = "GET", body, headers = {}, tho = false } = {}) {
  const token = await layAccessToken();
  const r = await fetch(url, { method, headers: { authorization: `Bearer ${token}`, ...headers }, body });
  if (tho) return r;
  const chu = await r.text();
  let j = null; try { j = chu ? JSON.parse(chu) : null; } catch {}
  if (!r.ok) {
    const e = j?.error;
    const ly = e?.errors?.[0]?.reason || "";
    const mo = e?.message || chu.slice(0, 200);
    const them = ly === "quotaExceeded" ? " — hết hạn mức API hôm nay, thử lại sau nửa đêm giờ Thái Bình Dương"
      : ly === "youtubeSignupRequired" ? " — tài khoản Google này chưa có kênh YouTube"
      : ly === "forbidden" ? " — tài khoản đăng nhập không phải chủ kênh?" : "";
    throw new Error(`YouTube API ${r.status} ${ly}: ${mo}${them}`);
  }
  return j;
}

/** Tải một file lên bằng luồng resumable: mở phiên, rồi đẩy trọn file. */
async function taiLen(urlKhoiTao, sieuDuLieu, file, kieuFile) {
  const so = statSync(file).size;
  const token = await layAccessToken();
  const mo = await fetch(urlKhoiTao, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=UTF-8",
      "x-upload-content-length": String(so),
      "x-upload-content-type": kieuFile,
    },
    body: JSON.stringify(sieuDuLieu),
  });
  if (!mo.ok) throw new Error(`YouTube từ chối mở phiên tải lên (${mo.status}): ${(await mo.text()).slice(0, 300)}`);
  const noi = mo.headers.get("location");
  if (!noi) throw new Error("YouTube không trả địa chỉ tải lên");

  const du = readFileSync(file);   // video dài ~300 MB, Shorts ~12 MB — nạp thẳng cho chắc Content-Length
  const day = await fetch(noi, { method: "PUT", headers: { "content-type": kieuFile, "content-length": String(du.length) }, body: du });
  const chu = await day.text();
  if (!day.ok) throw new Error(`Tải lên hỏng (${day.status}): ${chu.slice(0, 300)}`);
  return JSON.parse(chu);
}

/** Danh sách phát: tìm theo tên, chưa có thì tạo. Trả id. */
async function danhSachPhatId(ten) {
  const ds = await goi("https://www.googleapis.com/youtube/v3/playlists?part=snippet&mine=true&maxResults=50");
  const co = (ds.items || []).find(p => (p.snippet?.title || "").trim().toLowerCase() === ten.trim().toLowerCase());
  if (co) return co.id;
  const moi = await goi("https://www.googleapis.com/youtube/v3/playlists?part=snippet,status", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ snippet: { title: ten }, status: { privacyStatus: "public" } }),
  });
  return moi.id;
}

/** Phụ đề .srt → captions.insert (multipart tự dựng, không cần thư viện ngoài). */
async function taiPhuDe(videoId, fileSrt) {
  const ranh = "xuongvideo" + Date.now();
  const meta = JSON.stringify({ snippet: { videoId, language: "vi", name: "Tiếng Việt", isDraft: false } });
  const than = Buffer.concat([
    Buffer.from(`--${ranh}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${ranh}\r\ncontent-type: application/octet-stream\r\n\r\n`, "utf8"),
    readFileSync(fileSrt),
    Buffer.from(`\r\n--${ranh}--\r\n`, "utf8"),
  ]);
  return await goi("https://www.googleapis.com/upload/youtube/v3/captions?part=snippet&uploadType=multipart", {
    method: "POST", headers: { "content-type": `multipart/related; boundary=${ranh}` }, body: than,
  });
}

/**
 * Đăng một mục lên YouTube.
 * @param {object} o
 *  - file        : đường dẫn mp4 (bắt buộc)
 *  - tieu_de, mo_ta, tags
 *  - thumbnail   : png (video dài; Shorts bỏ qua, YouTube lấy khung trong video)
 *  - srt         : phụ đề tiếng Việt (tuỳ chọn)
 *  - danh_sach_phat : tên danh sách phát (tuỳ chọn)
 *  - hen         : Date hoặc chuỗi ISO — có thì đặt riêng tư + hẹn giờ; không thì để riêng tư chờ bật tay
 *  - bao         : hàm báo tiến độ
 * @returns { videoId, url, rieng_tu, hen }
 */
export async function dangYouTube({ file, tieu_de, mo_ta = "", tags = [], thumbnail, srt, danh_sach_phat, hen, bao }) {
  if (!file || !existsSync(file)) throw new Error("Không thấy file video: " + file);
  if (!tieu_de) throw new Error("Thiếu tiêu đề");
  const henISO = hen ? new Date(hen).toISOString() : null;
  if (henISO && new Date(henISO) <= new Date()) throw new Error("Giờ hẹn đăng phải ở tương lai");

  bao?.("tải video lên YouTube");
  const kq = await taiLen(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      snippet: {
        title: tieu_de.slice(0, 100),
        description: (mo_ta || "").slice(0, 4900),
        tags: (tags || []).slice(0, 30),
        categoryId: DANH_MUC_GIAO_DUC,
        defaultLanguage: "vi", defaultAudioLanguage: "vi",
      },
      status: {
        privacyStatus: "private",          // hẹn giờ BẮT BUỘC phải là riêng tư; không hẹn thì chủ kênh tự bật
        ...(henISO ? { publishAt: henISO } : {}),
        selfDeclaredMadeForKids: false,
        containsSyntheticMedia: true,      // khai giọng và tranh do AI tạo — tiêu chí kênh
        license: "youtube", embeddable: true,
      },
    },
    file, "video/*",
  );
  const videoId = kq.id;
  if (!videoId) throw new Error("YouTube không trả mã video");

  const loiPhu = [];
  if (thumbnail && existsSync(thumbnail)) {
    bao?.("đặt hình thu nhỏ");
    try {
      await taiLen(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}&uploadType=resumable`,
        {}, thumbnail, "image/png");
    } catch (e) { loiPhu.push("hình thu nhỏ: " + e.message); }
  }
  if (srt && existsSync(srt)) {
    bao?.("tải phụ đề");
    try { await taiPhuDe(videoId, srt); } catch (e) { loiPhu.push("phụ đề: " + e.message); }
  }
  if (danh_sach_phat) {
    bao?.("thêm vào danh sách phát");
    try {
      const pid = await danhSachPhatId(danh_sach_phat);
      await goi("https://www.googleapis.com/youtube/v3/playlistItems?part=snippet", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ snippet: { playlistId: pid, resourceId: { kind: "youtube#video", videoId } } }),
      });
    } catch (e) { loiPhu.push("danh sách phát: " + e.message); }
  }

  return { videoId, url: `https://youtu.be/${videoId}`, rieng_tu: true, hen: henISO, loi_phu: loiPhu };
}

/** Ghi token sau khi cấp quyền (tools/yt-dang-nhap.mjs gọi). */
export function luuToken(du) {
  writeFileSync(FILE_TOKEN, JSON.stringify(du, null, 2), "utf8");
  boNhoToken = null;
  return FILE_TOKEN;
}
