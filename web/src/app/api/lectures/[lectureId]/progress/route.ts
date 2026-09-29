import { NextResponse } from "next/server";
import type { LectureProgress } from "@shared/index";
import { proxyPost } from "@/lib/api/proxyPost";

/** Proxies `POST /api/v1/lectures/:lectureId/progress` (mark a lecture
 * complete/incomplete — PHASE4_ENHANCEMENT_PLAN.md §1.1). Same pattern as
 * the assessment proxies: the backend is the sole authority on validating
 * and persisting this, re-deriving the caller's identity from the
 * session token itself — this route adds no logic of its own. */
export async function POST(request: Request, context: { params: Promise<{ lectureId: string }> }) {
  const { lectureId } = await context.params;
  let body: { completed: boolean };
  try {
    body = (await request.json()) as { completed: boolean };
  } catch {
    return NextResponse.json(
      { error: { code: "validation_error", message: "A boolean 'completed' field is required." } },
      { status: 400 },
    );
  }
  return proxyPost<LectureProgress>(
    `/api/v1/lectures/${lectureId}/progress`,
    body,
    "Unable to update your progress. Please try again.",
  );
}
