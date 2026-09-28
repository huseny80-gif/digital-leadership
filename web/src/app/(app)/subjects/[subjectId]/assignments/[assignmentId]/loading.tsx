import { LoadingState } from "@/components/ui/States";

/**
 * Phase 21.4 — route-level loading boundary for the assignment detail
 * page, mirroring `lectures/[lectureId]/loading.tsx` (Phase 21.3). Reuses
 * the existing `LoadingState` component — no new loading UI invented.
 */
export default function AssignmentDetailLoading() {
  return <LoadingState label="Loading assignment…" />;
}
