import { describe, expect, it } from "vitest";
import type { Subject } from "@shared/index";
import { themeForSubject } from "@/lib/content/subjectTheme";

function subject(title: string): Subject {
  return {
    id: "s1",
    title,
    description: null,
    orderIndex: 0,
    status: "published",
    createdBy: "admin",
    createdAt: "",
    updatedAt: "",
  };
}

/**
 * Regression test for a real, confirmed production bug: the subject
 * card theme mapping used exact-string equality against titles typed
 * WITH hamza (إدارة, الأمن), but the real `subjects` table rows drop
 * the hamza (ادارة, الامن) — verified directly against production data
 * — so every card silently fell back to index-based theming instead of
 * its real subject-specific color. These are the five actual titles
 * currently in the production `subjects` table, used verbatim.
 */
describe("themeForSubject", () => {
  it("maps the real production subject titles to their correct themes, regardless of hamza spelling", () => {
    expect(themeForSubject(subject("الذكاء الاصطناعي وتحليل البيانات"), 0)).toBe("ai");
    expect(themeForSubject(subject("الثقافة القانونية والتنظيمية"), 1)).toBe("legal");
    expect(themeForSubject(subject("حوكمة الامن السيبراني"), 2)).toBe("cyber");
    expect(themeForSubject(subject("الابتكار وادارة المشاريع"), 3)).toBe("innovation");
    expect(themeForSubject(subject("ادارة المخاطر واتخاذ القرار"), 4)).toBe("risk");
  });

  it("still maps correctly for the hamza-spelled variants, in any array position", () => {
    expect(themeForSubject(subject("حوكمة الأمن السيبراني"), 0)).toBe("cyber");
    expect(themeForSubject(subject("إدارة المخاطر واتخاذ القرار"), 0)).toBe("risk");
  });

  it("falls back to index-cycling for an unrecognized title instead of breaking", () => {
    expect(themeForSubject(subject("مادة جديدة تمامًا"), 0)).toBe("ai");
    expect(themeForSubject(subject("مادة جديدة تمامًا"), 4)).toBe("risk");
  });
});
