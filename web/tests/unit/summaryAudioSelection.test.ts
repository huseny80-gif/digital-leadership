import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STUDY_COURSES } from "@digital-leadership/shared";

const html = readFileSync(resolve(process.cwd(), "..", "summaries.html"), "utf8");
const script = html.match(/<script id="summaries-script">([\s\S]*?)<\/script>/)![1];
function legacy(search: string, hash = "") {
  document.documentElement.innerHTML = html.match(/<html[^>]*>([\s\S]*)<\/html>/)![1];
  const location = { search, hash, replace: vi.fn() };
  // Execute the exact published redirect without navigating jsdom itself.
  new Function("location", "document", script)(location, document);
  return location;
}
afterEach(() => { document.documentElement.innerHTML = ""; });

describe("subject-aware legacy summary bookmarks", () => {
  it.each(STUDY_COURSES)("opens $slug's protected subject page without rendering other courses", course => {
    const location = legacy(`?subject=${course.id}`, "#rm-l6");
    expect(location.replace).toHaveBeenCalledWith(`https://web-husen4.vercel.app/subjects/${course.id}/summaries#rm-l6`);
    expect(document.querySelector(".platform-link")).toHaveAttribute("href", `https://web-husen4.vercel.app/subjects/${course.id}/summaries`);
    expect(document.querySelector("#subject-select,#summaries-data,audio")).toBeNull();
  });
  it.each(["#lg-l3", "#cs-iso-roadmap", "#lecture-6"])("preserves a legacy/current anchor %s for the subject page's canonical resolver", hash => {
    const course = STUDY_COURSES[0];
    const location = legacy(`?subject=${course.id}`, hash);
    expect(location.replace).toHaveBeenCalledWith(`https://web-husen4.vercel.app/subjects/${course.id}/summaries${hash}`);
  });
  it.each(["", "?subject=../../other", "?subject=https%3A%2F%2Fexample.com", `?subject=${STUDY_COURSES[0].id}&subject=${STUDY_COURSES[1].id}`])("offers the platform subject list for invalid or absent context %s", query => {
    const location = legacy(query);
    expect(location.replace).not.toHaveBeenCalled();
    expect(document.querySelector(".platform-link")).toHaveAttribute("href", "https://web-husen4.vercel.app/subjects");
    expect(document.querySelector("#subject-select,#summaries-data,.lecture-card,audio")).toBeNull();
  });
  it("does not take a destination from caller-controlled redirect parameters", () => {
    const course = STUDY_COURSES[0];
    const location = legacy(`?subject=${course.id}&redirectTo=https://example.com`, "#<script>");
    expect(location.replace).toHaveBeenCalledWith(`https://web-husen4.vercel.app/subjects/${course.id}/summaries`);
  });
});
