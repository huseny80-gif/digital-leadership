#!/usr/bin/env node
/**
 * Platform walkthrough, part 1: drive the platform like a person (visible, smoothly moving
 * cursor; real clicks and scrolling), take Full HD screenshots and write a documentation log.
 *
 *   BASE_URL=https://your-site JOIN_TOKEN=... node capture.mjs        # guest training link
 *   BASE_URL=https://your-site STORAGE_STATE=auth.json node capture.mjs  # signed-in session
 *
 * Output (OUT_DIR, default ./out): shots/*.png, raw/session.webm, manifest.json, REPORT.md
 */
import { mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig } from "./lib/config.mjs";
import { loadChromium } from "./lib/playwright.mjs";
import { CURSOR_INIT_SCRIPT, Mouse } from "./lib/cursor.mjs";
import { captionFor } from "./lib/captions.mjs";

const cfg = loadConfig();
const SECTION_ORDER = ["pdf", "summaries.html", "mind-maps", "assessments", "exam-material", "assignments", "library?section=references"];
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const log = (...args) => console.log(new Date().toISOString().slice(11, 19), ...args);
const pad = n => String(n).padStart(3, "0");
const slugOf = path => (path.replace(/\?/g, "-").replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, "id").replace(/^\/+|\/+$/g, "").replace(/[^a-z0-9]+/gi, "-") || "home").slice(0, 60);
const redact = value => String(value).replace(/\/join\/[^/?#]+/g, "/join/<token>");

await rm(cfg.outDir, { recursive: true, force: true });
const shotsDir = join(cfg.outDir, "shots"), rawDir = join(cfg.outDir, "raw");
await mkdir(shotsDir, { recursive: true }); await mkdir(rawDir, { recursive: true });

const chromium = await loadChromium();
const browser = await chromium.launch({ args: ["--hide-scrollbars", "--force-color-profile=srgb"] });

/** Visit the main pages once, off camera, so the recording is free of cold-start/compile waits. */
async function warmUp() {
  log("warming up the site (not recorded)…");
  const warm = await browser.newContext({ viewport: cfg.viewport, locale: cfg.locale, ...(cfg.storageState ? { storageState: cfg.storageState } : {}) });
  warm.setDefaultTimeout(cfg.navTimeoutMs);
  const wp = await warm.newPage();
  const open = async path => { await wp.goto(cfg.baseUrl + path, { waitUntil: "domcontentloaded" }).catch(() => {}); await wp.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {}); };
  const links = async rx => wp.evaluate(source => [...new Set([...document.querySelectorAll("a[href]")].map(a => a.getAttribute("href")).filter(h => new RegExp(source).test(h)))], rx);
  const joinPath = cfg.joinUrl ? new URL(cfg.joinUrl).pathname : cfg.joinToken ? `/join/${cfg.joinToken}` : "";
  if (!cfg.storageState && joinPath) {
    await open(joinPath);
    await wp.locator("input").first().fill(cfg.guestName).catch(() => {});
    await wp.locator("button").first().click().catch(() => {});
    await wp.waitForURL(url => !new URL(url).pathname.startsWith("/join/"), { timeout: cfg.navTimeoutMs }).catch(() => {});
  }
  await open("/dashboard");
  const subjectPaths = (await links(`^/subjects/${UUID}$`)).slice(0, cfg.maxSubjects);
  for (const path of [...cfg.extraPages, ...subjectPaths]) await open(path);
  for (const subject of subjectPaths) {
    await open(subject);
    const inner = await links(`^(${subject}/.+|/summaries\\.html\\?subject=.+)$`);
    for (const path of inner.slice(0, 14)) await open(path);
  }
  await warm.close();
  log("warm-up done");
}
if (cfg.warmup) await warmUp();
const context = await browser.newContext({
  viewport: cfg.viewport, deviceScaleFactor: 1, locale: cfg.locale,
  recordVideo: { dir: rawDir, size: cfg.viewport },
  ...(cfg.storageState ? { storageState: cfg.storageState } : {}),
});
context.setDefaultTimeout(cfg.navTimeoutMs);
await context.addInitScript(CURSOR_INIT_SCRIPT);
const page = await context.newPage();
const mouse = new Mouse(page, cfg.speed);

const steps = [];
let pageErrors = [];
page.on("console", message => { if (message.type() === "error") pageErrors.push(message.text().slice(0, 200)); });
page.on("pageerror", error => pageErrors.push(String(error).slice(0, 200)));

async function settle() {
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await mouse.wait(800);
}

/** Take the screenshot + documentation entry for the current state of the page. */
async function capture(kind, extra = {}) {
  await settle();
  const url = new URL(page.url());
  const path = url.pathname;
  const info = await page.evaluate(() => ({
    title: document.title,
    h1: document.querySelector("h1")?.innerText?.trim() ?? "",
    headings: [...document.querySelectorAll("h2,h3")].slice(0, 8).map(h => h.innerText.trim()).filter(Boolean),
    links: document.querySelectorAll("a[href]").length,
    buttons: document.querySelectorAll("button").length,
    scrollHeight: document.documentElement.scrollHeight,
    scrollY: Math.round(scrollY),
  })).catch(() => ({ title: "", h1: "", headings: [], links: 0, buttons: 0, scrollHeight: 0, scrollY: 0 }));
  const index = steps.length + 1;
  const file = `${pad(index)}-${slugOf(path + url.search)}${kind === "page" ? "" : "-" + kind}.png`;
  await page.screenshot({ path: join(shotsDir, file), type: "png" });
  let fullFile = null;
  if (kind === "page" && cfg.fullPageShots && info.scrollHeight > cfg.viewport.height * 1.15) {
    fullFile = file.replace(/\.png$/, "-full.png");
    await page.screenshot({ path: join(shotsDir, fullFile), type: "png", fullPage: true });
  }
  const caption = captionFor(path, info.h1 || info.title, url.search);
  const entry = {
    index, kind, file, fullFile, url: redact(url.pathname + url.search), path: redact(path),
    title: info.title, h1: info.h1, headings: info.headings, links: info.links, buttons: info.buttons,
    pageHeight: info.scrollHeight, scrollY: info.scrollY,
    caption: extra.caption ?? caption.title, description: extra.description ?? caption.text,
    cursor: { x: Math.round(mouse.x), y: Math.round(mouse.y) },
    click: extra.click ?? null, httpStatus: extra.httpStatus ?? null, note: extra.note ?? null,
    consoleErrors: pageErrors.splice(0).slice(0, 5), at: new Date().toISOString(),
  };
  steps.push(entry);
  log(`#${pad(index)} ${kind.padEnd(6)} ${entry.path}  ${entry.h1 || entry.title}`);
  return entry;
}

/** Open a page the way a user would: click its link if it is on screen, otherwise type the address. */
async function visit(href, extra = {}) {
  const target = new URL(href, cfg.baseUrl);
  const arrived = () => { const now = new URL(page.url()); return now.pathname === target.pathname && now.search === target.search; };
  const link = page.locator(`a[href="${href}"]:visible`).first();
  let click = null, httpStatus = null, note = null;
  try {
    if (await link.count()) {
      click = await mouse.clickLocator(link);
      await page.waitForURL(arrived, { timeout: 30000 }).catch(() => {});
    }
    if (!arrived()) {
      const response = await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: cfg.navTimeoutMs });
      httpStatus = response?.status() ?? null;
    }
  } catch (error) { note = `navigation failed: ${String(error.message).split("\n")[0]}`; }
  if (!arrived() && !note) note = `redirected to ${redact(new URL(page.url()).pathname)}`;
  return { click, httpStatus, note, ...extra };
}

