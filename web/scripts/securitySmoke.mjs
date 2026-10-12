import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url), port = 3187;
const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "--port", String(port)], {
  cwd: fileURLToPath(new URL("..", import.meta.url)),
  env: { ...process.env, NODE_ENV: "production", API_BASE_URL: "https://backend.invalid" },
  stdio: ["ignore", "pipe", "pipe"],
});
let tail = "";
for (const stream of [server.stdout, server.stderr]) stream.on("data", bytes => { tail = (tail + bytes.toString()).slice(-2000); });
const origin = `http://localhost:${port}`;
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { const response = await fetch(`${origin}/login`); await response.text(); ready = response.ok; } catch { /* server starting */ }
    if (ready) break;
    if (server.exitCode !== null) throw new Error(`Next.js exited during startup: ${tail}`);
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, `Production server did not start: ${tail}`);
  const nonces = [];
  for (let i = 0; i < 2; i++) {
    const response = await fetch(`${origin}/login`), html = await response.text();
    assert.equal(response.status, 200);
    const csp = response.headers.get("content-security-policy") ?? "";
    const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
    assert.ok(nonce, "Production login has no CSP nonce"); nonces.push(nonce);
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/giu)];
    assert.ok(scripts.length > 0, "Expected Next.js hydration scripts");
    for (const [, attributes] of scripts) assert.ok(attributes.includes(`nonce="${nonce}"`), "A hydration script is blocked by the response CSP");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-powered-by"), null);
  }
  assert.notEqual(nonces[0], nonces[1], "Nonce must change between requests");
  const forbidden = await fetch(`${origin}/api/admin/subjects`, { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: '{"title":"unauthorized"}' });
  assert.equal(forbidden.status, 403); await forbidden.arrayBuffer();
  console.log("Production CSP hydration and cross-origin mutation checks passed.");
} finally {
  server.kill("SIGTERM");
  const timer = setTimeout(() => server.kill("SIGKILL"), 5000); timer.unref();
  server.once("exit", () => clearTimeout(timer));
}
