// Gọi Claude qua CHÍNH Claude Code đang cài trên máy (gói đăng ký) — không cần API key.
//   claude -p --output-format json [--system-prompt ...] [--json-schema ...] [--tools WebSearch]
// Đổi sang đường API bằng XV_CLAUDE=api trong config.env (khi đó cần ANTHROPIC_API_KEY).
//
// goi({ cfg, model, system, user, webSearch, jsonTool, timeoutPhut })
//   → { text, toolInput, nguon, usage, usd, usd_quy_doi, model, nguon_goi }
//   usd          : tiền THẬT phát sinh — 0 với gói đăng ký
//   usd_quy_doi  : giá quy đổi nếu đi API (Claude Code tự báo) — để anh biết mình đang "dùng" bao nhiêu

import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { goiApi } from "./claude-api.mjs";

let duongDanClaude = null;

/** Tìm claude.exe: XV_CLAUDE_BIN → PATH → extension VS Code (bản mới nhất) → ~/.local/bin */
export function timClaude(cfg) {
  if (duongDanClaude) return duongDanClaude;
  const thu = [];
  if (cfg?.XV_CLAUDE_BIN) thu.push(cfg.XV_CLAUDE_BIN);
  // trên PATH? (kiểm thật từng thư mục, không tin tên trần)
  for (const d of (process.env.PATH || "").split(process.platform === "win32" ? ";" : ":")) {
    if (!d) continue;
    for (const ten of ["claude.exe", "claude.cmd", "claude"]) thu.push(join(d, ten));
  }
  const home = homedir();
  const ext = join(home, ".vscode", "extensions");
  if (existsSync(ext)) {
    const ban = readdirSync(ext).filter(t => /^anthropic\.claude-code-[\d.]+-win32-x64$/.test(t))
      .sort((a, b) => soSanhBan(b, a));
    for (const t of ban) thu.push(join(ext, t, "resources", "native-binary", "claude.exe"));
  }
  thu.push(join(home, ".local", "bin", "claude.exe"), join(home, "AppData", "Roaming", "npm", "claude.cmd"));
  for (const p of thu) {
    if (existsSync(p)) { duongDanClaude = p; return p; }
  }
  throw new Error("Không tìm thấy Claude Code trên máy. Cài Claude Code hoặc điền XV_CLAUDE_BIN trong config.env");
}
function soSanhBan(a, b) {
  const va = (a.match(/(\d+\.\d+\.\d+)/) || [])[1]?.split(".").map(Number) ?? [0];
  const vb = (b.match(/(\d+\.\d+\.\d+)/) || [])[1]?.split(".").map(Number) ?? [0];
  for (let i = 0; i < 3; i++) if ((va[i] ?? 0) !== (vb[i] ?? 0)) return (va[i] ?? 0) - (vb[i] ?? 0);
  return 0;
}

/** claude-haiku-4-5 → haiku, claude-opus-5 → opus … CLI nhận alias chắc hơn tên đầy đủ */
export function tenModelCli(model) {
  const m = String(model || "").toLowerCase();
  if (/fable|mythos/.test(m)) return "fable";
  if (/opus/.test(m)) return "opus";
  if (/sonnet/.test(m)) return "sonnet";
  if (/haiku/.test(m)) return "haiku";
  return m || "haiku";
}

export async function goi(o) {
  const cfg = o.cfg ?? {};
  if ((cfg.XV_CLAUDE || "cli") === "api") {
    const kq = await goiApi({ ...o, apiKey: cfg.ANTHROPIC_API_KEY });
    return { ...kq, usd_quy_doi: kq.usd, nguon_goi: "api" };
  }

  const bin = timClaude(cfg);
  const args = [
    "-p", "--output-format", "json",
    "--model", tenModelCli(o.model),
    "--strict-mcp-config", "--no-session-persistence", "--disable-slash-commands",
    "--setting-sources", "",
  ];
  if (o.system) args.push("--system-prompt", o.system);
  if (o.webSearch) args.push("--tools", "WebSearch", "--allowedTools", "WebSearch");
  else args.push("--tools", "");
  if (o.jsonTool) args.push("--json-schema", JSON.stringify(o.jsonTool.schema));

  const user = typeof o.user === "string" ? o.user
    : o.user.map(b => b.type === "text" ? b.text : "").join("\n");

  // Không chạy lồng trong phiên Claude Code khác: gỡ hai biến môi trường đánh dấu phiên
  const env = { ...process.env };
  delete env.CLAUDECODE; delete env.CLAUDE_CODE_ENTRYPOINT;

  const raw = await chayCli(bin, args, user, env, (o.timeoutPhut ?? 8) * 60000);
  let j;
  try { j = JSON.parse(raw); }
  catch { throw new Error("Claude Code trả về không phải JSON: " + raw.slice(0, 300)); }
  neuLoi(j);

  const text = String(j.result ?? "").trim();
  let toolInput = j.structured_output ?? null;
  if (o.jsonTool && !toolInput) toolInput = bocJson(text);

  const u = j.usage ?? {};
  return {
    text,
    toolInput,
    nguon: bocUrl(text),
    usage: {
      token_vao: u.input_tokens ?? 0,
      token_ra: u.output_tokens ?? 0,
      cache_ghi: u.cache_creation_input_tokens ?? 0,
      cache_doc: u.cache_read_input_tokens ?? 0,
      tim_kiem: u.server_tool_use?.web_search_requests ?? 0,
      luot: j.num_turns ?? 1,
    },
    usd: 0,
    usd_quy_doi: Number(j.total_cost_usd ?? 0),
    stop: j.stop_reason ?? "end_turn",
    model: Object.keys(j.modelUsage ?? {})[0] ?? o.model,
    nguon_goi: "cli",
  };
}

