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
  it.each(STUDY_COURSES)("loads $slug summaries and six voices with only that course's source/audio paths", async course => {
    const data = fixture(course.id).summaries;
    await render("summaries", course.id, data);
    expect(document.querySelector("main .eyebrow")!.textContent).toBe(data.courseTitle);
    expect(document.querySelectorAll(".lecture-card")).toHaveLength(1);
    expect(document.querySelector("#recording-count")!.textContent).toContain("يُجهّز عند التشغيل");
    const card = document.getElementById(data.lectures[0]!.id)!, select = card.querySelector<HTMLSelectElement>(".player select")!;
    expect(select.options).toHaveLength(6);
    for (const voice of STUDY_VOICES) {
      select.value = voice.id; select.dispatchEvent(new Event("change"));
      const audio = card.querySelector<HTMLAudioElement>("audio")!;
      expect(audio.querySelector("source")!.getAttribute("src")).toBe(data.lectures[0]!.audioUrl + "&voice=" + voice.id);
      expect(audio.autoplay).toBe(false); expect(audio.preload).toBe("none");
    }
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(`/api/study-modules/${course.id}/summaries`, expect.objectContaining({ credentials: "same-origin", cache: "no-store" }));
    expect(card.querySelector(".summary-actions a")!.getAttribute("href")).toBe(data.lectures[0]!.sourceHref);
    expect(document.querySelector<HTMLAnchorElement>(".platform-link")!.href).toContain(`/subjects/${course.id}`);
  });
  it("keeps native seek/rate/download bound to the selected voice and ignores old audio events", async () => {
    const data = fixture().summaries; await render("summaries", data.subjectId, data);
    const card = document.querySelector(".lecture-card")!, first = card.querySelector<HTMLAudioElement>("audio")!, select = card.querySelector<HTMLSelectElement>(".player select")!;
    select.value = "iraqi-female"; select.dispatchEvent(new Event("change"));
    const audio = card.querySelector<HTMLAudioElement>("audio")!;
    first.dispatchEvent(new Event("loadedmetadata"));
    expect(card.querySelector<HTMLButtonElement>(".audio-back")!.disabled).toBe(true);
    Object.defineProperty(audio, "duration", { value: 300 }); audio.dispatchEvent(new Event("loadedmetadata"));
    audio.currentTime = 20;
    card.querySelector<HTMLButtonElement>(".audio-back")!.click(); expect(audio.currentTime).toBe(5);
    card.querySelector<HTMLButtonElement>(".audio-forward")!.click(); expect(audio.currentTime).toBe(20);
    const rate = card.querySelector<HTMLSelectElement>(".audio-rate")!; rate.value = "1.15"; rate.dispatchEvent(new Event("change")); expect(audio.playbackRate).toBe(1.15);
    expect(card.querySelector(".download-audio")!.getAttribute("href")).toContain("voice=iraqi-female");
    expect(card.querySelector(".transcript-link")!.getAttribute("href")).toBe("#text-" + data.lectures[0]!.id);
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
  it.each([401, 404, 503])("shows an actionable status %s without rendering Innovation as a fallback", async status => {
    const subject = STUDY_COURSES[1].id; await render("summaries", subject, null, status);
    expect(document.querySelector<HTMLElement>("#main")!.hidden).toBe(true);
    expect(document.querySelectorAll(".lecture-card")).toHaveLength(0);
    expect(document.querySelector("#study-load-status")!.getAttribute("role")).toBe("alert");
    expect(document.querySelector("#study-load-status button")!.textContent).toBe("إعادة المحاولة");
  });
  it("rejects a cross-course payload and an injected audio/source URL before rendering", async () => {
    const requested = STUDY_COURSES[1].id, wrong = fixture(STUDY_COURSES[0].id).summaries;
    await render("summaries", requested, wrong);
    expect(document.querySelector<HTMLElement>("#main")!.hidden).toBe(true);
    const data = fixture(requested).summaries; data.lectures[0]!.audioUrl = "https://example.com/not-the-source.mp3";
    await render("summaries", requested, data);
    expect(document.querySelector<HTMLElement>("#main")!.hidden).toBe(true); expect(document.querySelector("audio")).toBeNull();
  });
  it("lists unavailable source files explicitly while keeping the verified summaries usable", async () => {
    const data = fixture().summaries; data.unavailableLectures.push({ lectureId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", title: "محاضرة تجريبية تحتاج معالجة", reason: "لم يُعتمد ملخص مطابق بعد." });
    await render("summaries", data.subjectId, data);
    expect(document.querySelector('[aria-label="محاضرات تحتاج مراجعة"]')!.textContent).toContain(data.unavailableLectures[0]!.reason);
    expect(document.querySelectorAll(".lecture-card")).toHaveLength(1);
  });
});
