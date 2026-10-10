import { describe, expect, it } from "vitest";
import { ACADEMIC_VOICES, academicAudioChapters, academicSpeechSegments, prepareAcademicSpeech } from "@digital-leadership/shared";
import type { ExamMaterialSummary } from "@shared/index";

describe("conservative academic spoken text", () => {
  it("cleans formatting and vocalizes known contextual terms without rewriting the source", () => {
    const source = "## علم البيانات\n**الحوكمة** و[الذكاء الاصطناعي](https://example.com) — حكم القانون [12].";
    expect(prepareAcademicSpeech(source)).toBe("عِلْم البيانات الحَوْكَمَة والذَّكاء الاِصْطِناعِيّ — حُكْم القانون.");
    expect(source).toContain("**الحوكمة**");
    expect(prepareAcademicSpeech("حُكْم قانوني وعِلْم مختلف، علم أن القرار صحيح.")).toBe("حُكْم قانوني وعِلْم مختلف، علم أن القرار صحيح.");
  });
  it("preserves negation, numbers, existing diacritics, identifiers and mathematical operators", () => {
    const source = "لا يُسمح بالنشر؛ 2*3=6، foo_bar، ISO 27001:2022 و2.5 و2026/10/10.";
    expect(prepareAcademicSpeech(source)).toBe(source.replace("ISO", "آيزو"));
    expect(prepareAcademicSpeech("API وAI وGPT وPDF")).toBe("إيه بي آي وإيه آي وجي بي تي وبي دي إف");
  });
  it("keeps every word including the last sentence when splitting long academic text", () => {
    const text = Array.from({ length: 700 }, (_, n) => `مفهوم${n}`).join(" ") + " خاتمة محفوظة.";
    const chunks = academicSpeechSegments(text);
    expect(chunks.length).toBeGreaterThan(1); expect(chunks.every(chunk => chunk.length <= 650)).toBe(true);
    expect(chunks.join(" ")).toBe(text);
    expect(academicSpeechSegments("الجزء الأول. الجزء الثاني. الخاتمة.", 26)).toEqual(["الجزء الأول. الجزء الثاني.", "الخاتمة."]);
  });
  it("separates headings and chapters with longer pauses and leaves source summaries unchanged", () => {
    const summary: ExamMaterialSummary = { introduction: "مقدمة علمية.", sections: [{ id: "lecture", number: 1, title: "الحوكمة", text: "النص.", keyPoints: [], topics: [{ title: "علم البيانات", text: "التعلم مهم. لا يمكن إهمال المتابعة.", details: "تفصيل إضافي." }] }] };
    const original = structuredClone(summary), chapters = academicAudioChapters(summary);
    expect(summary).toEqual(original); expect(chapters.map(chapter => chapter.id)).toEqual(["introduction", "lecture"]);
    const segments = chapters[1]!.segments!;
    expect(segments[0]).toMatchObject({ kind: "title", text: "الحَوْكَمَة.", pauseAfterMs: 1200 });
    expect(segments[1]).toMatchObject({ kind: "heading", text: "عِلْم البيانات.", pauseAfterMs: 900 });
    expect(segments[2]).toMatchObject({ kind: "body", pauseAfterMs: 350 });
    expect(segments.at(-1)?.pauseAfterMs).toBe(1400);
    expect(chapters[1]!.chunks).toEqual(segments.map(segment => segment.text));
  });
  it("has distinct actual Iraqi male and female personas rather than pitch variations", () => {
    expect(ACADEMIC_VOICES).toHaveLength(6);
    expect(ACADEMIC_VOICES.filter(voice => voice.locale === "ar-IQ").map(voice => [voice.id, voice.gender])).toEqual([["ar-IQ-BasselNeural", "male"], ["ar-IQ-RanaNeural", "female"]]);
  });
});
