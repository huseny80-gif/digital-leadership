"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import {
  activityStatusLabels,
  formatDeadline,
  notifyLearningProgress,
} from "@/lib/learning";
import type { ActivityStatus } from "@shared/index";
import { useLearning } from "./LearningProvider";
import { DashboardDisclosure } from "@/components/content/DashboardDisclosure";

export function ActivityFeed() {
  const { overview, loading, error, refresh } = useLearning();
  const [filter, setFilter] = useState<ActivityStatus | "all">("all");
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const activities = (overview?.activities ?? []).filter(
    (item) => filter === "all" || item.status === filter,
  );
  const visible = expanded ? activities : activities.slice(0, 4);
  async function complete(id: string) {
    setSaving(id);
    setSaveError(null);
    try {
      const response = await fetch(`/api/learning/assignments/${id}/progress`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ completed: true }),
      });
      if (!response.ok) throw new Error("progress_failed");
      notifyLearningProgress();
    } catch {
      setSaveError("تعذر حفظ إنجاز المهمة. حاول مرة أخرى.");
    } finally {
      setSaving(null);
    }
  }
  return (
    <DashboardDisclosure
      className="dl-smart-activities"
      id="upcoming-activities"
      title="الأنشطة القادمة"
      icon="calendar"
      count={
        loading && !overview
          ? "…"
          : error && !overview
            ? "تعذّر التحميل"
            : (overview?.activities.length ?? 0).toLocaleString("ar")
      }
      busy={loading}
    >
      <div className="dl-disclosure-toolbar">
        <Link href="/subjects?view=assignments">
          الواجبات <PlatformIcon name="arrow" />
        </Link>
      </div>
      <div className="dl-activity-filters" aria-label="تصفية المهام">
        {(["all", "urgent", "in_progress", "completed"] as const).map(
          (value) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => {
                setFilter(value);
                setExpanded(false);
                if (listRef.current) listRef.current.scrollTop = 0;
              }}
            >
              {value === "all" ? "الكل" : activityStatusLabels[value]}
            </button>
          ),
        )}
      </div>
      {error ? (
        <div className="dl-learning-error" role="status">
          {error}
          <button type="button" onClick={() => void refresh()}>
            إعادة المحاولة
          </button>
        </div>
      ) : null}
      {saveError ? (
        <p className="dl-learning-error" role="alert">
          {saveError}
        </p>
      ) : null}
      <div className="dl-activity-list" ref={listRef}>
        {visible.map((activity) => (
          <article
            className="dl-smart-activity"
            key={`${activity.kind}-${activity.id}`}
          >
            <span
              className={`dl-smart-activity-icon dl-status-${activity.status}`}
            >
              <PlatformIcon
                name={activity.kind === "quiz" ? "quiz" : "clipboard"}
              />
            </span>
            <div className="dl-smart-activity-copy">
              <a href={activity.href}>
                <strong>{activity.title}</strong>
              </a>
              <small>
                {activity.subjectTitle} ·{" "}
                {activity.kind === "quiz" ? "اختبار" : "واجب"}
              </small>
              <span className={`dl-status-badge dl-status-${activity.status}`}>
                {activityStatusLabels[activity.status]}
              </span>
              <p className="dl-activity-deadline">
                {activity.dueAt ? (
                  <>
                    <PlatformIcon name="clock" />
                    {activity.overdue ? "انقضى الموعد: " : "الموعد: "}
                    <time dateTime={activity.dueAt}>
                      {formatDeadline(activity.dueAt)}
                    </time>
                  </>
                ) : (
                  "بدون موعد نهائي محدد"
                )}
              </p>
            </div>
            <div className="dl-activity-actions">
              <a className="dl-quick-action" href={activity.href}>
                {activity.status === "completed"
                  ? "مراجعة"
                  : activity.status === "in_progress"
                    ? "متابعة"
                    : "ابدأ"}
                <PlatformIcon name="arrow" />
              </a>
              {activity.kind === "assignment" &&
              activity.status !== "completed" ? (
                <button
                  type="button"
                  className="dl-complete-task"
                  onClick={() => void complete(activity.id)}
                  disabled={saving !== null}
                  aria-label={`أنجزت المهمة: ${activity.title}`}
                >
                  {saving === activity.id ? "جارٍ الحفظ…" : "أنجزت المهمة"}
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      {!visible.length && !error ? (
        <p className="dl-panel-empty">
          {loading ? "جارٍ تحميل المهام…" : "لا توجد مهام ضمن هذا التصنيف."}
        </p>
      ) : null}
      {activities.length > 4 ? (
        <button
          type="button"
          className="dl-show-activities"
          aria-expanded={expanded}
          onClick={() => {
            setExpanded(!expanded);
            if (listRef.current) listRef.current.scrollTop = 0;
          }}
        >
          {expanded
            ? "عرض أقل"
            : `عرض جميع الأنشطة (${activities.length.toLocaleString("ar")})`}
        </button>
      ) : null}
    </DashboardDisclosure>
  );
}
