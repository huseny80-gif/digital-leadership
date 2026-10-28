import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = fileURLToPath(new URL("..", import.meta.url));
// A local `npm install` wins; the fallbacks cover this repository's web/ package and a global install.
const searchPaths = [here, new URL("../../../web", import.meta.url).pathname, "/opt/node-tools"];

export async function loadChromium() {
  let resolved;
  for (const path of searchPaths) {
    try { resolved = require.resolve("playwright", { paths: [path] }); break; } catch { /* try next */ }
  }
  if (!resolved) throw new Error("Playwright is not installed. Run `npm install` in tools/platform-walkthrough, then `npx playwright install chromium`.");
  const mod = await import(pathToFileURL(resolved).href);
  return (mod.chromium ?? mod.default.chromium);
}
