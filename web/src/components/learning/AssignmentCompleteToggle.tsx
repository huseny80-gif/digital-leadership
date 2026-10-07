"use client";

import { useState } from "react";
import type { AssignmentProgress } from "@shared/index";
import { notifyLearningProgress } from "@/lib/learning";

export function AssignmentCompleteToggle({
  assignmentId,
  initialCompleted,
}: {
  assignmentId: string;
  initialCompleted: boolean;
}) {
  const [completed, setCompleted] = useState(initialCompleted);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  async function toggle() {
    setSaving(true);
    setError(false);
    try {
      const response = await fetch(
        `/api/learning/assignments/${assignmentId}/progress`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ completed: !completed }),
        },
      );
      const body = (await response.json()) as { data?: AssignmentProgress };
      if (!response.ok || !body.data) throw new Error("progress_failed");
      setCompleted(body.data.completed);
      notifyLearningProgress();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="dl-assignment-completion">
      <button
        type="button"
        className={completed ? "btn btn-secondary" : "btn"}
        aria-pressed={completed}
        disabled={saving}
        onClick={() => void toggle()}
      >
        {saving
          ? "جارٍ الحفظ…"
          : completed
            ? "✓ مكتمل — إلغاء الإنجاز"
            : "أنجزت المهمة"}
      </button>
      <p>سجّل إنجازك بعد تنفيذ الواجب؛ يظهر ضمن تقدمك الشخصي.</p>
      {error ? (
        <p role="alert" className="dl-learning-error">
          تعذر حفظ الإنجاز. حاول مرة أخرى.
        </p>
      ) : null}
    </div>
  );
}