async function hrefs(pattern) {
  return page.evaluate(({ source }) => {
    const rx = new RegExp(source);
    const seen = new Map();
    for (const a of document.querySelectorAll("a[href]")) {
      const href = a.getAttribute("href");
      if (rx.test(href) && !seen.has(href)) seen.set(href, (a.innerText || a.getAttribute("aria-label") || "").trim().replace(/\s+/g, " "));
    }
    return [...seen].map(([href, text]) => ({ href, text }));
  }, { source: pattern });
}

/** Scroll down a long page in readable steps (screenshot at each stop), then glide back to the top. */
async function scrollTour() {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  if (height < cfg.viewport.height * 1.3 || cfg.scrollStops < 1) return;
  await mouse.moveTo(cfg.viewport.width * 0.55, cfg.viewport.height * 0.55);
  let moved = 0;
  for (let stop = 1; stop <= cfg.scrollStops; stop++) {
    const room = height - cfg.viewport.height - moved;
    if (room < 80) break;
    const delta = Math.min(room, cfg.viewport.height * 0.8);
    await mouse.scrollBy(delta); moved += delta; await mouse.wait(500);
    await capture("scroll", { note: `scrolled ${Math.round(moved)}px of ${height}px` });
  }
  await mouse.scrollBy(-moved); await mouse.wait(400);
}

