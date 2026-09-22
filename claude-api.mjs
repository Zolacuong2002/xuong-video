// ĐƯỜNG API (cần ANTHROPIC_API_KEY). Mặc định KHÔNG dùng — xem claude.mjs. Bật bằng XV_CLAUDE=api.
// Client gọi Claude bằng HTTP thuần (Node 24 có fetch sẵn). Tự chỉnh hình dạng request theo dòng model:
//   - Haiku 4.5: thinking dạng budget_tokens, KHÔNG gửi effort, web search bản 20250305
//   - Opus 5 / Sonnet 5 / Opus 4.x / Sonnet 4.6: thinking adaptive, effort được, web search bản 20260209
// Trả về text + input của tool (nếu ép JSON) + usage + tiền tính ra USD.

const API = "https://api.anthropic.com/v1/messages";

// USD trên 1 triệu token: [vào, ra]. Cache ghi = 1,25× vào, cache đọc = 0,1× vào (chuẩn chung).
const GIA = {
  "claude-opus-5":     [5, 25],
  "claude-opus-4-8":   [5, 25],
  "claude-opus-4-7":   [5, 25],
  "claude-opus-4-6":   [5, 25],
  "claude-sonnet-5":   [2, 10],
  "claude-sonnet-4-6": [3, 15],
  "claude-haiku-4-5":  [1, 5],
};
const GIA_TIM_KIEM = 0.01; // USD mỗi lượt web search

function dongCu(model) {
  return /^claude-haiku-4-5/.test(model) || /^claude-(sonnet|opus)-4-5/.test(model) || /-3-/.test(model);
}

export function tinhUsd(model, usage = {}) {
  const [vao, ra] = GIA[model] ?? [5, 25];
  const tk = (usage.server_tool_use?.web_search_requests) ?? 0;
  return (usage.input_tokens ?? 0) / 1e6 * vao
       + (usage.output_tokens ?? 0) / 1e6 * ra
       + (usage.cache_creation_input_tokens ?? 0) / 1e6 * vao * 1.25
       + (usage.cache_read_input_tokens ?? 0) / 1e6 * vao * 0.1
       + tk * GIA_TIM_KIEM;
}

/**
 * goi({ apiKey, model, system, user, maxTokens, thinking, webSearch, jsonTool })
 *   system    : chuỗi ổn định → được gắn cache_control
 *   user      : chuỗi hoặc mảng block
 *   thinking  : true để bật suy nghĩ (adaptive hoặc budget tuỳ model)
 *   webSearch : số lượt tối đa (0/undefined = không bật)
 *   jsonTool  : { name, description, schema } → ép trả JSON qua strict tool
 */
export async function goiApi(o) {
  if (!o.apiKey) throw new Error("Thiếu ANTHROPIC_API_KEY trong config.env");
  const model = o.model;
  const cu = dongCu(model);
  const maxTokens = o.maxTokens ?? 8000;

  const body = {
    model,
    max_tokens: maxTokens,
    system: [{ type: "text", text: o.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: typeof o.user === "string" ? [{ type: "text", text: o.user }] : o.user }],
  };

  if (o.thinking) {
    body.thinking = cu
      ? { type: "enabled", budget_tokens: Math.max(1024, Math.min(o.budget ?? 4000, maxTokens - 1000)) }
      : { type: "adaptive" };
  }
  if (!cu && o.effort) body.output_config = { effort: o.effort };

  const tools = [];
  if (o.webSearch) {
    tools.push({ type: cu ? "web_search_20250305" : "web_search_20260209", name: "web_search", max_uses: o.webSearch });
  }
  if (o.jsonTool) {
    tools.push({
      name: o.jsonTool.name,
      description: o.jsonTool.description,
      input_schema: o.jsonTool.schema,
      strict: true,
    });
    // Ép gọi tool; Haiku/Opus 5 đều nhận. (Chỉ Fable 5.1 bỏ tool_choice ép — không dùng ở đây.)
    body.tool_choice = { type: "tool", name: o.jsonTool.name };
    // Không thể vừa ép tool vừa bật thinking trên dòng budget → tắt thinking khi ép JSON.
    if (cu) delete body.thinking;
  }
  if (tools.length) body.tools = tools;

  const res = await goiCoThuLai(o.apiKey, body);
  const usage = res.usage ?? {};
  const usd = tinhUsd(model, usage);

  if (res.stop_reason === "refusal") {
    throw new Error("Model từ chối yêu cầu này (stop_reason=refusal)" + (res.stop_details?.category ? " · " + res.stop_details.category : ""));
  }

  let text = "";
  let toolInput = null;
  const nguon = [];
  for (const b of res.content ?? []) {
    if (b.type === "text") text += b.text;
    else if (b.type === "tool_use" && o.jsonTool && b.name === o.jsonTool.name) toolInput = b.input;
    else if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
      for (const r of b.content) if (r.type === "web_search_result") nguon.push({ url: r.url, tieu_de: r.title, ngay: r.page_age ?? null });
    }
  }
  return {
    text: text.trim(),
    toolInput,
    nguon,
    usage: {
      token_vao: usage.input_tokens ?? 0,
      token_ra: usage.output_tokens ?? 0,
      cache_ghi: usage.cache_creation_input_tokens ?? 0,
      cache_doc: usage.cache_read_input_tokens ?? 0,
      tim_kiem: usage.server_tool_use?.web_search_requests ?? 0,
    },
    usd,
    stop: res.stop_reason,
    model,
  };
}

async function goiCoThuLai(apiKey, body, lan = 0) {
  const r = await fetch(API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  if (r.ok) return r.json();
  const loi = await r.text();
  const thuLai = [408, 409, 429, 500, 502, 503, 529].includes(r.status);
  if (thuLai && lan < 3) {
    await new Promise(x => setTimeout(x, (lan + 1) * 2500 + Math.random() * 800));
    return goiCoThuLai(apiKey, body, lan + 1);
  }
  let chiTiet = loi;
  try { chiTiet = JSON.parse(loi).error?.message ?? loi; } catch {}
  throw new Error(`Claude API ${r.status}: ${chiTiet}`);
}
