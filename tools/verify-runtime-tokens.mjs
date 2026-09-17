import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(root, "frontend", "src");
const CDP_PORT = 9347;
const EDGE = ["C:\\\\Program Files (x86)\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe",
              "C:\\\\Program Files\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe"].find(existsSync);
if (!EDGE) { console.error("no edge"); process.exit(1); }

const PAGE = `<!DOCTYPE html><html><head><style id="runtime-tokens"></style></head><body>
<script type="module">
  import * as M from "/runtime-tokens.js";
  window.__tok = M;
  window.__tokReady = true;
</script></body></html>`;

const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/" || p === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(PAGE);
  }
  const rel = p === "/runtime-tokens.js" ? join("js", "runtime-tokens.js") : p.slice(1);
  const file = join(SRC, rel);
  if (!existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); return res.end("nf"); }
  res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const PORT = server.address().port;
const userDir = join(tmpdir(), "lmp-tok-" + Date.now());
mkdirSync(userDir, { recursive: true });
const edge = spawn(EDGE, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${userDir}`, "--no-first-run", `http://127.0.0.1:${PORT}/`], { stdio: "ignore" });

async function waitTarget() {
  for (let i = 0; i < 120; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
      const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("no target");
}
const ws = new WebSocket(await waitTarget());
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params) => { const i = ++id; return new Promise((res) => { pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); }); };
async function ev(expr) {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  const ex = r.result?.exceptionDetails;
  if (ex) return { __error: ex.exception?.description || ex.text };
  return r.result?.result?.value;
}
for (let i = 0; i < 60; i++) { if (await ev("window.__tokReady === true")) break; await new Promise((r) => setTimeout(r, 200)); }

const out = await ev(`(() => {
  const m = window.__tok;
  const sheet = () => document.getElementById("runtime-tokens").sheet;
  const probe = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  m.setRuntimeTokens({ "--a": "1px", "--b": "2px" });
  const rules1 = sheet().cssRules.length;
  const ruleObj1 = sheet().cssRules[0];
  const a1 = probe("--a");
  m.setRuntimeTokens({ "--a": "9px" });
  const rules2 = sheet().cssRules.length;
  const ruleObj2 = sheet().cssRules[0];
  const a2 = probe("--a"), b2 = probe("--b");
  m.setRuntimeTokens({ "--b": null });
  const a3 = probe("--a"), b3 = probe("--b");
  m.setRuntimeTokens({ "--a": null });
  const rules4 = sheet().cssRules.length;
  return { rules1, rules2, sameRuleObject: ruleObj1 === ruleObj2, a1, a2, b2, a3, b3, rules4 };
})()`);

console.log(JSON.stringify(out, null, 2));
ws.close(); edge.kill(); server.close(); process.exit(0);
