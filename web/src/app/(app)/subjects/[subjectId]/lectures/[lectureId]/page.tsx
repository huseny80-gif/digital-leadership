import type { Lecture, LectureItemResponse } from "@shared/index";
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
  let notFound = false;
  let errorMessage: string | null = null;

  try {
    const [lectureRes, itemsRes] = await Promise.all([
      apiGet<Lecture>(`/api/v1/lectures/${lectureId}`),
      apiGetPaginated<LectureItemResponse>(`/api/v1/lectures/${lectureId}/items?page=1&limit=100`),
    ]);
    lecture = lectureRes.data;
    items = itemsRes.data;
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
          { label: "Subject", href: `/subjects/${subjectId}` },
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
