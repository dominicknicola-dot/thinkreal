#!/usr/bin/env node
// Real-clock verification: headless Chrome over the DevTools protocol.
// The in-app browser pane reports visibilityState "hidden", which throttles
// rAF and stops IntersectionObserver delivering, so anything reveal- or
// frame-driven reads as broken there. Here the page is visible and the clock
// is real. Lives in the repo because it was rebuilt from scratch three times
// after a scratchpad was cleared between sessions.
//
//   node devcheck/cdp.mjs <url> <w> <h> <script.js> [--reduce] [--mobile]
//                         [--nojs] [--shot=out.png]
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [url, w, h, scriptPath, ...flags] = process.argv.slice(2);
const W = +w, H = +h;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9300 + Math.floor(Math.random() * 600);
const profile = mkdtempSync(join(tmpdir(), "cdp-"));
const body = readFileSync(scriptPath, "utf8");

const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--hide-scrollbars",
  `--window-size=${W},${H}`, "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function done(code, out) {
  if (out !== undefined) console.log(typeof out === "string" ? out : JSON.stringify(out));
  try { chrome.kill("SIGKILL"); } catch {}
  await sleep(150);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(code);
}

let target;
for (let i = 0; i < 80; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    target = list.find((t) => t.type === "page");
    if (target) break;
  } catch {}
  await sleep(100);
}
if (!target) await done(1, "chrome did not start");

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0;
const pending = new Map(), listeners = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  else if (msg.method) listeners.forEach((fn) => fn(msg));
};
const send = (method, params = {}) => new Promise((res) => {
  const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params }));
});

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride",
  { width: W, height: H, deviceScaleFactor: 1, mobile: flags.includes("--mobile") });
if (flags.includes("--mobile")) await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
if (flags.includes("--reduce"))
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
if (flags.includes("--nojs")) await send("Emulation.setScriptExecutionDisabled", { value: true });

const loaded = new Promise((r) => listeners.push((m) => { if (m.method === "Page.loadEventFired") r(); }));
await send("Page.navigate", { url });
await Promise.race([loaded, sleep(15000)]);

const res = await send("Runtime.evaluate",
  { expression: `(async () => { ${body} })()`, awaitPromise: true, returnByValue: true, timeout: 120000 });
if (res.result?.exceptionDetails)
  await done(1, "EXCEPTION: " + JSON.stringify(res.result.exceptionDetails).slice(0, 500));

const shot = flags.find((f) => f.startsWith("--shot="));
if (shot) {
  const img = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  if (img.result?.data) writeFileSync(shot.slice(7), Buffer.from(img.result.data, "base64"));
}
await done(0, res.result?.result?.value);
