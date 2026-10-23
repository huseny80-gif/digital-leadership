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
import { INNOVATION_STUDY_SUBJECT_ID, isStudyModuleDocument, lectureSummaryHref, studyModulesForSubject } from "@/components/content/studyModules";
import LibraryPage from "@/app/(app)/subjects/[subjectId]/library/page";
import ExamPage from "@/app/(app)/subjects/[subjectId]/exam-material/page";

beforeEach(() => { vi.mocked(apiGet).mockReset(); });

describe("approved course study module navigation", () => {
  it("uses the actual existing Innovation UUID and preserves every other course's destinations", () => {
    const catalog = readFileSync(resolve(process.cwd(), "../backend/src/finquiz/catalog.ts"), "utf8");
    expect(catalog).toContain(`"innovation-project-management": "${INNOVATION_STUDY_SUBJECT_ID}"`);
    for (const subjectId of ["2d6c0980-e4d2-4687-9027-cf090b3d1a67", "ade09563-02ec-4a09-a97b-58857f6cd876", "bc861a76-620d-4646-81ca-c49d24665b75", "1f4d2071-d1c9-46ee-a848-d5c90eedf287", "innovation-project-management", "other"]) {
      expect(studyModulesForSubject(subjectId)).toBeNull();
      expect(subjectTabs(subjectId).find(tab => tab.key === "summaries")?.href).toBe(`/subjects/${subjectId}/library?section=summaries`);
      expect(subjectTabs(subjectId).some(tab => tab.key === "comprehensive")).toBe(false);
    }
  });

  it("places the comprehensive test beside ordinary quizzes without replacing quiz or group routes", () => {
    const tabs = subjectTabs(INNOVATION_STUDY_SUBJECT_ID);
    expect(tabs.map(tab => tab.key)).toEqual(["lectures", "pdf", "summaries", "mind-maps", "assessments", "comprehensive", "exam-material", "assignments", "references", "resources", "updates"]);
    expect(tabs.find(tab => tab.key === "assessments")?.href).toBe(`/subjects/${INNOVATION_STUDY_SUBJECT_ID}/assessments`);
    expect(tabs.find(tab => tab.key === "exam-material")?.href).toBe(`/subjects/${INNOVATION_STUDY_SUBJECT_ID}/exam-material`);
  });

  it("uses native document links for the published HTML and app navigation for existing sections", () => {
    render(<SubjectTabs tabs={subjectTabs(INNOVATION_STUDY_SUBJECT_ID)} activeKey="exam-material" />);
    for (const [name, href] of [[/الملخصات/, "/summaries.html"], [/الاختبار الشامل/, "/exam-module.html"]] as const) {
      const link = screen.getByRole("link", { name });
      expect(link).toHaveAttribute("href", href);
      expect(link).not.toHaveAttribute("data-app-route");
      expect(link).not.toHaveAttribute("target");
    }
    expect(screen.getByRole("link", { name: /المادة الامتحانية/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /المحاضرات/ })).toHaveAttribute("data-app-route", "true");
  });

  it("resolves each of the five lecture summary anchors and safely falls back for other content", () => {
    const html = readFileSync(resolve(process.cwd(), "public/summaries.html"), "utf8");
    const data = JSON.parse(html.match(/<script type="application\/json" id="summaries-data">([\s\S]*?)<\/script>/)![1]!);
    for (const lecture of data.lectures) expect(lectureSummaryHref(INNOVATION_STUDY_SUBJECT_ID, "entry", lecture.number)).toBe(`/summaries.html#${lecture.id}`);
    expect(lectureSummaryHref(INNOVATION_STUDY_SUBJECT_ID, "future entry", 6)).toBe(`/subjects/${INNOVATION_STUDY_SUBJECT_ID}/library?section=summaries&entry=future%20entry`);
    expect(lectureSummaryHref("another", "entry/#", 1)).toBe("/subjects/another/library?section=summaries&entry=entry%2F%23");
    expect(isStudyModuleDocument("/summaries.html#innovation-02")).toBe(true);
    for (const value of ["https://example.com/summaries.html", "//example.com/exam-module.html", "/summaries.html.evil", "/exam-module.html/extra"]) expect(isStudyModuleDocument(value)).toBe(false);
  });

  it.each(["summaries", "comprehensive"] as const)("shows the %s entry only in its matching course", section => {
    const { rerender } = render(<StudyModuleEntry subjectId={INNOVATION_STUDY_SUBJECT_ID} section={section} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", section === "summaries" ? "/summaries.html" : "/exam-module.html");
    rerender(<StudyModuleEntry subjectId="other" section={section} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("keeps a bookmarked summaries URL readable and adds its podcast entry", async () => {
    vi.mocked(apiGet).mockImplementation(async path => ({ data: path.endsWith("/library") ? { entries: [] } : { id: INNOVATION_STUDY_SUBJECT_ID, title: "الابتكار وإدارة المشاريع" } }));
    render(await LibraryPage({ params: Promise.resolve({ subjectId: INNOVATION_STUDY_SUBJECT_ID }), searchParams: Promise.resolve({ section: "summaries" }) }));
    expect(screen.getByRole("link", { name: /افتح الملخصات والبودكاست/ })).toHaveAttribute("href", "/summaries.html");
    expect(apiGet).toHaveBeenCalledWith(`/api/v1/subjects/${INNOVATION_STUDY_SUBJECT_ID}/library`);
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

  it.each(["exam-module.html", "summaries.html"])("returns from %s to the actual course rather than the platform homepage", page => {
    const html = readFileSync(resolve(process.cwd(), "public", page), "utf8");
    expect(html).toContain(`class="platform-link" href="https://web-husen4.vercel.app/subjects/${INNOVATION_STUDY_SUBJECT_ID}"`);
  });
});
