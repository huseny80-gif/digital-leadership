import type { Lecture, LectureItemResponse, Subject } from "@shared/index";
import { apiGet, apiGetPaginated, ApiError } from "@/lib/api/client";
import { toSafeErrorMessage } from "@/lib/api/errorMessage";
import { EmptyState, ErrorState, NotFoundState } from "@/components/ui/States";
import { LectureItemCard } from "@/components/content/LectureItemCard";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";

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
  let notFound = false;
  let errorMessage: string | null = null;

  try {
    const [lectureRes, itemsRes] = await Promise.all([
      apiGet<Lecture>(`/api/v1/lectures/${lectureId}`),
      apiGetPaginated<LectureItemResponse>(`/api/v1/lectures/${lectureId}/items?page=1&limit=100`),
    ]);
    lecture = lectureRes.data;
    items = itemsRes.data;

    // Best-effort only — the breadcrumb falls back to a generic "Subject"
    // label if this fails; the lecture/items fetch above is what actually
    // gates this page's visibility, not this lookup (Phase 21.2 audit:
    // this previously hardcoded the literal word "Subject" instead of the
    // real title, unlike every other subject-scoped page).
    try {
      const subjectRes = await apiGet<Subject>(`/api/v1/subjects/${subjectId}`);
      subjectTitle = subjectRes.data.title;
    } catch {
      // keep the fallback label
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
      {lecture!.description ? <p className="page-subheading">{lecture!.description}</p> : null}

      {items.length === 0 ? (
        <EmptyState title="No content yet" message="Content for this lecture will appear here once published." />
      ) : (
        <ul className="item-list" style={{ listStyle: "none", padding: 0 }}>
          {items.map((item) => (
            <LectureItemCard key={item.id} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}
