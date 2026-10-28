import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const env = process.env;
const num = (value, fallback) => (value === undefined || value === "" || Number.isNaN(Number(value)) ? fallback : Number(value));
const list = value => (value ? value.split(",").map(item => item.trim()).filter(Boolean) : []);

/** Every option can be set from the environment so the tour can be re-run without editing code. */
export function loadConfig() {
  const root = fileURLToPath(new URL("..", import.meta.url));
  return {
    // Where the platform runs, and how the tour signs in.
    baseUrl: (env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
    joinToken: env.JOIN_TOKEN ?? "",            // /join/<token> training link: no account needed
    joinUrl: env.JOIN_URL ?? "",                // or paste the whole link
    guestName: env.GUEST_NAME ?? "زائر العرض التوضيحي",
    storageState: env.STORAGE_STATE ?? "",      // Playwright storage-state JSON for a signed-in (e.g. Google/admin) session
    includeAdmin: env.INCLUDE_ADMIN === "1",    // only meaningful with STORAGE_STATE of an admin
    // Output.
    outDir: resolve(env.OUT_DIR ?? resolve(root, "out")),
    viewport: { width: num(env.WIDTH, 1920), height: num(env.HEIGHT, 1080) },
    locale: env.LOCALE ?? "ar",
    // Pacing: SPEED=0.5 is twice as slow, SPEED=2 twice as fast.
    speed: num(env.SPEED, 1),
    // Coverage limits.
    maxSubjects: num(env.MAX_SUBJECTS, 5),
    scrollStops: num(env.SCROLL_STOPS, 2),       // extra screenshots while scrolling down a long page
    maxTabsPerPage: num(env.MAX_TABS, 5),
    lecturesPerSubject: num(env.LECTURES_PER_SUBJECT, 1),
    featuredLectures: list(env.FEATURED_LECTURES), // regexes: lectures whose title matches are always visited
    fullPageShots: env.FULL_PAGE !== "0",
    extraPages: list(env.EXTRA_PAGES ?? "/subjects?view=lectures,/subjects?view=summaries,/subjects?view=assignments,/subjects?view=assessments,/subjects?view=files,/subjects/reports,/subjects/pdf,/training,/feedback,/about"),
    adminPages: list(env.ADMIN_PAGES ?? "/admin,/admin/subjects,/admin/content,/admin/analytics,/admin/users,/admin/training-access"),
    navTimeoutMs: num(env.NAV_TIMEOUT_MS, 120000),
    warmup: env.WARMUP !== "0",                  // visit the main pages once, off camera, so the recording shows no cold-start waits
  };
}
