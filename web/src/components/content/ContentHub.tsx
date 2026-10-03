import Link from "next/link";
import type { Assignment, Lecture, LectureItemResponse, Quiz, Subject } from "@shared/index";
import { apiGetPaginated } from "@/lib/api/client";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { PlatformIcon } from "@/components/ui/PlatformIcon";

export const contentViews = { lectures: "المحاضرات", summaries: "الملخصات", assignments: "الواجبات والأنشطة", assessments: "الاختبارات", files: "المصادر والملفات", search: "نتائج البحث" } as const;
export type ContentView = keyof typeof contentViews;
type Entry = { id: string; title: string; subjectTitle: string; href: string; icon: string };

export async function ContentHub({ subjects, view, query = "" }: { subjects: Subject[]; view: ContentView; query?: string }) {
  const entries: Entry[] = [];
  const failures: string[] = [];
  // Work in bounded batches; all reads go through the existing scoped API.
  for (let offset = 0; offset < subjects.length; offset += 5) {
    await Promise.all(subjects.slice(offset, offset + 5).map(async (subject) => {
      try {
        if (["lectures", "summaries", "files", "search"].includes(view)) {
          const lectures = await apiGetPaginated<Lecture>(`/api/v1/subjects/${subject.id}/lectures?page=1&limit=50`);
          if (view === "lectures" || view === "search") entries.push(...lectures.data.map((lecture) => ({ id: `lecture-${lecture.id}`, title: lecture.title, subjectTitle: subject.title, href: `/subjects/${subject.id}/lectures/${lecture.id}`, icon: "video" })));
          if (view !== "lectures") {
            for (let start = 0; start < lectures.data.length; start += 5) {
              await Promise.all(lectures.data.slice(start, start + 5).map(async (lecture) => {
                const items = await apiGetPaginated<LectureItemResponse>(`/api/v1/lectures/${lecture.id}/items?page=1&limit=100`);
                entries.push(...items.data.filter((item) => view === "summaries" ? item.itemType === "summary" : view === "files" ? item.itemType === "pdf" : ["summary", "pdf"].includes(item.itemType)).map((item) => ({ id: `item-${item.id}`, title: item.title, subjectTitle: subject.title, href: `/subjects/${subject.id}/lectures/${lecture.id}`, icon: item.itemType === "pdf" ? "folder" : "document" })));
              }));
            }
          }
        }
        if (view === "assignments" || view === "search") {
          const assignments = await apiGetPaginated<Assignment>(`/api/v1/subjects/${subject.id}/assignments?page=1&limit=50`);
          entries.push(...assignments.data.map((assignment) => ({ id: `assignment-${assignment.id}`, title: assignment.title, subjectTitle: subject.title, href: `/subjects/${subject.id}/assignments/${assignment.id}`, icon: "clipboard" })));
        }
        if (view === "assessments" || view === "search") {
          const quizzes = await apiGetPaginated<Quiz>(`/api/v1/subjects/${subject.id}/quizzes?page=1&limit=50`);
          entries.push(...quizzes.data.map((quiz) => ({ id: `quiz-${quiz.id}`, title: quiz.title, subjectTitle: subject.title, href: `/quizzes/${quiz.id}`, icon: "quiz" })));
        }
      } catch { failures.push(subject.id); }
    }));
  }
  const failed = failures.length > 0;
  const normalize = (value: string) => value.normalize("NFKC").replace(/[\u064B-\u065F\u0670]/g, "").replace(/[أإآ]/g, "ا").toLowerCase();
  const results = entries.filter((entry) => !query || normalize(`${entry.title} ${entry.subjectTitle}`).includes(normalize(query))).sort((a, b) => a.subjectTitle.localeCompare(b.subjectTitle, "ar") || a.title.localeCompare(b.title, "ar"));
  return <section>
    <h1 className="page-heading">{contentViews[view]}</h1>
    {query ? <p className="page-subheading">نتائج البحث عن «{query}»</p> : null}
    {failed ? <ErrorState message="تعذّر تحميل بعض المحتوى. يرجى المحاولة مرة أخرى." retryHref={`/subjects?view=${view}${query ? `&q=${encodeURIComponent(query)}` : ""}`} /> : null}
    {results.length ? <div className="dl-content-hub">{results.map((entry) => <Link href={entry.href} className="dl-hub-row" key={entry.id}><PlatformIcon name={entry.icon} /><span><strong>{entry.title}</strong><small>{entry.subjectTitle}</small></span></Link>)}</div> : !failed ? <EmptyState title="لا توجد نتائج متاحة" message="سيظهر المحتوى هنا فور نشره." /> : null}
  </section>;
}
