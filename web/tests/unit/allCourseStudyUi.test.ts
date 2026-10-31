import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STUDY_COURSES, STUDY_VOICES, type StudySummaryDocument, type StudyExamDocument, type StudyModuleLecture, type StudyPracticeQuestion } from "@digital-leadership/shared";

const loader = readFileSync(resolve(process.cwd(), "..", "assets/study-module-loader.js"), "utf8");
const summaryHtml = readFileSync(resolve(process.cwd(), "..", "summaries.html"), "utf8");
const examHtml = readFileSync(resolve(process.cwd(), "..", "exam-module.html"), "utf8");
// Install the production shared loader once, as on a real document navigation.
window.eval(loader);
const lectureId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", sourceHash = "b".repeat(64), textHash = "c".repeat(64);
function fixture(subject = STUDY_COURSES[0].id as string) {
  const course = STUDY_COURSES.find(course => course.id === subject)!;
  const lecture: StudyModuleLecture = { id: `${course.anchor}-01`, lectureId, number: 1, title: "المحاضرة الأولى — بيانات تجريبية للواجهة", filename: "ملف تجريبي.pdf", sha256: sourceHash, sourceHref: `/subjects/${subject}/lectures/${lectureId}`, overview: "تمهيد من مصدر تجريبي للاختبار.", sections: [{ heading: "محور تجريبي", points: [{ term: "مفهوم تجريبي", text: "شرح موجز مخصص لاختبارات الواجهة." }] }], transcript: "نص تجريبي مطابق للاختبار المحلي.", summarySha256: textHash, audioUrl: `/api/study-modules/${subject}/${lectureId}/audio.mp3?revision=${textHash}` };
  const summaries: StudySummaryDocument = { live: true, subjectId: subject, courseTitle: "مقرر تجريبي: " + course.slug, revision: subject.replaceAll("-", "").padEnd(64, "a"), voices: STUDY_VOICES.map(({ id, label }) => ({ id, label })), lectures: [lecture], unavailableLectures: [] };
  const formats = ["multiple_choice", "true_false", "match", "order", "essay", "short_scenario"] as const;
  const questions: StudyPracticeQuestion[] = formats.map((type, index) => ({ id: String(index + 1).padStart(24, "a"), lecture: 1, type, level: "medium", prompt: `سؤال تجريبي لصيغة ${type} من بيانات الواجهة.`, explanation: "تفسير تجريبي من المصدر المحلي.", references: [0], ...(["multiple_choice", "true_false"].includes(type) ? { options: ["الإجابة التجريبية الصحيحة", "بديل تجريبي"], correctIndex: 0 } : {}), ...(type === "match" ? { pairs: [{ left: "مصطلح تجريبي ١", right: "تعريف تجريبي ١" }, { left: "مصطلح تجريبي ٢", right: "تعريف تجريبي ٢" }] } : {}), ...(type === "order" ? { items: ["مرحلة تجريبية أولى", "مرحلة تجريبية ثانية", "مرحلة تجريبية ثالثة"] } : {}), ...(["essay", "short_scenario"].includes(type) ? { model: ["عنصر إجابة تجريبي للمراجعة الذاتية."] } : {}) }));
  const exam: StudyExamDocument = { ...summaries, policy: "local-ui-fixture", questions, references: [{ lectureId, fileId: "fixture", sha256: sourceHash, filename: "ملف تجريبي.pdf", number: 1, startLine: 1, endLine: 3, excerpt: "مرجع تجريبي للاختبار المحلي." }] };
  return { summaries, exam };
}
async function render(kind: "summaries" | "exam", subject: string, data: unknown, status = 200) {
  window.history.replaceState(null, "", `/${kind === "exam" ? "exam-module" : "summaries"}.html?subject=${subject}`);
  const html = kind === "exam" ? examHtml : summaryHtml, scriptId = kind === "exam" ? "module-script" : "summaries-script";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => ({ data }) }));
  document.documentElement.innerHTML = html.match(/<html[^>]*>([\s\S]*)<\/html>/)![1];
  await window.eval(html.match(new RegExp(`<script id="${scriptId}">([\\s\\S]*?)<\\/script>`))![1]);
}
beforeEach(() => {
  localStorage.clear();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.documentElement.innerHTML = ""; localStorage.clear(); window.history.replaceState(null, "", "/"); });

describe("shared study experience for every course", () => {
  // The summaries page no longer loads a course from the API: it embeds study-data.json and
  // selects the course by ?subject. A lecture missing from that data never appears on the page.
  it.each(STUDY_COURSES)("lists every published lecture of $slug in the summaries page data", course => {
    const embedded = JSON.parse(summaryHtml.match(/<script type="application\/json" id="summaries-data">([\s\S]*?)<\/script>/)![1]!) as { subjects: Array<{ id: string }>; lectures: Array<{ subjectId: string; catalogLectureId: string; number: number }> };
    const catalog = JSON.parse(readFileSync(resolve(process.cwd(), "..", "backend/content/finquiz/catalog.json"), "utf8")) as { subjects: Array<{ id: string; lectures: Array<{ id: string; status: string; number: number }> }> };
    const published = catalog.subjects.find(subject => subject.id === course.slug)!.lectures.filter(lecture => lecture.status === "published");
    const shown = embedded.lectures.filter(lecture => lecture.subjectId === course.id);
    expect(embedded.subjects.some(subject => subject.id === course.id)).toBe(true);
    expect(shown.map(lecture => lecture.catalogLectureId).sort()).toEqual(published.map(lecture => lecture.id).sort());
    expect(new Set(shown.map(lecture => lecture.number)).size).toBe(shown.length);
  });
  it.each(STUDY_COURSES)("loads $slug's comprehensive exam with all six formats and source-based feedback", async course => {
    const data = fixture(course.id).exam; await render("exam", course.id, data);
    expect(document.querySelector("main .eyebrow")!.textContent).toBe(data.courseTitle);
    expect(document.querySelector("#bank-count")!.textContent).toBe("٦");
    const filter = document.querySelector<HTMLSelectElement>("#type-filter")!;
    for (const question of data.questions) {
      filter.value = question.type; filter.dispatchEvent(new Event("change"));
      expect(document.querySelector(".question-title")!.textContent).toContain(question.prompt);
    }
    expect(document.querySelector("audio")).toBeNull();
    expect(document.querySelector<HTMLAnchorElement>(".platform-link")!.href).toContain(`/subjects/${course.id}/exam-material`);
    expect(fetch).toHaveBeenCalledWith(`/api/study-modules/${course.id}/exam`, expect.objectContaining({ credentials: "same-origin" }));
  });
});
