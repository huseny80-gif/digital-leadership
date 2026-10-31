import type { AnchorHTMLAttributes } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { STUDY_COURSES } from "@digital-leadership/shared";

vi.mock("next/navigation", () => ({ usePathname: () => "/subjects/example/summaries" }));
vi.mock("next/link", () => ({ default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} data-app-route="true" /> }));

import { SubjectTabs } from "@/components/content/SubjectTabs";
import { subjectTabs } from "@/components/content/subjectTabs.config";
import { StudyModuleEntry } from "@/components/content/StudyModuleEntry";
import { lectureSummaryHref, studyModulesForSubject } from "@/components/content/studyModules";

describe("subject-owned summaries and podcast navigation", () => {
  it.each(STUDY_COURSES)("opens only $slug's own summaries page from its subject tab", course => {
    render(<SubjectTabs tabs={subjectTabs(course.id)} activeKey="summaries" />);
    const link = screen.getByRole("link", { name: /الملخصات والبودكاست/ });
    expect(link).toHaveAttribute("href", `/subjects/${course.id}/summaries`);
    expect(link).toHaveAttribute("aria-current", "page");
    expect(link).toHaveAttribute("data-app-route", "true");
  });

  it.each(STUDY_COURSES)("keeps $slug's summary entry and final numbered lecture in that subject", course => {
    render(<StudyModuleEntry subjectId={course.id} section="summaries" />);
    expect(screen.getByRole("link", { name: /افتح الملخصات والبودكاست/ }))
      .toHaveAttribute("href", `/subjects/${course.id}/summaries`);
    expect(studyModulesForSubject(course.id)?.summaries).toBe(`/subjects/${course.id}/summaries`);
    expect(lectureSummaryHref(course.id, "entry", course.lectures))
      .toBe(`/subjects/${course.id}/summaries#lecture-${course.lectures}`);
  });

  it("links risk lectures four, five and six to their own academic summary instead of the library fallback", () => {
    const course = STUDY_COURSES.find(course => course.slug === "risk-management")!;
    for (const number of [4, 5, 6]) {
      expect(lectureSummaryHref(course.id, `risk-entry-${number}`, number))
        .toBe(`/subjects/${course.id}/summaries#lecture-${number}`);
    }
  });

  it("does not assign an unknown course or an invalid lecture number to another subject's summary", () => {
    expect(studyModulesForSubject("unknown")).toBeNull();
    expect(lectureSummaryHref("unknown", "entry/#", 1)).toBe("/subjects/unknown/library?section=summaries&entry=entry%2F%23");
    const course = STUDY_COURSES[0];
    expect(lectureSummaryHref(course.id, "entry", 0)).toBe(`/subjects/${course.id}/library?section=summaries&entry=entry`);
  });
});
