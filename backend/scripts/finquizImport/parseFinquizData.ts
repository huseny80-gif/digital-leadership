import { createRequire } from "node:module";
import { readdirSync } from "node:fs";
import path from "node:path";
import type { FinquizSubject } from "./types.js";

/**
 * Reads every `data/subjects/*.js` file from a Finquiz checkout.
 *
 * Handles both quote formats found in the source repo (Phase 19 §1):
 * `ai-data.js`/`innovation-project-management.js`/`legal-regulatory.js`
 * use double-quoted JSON-object-literal style; `cybersecurity-governance.js`/
 * `risk-management.js` use single-quoted JS-object style. Both are plain
 * CommonJS modules (`module.exports = SUBJECT` inside an IIFE that checks
 * `typeof module !== 'undefined'`), so both parse identically via a
 * regular `require()` — no `eval`/`new Function` needed, and no
 * quote-format-specific regex parsing that could silently miss one style
 * (as a first, discarded pass at this during Phase 19's analysis did).
 *
 * This module performs no writes anywhere — it only reads files from
 * `sourceDir` and returns parsed data in memory.
 */
export function parseFinquizSubjects(sourceDir: string): FinquizSubject[] {
  const require = createRequire(import.meta.url);
  const files = readdirSync(sourceDir).filter(
    (f) => f.endsWith(".js") && f !== "index.js",
  );

  const subjects: FinquizSubject[] = [];
  for (const file of files) {
    const absolutePath = path.resolve(sourceDir, file);
    // `require`'s module cache is irrelevant here (each file's `id` is
    // unique, this runs once per process), but delete defensively in
    // case this function is ever called twice in one process (e.g. a
    // future test) against a modified fixture on disk.
    delete require.cache[require.resolve(absolutePath)];
    const subject = require(absolutePath) as FinquizSubject;
    if (!subject || typeof subject.id !== "string") {
      throw new Error(`${file} did not export a valid Finquiz subject object (missing 'id').`);
    }
    subjects.push(subject);
  }

  // Stable order: Finquiz's own data/subjects/index.js order, falling
  // back to alphabetical for anything not listed there.
  const orderFile = path.resolve(sourceDir, "index.js");
  try {
    delete require.cache[require.resolve(orderFile)];
    const order = require(orderFile) as string[];
    subjects.sort((a, b) => {
      const ai = order.indexOf(a.id);
      const bi = order.indexOf(b.id);
      if (ai === -1 && bi === -1) return a.id.localeCompare(b.id);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  } catch {
    subjects.sort((a, b) => a.id.localeCompare(b.id));
  }

  return subjects;
}
