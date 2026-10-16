import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AcademicExamPaper } from "@shared/index";
import { ExamAcademicPaper } from "@/components/exam-material/ExamAcademicPaper";

const source = { paragraphId: "a".repeat(24), fileId: "file", filename: "المحاضرة الأولى.pdf", sha256: "a".repeat(64), number: 1, startLine: 4, endLine: 6 };
const paper: AcademicExamPaper = { policy: "strict-academic-exam-v1", groupId: "group", title: "المراجعة", questionSectionTitle: "أسئلة المادة الامتحانية", answerSectionTitle: "نموذج الإجابة وتوزيع الدرجات", totalPoints: 12,
  distribution: [{ type: "multiple_choice", count: 1, points: 2 }, { type: "short_answer", count: 1, points: 4 }, { type: "case_study", count: 1, points: 6 }],
  questions: ["multiple_choice", "short_answer", "case_study"].map((type, index) => ({ id: `q${index}`, type: type as "multiple_choice" | "short_answer" | "case_study", lectureId: "lecture", lectureTitle: "المحاضرة الأولى", prompt: `سؤال تطبيقي ${index + 1}`, instructions: "علّل قرارك وفق المحاضرة.", points: (index + 1) * 2, options: ["خطة أولى", "خطة ثانية", "خطة ثالثة"], sources: [source] })) };
const reviewed: AcademicExamPaper = { ...paper, answerKey: [{ questionId: "q0", modelAnswer: "الإجابة النموذجية المحمية", explanation: "تفسير موثق", correctOptionIndex: 1,
  rubric: [{ criterion: "صحة القرار", expected: "قرار موثق", points: 2, references: [{ ...source, excerpt: "الاقتباس الأصلي المحمي" }] }], optionReviews: [] }] };
const response = (value: AcademicExamPaper) => new Response(JSON.stringify({ data: value }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("academic exam questions and protected marking scheme", () => {
  it("loads on demand and displays all response formats, marks and source locations without a hidden answer key", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(paper)); vi.stubGlobal("fetch", fetcher);
    render(<ExamAcademicPaper subjectId="course" groupId="group" />);
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /الورقة الامتحانية الأكاديمية/u }));
    expect(await screen.findByRole("heading", { name: "أسئلة المادة الامتحانية" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "نموذج الإجابة وتوزيع الدرجات" })).toBeInTheDocument();
    expect(screen.getAllByRole("table")).toHaveLength(1);
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.getByText("الدرجة الكلية: ١٢")).toBeInTheDocument();
    expect(screen.getByText(/يتاح نموذج الإجابة للمدير/u)).toBeInTheDocument();
    expect(screen.queryByText("الإجابة النموذجية المحمية")).not.toBeInTheDocument();
    expect(screen.queryByText("الاقتباس الأصلي المحمي")).not.toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledWith("/api/exam-material/course/group/academic-paper", expect.objectContaining({ cache: "no-store" }));
  });
  it("shows the authorized marking scheme and removes stale answers immediately when the attempt changes", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response(reviewed)); vi.stubGlobal("fetch", fetcher);
    const view = render(<ExamAcademicPaper subjectId="course" groupId="group" attemptId="graded" />);
    fireEvent.click(screen.getByRole("button", { name: /الورقة الامتحانية الأكاديمية/u }));
    expect(await screen.findByText("الإجابة النموذجية المحمية")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "معايير تصحيح السؤال ١" })).toBeInTheDocument();
    expect(screen.getByText("البديل الصحيح: ب")).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("?attemptId=graded"), expect.anything());
    fetcher.mockImplementationOnce(() => new Promise(() => {}));
    view.rerender(<ExamAcademicPaper subjectId="course" groupId="group" />);
    expect(screen.queryByText("الإجابة النموذجية المحمية")).not.toBeInTheDocument();
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    const signal = fetcher.mock.calls.at(-1)![1].signal as AbortSignal;
    view.unmount(); await act(async () => {}); expect(signal.aborted).toBe(true);
  });
  it("keeps unavailable source evidence retryable instead of substituting fabricated questions", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "لا تتوفر أدلة مكتملة." } }), { status: 400 })).mockResolvedValueOnce(response(paper));
    vi.stubGlobal("fetch", fetcher);
    render(<ExamAcademicPaper subjectId="course" groupId="group" />);
    fireEvent.click(screen.getByRole("button", { name: /الورقة الامتحانية الأكاديمية/u }));
    expect(await screen.findByRole("alert")).toHaveTextContent("لا تتوفر أدلة مكتملة.");
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    expect(await screen.findByRole("heading", { name: "أسئلة المادة الامتحانية" })).toBeInTheDocument();
  });
});