/** Click through the page's tabs (e.g. lectures / summaries / quizzes) and capture each. */
async function tabTour() {
  const tabs = page.locator('[role="tab"]:visible');
  const count = Math.min(await tabs.count(), cfg.maxTabsPerPage);
  for (let i = 0; i < count; i++) {
    const tab = tabs.nth(i);
    if ((await tab.getAttribute("aria-selected")) === "true" && i === 0) continue;
    const label = (await tab.innerText().catch(() => "")).trim().replace(/\s+/g, " ").slice(0, 60);
    try {
      const click = await mouse.clickLocator(tab);
      await capture("tab", { click, caption: label || "تبويب", description: "تبويب داخل الصفحة نفسها.", note: `tab ${i + 1}/${count}` });
    } catch { break; }
  }
}

const visited = new Set();
async function tourPage(path, extra = {}) {
  if (visited.has(path)) return;
  visited.add(path);
  const result = await visit(path, extra);
  await capture("page", result);
  await scrollTour();
  await tabTour();
}

// ---------------------------------------------------------------- 1) sign in
log("base:", cfg.baseUrl);
if (cfg.storageState) {
  log("using stored session", cfg.storageState);
  await page.goto(cfg.baseUrl + "/dashboard", { waitUntil: "domcontentloaded" });
  await capture("page", { note: "signed in with a stored session" });
} else {
  await page.goto(cfg.baseUrl + "/login", { waitUntil: "domcontentloaded" });
  await mouse.moveTo(cfg.viewport.width * 0.5, cfg.viewport.height * 0.5);
  await capture("page", { note: "public sign-in page (before any session)" });
  const joinPath = cfg.joinUrl ? new URL(cfg.joinUrl).pathname : cfg.joinToken ? `/join/${cfg.joinToken}` : "";
  if (!joinPath) { console.error("Set JOIN_TOKEN (or JOIN_URL) for a training link, or STORAGE_STATE for a signed-in session."); process.exitCode = 2; }
  else {
    await page.goto(cfg.baseUrl + joinPath, { waitUntil: "domcontentloaded" });
    const name = page.locator("input").first();
    await name.waitFor({ state: "visible" });
    await capture("page", { note: "training-link entry form" });
    await mouse.clickLocator(name);
    await page.keyboard.type(cfg.guestName, { delay: 90 / cfg.speed });
    await mouse.wait(500);
    const button = page.locator("button[type=submit], button").first();
    const click = await mouse.clickLocator(button);
    await page.waitForURL(url => !new URL(url).pathname.startsWith("/join/"), { timeout: cfg.navTimeoutMs }).catch(() => {});
    await capture("page", { click, note: "joined as a guest trainee" });
  }
}

