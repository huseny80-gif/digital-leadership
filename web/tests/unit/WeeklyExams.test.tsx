import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { WeeklyExamCollection, WeeklyExamPaper } from "@shared/index";
import { WeeklyExams } from "@/components/exam-material/WeeklyExams";
const source = { filename: "اختبار الأسبوع الأول.pdf", sha256: "a".repeat(64), pages: 2 };
const paper: WeeklyExamPaper = { id: "week-1", title: "الأسبوع الأول", kind: "weekly", week: 1, suggestedMinutes: 15, questionCount: 2, totalPoints: 2, source,
  questions: [1, 2].map(number => ({ id: `week-1-q${number}`, number, type: "multiple_choice", difficulty: "medium", points: 1, prompt: `سؤال تدريبي ${number}`,
    options: ["خيار أول", "خيار ثانٍ", "خيار ثالث", "خيار رابع"], questionReference: { ...source, page: 1 } })) };
const collection: WeeklyExamCollection = { policy: "test", title: "اختبارات د. ضياء الأسبوعية", solutionNote: "حلول تعليمية.", papers: [paper] };
const answer = { questionId: "week-1-q1", correctIndex: 1, modelAnswer: "خيار ثانٍ", rationale: "تغذية راجعة موثقة.", grading: "automatic", isCorrect: false };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("checks an actual choice, retains feedback when going back and downloads two different papers", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: answer }))); vi.stubGlobal("fetch", fetcher);
  render(<WeeklyExams subjectId="course" collection={collection} initialPaper={paper} />);
  expect(screen.queryByText(answer.rationale)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "تحقق من الإجابة" })).toBeDisabled();
  fireEvent.click(screen.getByRole("radio", { name: /خيار أول/u })); fireEvent.click(screen.getByRole("button", { name: "تحقق من الإجابة" }));
  expect(await screen.findByText(answer.rationale)).toBeInTheDocument();
  expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual({ questionId: "week-1-q1", selectedIndex: 0 });
  fireEvent.click(screen.getByRole("button", { name: "السؤال التالي" })); expect(screen.getByRole("heading", { name: "سؤال تدريبي 2" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "السؤال السابق" })); expect(screen.getByText(answer.rationale)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "ورقة الأسئلة PDF" })).toHaveAttribute("href", "/api/weekly-exams/course/week-1/paper.pdf");
  expect(screen.getByRole("link", { name: "الحل النموذجي PDF" })).toHaveAttribute("href", "/api/weekly-exams/course/week-1/paper.pdf?answers=1");
});
it("shows all questions without fetching hidden answers, then requests the model explicitly", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [answer] }))); vi.stubGlobal("fetch", fetcher);
  render(<WeeklyExams subjectId="course" collection={collection} initialPaper={paper} />);
  fireEvent.click(screen.getByRole("button", { name: "الورقة الامتحانية" })); expect(screen.getAllByRole("article")).toHaveLength(2); expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "نموذج الإجابة والتغذية الراجعة" })); expect(await screen.findByText(answer.rationale)).toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledWith("/api/weekly-exams/course/week-1/solutions", expect.objectContaining({ cache: "no-store" }));
});
it("keeps the open question independent and never transmits or auto-grades a draft", async () => {
  const open: WeeklyExamPaper = { ...paper, id: "open-book", kind: "open_book", week: null, questionCount: 1, questions: [{ ...paper.questions[0]!, id: "open-book-q1", type: "case_study", options: [], proposedPoints: true }] };
  const model = { questionId: "open-book-q1", correctIndex: null, grading: "manual", modelAnswer: [{ heading: "فرضية تطبيقية", text: "تخطيط مقيد بالمصدر." }], rationale: "مراجعة ذاتية." };
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: model }))); vi.stubGlobal("fetch", fetcher);
  render(<WeeklyExams subjectId="course" collection={collection} initialPaper={open} />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "مسودة المتدرب الخاصة" } });
  fireEvent.click(screen.getByRole("button", { name: "عرض الإجابة النموذجية ومعايير التصحيح" })); expect(await screen.findByText("تخطيط مقيد بالمصدر.")).toBeInTheDocument();
  expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual({ questionId: "open-book-q1" }); expect(screen.queryByText("إجابة صحيحة")).not.toBeInTheDocument();
});
