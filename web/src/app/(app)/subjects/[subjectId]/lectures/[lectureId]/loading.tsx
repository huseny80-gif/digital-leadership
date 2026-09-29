import { LoadingState } from "@/components/ui/States";

/**
 * Phase 21.3 — Next.js route-level loading boundary for the lecture
 * detail page (App Router `loading.tsx` convention), shown while the
 * Server Component's data fetches (lecture, items, subject title,
 * sibling lectures) are in flight. Reuses the same `LoadingState`
 * component already used across the admin pages — no new loading UI is
 * invented.
 */
export default function LectureDetailLoading() {
  return <LoadingState label="Loading lecture…" />;
}
