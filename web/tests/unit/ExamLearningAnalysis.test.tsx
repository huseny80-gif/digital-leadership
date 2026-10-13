import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ExamContextReference, ExamInstructorGuide as Guide, ExamKnowledgeGapReport } from "@shared/index";
import { ExamInstructorGuide } from "@/components/exam-material/ExamInstructorGuide";
import { ExamKnowledgeGaps } from "@/components/exam-material/ExamKnowledgeGaps";

const reference: ExamContextReference = { paragraphId: "a".repeat(24), fileId: "original", filename: "المحاضرة الأولى مخاطر.pdf", sha256: "b".repeat(64), number: 3, startLine: 17, endLine: 20,
  excerpt: "لا يُعد الخطر مقبولًا إذا تجاوز الأثر 25%، ولا تجوز الاستجابة دون موافقة مالك الخطر." };
const guide: Guide = { groupId: "group", generator: "source-verified-instructor-v2", sourceScope: "current-lecture-files", items: [{ id: reference.paragraphId, lectureId: "lecture", lectureTitle: "المحاضرة الأولى مخاطر", topic: "شروط القرار",
  expectedGap: "قد يحتاج المتدرب إلى توضيح شروط القرار في النص.", discussionQuestion: `كيف تفسّر العبارة «${reference.excerpt}»؟`, references: [reference] }] };
const report: ExamKnowledgeGapReport = { attemptId: "mine", incorrectAnswers: 2, unansweredQuestions: 1, unmappedQuestions: 0,
  gaps: [{ id: "gap", lectureId: "lecture", lectureTitle: "المحاضرة الأولى مخاطر", topic: "شروط القرار", wrongQuestionIds: ["q1", "q2"], unansweredQuestionIds: ["q3"], references: [reference] }] };
