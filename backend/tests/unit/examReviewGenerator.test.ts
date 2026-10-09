import { describe, expect, it } from "vitest";
import { examChallengeSeconds, examReadiness, examSectionNarration, generateExamReviewArtifacts, speechChunks } from "@digital-leadership/shared";
import type { ExamMaterialSummary } from "@shared/index";

const summary: ExamMaterialSummary = { introduction: "مراجعة المحاضرات المختارة.", sections: [
  { id: "one", number: 1, title: "المحاضرة الأولى", text: "محتوى أصلي", keyPoints: ["تُراجع الأولويات بانتظام."], objectives: ["فهم أثر المخاطر."], topics: [{ title: "التحليل", text: "يُدرس احتمال الخطر وأثره.", details: "تُوثّق النتيجة." }], concepts: [{ term: "الخَطَر", definition: "حدث محتمل يؤثر في الأهداف." }] },
  { id: "two", number: 2, title: "المحاضرة الثانية", text: "نص من المصدر الثاني.", keyPoints: [], concepts: [{ term: "الخطر", definition: "تعريف من المحاضرة الثانية." }, { term: "الأثر", definition: "نتائج وقوع الحدث." }] },
] };
describe("source-grounded mock review generators", () => {
  it("preserves source definitions, makes stable IDs, and links only explicitly shared terms", () => {
    const original = structuredClone(summary), generated = generateExamReviewArtifacts(summary, "مجموعة محاضرات (1-2)");
    expect(summary).toEqual(original);
    expect(generated).toEqual(generateExamReviewArtifacts(summary, "مجموعة محاضرات (1-2)"));
    expect(generated.generator).toBe("source-mock-v1");
    expect(new Set(generated.mindMap.nodes.map(node => node.id)).size).toBe(generated.mindMap.nodes.length);
    expect(generated.mindMap.nodes.find(node => node.label === "الخَطَر")?.description).toBe(summary.sections[0]!.concepts![0]!.definition);
    expect(generated.mindMap.edges.filter(edge => edge.kind === "shared")).toHaveLength(1);
    for (const edge of generated.mindMap.edges) expect(generated.mindMap.nodes.some(node => node.id === edge.from) && generated.mindMap.nodes.some(node => node.id === edge.to)).toBe(true);
    expect(JSON.stringify(generated)).not.toContain("ISO 27001");
  });
  it("narrates every expanded summary section and preserves the end of long text", () => {
    const text = `${Array.from({ length: 800 }, (_, index) => `مصطلح${index}`).join(" ")} خاتمة محفوظة`;
    const chunks = speechChunks(text);
    expect(chunks.every(chunk => chunk.length <= 350)).toBe(true);
    expect(chunks.join(" ")).toBe(text);
    const lecture = examSectionNarration(summary.sections[0]!);
    for (const text of ["فهم أثر المخاطر.", "يُدرس احتمال الخطر وأثره.", "تُوثّق النتيجة.", "حدث محتمل يؤثر في الأهداف.", "تُراجع الأولويات بانتظام."]) expect(lecture).toContain(text);
    expect(generateExamReviewArtifacts(summary, "مراجعة").audioChapters.map(chapter => chapter.lectureId)).toEqual([null, "one", "two"]);
  });
  it("bounds challenge duration and describes readiness from the actual percentage", () => {
    expect(examChallengeSeconds(1)).toBe(300); expect(examChallengeSeconds(20)).toBe(1800); expect(examChallengeSeconds(200)).toBe(7200);
    expect(examReadiness(80).tone).toBe("strong"); expect(examReadiness(60).tone).toBe("developing"); expect(examReadiness(0).tone).toBe("review");
  });
});
