import { NextResponse } from "next/server";
import type { SubmitAnswerAck, SubmitAnswerInput } from "@shared/index";
import { proxyPost } from "@/lib/api/proxyPost";

/** Proxies `POST /api/v1/attempts/:attemptId/answers` (record one answer
 * — ASSESSMENT_API.md). The request body is forwarded as-is; the backend
 * is the sole authority on validating and grading it — this route adds
 * no scoring logic of its own (QUIZ_SECURITY.md). */
export async function POST(request: Request, context: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await context.params;
  let body: SubmitAnswerInput;
  try {
    body = (await request.json()) as SubmitAnswerInput;
  } catch {
    return NextResponse.json(
      { error: { code: "validation_error", message: "A valid answer payload is required." } },
      { status: 400 },
    );
  }
  return proxyPost<SubmitAnswerAck>(
    `/api/v1/attempts/${attemptId}/answers`,
    body,
    "Unable to save your answer. Please try again.",
  );
}
