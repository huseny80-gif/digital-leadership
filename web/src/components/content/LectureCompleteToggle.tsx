"use client";

import { useState } from "react";
import type { ApiErrorBody, LectureProgress } from "@shared/index";
import { notifyLearningProgress } from "@/lib/learning";

/**
 * "Mark as complete" action for a lecture (PHASE4_ENHANCEMENT_PLAN.md
 * §1.1). Calls the same-origin proxy — never the backend directly — and
 * reflects only what the server actually persisted, never an optimistic
 * client-only state that could drift from the backend's own record.
 */
export function LectureCompleteToggle({
  lectureId,
  initialCompleted,
}: {
  lectureId: string;
  initialCompleted: boolean;
}) {
  const [completed, setCompleted] = useState(initialCompleted);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");

  async function toggle() {
    const next = !completed;
    setStatus("saving");
    try {
      const res = await fetch(`/api/lectures/${lectureId}/progress`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ completed: next }),
      });
      const body = (await res.json()) as { data?: LectureProgress } & Partial<ApiErrorBody>;
      if (!res.ok || !body.data) {
        setStatus("error");
        return;
      }
      setCompleted(body.data.completed);
      notifyLearningProgress();
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-5)" }}>
      <button
        type="button"
        className={completed ? "btn btn-secondary" : "btn"}
        onClick={toggle}
        disabled={status === "saving"}
        aria-pressed={completed}
      >
        {status === "saving" ? "Saving…" : completed ? "✓ Completed" : "Mark as complete"}
      </button>
      {status === "error" ? (
        <p role="alert" className="item-row-meta" style={{ color: "var(--color-danger)" }}>
          Unable to update your progress. Please try again.
        </p>
      ) : null}
    </div>
  );
}
