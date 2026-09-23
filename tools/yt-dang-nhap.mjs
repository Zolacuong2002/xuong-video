// Cấp quyền YouTube MỘT LẦN cho Xưởng (chủ kênh tự bấm Cho phép trong trình duyệt của mình).
// Dùng: node tools/yt-dang-nhap.mjs
// Cần XV_YT_CLIENT_ID và XV_YT_CLIENT_SECRET trong config.env — lấy ở Google Cloud Console,
// loại ứng dụng "Máy tính" (Desktop app). Xem tai-lieu/huong-dan-dang-youtube.pdf.
import { createServer } from "node:http";
import { napCfg } from "../cfg.mjs";
import { luuToken, FILE_TOKEN, PHAM_VI } from "../yt.mjs";
import { chayLenh } from "../buoc/chung.mjs";

const cfg = napCfg();
const id = (cfg.XV_YT_CLIENT_ID || "").trim();
const bi = (cfg.XV_YT_CLIENT_SECRET || "").trim();
if (!id || !bi) {
  console.error(`Chưa có XV_YT_CLIENT_ID / XV_YT_CLIENT_SECRET trong config.env.
Lấy như sau: console.cloud.google.com → tạo dự án → APIs & Services → Library → bật "YouTube Data API v3"
→ Credentials → Create credentials → OAuth client ID → Application type: Desktop app → copy hai chuỗi vào config.env.`);
  process.exit(1);
}

const CONG = parseInt(process.env.XV_YT_CONG || "5199", 10);
const veLai = `http://127.0.0.1:${CONG}`;
const diToi = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
  client_id: id, redirect_uri: veLai, response_type: "code", scope: PHAM_VI,
  access_type: "offline", prompt: "consent",
});

console.log("\nMở trang này trong trình duyệt đang đăng nhập tài khoản CỦA KÊNH, rồi bấm Cho phép:\n");
console.log(diToi + "\n");
try { await chayLenh("cmd", ["/c", "start", "", diToi.replace(/&/g, "^&")], { boQuaLoi: true }); } catch {}

const ma = await new Promise((xong, hong) => {
  const may = createServer((req, res) => {
    const u = new URL(req.url, veLai);
    const code = u.searchParams.get("code"), loi = u.searchParams.get("error");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<meta charset="utf-8"><body style="font-family:Segoe UI,Arial;padding:40px">
      <h2>${code ? "Xong. Đóng tab này và quay lại cửa sổ lệnh." : "Không cấp được quyền: " + (loi || "?")}</h2></body>`);
    may.close();
    code ? xong(code) : hong(new Error(loi || "không nhận được mã"));
  });
  may.listen(CONG, "127.0.0.1", () => console.log(`Đang chờ ở ${veLai} …`));
  setTimeout(() => { may.close(); hong(new Error("quá 5 phút không thấy trả lời")); }, 300000);
});

const r = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ code: ma, client_id: id, client_secret: bi, redirect_uri: veLai, grant_type: "authorization_code" }),
});
const j = await r.json();
if (!r.ok || !j.refresh_token) {
  console.error("Đổi mã lấy quyền hỏng:", JSON.stringify(j).slice(0, 400));
  if (r.ok && !j.refresh_token) console.error("(Google chỉ trả refresh_token ở lần cấp quyền đầu — vào myaccount.google.com/permissions gỡ ứng dụng rồi chạy lại.)");
  process.exit(1);
}
luuToken({ client_id: id, client_secret: bi, refresh_token: j.refresh_token, pham_vi: PHAM_VI, luu: new Date().toISOString() });

const me = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
  headers: { authorization: `Bearer ${j.access_token}` },
}).then(x => x.json()).catch(() => null);
const ten = me?.items?.[0]?.snippet?.title;
console.log(`\n✓ Đã lưu quyền vào ${FILE_TOKEN}${ten ? ` — kênh: ${ten}` : ""}`);
console.log("Từ giờ tab Thư viện trong Xưởng có nút “Đăng YouTube”.");
