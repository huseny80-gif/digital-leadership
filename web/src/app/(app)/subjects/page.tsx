import type { Subject } from "@shared/index";
import { apiGetPaginated } from "@/lib/api/client";
import { toSafeErrorMessage } from "@/lib/api/errorMessage";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { SubjectCard } from "@/components/content/SubjectCard";
import { ContentHub, contentViews, type ContentView } from "@/components/content/ContentHub";
import { getSubjectTheme, subjectThemes } from "@/components/content/subjectTheme";

export const metadata = { title: "المواد الدراسية | القيادة الرقمية" };

/**
 * Subjects listing (API_V1.md `GET /subjects`). The backend already
 * filters to only what this caller is authorized to see (published
 * subjects for a `user`, plus drafts for an `admin` — API_V1.md
 * "Visibility") — this page renders exactly what it receives and applies
 * no additional client-side filtering, since frontend filtering must
 * never be treated as an authorization boundary (PHASE 09A explicit
 * instruction).
 */
export default async function SubjectsPage({ searchParams }: { searchParams?: Promise<{ view?: string; q?: string }> }) {
  const params = await searchParams;
  let subjects: Subject[] = [];
  let errorMessage: string | null = null;

  try {
    const result = await apiGetPaginated<Subject>("/api/v1/subjects?page=1&limit=50");
    subjects = result.data;
  } catch (err) {
    errorMessage = toSafeErrorMessage(err, "subjects").message;
  }

  if (!errorMessage && params?.view && Object.hasOwn(contentViews, params.view)) {
    return <ContentHub subjects={subjects} view={params.view as ContentView} query={params.q?.trim().slice(0, 200)} />;
  }
  const orderedSubjects = [...subjects].sort((a, b) => subjectThemes.indexOf(getSubjectTheme(a.title)) - subjectThemes.indexOf(getSubjectTheme(b.title)) || a.orderIndex - b.orderIndex);

  return (
    <section>
      <h1 className="page-heading">المواد الدراسية</h1>
      <p className="page-subheading">اختر المادة للاطلاع على محاضراتها وملخصاتها واختباراتها.</p>

      {errorMessage ? <ErrorState message={errorMessage} retryHref="/subjects" /> : null}

      {!errorMessage && subjects.length === 0 ? (
        <EmptyState
          title="لا توجد مواد متاحة حاليًا"
          message="ستظهر المواد هنا فور نشرها."
        />
      ) : null}

      {!errorMessage && subjects.length > 0 ? (
        <div className="dl-subject-grid dl-subject-grid--compact">
          {orderedSubjects.map((subject, index) => (
            <SubjectCard key={subject.id} subject={subject} index={index} compact />
          ))}
        </div>
      ) : null}
    </section>
  );
}
