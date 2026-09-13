import type { Subject } from "@shared/index";
import { apiGetPaginated } from "@/lib/api/client";
import { toSafeErrorMessage } from "@/lib/api/errorMessage";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { SubjectCard } from "@/components/content/SubjectCard";

export const metadata = { title: "Subjects | Digital Leadership" };

/**
 * Subjects listing (API_V1.md `GET /subjects`). The backend already
 * filters to only what this caller is authorized to see (published
 * subjects for a `user`, plus drafts for an `admin` — API_V1.md
 * "Visibility") — this page renders exactly what it receives and applies
 * no additional client-side filtering, since frontend filtering must
 * never be treated as an authorization boundary (PHASE 09A explicit
 * instruction).
 */
export default async function SubjectsPage() {
  let subjects: Subject[] = [];
  let errorMessage: string | null = null;

  try {
    const result = await apiGetPaginated<Subject>("/api/v1/subjects?page=1&limit=50");
    subjects = result.data;
  } catch (err) {
    errorMessage = toSafeErrorMessage(err, "subjects").message;
  }

  return (
    <section>
      <h1 className="page-heading">Subjects</h1>
      <p className="page-subheading">Browse all available subjects.</p>

      {errorMessage ? <ErrorState message={errorMessage} retryHref="/subjects" /> : null}

      {!errorMessage && subjects.length === 0 ? (
        <EmptyState
          title="No subjects available yet"
          message="Check back soon — new subjects will appear here once they're published."
        />
      ) : null}

      {!errorMessage && subjects.length > 0 ? (
        <div className="card-grid">
          {subjects.map((subject) => (
            <SubjectCard key={subject.id} subject={subject} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
