import { describe, expect, it } from "vitest";
import { STUDY_VOICES, arabicCardinal, saudiVoiceScript, SAUDI_SCRIPT_MAX_WORDS } from "@digital-leadership/shared";

describe("Saudi narration script", () => {
  it("spells integers, years, decimals and percentages in words", () => {
    expect(arabicCardinal(0)).toBe("صفر");
    expect(arabicCardinal(17)).toBe("سبعة عشر");
    expect(arabicCardinal(40)).toBe("أربعون");
    expect(arabicCardinal(125)).toBe("مئة وخمسة وعشرون");
    expect(arabicCardinal(2004)).toBe("ألفان وأربعة");
    expect(arabicCardinal(5000)).toBe("خمسة آلاف");
    expect(saudiVoiceScript("بنسبة 40% في ٢٠٠٤").text).toBe("بنسبة أربعون بالمئة في ألفان وأربعة");
    expect(saudiVoiceScript("الإصدار 2.6").text).toBe("الإصدار اثنان فاصلة ستة");
  });
  it("spells acronyms by letter and leaves words inside other tokens alone", () => {
    expect(saudiVoiceScript("API").text).toBe("إي-بي-آي");
    expect(saudiVoiceScript("KPIs").text).toBe("كي-بي-آي-ز");
    expect(saudiVoiceScript("Cybersecurity").text).toBe("الأمن السيبراني");
    expect(saudiVoiceScript("ms-dos2").text).toBe("ms-dos2");
  });
  it("changes function words only and keeps every other word", () => {
    expect(saudiVoiceScript("لذلك يجب الحذر لأن الخطر قائم الآن").text).toBe("عشان كذا يجب الحذر عشان الخطر قائم الحين");
  });
  it("breaks a long sentence at a clause, never inside a phrase, and reports what it cannot split", () => {
    const long = "تقوم الإدارة الالكترونية على استخدام الحاسوب في إنجاز الأعمال، وتعتمد على الشبكات الحديثة في تبادل المعلومات بين الدوائر، لكن ذلك يتطلب ضوابط أمنية واضحة";
    const { text, stats } = saudiVoiceScript(long);
    expect(stats.splits).toBeGreaterThan(0);
    expect(text.replace(/[.،]/g, "").split(/\s+/)).toEqual(long.replace(/[.،]/g, "").split(/\s+/));
    for (const sentence of text.split(/(?<=\.)\s+/)) expect(sentence.split(/\s+/).length).toBeLessThanOrEqual(SAUDI_SCRIPT_MAX_WORDS + 2);
    expect(saudiVoiceScript(Array(30).fill("كلمة").join(" ")).stats.overlong).toBe(1);
  });
  it("offers only the Saudi voices", () => {
    expect(STUDY_VOICES.map(voice => voice.voice)).toEqual(["ar-SA-HamedNeural", "ar-SA-ZariyahNeural"]);
  });
});
