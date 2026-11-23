import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReflectiveQuestions } from "@/components/content/ReflectiveQuestions";
import { subjectTabs } from "@/components/content/subjectTabs.config";
import { SUBJECT_STUDY_IDS } from "@/components/content/studyModules";
import { reflectiveQuestions } from "@/content/reflectiveQuestions";

describe("Dr. Saad reflective questions tab", () => {
  it("appears only in the legal and organizational course, right after the exam material", () => {
    const legal = subjectTabs(SUBJECT_STUDY_IDS.legal).map(tab => tab.key);
    expect(legal).toEqual(["lectures", "pdf", "summaries", "mind-maps", "assessments", "exam-material", "reflective-questions", "assignments", "references", "resources", "updates"]);
    const tab = subjectTabs(SUBJECT_STUDY_IDS.legal).find(item => item.key === "reflective-questions")!;
    expect(tab).toMatchObject({ label: "الأسئلة الفكرية الخمسة عشر د. سعد", count: 15, href: `/subjects/${SUBJECT_STUDY_IDS.legal}/reflective-questions` });
    for (const id of [SUBJECT_STUDY_IDS.ai, SUBJECT_STUDY_IDS.cybersecurity, SUBJECT_STUDY_IDS.risk, "other"]) expect(subjectTabs(id).some(item => item.key === "reflective-questions")).toBe(false);
  });
  it("carries all fifteen complete answers in order and never republishes the file's student credit", () => {
    expect(reflectiveQuestions.questions.map(item => item.number)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    for (const item of reflectiveQuestions.questions) {
      expect(item.question.length).toBeGreaterThan(15);
      expect(item.shortAnswer.length).toBeGreaterThan(20);
      expect(item.theoreticalBasis.length).toBeGreaterThan(40);
      expect(item.detailedAnswer).toHaveLength(2);
      expect(item.recommendations).toHaveLength(3);
      expect(item.conclusion.length).toBeGreaterThan(15);
    }
    expect(reflectiveQuestions.references).toHaveLength(5);
    expect(JSON.stringify(reflectiveQuestions)).not.toMatch(/حسين ياسين|ياسين حسن|شعبة|@/u);
  });
  it("renders every question with its answer sections and references", () => {
    const { container } = render(<ReflectiveQuestions />);
    expect(container.querySelectorAll("details")).toHaveLength(15);
    expect(screen.getAllByText("التوصيات التنفيذية")).toHaveLength(15);
    expect(screen.getByRole("link", { name: "السؤال 15" })).toHaveAttribute("href", "#question-15");
    expect(screen.getByText(/Schein, E\. H\. \(2010\)/)).toBeInTheDocument();
  });
});
