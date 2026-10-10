import { describe, expect, it } from "vitest";
import { examSectionPresentation, generateExamReviewArtifacts, academicAudioChapters, libraryEntriesPresentation, uniqueStudyText } from "@digital-leadership/shared";
import type { ExamMaterialSummary, ExamSummarySection, LibraryEntry } from "@shared/index";

describe("source-preserving summary presentation", () => {
  const section: ExamSummarySection = { id: "one", title: "الحوكمة", number: 1, text: "نسخة مرجعية.", keyPoints: ["يجب توثيق الاستجابة.", "تفصيل جديد للمراجعة."],
    topics: [{ title: "الاستجابة", text: "يجب توثيق الاستجابة. لا يجوز النشر دون موافقة.", details: "يجب توثيق الاستجابة. لا يجوز النشر دون موافقة. تحفظ السجلات لمدة 3 سنوات." }],
    concepts: [{ term: "السجل", definition: "توثيق معتمد للإجراء." }, { term: "السجل", definition: "توثيق معتمد للإجراء." }] };
  it("shows overlapping prose once, retains extra details and original concept metadata", () => {
    const original = structuredClone(section), display = examSectionPresentation(section);
    expect(display.topics?.[0]?.details).toBe("تحفظ السجلات لمدة 3 سنوات.");
    expect(display.keyPoints).toEqual(["تفصيل جديد للمراجعة."]); expect(display.concepts).toHaveLength(1);
    expect(display.text.match(/يجب توثيق الاستجابة/g)).toHaveLength(1); expect(section).toEqual(original);
  });
  it("never conflates positive/negative facts, numeric prefixes, decimals or ambiguous diacritics", () => {
    const text = "يجوز النشر. لا يجوز النشر. الحد 1. الحد 10. القيمة 1.0. القيمة 1.5. علم. عِلْم.";
    expect(uniqueStudyText(text)).toBe(text);
    expect(uniqueStudyText("لا يجوز النشر.", ["يجوز النشر."])).toBe("لا يجوز النشر.");
  });
  it("recognizes line-wrapped copies while preserving necessary numbered operations and topic context", () => {
    expect(uniqueStudyText("يدعم النظام إجراء\nالمراجعة. يدعم النظام إجراء المراجعة.")).toBe("يدعم النظام إجراء\nالمراجعة.");
    const steps = "1. راجع المصدر.\n2. عدل القرار.\n3. راجع المصدر.";
    expect(uniqueStudyText(steps)).toBe(steps);
    const result = examSectionPresentation({ ...section, topics: [{ title: "الحالة الأولى", text: steps }, { title: "الحالة الثانية", text: steps }] });
    expect(result.topics?.map(topic => topic.text)).toEqual([steps, steps]);
  });
  it("keeps the entire long source including the tail without repeating the condensed selection", () => {
    const facts = Array.from({ length: 50 }, (_, n) => "يعرض المحور العلمي رقم " + (n + 1) + " تطبيقاً مستقلاً في المؤسسة.");
    const display = examSectionPresentation({ ...section, topics: [{ title: "المحور الكامل", text: facts.filter((_fact, n) => n % 2 === 0).join(" "), details: facts.join(" ") }] });
    for (const fact of facts) expect(display.text.split(fact).length - 1).toBe(1);
    expect(display.text).toContain(facts[49]);
  });
  it("merges overlapping copies of the same named topic while retaining later source additions", () => {
    const shared = "يجب توثيق الاستجابة.", first = "تحفظ السجلات لمدة 3 سنوات.", last = "تراجع صلاحيات الوصول كل شهر.";
    const original = { ...section, topics: [{ title: "الاستجابة", text: shared, details: shared + " " + first }, { title: "الاستجابة", text: shared + " " + last, details: shared + " " + first + " " + last }] };
    const archived = structuredClone(original), display = examSectionPresentation(original);
    expect(display.topics).toHaveLength(1);
    for (const fact of [shared, first, last]) expect(display.text.split(fact).length - 1).toBe(1);
    expect(original).toEqual(archived);
  });
  it("prefers the complete numbered source list over an identical prose copy without erasing repeated ordered steps", () => {
    const fact = "يجب توثيق الاستجابة.", ordered = "1. راجع المصدر.\n2. عدل القرار.\n3. راجع المصدر.";
    const original = { ...section, keyPoints: [fact], topics: [{ title: "الاستجابة", text: fact + "\n\n" + ordered + "\n\n٣. " + fact }] };
    const display = examSectionPresentation(original);
    expect(display.text.split(fact).length - 1).toBe(1); expect(display.text).toContain("٣. " + fact);
    expect(display.text).toContain(ordered); expect(display.keyPoints).toEqual([]);
    expect(uniqueStudyText("القيمة 1.0.", ["القيمة 1."])).toBe("القيمة 1.0.");
  });
  it("deduplicates a glossary rendered in the body without discarding its concept-map definitions", () => {
    const summary: ExamMaterialSummary = { introduction: "", sections: [{ ...section, keyPoints: [], topics: [{ title: "المفاهيم والمصطلحات الأساسية", text: "السجل: توثيق معتمد للإجراء." }] }] };
    const display = examSectionPresentation(summary.sections[0]!);
    expect(display.concepts).toHaveLength(0); expect(display.topics?.[0]?.text).toContain("توثيق معتمد");
    expect(generateExamReviewArtifacts(summary, "مراجعة").mindMap.nodes.filter(node => node.kind === "concept")).toMatchObject([{ label: "السجل", description: "توثيق معتمد للإجراء." }]);
    const spoken = academicAudioChapters(summary).flatMap(chapter => chapter.chunks).join(" ");
    expect(spoken.split("توثيق معتمد للإجراء.").length - 1).toBe(1);
  });
});

describe("regular library summary presentation", () => {
  const entry: LibraryEntry = { id: "summary", title: "الملخص", section: "summaries", description: "يجب توثيق الاستجابة.", keyPoints: ["يجب توثيق الاستجابة.", "لا يجوز النشر دون موافقة."], concepts: [], files: [{ id: "html", filename: "source.html", label: "المصدر", sizeBytes: 100, bodyHtml: "<h2>الاستجابة</h2><p>يجب توثيق الاستجابة.</p>" }], unavailableFiles: [] };
  it("retains the formatted original while showing only metadata absent from it", () => {
    const original = structuredClone(entry), display = libraryEntriesPresentation([entry])[0]!;
    expect(display.description).toBe(""); expect(display.keyPoints).toEqual(["لا يجوز النشر دون موافقة."]);
    expect(display.files[0]!.bodyHtml).toBe(entry.files[0]!.bodyHtml); expect(entry).toEqual(original);
  });
  it("shows an identical inline source once and keeps its secondary attachment available", () => {
    const display = libraryEntriesPresentation([entry, { ...entry, id: "copy" }]);
    expect(display[0]!.files[0]!.bodyHtml).toBeTruthy(); expect(display[1]!.files[0]!.inlineReferenceId).toBe("html");
    expect(display[1]!.files[0]).toMatchObject({ id: "html", filename: "source.html" });
    const filtered = libraryEntriesPresentation([display[1]!]);
    expect(filtered[0]!.files[0]!.inlineReferenceId).toBeUndefined();
    expect(filtered[0]!.files[0]!.bodyHtml).toBe(entry.files[0]!.bodyHtml);
  });
});
