import type { AdminOverviewCounts } from "@shared/index";
import { apiGet, ApiError } from "@/lib/api/client";
import { toSafeErrorMessage } from "@/lib/api/errorMessage";
import { ErrorState } from "@/components/ui/States";

const TILES: { key: keyof AdminOverviewCounts; label: string; href: string }[] = [
  { key: "subjects", label: "Subjects", href: "/admin/subjects" },
  { key: "lectures", label: "Lectures", href: "/admin/subjects" },
  { key: "files", label: "Files", href: "/admin/files" },
  { key: "questionBanks", label: "Question Banks", href: "/admin/question-banks" },
  { key: "quizzes", label: "Quizzes", href: "/admin/quizzes" },
  { key: "users", label: "Users", href: "/admin/users" },
];

/**
 * Admin overview (PHASE 09C "Admin Dashboard"). Every number here is a
 * real `count(*)` from `GET /api/v1/admin/overview` — nothing is
 * fabricated or estimated client-side.
 */
export default async function AdminOverviewPage() {
  let counts: AdminOverviewCounts | null = null;
  let errorMessage: string | null = null;

  try {
    const res = await apiGet<AdminOverviewCounts>("/api/v1/admin/overview");
    counts = res.data;
  } catch (err) {
    errorMessage = err instanceof ApiError ? toSafeErrorMessage(err, "the admin overview").message : "Unable to load the admin overview. Please try again.";
  }

  if (errorMessage) {
    return <ErrorState message={errorMessage} retryHref="/admin" />;
  }

  return (
    <section>
      <h1 className="page-heading">Admin Overview</h1>
      <p className="page-subheading">A summary of the platform&apos;s current content and users.</p>

      <div className="card-grid">
        {TILES.map((tile) => (
          <a key={tile.key} href={tile.href} className="card-link">
            <p className="card-title">{counts![tile.key]}</p>
            <p className="card-description">{tile.label}</p>
          </a>
        ))}
      </div>
    </section>
  );
}
