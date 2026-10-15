import { describe, expect, it } from "vitest";
import { ACADEMIC_SPEECH_SEGMENT_LIMIT, ACADEMIC_VOICES, academicAudioChapters, academicSpeechSegments, prepareAcademicSpeech } from "@digital-leadership/shared";
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
    expect(chunks.length).toBeGreaterThan(1); expect(chunks.every(chunk => chunk.length <= ACADEMIC_SPEECH_SEGMENT_LIMIT)).toBe(true);
    expect(chunks.join(" ")).toBe(text);
    expect(academicSpeechSegments("الجزء الأول. الجزء الثاني. الخاتمة.", 26)).toEqual(["الجزء الأول. الجزء الثاني.", "الخاتمة."]);
  });
  it("synthesizes headings with their paragraphs, preserving semantic pauses and the source", () => {
    const summary: ExamMaterialSummary = { introduction: "مقدمة علمية.", sections: [{ id: "lecture", number: 1, title: "الحوكمة", text: "النص.", keyPoints: [], topics: [{ title: "علم البيانات", text: "التعلم مهم. لا يمكن إهمال المتابعة.", details: "تفصيل إضافي." }] }] };
    const original = structuredClone(summary), chapters = academicAudioChapters(summary);
    expect(summary).toEqual(original); expect(chapters.map(chapter => chapter.id)).toEqual(["introduction", "lecture"]);
    const segments = chapters[1]!.segments!;
    expect(segments).toHaveLength(1);
    expect(segments[0]!.kind).toBe("body");
    expect(segments[0]!.text).toBe("الحَوْكَمَة.\n\nعِلْم البيانات.\n\nالتَّعَلُّم مهم. لا يمكن إهمال المتابعة.\n\nتفصيل إضافي.");
    expect(segments.at(-1)?.pauseAfterMs).toBe(900);
    expect(chapters[1]!.chunks).toEqual(segments.map(segment => segment.text));
  });
  it("preserves continuing intonation across long paragraphs without adding full stops mid-sentence", () => {
    const text = Array.from({ length: 750 }, (_, n) => `مفهوم${n}`).join(" ") + " خاتمة محفوظة.";
    const summary: ExamMaterialSummary = { introduction: "", sections: [{ id: "lecture", number: 1, title: "عنوان معتمد", text, keyPoints: [] }] };
    const segments = academicAudioChapters(summary)[0]!.segments!;
    expect(segments.length).toBeGreaterThan(1);
    expect(segments.every(segment => segment.text.length <= ACADEMIC_SPEECH_SEGMENT_LIMIT)).toBe(true);
    expect(segments[0]!.text).toMatch(/^عنوان معتمد\.\n\nمفهوم0 /);
    expect(segments.map(segment => segment.text).join(" ").replace(/^عنوان معتمد\.\n\n/, "")).toBe(text);
    expect(segments.slice(0, -1).every(segment => !segment.text.endsWith(".") && segment.pauseAfterMs === 0)).toBe(true);
    expect(academicSpeechSegments("مفهوم أول واضح، مفهوم ثان واضح، مفهوم ثالث واضح.", 35)).toEqual(["مفهوم أول واضح، مفهوم ثان واضح،", "مفهوم ثالث واضح."]);
  });
  it("has distinct Iraqi male and female synthetic voices rather than pitch variations", () => {
    expect(ACADEMIC_VOICES).toHaveLength(6);
    expect(ACADEMIC_VOICES.filter(voice => voice.locale === "ar-IQ").map(voice => [voice.id, voice.gender])).toEqual([["ar-IQ-BasselNeural", "male"], ["ar-IQ-RanaNeural", "female"]]);
  });
});
