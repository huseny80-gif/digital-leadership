import Link from "next/link";
import type { Lecture, LectureItemResponse, LectureProgress, Subject } from "@shared/index";
import { apiGet, apiGetPaginated, ApiError } from "@/lib/api/client";
import { toSafeErrorMessage } from "@/lib/api/errorMessage";
import { EmptyState, ErrorState, NotFoundState } from "@/components/ui/States";
import { LectureItemCard } from "@/components/content/LectureItemCard";
import { getLectureLibraryEntries, LibraryEntryContent } from "@/components/content/LibraryContent";
import { LectureCompleteToggle } from "@/components/content/LectureCompleteToggle";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { LectureTabs } from "@/components/content/LectureTabs";

/**
 * Lecture detail (API_V1.md `GET /lectures/:lectureId`,
 * `GET /lectures/:lectureId/items`). Route kept nested under
 * `/subjects/[subjectId]/` — the structure already scaffolded since
 * Phase 4 — rather than adding a duplicate flat `/lectures/[lectureId]`
 * route, per PHASE 09A's "preserve [the existing route structure] rather
 * than creating duplicate routes." `subjectId` is used only for the
 * breadcrumb link; the actual lecture (and its visibility) is resolved
 * entirely from `lectureId` against the backend, which independently
 * re-derives and enforces the subject relationship
 * (`FilesRepository`/`ContentRepository`'s visibility joins) regardless
 * of what this URL segment says.
 *
 * Phase 21.3 — Lecture Learning Flow Upgrade: adds a "Lecture N of M"
 * position indicator and Previous/Next navigation, both computed from the
 * subject's own lecture list (`GET /subjects/:subjectId/lectures`,
 * already ordered `order_index asc, title asc` server-side — the same
 * endpoint the subject overview page already uses, no new API). Both are
 * best-effort: if that list fails to load, or this lecture isn't found in
 * it (e.g. its subject_id has drifted from the URL segment), the page
 * still renders — it just omits the position/nav UI rather than fabricate
 * an ordering that isn't confirmed.
 */
export default async function LectureDetailPage({
  params,
}: {
  params: Promise<{ subjectId: string; lectureId: string }>;
}) {
  const { subjectId, lectureId } = await params;

  let lecture: Lecture | null = null;
  let items: LectureItemResponse[] = [];
  let subjectTitle = "Subject";
  let siblingLectures: Lecture[] = [];
  let progress: LectureProgress | null = null;
  let notFound = false;
  let errorMessage: string | null = null;

  try {
    const [lectureRes, itemsRes] = await Promise.all([
      apiGet<Lecture>(`/api/v1/lectures/${lectureId}`),
      apiGetPaginated<LectureItemResponse>(`/api/v1/lectures/${lectureId}/items?page=1&limit=100`),
    ]);
    lecture = lectureRes.data;
    items = itemsRes.data;

    // Best-effort only, in every case below — none of these gate this
    // page's visibility, which the lecture/items fetch above already
    // handled. Safe fallbacks (a generic breadcrumb label, no prev/next
    // nav, no completion toggle) are used instead of an error state.
    try {
      const subjectRes = await apiGet<Subject>(`/api/v1/subjects/${subjectId}`);
      subjectTitle = subjectRes.data.title;
    } catch {
      // keep the fallback label
    }
    try {
      const lecturesRes = await apiGetPaginated<Lecture>(
        `/api/v1/subjects/${subjectId}/lectures?page=1&limit=50`,
      );
      siblingLectures = lecturesRes.data;
    } catch {
      // keep siblingLectures empty — position/prev-next UI is simply omitted
    }
    try {
      const progressRes = await apiGet<LectureProgress>(`/api/v1/lectures/${lectureId}/progress`);
      progress = progressRes.data;
    } catch {
      // keep progress null — the completion toggle is simply omitted
    }
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound = true;
    } else {
      errorMessage = toSafeErrorMessage(err, "this lecture").message;
    }
  }

  if (notFound) {
    return <NotFoundState message="This lecture doesn't exist or is not available." />;
  }

  if (errorMessage) {
    return <ErrorState message={errorMessage} retryHref={`/subjects/${subjectId}/lectures/${lectureId}`} />;
  }

  const currentIndex = siblingLectures.findIndex((l) => l.id === lectureId);
  const libraryEntries = await getLectureLibraryEntries(lecture!.subjectId, lecture!.id);
  const hasPosition = currentIndex !== -1 && siblingLectures.length > 0;
  const previousLecture = hasPosition && currentIndex > 0 ? siblingLectures[currentIndex - 1] : null;
  const nextLecture =
    hasPosition && currentIndex < siblingLectures.length - 1 ? siblingLectures[currentIndex + 1] : null;

  return (
    <section>
      <Breadcrumbs
        items={[
          { label: "Subjects", href: "/subjects" },
          { label: subjectTitle, href: `/subjects/${subjectId}` },
          { label: lecture!.title },
        ]}
      />

      <h1 className="page-heading">{lecture!.title}</h1>
      <LectureTabs subjectId={lecture!.subjectId} lectures={siblingLectures} activeId={lecture!.id} />
      <div className="dl-library-list">{libraryEntries.map(entry => <LibraryEntryContent key={entry.id} subjectId={lecture!.subjectId} entry={entry} />)}</div>
      <p className="item-row-meta" style={{ marginBottom: "var(--space-2)" }}>
        {subjectTitle}
        {hasPosition ? ` · Lecture ${currentIndex + 1} of ${siblingLectures.length}` : null}
      </p>
      {lecture!.description ? <p className="page-subheading">{lecture!.description}</p> : null}

      {progress ? <LectureCompleteToggle lectureId={lectureId} initialCompleted={progress.completed} /> : null}

      <Link href={`/subjects/${subjectId}`} className="btn btn-secondary" style={{ marginBottom: "var(--space-5)", display: "inline-flex" }}>
        Back to subject
      </Link>

      {items.length === 0 && libraryEntries.length === 0 ? (
        <EmptyState title="No content yet" message="Content for this lecture will appear here once published." />
      ) : items.length > 0 ? (
        <ul className="item-list" style={{ listStyle: "none", padding: 0 }}>
          {items.map((item) => (
            <LectureItemCard key={item.id} item={item} />
          ))}
        </ul>
      ) : null}

      {previousLecture || nextLecture ? (
        <nav className="lecture-nav" aria-label="Lecture navigation">
          {previousLecture ? (
            <Link
              href={`/subjects/${subjectId}/lectures/${previousLecture.id}`}
              className="lecture-nav-link"
              data-direction="previous"
            >
              <span className="lecture-nav-label">← Previous</span>
              <span className="lecture-nav-title">{previousLecture.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {nextLecture ? (
            <Link
              href={`/subjects/${subjectId}/lectures/${nextLecture.id}`}
              className="lecture-nav-link"
              data-direction="next"
            >
              <span className="lecture-nav-label">Next →</span>
              <span className="lecture-nav-title">{nextLecture.title}</span>
            </Link>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}