const reply = (data: unknown, ok = true) => ({ ok, json: async () => ok ? { data } : { error: { message: "غير مصرح بعرض هذا الدليل." } } });
beforeEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("source-bound review interfaces", () => {
  it("shows precise revision excerpts and lecture links, separating mistakes from unanswered questions", () => {
    render(<ExamKnowledgeGaps subjectId="subject" report={report} />);
    expect(screen.getByRole("heading", { name: /كاشف الثغرات/ })).toBeInTheDocument();
    expect(screen.getByText("2 إجابة غير صحيحة")).toBeInTheDocument();
    expect(screen.getByText("1 سؤال لم تُجب عنه")).toBeInTheDocument();
    expect(screen.getByText(/ولا تُعدّ دليلًا على ضعف معرفي/)).toBeInTheDocument();
    const citation = screen.getByText(reference.filename).closest("details")!;
    expect(citation).not.toHaveAttribute("open"); fireEvent.click(screen.getByText(reference.filename));
    expect(citation).toHaveAttribute("open"); expect(screen.getByText(reference.excerpt)).toBeVisible();
    expect(screen.getByText(/الفقرة 3 · الأسطر 17–20/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /فتح المحاضرة الأصلية/ })).toHaveAttribute("href", "/subjects/subject/lectures/lecture");
  });
  it("reports a perfect attempt without inventing weaknesses or ungrounded references", () => {
    render(<ExamKnowledgeGaps subjectId="subject" report={{ ...report, incorrectAnswers: 0, unansweredQuestions: 0, gaps: [] }} />);
    expect(screen.getByText(/لا توجد فقرات تحتاج إلى مراجعة/)).toBeInTheDocument();
    expect(screen.queryByText(reference.filename)).not.toBeInTheDocument();
  });
  it("loads the private guide only when expanded and retains its source-grounded discussion prompts", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(guide)); vi.stubGlobal("fetch", fetchMock);
    render(<ExamInstructorGuide subjectId="subject" groupId="group" />);
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("دليل المناقشة الذكي للمدير"));
    await screen.findByText(guide.items[0]!.discussionQuestion);
    expect(fetchMock).toHaveBeenCalledOnce(); expect(fetchMock.mock.calls[0]![0]).toBe("/api/admin/subjects/subject/exam-material/group/instructor-guide");
    expect(fetchMock.mock.calls[0]![1].cache).toBe("no-store");
    expect(screen.getByText(/وليست نتائج فعلية عن مستوى المتدربين/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("دليل المناقشة الذكي للمدير")); fireEvent.click(screen.getByText("دليل المناقشة الذكي للمدير"));
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("handles an authorization failure and retries without exposing a partial guide", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(null, false)).mockResolvedValueOnce(reply(guide)); vi.stubGlobal("fetch", fetchMock);
    render(<ExamInstructorGuide subjectId="subject" groupId="group" />); fireEvent.click(screen.getByText("دليل المناقشة الذكي للمدير"));
    await screen.findByRole("alert"); expect(screen.queryByText(guide.items[0]!.discussionQuestion)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    await screen.findByText(guide.items[0]!.discussionQuestion); expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("aborts an outstanding private request when leaving its archived group", async () => {
    const fetchMock = vi.fn().mockImplementation(() => new Promise(() => {})); vi.stubGlobal("fetch", fetchMock);
    const view = render(<ExamInstructorGuide subjectId="subject" groupId="group" />); fireEvent.click(screen.getByText("دليل المناقشة الذكي للمدير"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const signal = fetchMock.mock.calls[0]![1].signal as AbortSignal;
    expect(signal.aborted).toBe(false); view.unmount(); expect(signal.aborted).toBe(true);
  });
  it("reveals analytical decision feedback and precise proof on demand", () => {
    const analytical: ExamKnowledgeGapReport = { ...report, gaps: [{ ...report.gaps[0]!, decisions: [{ questionId: "q1", scenario: "قيّم خطة المسؤول للاستجابة للخطر.",
      selectedOption: "اعتماد الخطة قبل توثيق الموافقة.", expectedOption: "توثيق الموافقة قبل اعتماد الخطة.",
      reason: "تؤخر الخطة الإجراء الذي اشترطه المصدر قبل الاعتماد.", criterion: "ترتيب التوثيق والاعتماد", skill: "prioritization", references: [reference] }] }] };
    render(<ExamKnowledgeGaps subjectId="subject" report={analytical} />);
    const toggle = screen.getByText("تحليل قرارك · ترتيب الإجراءات");
    expect(toggle.closest("details")).not.toHaveAttribute("open");
    fireEvent.click(toggle);
    expect(toggle.closest("details")).toHaveAttribute("open");
    expect(screen.getByText("اعتماد الخطة قبل توثيق الموافقة.")).toBeVisible();
    expect(screen.getByText("توثيق الموافقة قبل اعتماد الخطة.")).toBeVisible();
    expect(screen.getByText("تؤخر الخطة الإجراء الذي اشترطه المصدر قبل الاعتماد.")).toBeVisible();
  });

  it("rejects a legacy or wrong-group response instead of showing saved extraction debris", async () => {
    const damaged = { ...guide, generator: "strict-source-extractive-v1", items: [{ ...guide.items[0]!, discussionQuestion: "io/academic-cv-website/ai/week1 Id Zz Slo" }] };
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(damaged)).mockResolvedValueOnce(reply({ ...guide, groupId: "other" })); vi.stubGlobal("fetch", fetchMock);
    render(<ExamInstructorGuide subjectId="subject" groupId="group" />); fireEvent.click(screen.getByText("دليل المناقشة الذكي للمدير"));
    await screen.findByRole("alert"); expect(screen.queryByText(damaged.items[0]!.discussionQuestion)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    await screen.findByRole("alert"); expect(screen.queryByText(guide.items[0]!.discussionQuestion)).not.toBeInTheDocument();
  });
  it("resets the expanded panel and aborts the previous archive when selection changes", async () => {
    let resolveFirst!: (value: unknown) => void;
    const fresh = { ...guide, groupId: "new-group", items: [{ ...guide.items[0]!, discussionQuestion: "كيف تناقش ضوابط المصدر في المجموعة الجديدة؟" }] };
    const fetchMock = vi.fn().mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; })).mockResolvedValueOnce(reply(fresh)); vi.stubGlobal("fetch", fetchMock);
    const view = render(<ExamInstructorGuide subjectId="subject" groupId="group" />); fireEvent.click(screen.getByText("دليل المناقشة الذكي للمدير"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const signal = fetchMock.mock.calls[0]![1].signal as AbortSignal;
    view.rerender(<ExamInstructorGuide subjectId="subject" groupId="new-group" />);
    expect(signal.aborted).toBe(true); expect(screen.getByText("دليل المناقشة الذكي للمدير").closest("details")).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("دليل المناقشة الذكي للمدير")); await screen.findByText(fresh.items[0]!.discussionQuestion);
    resolveFirst(reply(guide));
    await waitFor(() => expect(screen.queryByText(guide.items[0]!.discussionQuestion)).not.toBeInTheDocument());
    expect(fetchMock.mock.calls[1]![0]).toContain("new-group/instructor-guide");
  });
  it("revalidates on request and reports unreadable lecture evidence without inventing a topic", async () => {
    const fresh = { ...guide, items: [], unavailableLectures: [{ lectureId: "unclear", lectureTitle: "المحاضرة غير الواضحة" }] };
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(guide)).mockResolvedValueOnce(reply(fresh)); vi.stubGlobal("fetch", fetchMock);
    render(<ExamInstructorGuide subjectId="subject" groupId="group" />); fireEvent.click(screen.getByText("دليل المناقشة الذكي للمدير")); await screen.findByText(guide.items[0]!.discussionQuestion);
    fireEvent.click(screen.getByRole("button", { name: "إعادة تدقيق الدليل" }));
    await screen.findByText(/لم يُعتمد محور مناقشة/); expect(screen.getByText(/المحاضرة غير الواضحة/)).toBeInTheDocument();
    expect(screen.queryByText(guide.items[0]!.discussionQuestion)).not.toBeInTheDocument(); expect(fetchMock).toHaveBeenCalledTimes(2);
  });

});
