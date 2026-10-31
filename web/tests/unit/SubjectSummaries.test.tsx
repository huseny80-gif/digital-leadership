import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { STUDY_COURSES } from "@digital-leadership/shared";
import { SubjectSummaries } from "@/components/content/SubjectSummaries";
import { parseSubjectSummaries } from "@/components/content/subjectSummaryData";
import { jsonResponse, summaryFixture } from "./fixtures/subjectSummaries";

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn());
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); });

describe("one subject's academic summaries and lecture podcasts", () => {
  it.each(STUDY_COURSES)("loads only $slug's document and renders its own lecture summaries without a course picker", async course => {
    const data = summaryFixture(course.id, course.lectures);
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ data }));
    const { container } = render(<SubjectSummaries subjectId={course.id} subjectTitle={data.courseTitle} />);
    await screen.findByText(`${course.lectures === 6 ? "٦" : course.lectures === 8 ? "٨" : "٥"}`, { selector: "strong" });
    expect(container.querySelectorAll("details")).toHaveLength(course.lectures);
    expect(screen.queryByRole("combobox", { name: "المادة الدراسية" })).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(`/api/study-modules/${course.id}/summaries`, expect.objectContaining({ credentials: "same-origin", cache: "no-store" }));
    expect(container.querySelectorAll("audio")).toHaveLength(0);
    for (const lecture of data.lectures) {
      expect(container.querySelector(`#lecture-${lecture.number}`)).toHaveTextContent(lecture.sections[0].points[0].text);
      expect(container.querySelector(`#lecture-${lecture.number} a[href='${lecture.sourceHref}']`)).not.toBeNull();
    }
  });

  it("includes all six risk summaries and opens a directly linked sixth lecture", async () => {
    const data = summaryFixture();
    window.history.replaceState(null, "", "/subjects/example/summaries#lecture-6");
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ data }));
    const { container } = render(<SubjectSummaries subjectId={data.subjectId} subjectTitle={data.courseTitle} />);
    await waitFor(() => expect(container.querySelectorAll("details")).toHaveLength(6));
    expect(container.querySelector("#lecture-6")).toHaveProperty("open", true);
    expect(container.querySelector("#summary-text-6")).toHaveTextContent("شرح أكاديمي تجريبي خاص بالمحاضرة 6.");
    expect(screen.getByRole("navigation", { name: `فهرس ملخصات ${data.courseTitle}` }).querySelectorAll("a")).toHaveLength(6);
  });

  it.each([
    ["legal-regulatory", "lg-l3", 2],
    ["legal-regulatory", "lg-l2", 4],
    ["cybersecurity-governance", "cs-iso-roadmap", 8],
    ["risk-management", "rm-l3", 3],
  ] as const)("resolves %s's old #%s bookmark using the current source catalogue", async (slug, catalogId, currentNumber) => {
    const course = STUDY_COURSES.find(item => item.slug === slug)!;
    const data = summaryFixture(course.id, course.lectures);
    Object.assign(data.lectures[currentNumber - 1], { catalogId });
    window.history.replaceState(null, "", `/subjects/${course.id}/summaries#${catalogId}`);
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ data }));
    const { container } = render(<SubjectSummaries subjectId={course.id} subjectTitle={data.courseTitle} />);
    await waitFor(() => expect(container.querySelectorAll("details")).toHaveLength(course.lectures));
    expect(container.querySelector(`#lecture-${currentNumber}`)).toHaveProperty("open", true);
  });

  it.each([401, 404, 500])("shows an actionable status %s without rendering another course", async status => {
    const data = summaryFixture();
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: { code: "unavailable" } }, status));
    const { container } = render(<SubjectSummaries subjectId={data.subjectId} subjectTitle={data.courseTitle} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(status === 401 ? "انتهت صلاحية الدخول" : status === 404 ? "غير متاحة" : "تعذر تحميل");
    expect(container.querySelectorAll("details")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "إعادة تحميل الملخصات" })).toBeInTheDocument();
  });

  it("recovers after an explicit reload and keeps unavailable-source notices separate from usable lectures", async () => {
    const data = summaryFixture();
    data.unavailableLectures.push({ lectureId: data.lectures[0].lectureId, title: data.lectures[0].title, reason: "ملاحظة تجريبية على مرفق إضافي." });
    vi.mocked(fetch).mockRejectedValueOnce(new Error("private diagnostic")).mockResolvedValueOnce(jsonResponse({ data }));
    const { container } = render(<SubjectSummaries subjectId={data.subjectId} subjectTitle={data.courseTitle} />);
    await screen.findByRole("alert");
    expect(screen.queryByText(/private diagnostic/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "إعادة تحميل الملخصات" }));
    await waitFor(() => expect(container.querySelectorAll("details")).toHaveLength(6));
    expect(screen.getByRole("region", { name: "ملاحظات على مصادر المحاضرات" })).toHaveTextContent(data.unavailableLectures[0].reason);
  });

  it("discards a late response from the previous course", async () => {
    const first = summaryFixture(), second = summaryFixture(STUDY_COURSES[0].id, 1);
    let finishFirst!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve; })).mockResolvedValueOnce(jsonResponse({ data: second }));
    const { rerender, container } = render(<SubjectSummaries subjectId={first.subjectId} subjectTitle={first.courseTitle} />);
    rerender(<SubjectSummaries subjectId={second.subjectId} subjectTitle={second.courseTitle} />);
    await waitFor(() => expect(container.querySelectorAll("details")).toHaveLength(1));
    finishFirst(jsonResponse({ data: first }));
    await waitFor(() => expect(container.querySelectorAll("details")).toHaveLength(1));
    expect(container.querySelectorAll("a[href*='" + first.subjectId + "']")).toHaveLength(0);
  });

  it("renders an empty approved course explicitly without creating a fake lecture", async () => {
    const data = summaryFixture(undefined, 0);
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ data }));
    const { container } = render(<SubjectSummaries subjectId={data.subjectId} subjectTitle={data.courseTitle} />);
    expect(await screen.findByText(/لا تتوفر ملخصات معتمدة/)).toBeInTheDocument();
    expect(container.querySelectorAll("details,audio")).toHaveLength(0);
  });

  it("rejects a cross-course response and external or cross-lecture source/audio URLs", () => {
    const data = summaryFixture();
    expect(() => parseSubjectSummaries(data, STUDY_COURSES[0].id)).toThrow(/مطابقة/);
    for (const property of ["sourceHref", "audioUrl"] as const) {
      const bad = structuredClone(data); bad.lectures[0][property] = "https://example.com/unrelated";
      expect(() => parseSubjectSummaries(bad, data.subjectId)).toThrow(/مطابقة/);
    }
    const duplicate = structuredClone(data); duplicate.lectures[1] = duplicate.lectures[0];
    expect(() => parseSubjectSummaries(duplicate, data.subjectId)).toThrow(/مطابقة/);
  });
});
