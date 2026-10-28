#!/usr/bin/env node
/**
 * Platform walkthrough, part 2: turn the capture output into
 *   out/deck/index.html        – interactive slide deck (Space / arrows / F), works offline
 *   out/walkthrough.mp4        – the deck rendered as a Full HD video (needs ffmpeg)
 *   out/session.mp4           – the raw recording of the cursor session (if present)
 *   out/walkthrough-full.mp4   – deck followed by the live session
 */
import { mkdir, readFile, rename, rm, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { loadConfig } from "./lib/config.mjs";
import { loadChromium } from "./lib/playwright.mjs";
import { deckHtml } from "./lib/deck-template.mjs";

const cfg = loadConfig();
const out = cfg.outDir;
const exists = async path => access(path).then(() => true, () => false);
const run = (cmd, args) => new Promise((resolve, reject) => {
  const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
  let err = ""; child.stderr.on("data", d => { err += d; });
  child.on("close", code => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}\n${err.slice(-800)}`))));
  child.on("error", reject);
});

const manifest = JSON.parse(await readFile(join(out, "manifest.json"), "utf8"));
await mkdir(join(out, "deck"), { recursive: true });
const deckPath = join(out, "deck", "index.html");
await writeFile(deckPath, deckHtml(manifest));
console.log("deck:", deckPath);

if (process.env.NO_VIDEO === "1") process.exit(0);
const hasFfmpeg = await run("ffmpeg", ["-version"]).then(() => true, () => false);
if (!hasFfmpeg) { console.error("ffmpeg not found: the interactive deck was written, video rendering skipped."); process.exit(0); }

// Record the deck playing by itself (the same animation a viewer sees in the browser).
const chromium = await loadChromium();
const browser = await chromium.launch({ args: ["--hide-scrollbars", "--allow-file-access-from-files", "--force-color-profile=srgb"] });
const tmp = join(out, "deck-raw");
await rm(tmp, { recursive: true, force: true }); await mkdir(tmp, { recursive: true });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, recordVideo: { dir: tmp, size: { width: 1920, height: 1080 } } });
const page = await context.newPage();
await page.goto(pathToFileURL(deckPath).href + "?record=1");
const seconds = manifest.steps.reduce((sum, s) => sum + (s.kind === "page" ? 4.3 : 3.3) + (s.click ? 0.9 : 0), 9);
console.log(`recording the deck (~${Math.round(seconds)}s)…`);
await page.waitForFunction(() => window.__deckDone === true, null, { timeout: (seconds + 60) * 1000 });
const video = page.video();
await context.close(); await browser.close();
const rawDeck = await video.path();

const encode = (input, output, extra = []) => run("ffmpeg", ["-y", "-i", input, ...extra, "-vf", "fps=30,scale=1920:1080:flags=lanczos,format=yuv420p",
  "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-movflags", "+faststart", output]);
await encode(rawDeck, join(out, "walkthrough.mp4"));
console.log("video:", join(out, "walkthrough.mp4"));

const session = join(out, "raw", "session.webm");
if (await exists(session)) {
  await encode(session, join(out, "session.mp4"));
  await run("ffmpeg", ["-y", "-i", join(out, "walkthrough.mp4"), "-i", join(out, "session.mp4"),
    "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[v]", "-map", "[v]", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", join(out, "walkthrough-full.mp4")]);
  console.log("video:", join(out, "session.mp4"), "and", join(out, "walkthrough-full.mp4"));
}
await rm(tmp, { recursive: true, force: true });
