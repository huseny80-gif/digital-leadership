"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ApiErrorBody, QuizAttempt } from "@shared/index";

/**
 * Starts (or resumes) a quiz attempt (PHASE 09B "Quiz Attempts"). Calls
 * the same-origin proxy — never the backend directly, never asserts its
 * own userId (the backend derives it from the verified session).
 * Disabled while the request is in flight (PHASE 09B "Submission Safety"
 * — the same double-click guard applies to starting an attempt as to
 * submitting one).
 */
export function StartQuizButton({
  quizId,
  apiBasePath = "/api",
  routeBasePath = "/quizzes",
  label = "بدء الاختبار",
}: {
  quizId: string;
  /** Same-origin proxy prefix to call — `/api` for an authenticated
   * learner (default, unchanged), `/api/guest` for a joined guest
   * (`api/guest/[...path]/route.ts` forwards the signed guest session
   * cookie instead of a bearer token; the backend's own
   * `requireGuestSession` on the mirrored `/guest/quizzes/*` routes is
   * what actually authorizes this, not this prop). */
  apiBasePath?: string;
  /** Page-route prefix to navigate to after starting — `/quizzes`
   * (default, unchanged) for a learner, `/training/quizzes` for a guest. */
  routeBasePath?: string;
  label?: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "starting" | "error">("idle");

  async function handleStart() {
    setStatus("starting");
    try {
      const res = await fetch(`${apiBasePath}/quizzes/${quizId}/attempts`, { method: "POST" });
      const body = (await res.json()) as { data?: QuizAttempt } & Partial<ApiErrorBody>;
      if (!res.ok || !body.data) {
        setStatus("error");
        return;
      }
      router.push(`${routeBasePath}/${quizId}/attempt/${body.data.id}`);
    } catch {
      setStatus("error");
    }
  }

  return (
    <div>
      <button type="button" className="btn" onClick={handleStart} disabled={status === "starting"}>
        {status === "starting" ? "جارٍ بدء الاختبار…" : label}
      </button>
      {status === "error" ? (
        <p role="alert" className="state-message" style={{ color: "var(--color-danger)", marginTop: "var(--space-2)" }}>
          تعذر بدء الاختبار. حاول مرة أخرى.
        </p>
      ) : null}
    </div>
  );
}
