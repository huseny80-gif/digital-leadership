import type { AnchorHTMLAttributes } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("next/navigation", () => ({ usePathname: () => "/subjects/example", useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("next/link", () => ({ default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} data-app-route="true" /> }));
vi.mock("@/lib/api/client", async () => ({ ...await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client"), apiGet: vi.fn() }));
vi.mock("@/components/exam-material/ExamMaterialWorkspace", () => ({ ExamMaterialWorkspace: () => <div data-testid="exam-workspace" /> }));

import { apiGet, ApiError } from "@/lib/api/client";
import { SubjectTabs } from "@/components/content/SubjectTabs";
import { subjectTabs } from "@/components/content/subjectTabs.config";
import { StudyModuleEntry } from "@/components/content/StudyModuleEntry";
import { ALLOWLISTED_STUDY_SUBJECT_IDS, INNOVATION_STUDY_SUBJECT_ID, isStudyModuleDocument, lectureSummaryHref, studyModulesForSubject } from "@/components/content/studyModules";
import LibraryPage from "@/app/(app)/subjects/[subjectId]/library/page";
import ExamPage from "@/app/(app)/subjects/[subjectId]/exam-material/page";

beforeEach(() => { vi.mocked(apiGet).mockReset(); });

describe("approved course study module navigation", () => {
  it("maps summaries for all five UUIDs while keeping the comprehensive exam Innovation-only", () => {
    expect(ALLOWLISTED_STUDY_SUBJECT_IDS).toHaveLength(5);
    for (const subjectId of ALLOWLISTED_STUDY_SUBJECT_IDS) {
      expect(studyModulesForSubject(subjectId)?.summaries).toBe(`/summaries.html?subject=${subjectId}`);
      expect(subjectTabs(subjectId).find(tab => tab.key === "summaries")?.href).toBe(`/summaries.html?subject=${subjectId}`);
    }
    expect(studyModulesForSubject(INNOVATION_STUDY_SUBJECT_ID)?.comprehensive).toBe("/exam-module.html");
    for (const subjectId of ALLOWLISTED_STUDY_SUBJECT_IDS.filter(id => id !== INNOVATION_STUDY_SUBJECT_ID)) {
      expect(studyModulesForSubject(subjectId)?.comprehensive).toBeUndefined();
    }
    for (const subjectId of ["innovation-project-management", "other"]) {
      expect(studyModulesForSubject(subjectId)).toBeNull();
      expect(subjectTabs(subjectId).find(tab => tab.key === "summaries")?.href).toBe(`/subjects/${subjectId}/library?section=summaries`);
    }
  });

  it("keeps the comprehensive test inside exam material without a separate subject tab", () => {
    const tabs = subjectTabs(INNOVATION_STUDY_SUBJECT_ID);
    expect(tabs.map(tab => tab.key)).toEqual(["lectures", "pdf", "summaries", "mind-maps", "assessments", "exam-material", "assignments", "references", "resources", "updates"]);
    expect(tabs.find(tab => tab.key === "exam-material")?.href).toBe(`/subjects/${INNOVATION_STUDY_SUBJECT_ID}/exam-material`);
    expect(tabs.some(tab => tab.key === "comprehensive")).toBe(false);
  });

  it("uses native document links for every published subject summary", () => {
    render(<SubjectTabs tabs={subjectTabs(INNOVATION_STUDY_SUBJECT_ID)} activeKey="exam-material" />);
    const link = screen.getByRole("link", { name: /الملخصات/ });
    expect(link).toHaveAttribute("href", `/summaries.html?subject=${INNOVATION_STUDY_SUBJECT_ID}`);
    expect(link).not.toHaveAttribute("data-app-route");
    expect(screen.getByRole("link", { name: /المادة الامتحانية/ })).toHaveAttribute("aria-current", "page");
  });

  it("resolves the published lecture order, including the legal and ISO exceptions", () => {
    const expected = {
      "2d6c0980-e4d2-4687-9027-cf090b3d1a67": ["ai-l1", "ai-l2", "ai-l3", "ai-l4", "ai-l5", "ai-l6"],
      "bc861a76-620d-4646-81ca-c49d24665b75": ["cs-l1", "cs-l2", "cs-l3", "cs-l4", "cs-l5", "cs-iso-roadmap"],
      [INNOVATION_STUDY_SUBJECT_ID]: ["innovation-01", "innovation-02", "innovation-03", "innovation-04", "innovation-05"],
      "ade09563-02ec-4a09-a97b-58857f6cd876": ["lg-l1", "lg-l3", "lg-l4", "lg-l2", "lg-l5", "lg-l6"],
      "1f4d2071-d1c9-46ee-a848-d5c90eedf287": ["rm-l1", "rm-l2", "rm-l3"],
    } as Record<string, string[]>;
    for (const [subjectId, ids] of Object.entries(expected)) {
      ids.forEach((id, index) => expect(lectureSummaryHref(subjectId, "entry", index + 1)).toBe(`/summaries.html?subject=${subjectId}#${id}`));
    }
    expect(lectureSummaryHref(INNOVATION_STUDY_SUBJECT_ID, "future entry", 6)).toBe(`/subjects/${INNOVATION_STUDY_SUBJECT_ID}/library?section=summaries&entry=future%20entry`);
    expect(lectureSummaryHref("another", "entry/#", 1)).toBe("/subjects/another/library?section=summaries&entry=entry%2F%23");
    expect(isStudyModuleDocument(`/summaries.html?subject=${INNOVATION_STUDY_SUBJECT_ID}#innovation-02`)).toBe(true);
    for (const value of ["https://example.com/summaries.html", "//example.com/exam-module.html", "/summaries.html.evil", "/exam-module.html/extra"]) expect(isStudyModuleDocument(value)).toBe(false);
  });

  it.each(["summaries", "comprehensive"] as const)("shows the %s entry only where approved", section => {
    const { rerender } = render(<StudyModuleEntry subjectId={INNOVATION_STUDY_SUBJECT_ID} section={section} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", section === "summaries" ? `/summaries.html?subject=${INNOVATION_STUDY_SUBJECT_ID}` : "/exam-module.html");
    rerender(<StudyModuleEntry subjectId="other" section={section} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it.each(ALLOWLISTED_STUDY_SUBJECT_IDS)("offers the summary entry for %s", async subjectId => {
    vi.mocked(apiGet).mockImplementation(async path => ({ data: path.endsWith("/library") ? { entries: [] } : { id: subjectId, title: "مادة" } }));
    render(await LibraryPage({ params: Promise.resolve({ subjectId }), searchParams: Promise.resolve({ section: "summaries" }) }));
    expect(screen.getByRole("link", { name: /افتح الملخصات والبودكاست/ })).toHaveAttribute("href", `/summaries.html?subject=${subjectId}`);
  });

  it("adds a comprehensive entry while preserving the exam group workspace", async () => {
    vi.mocked(apiGet).mockResolvedValue({ data: { subject: { id: INNOVATION_STUDY_SUBJECT_ID, title: "الابتكار وإدارة المشاريع" }, groups: [] } });
    render(await ExamPage({ params: Promise.resolve({ subjectId: INNOVATION_STUDY_SUBJECT_ID }), searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("link", { name: /افتح الاختبار الشامل/ })).toHaveAttribute("href", "/exam-module.html");
    expect(screen.getByTestId("exam-workspace")).toBeInTheDocument();
  });

  it("keeps inaccessible course pages behind their existing server API visibility checks", async () => {
    vi.mocked(apiGet).mockRejectedValue(new ApiError({ error: { code: "not_found", message: "not found" } }, 404));
    render(await ExamPage({ params: Promise.resolve({ subjectId: INNOVATION_STUDY_SUBJECT_ID }), searchParams: Promise.resolve({}) }));
    expect(screen.queryByRole("link", { name: /افتح الاختبار الشامل/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId("exam-workspace")).not.toBeInTheDocument();
  });

  it.each(["exam-module.html", "summaries.html"])("keeps %s under its own parent with no cross-link in summaries", page => {
    const html = readFileSync(resolve(process.cwd(), "public", page), "utf8");
    const parent = `/subjects/${INNOVATION_STUDY_SUBJECT_ID}${page === "exam-module.html" ? "/exam-material" : ""}`;
    expect(html.match(/class="platform-link" href="([^"]+)"/)?.[1]).toBe(`https://web-husen4.vercel.app${parent}`);
    if (page === "summaries.html") expect(/href=["'][^"']*exam-module\.html/.test(html)).toBe(false);
  });
});