function chayCli(bin, args, stdinText, env, timeoutMs) {
  return new Promise((ok, hong) => {
    const p = spawn(bin, args, { env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    const t = setTimeout(() => { try { p.kill(); } catch {} hong(new Error(`Claude Code quá ${Math.round(timeoutMs / 60000)} phút, bỏ cuộc`)); }, timeoutMs);
    p.stdout.on("data", d => { out += d.toString("utf8"); });
    p.stderr.on("data", d => { err += d.toString("utf8"); });
    p.on("error", e => { clearTimeout(t); hong(new Error(`Không chạy được Claude Code (${bin}): ${e.message}`)); });
    p.on("close", code => {
      clearTimeout(t);
      // Thoát khác 0 nhưng stdout vẫn là JSON: đó là lỗi CÓ NGHĨA (hết hạn mức, bị từ chối…),
      // phải bóc ra chứ không quăng cả cục JSON vào mặt người dùng.
      const chu = out.trim();
      if (chu.startsWith("{")) {
        try { const j = JSON.parse(chu); if (code !== 0) { try { neuLoi(j); } catch (e) { return hong(e); } } return ok(chu); } catch {}
      }
      if (code === 0 && chu) return ok(chu);
      hong(new Error(`Claude Code thoát mã ${code}: ${(err || out).trim().slice(-400)}`));
    });
    p.stdin.on("error", () => {});
    p.stdin.write(stdinText, "utf8"); p.stdin.end();
  });
}

/** Bóc lỗi có nghĩa từ JSON của CLI. Hết hạn mức gói → gắn cờ để server tạm dừng hàng đợi. */
function neuLoi(j) {
  if (!j.is_error && (!j.subtype || j.subtype === "success")) return;
  const chu = String(j.result || j.error || "").trim();
  const het = j.api_error_status === 429 || /session limit|usage limit|rate limit|hit your limit/i.test(chu);
  if (het) {
    const m = chu.match(/resets?\s+([^\n.(]+)/i);
    const e = new Error("Hết hạn mức gói Claude Code" + (m ? " — mở lại lúc " + m[1].trim() : "") + ". Máy đã tạm dừng hàng đợi, không mất bước nào.");
    e.hetHanMuc = true;
    e.moLaiLuc = m ? m[1].trim() : null;
    throw e;
  }
  throw new Error(`Claude Code lỗi${j.api_error_status ? " " + j.api_error_status : ""}: ${chu.slice(0, 300) || j.subtype || "không rõ"}`);
}

function bocJson(text) {
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(text.slice(a, b + 1)); } catch { return null; }
}
function bocUrl(text) {
  const ra = [], da = new Set();
  for (const m of text.matchAll(/\[([^\]]{2,120})\]\((https?:\/\/[^\s)]+)\)/g)) {
    if (!da.has(m[2])) { da.add(m[2]); ra.push({ url: m[2], tieu_de: m[1], ngay: null }); }
  }
  for (const m of text.matchAll(/(?<!\()https?:\/\/[^\s)\]>"']+/g)) {
    const u = m[0].replace(/[.,;:]+$/, "");
    if (!da.has(u)) { da.add(u); ra.push({ url: u, tieu_de: null, ngay: null }); }
  }
  return ra;
}

// Giữ để nơi khác import không gãy
export { tinhUsd } from "./claude-api.mjs";