if (!process.exitCode) {
  // ---------------------------------------------------------------- 2) main areas
  await scrollTour(); await tabTour();
  await tourPage("/subjects");
  const subjects = (await hrefs(`^/subjects/${UUID}$`)).slice(0, cfg.maxSubjects);
  log(`${subjects.length} subjects found`);

  for (const subject of subjects) {
    await tourPage(subject.href);
    const base = subject.href;
    const lectureLinks = new Map();
    const collectLectures = async () => { for (const l of await hrefs(`^${base}/lectures/[^/]+$`)) lectureLinks.set(l.href, l.text); };
    await collectLectures();
    const onPage = (await hrefs(`^(${base}/[a-z-]+(\\?section=[a-z]+)?|/summaries\\.html\\?subject=${base.split("/").pop()})$`)).map(s => s.href);
    const ordered = SECTION_ORDER.map(name => (name.startsWith("summaries.html") ? `/summaries.html?subject=${base.split("/").pop()}` : `${base}/${name}`)).filter(href => onPage.includes(href));
    for (const href of ordered) {
      await tourPage(href);
      await collectLectures();
      if (href.endsWith("/exam-material")) {
        const weekly = (await hrefs(`^${base}/exam-material/weekly-tests$`))[0];
        if (weekly) await tourPage(weekly.href);
      }
    }
    // Lectures: always the featured ones (e.g. the newest), then the first few.
    const featured = cfg.featuredLectures.map(rx => new RegExp(rx, "u"));
    const all = [...lectureLinks];
    const chosen = [
      ...all.filter(([, text]) => featured.some(rx => rx.test(text))),
      ...all.filter(([, text]) => !featured.some(rx => rx.test(text))).slice(0, cfg.lecturesPerSubject),
    ];
    for (const [href] of chosen) await tourPage(href);
  }

  // ---------------------------------------------------------------- 3) shared pages
  for (const path of cfg.extraPages) await tourPage(path);
  if (cfg.includeAdmin) for (const path of cfg.adminPages) await tourPage(path);
  await tourPage("/dashboard");
}

// ---------------------------------------------------------------- 4) finish + documentation
await mouse.wait(800);
const video = page.video();
await context.close(); await browser.close();
try {
  const recorded = await video.path();
  await rename(recorded, join(rawDir, "session.webm"));
} catch {
  const files = (await readdir(rawDir)).filter(f => f.endsWith(".webm"));
  if (files[0]) await rename(join(rawDir, files[0]), join(rawDir, "session.webm"));
}

const manifest = {
  generatedAt: new Date().toISOString(),
  baseUrl: cfg.baseUrl, viewport: cfg.viewport, speed: cfg.speed,
  auth: cfg.storageState ? "stored-session" : "training-link",
  steps,
};
await writeFile(join(cfg.outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

const esc = text => String(text).replace(/\|/g, "\\|").replace(/\n/g, " ");
const lines = [
  "# تقرير جولة المنصة", "",
  `- العنوان: ${cfg.baseUrl}`, `- التاريخ: ${manifest.generatedAt}`, `- الدقة: ${cfg.viewport.width}×${cfg.viewport.height}`,
  `- الدخول: ${manifest.auth === "training-link" ? "رابط تدريب (جلسة زائر)" : "جلسة محفوظة"}`, `- عدد اللقطات: ${steps.length}`, "",
  "| # | النوع | المسار | الصفحة | الشرح | اللقطة |", "|---|---|---|---|---|---|",
  ...steps.map(s => `| ${s.index} | ${s.kind} | \`${esc(s.path)}\` | ${esc(s.h1 || s.title)} | ${esc(s.caption)} — ${esc(s.description)} | [${s.file}](shots/${s.file}) |`),
  "", "## تفاصيل كل خطوة", "",
];
for (const s of steps) {
  lines.push(`### ${s.index}. ${s.caption}`, "", `![${s.caption}](shots/${s.file})`, "",
    `- المسار: \`${s.path}\``, `- ما تظهره الصفحة: ${s.description}`,
    ...(s.headings.length ? [`- عناوين ظاهرة: ${s.headings.map(esc).join("، ")}`] : []),
    `- روابط: ${s.links} · أزرار: ${s.buttons} · ارتفاع الصفحة: ${s.pageHeight}px`,
    ...(s.click ? [`- نقرة عند (${s.click.x}, ${s.click.y})`] : []),
    ...(s.note ? [`- ملاحظة: ${esc(s.note)}`] : []),
    ...(s.fullFile ? [`- لقطة الصفحة كاملة: [${s.fullFile}](shots/${s.fullFile})`] : []),
    ...(s.consoleErrors.length ? [`- أخطاء وحدة التحكم: ${s.consoleErrors.map(esc).join(" · ")}`] : []), "");
}
await writeFile(join(cfg.outDir, "REPORT.md"), lines.join("\n"));
log(`done: ${steps.length} screenshots → ${cfg.outDir}`);
