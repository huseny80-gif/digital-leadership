import { describe, expect, it } from "vitest";
import { proofreadAcademicContent, proofreadArabicHtml, proofreadArabicText, prepareAcademicSpeech } from "@digital-leadership/shared";

describe("source-conservative Arabic proofreading", () => {
  it.each([
    ["األول واألمن واإلدارة واآلثار", "الأول والأمن والإدارة والآثار"],
    ["االبتكار واالصطناعي واالستجابة", "الابتكار والاصطناعي والاستجابة"],
    ["مست مرة وحم اية وتأ ثيرها واإللك تروني", "مستمرة وحماية وتأثيرها والإلكتروني"],
    ["شخصا ً آخر، وعلمٌ واضح", "شخصاً آخر، وعلمٌ واضح"],
    ["من إىل وعىل واألوىل", "من إلى وعلى والأولى"],
  ])("repairs attested extraction damage: %s", (source, expected) => {
    expect(proofreadArabicText(source)).toBe(expected);
    expect(proofreadArabicText(expected)).toBe(expected);
  });
  it("does not invent words or change scientific numbers, negation, formulas, code, links or personal names", () => {
    const original = "لا يجوز الاعتماد دون موافقة سالمة. ٣٫١٪، 10.9، ISO 27001، المادة 32/أولًا. `األمن` https://example.test/األمن?a=1 a@example.test";
    expect(proofreadArabicText(original)).toBe(original);
    expect(proofreadArabicText("غ ير مش كلة مب همة")).toBe("غ ير مش كلة مب همة");
    expect(proofreadArabicText("حوكمة الامن السيبراني والادارة الالكترونية")).toBe("حوكمة الأمن السيبراني والإدارة الإلكترونية");
  });
  it("changes HTML text without rewriting attributes, script/code content or encoded markup", () => {
    const source = '<a href="/األمن" title="األمن > األول">األمن</a><code>األول</code><script>اإلدارة</script><p>&lt;img&gt; األول</p>';
    expect(proofreadArabicHtml(source)).toBe('<a href="/األمن" title="األمن > األول">الأمن</a><code>األول</code><script>اإلدارة</script><p>&lt;img&gt; الأول</p>');
  });
  it("returns a display copy of academic fields without touching immutable keys, stored answers or unrelated data", () => {
    const original = { id: "األمن", sha256: "األمن", filename: "األمن.pdf", href: "/األمن", title: "األمن", options: [{ id: "option", text: "األول" }], references: [{ paragraphId: "original", startLine: 3, endLine: 5, excerpt: "ال يجوز ترك األمن دون مراجعة." }], answerText: "األمن", internalNote: "األمن", message: "األمن", authorName: "األمن", createdAt: new Date("2026-10-16T00:00:00Z") };
    const saved = structuredClone(original), result = proofreadAcademicContent(original);
    expect(original).toEqual(saved); expect(result).not.toBe(original);
    expect(result).toEqual({ ...original, title: "الأمن", options: [{ id: "option", text: "الأول" }], references: [{ ...original.references[0], excerpt: "لا يجوز ترك الأمن دون مراجعة." }] });
    expect(result.createdAt).toBe(original.createdAt);
    expect(proofreadAcademicContent({ quiz: [{ options: ["األول", "األمن"] }], sections: [{ paragraphs: ["اإلدارة"] }] })).toEqual({ quiz: [{ options: ["الأول", "الأمن"] }], sections: [{ paragraphs: ["الإدارة"] }] });
  });
  it("applies the same spelling repair before narration without guessing missing phrases", () => {
    const speech = prepareAcademicSpeech("األمن السيبراني وحم اية البيانات. لا يجوز تجاوز الصلاحيات.");
    expect(speech).not.toMatch(/األ|حم اية/u); expect(speech).toContain("لا يجوز");
  });
});
