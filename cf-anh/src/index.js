// POST /ve  — tạo một ảnh bằng FLUX.2 [klein] trên Workers AI.
//   header  X-Khoa: <bí mật>          (không có thì từ chối — giữ hạn mức miễn phí khỏi bị người lạ đốt)
//   body    multipart/form-data: prompt, width, height, seed, model (4b|9b), input_image_0..3 (ảnh tham chiếu)
//   trả     ảnh nhị phân (image/png hoặc image/jpeg)
// GET  /    — kiểm tra sống
const MODEL = {
  "4b": "@cf/black-forest-labs/flux-2-klein-4b",   // ~$0,0012/ảnh 1024px + 1 ảnh mẫu → khoảng 90 ảnh/ngày miễn phí
  "9b": "@cf/black-forest-labs/flux-2-klein-9b",   // đẹp hơn, đắt gấp ~13 lần → chỉ để vẽ nhân vật gốc
};

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname === "/") return new Response("xuong-anh: ok");
    if (req.method !== "POST" || url.pathname !== "/ve") return new Response("không có", { status: 404 });
    if (!env.KHOA || req.headers.get("x-khoa") !== env.KHOA) return new Response("sai khoá", { status: 401 });

    let vao;
    try { vao = await req.formData(); } catch { return json({ loi: "body phải là multipart/form-data" }, 400); }
    const prompt = String(vao.get("prompt") || "").trim();
    if (!prompt) return json({ loi: "thiếu prompt" }, 400);
    const model = MODEL[String(vao.get("model") || "4b")] || MODEL["4b"];

    const form = new FormData();
    form.append("prompt", prompt);
    for (const k of ["width", "height", "seed", "guidance"]) {
      const v = vao.get(k);
      if (v != null && String(v) !== "") form.append(k, String(v));
    }
    for (let i = 0; i < 4; i++) {
      const f = vao.get(`input_image_${i}`);
      if (f && typeof f !== "string") form.append(`input_image_${i}`, f);
    }

    const goi = new Response(form);
    let kq;
    try {
      kq = await env.AI.run(model, { multipart: { body: goi.body, contentType: goi.headers.get("content-type") } });
    } catch (e) {
      const m = String(e && e.message || e);
      const hetHanMuc = /neuron|quota|limit|429|capacity|daily/i.test(m);
      return json({ loi: m.slice(0, 500), het_han_muc: hetHanMuc }, hetHanMuc ? 429 : 502);
    }
    const b64 = kq && kq.image;
    if (!b64) return json({ loi: "model không trả ảnh", kq: JSON.stringify(kq).slice(0, 300) }, 502);

    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const png = bytes[0] === 0x89 && bytes[1] === 0x50;
    return new Response(bytes, { headers: { "content-type": png ? "image/png" : "image/jpeg", "x-model": model } });
  },
};

function json(o, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}
