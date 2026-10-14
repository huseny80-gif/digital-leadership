import { describe, expect, it } from "vitest";
import { isCyberRiskHeading } from "../../src/contentAutomation/separateCyberRiskSixthLecture.js";
import { courseLabelsForSubject } from "../../src/contentAutomation/courseSourceLabels.js";
import { subjectMapping } from "../../src/finquiz/catalog.js";

describe("the administrator's fifth versus sixth cyber source distinction", () => {
  it("identifies an explicit risk-management heading in the document itself", () => {
    for (const text of ["المحاضرة الخامسة\nإدارة المخاطر السيبرانية\nالمقدمة", "إدارة مخاطر الأمن السيبراني", "Cyber Risk Management\nCOBIT 2019 integration"]) expect(isCyberRiskHeading(text)).toBe(true);
  });
  it("does not turn COBIT or a generic risk mention into a sixth lecture", () => {
    for (const text of ["إطار COBIT 2019\nإدارة المخاطر السيبرانية ضمن الحوكمة", "المحاضرة الخامسة\nحوكمة تكنولوجيا المعلومات وإدارة الموارد", "ISO 27001\nالمخاطر السيبرانية"]) expect(isCyberRiskHeading(text)).toBe(false);
  });
  it("keeps the supplied Cybersecurety5 spelling assigned to fifth", () => {
    const labels = courseLabelsForSubject(subjectMapping["cybersecurity-governance"]!)!;
    expect(labels.label("Cybersecurety5.pdf")).toBe("المحاضرة الخامسة في حوكمة الأمن السيبراني.pdf");
    expect(labels.numberOf("Cybersecurety5")).toBe(5);
  });
});
