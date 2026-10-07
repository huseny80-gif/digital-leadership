"use client";

import { useEffect, useRef } from "react";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { activityStatusLabels, formatDeadline } from "@/lib/learning";
import { useLearning } from "./LearningProvider";

export function NotificationsHub({
  open,
  onToggle,
  onClose,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const { overview, loading, error, refresh } = useLearning();
  const root = useRef<HTMLDivElement>(null);
  const activities = (overview?.activities ?? []).filter(
    (item) => item.dueAt && item.status !== "completed",
  );
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open, onClose]);
  return (
    <div className="dl-control-wrap" ref={root}>
      <button
        type="button"
        className="dl-header-control dl-notifications-button"
        aria-label={
          activities.length
            ? `الإشعارات — المواعيد: ${activities.length}`
            : "الإشعارات"
        }
        aria-expanded={open}
        aria-controls="notifications-menu"
        onClick={onToggle}
      >
        <PlatformIcon name="bell" />
        {activities.length ? (
          <span className="dl-notification-count">
            {activities.length > 9
              ? "+٩"
              : activities.length.toLocaleString("ar")}
          </span>
        ) : null}
      </button>
      {open ? (
        <section
          className="dl-header-popover dl-notifications-hub"
          id="notifications-menu"
          role="dialog"
          aria-label="الإشعارات والمواعيد"
        >
          <div className="dl-notifications-heading">
            <strong>الإشعارات والمواعيد</strong>
            <button
              type="button"
              aria-label="إغلاق الإشعارات"
              onClick={onClose}
            >
              <PlatformIcon name="close" />
            </button>
          </div>
          {error ? (
            <div className="dl-learning-error" role="status">
              {error}
              <button type="button" onClick={() => void refresh()}>
                إعادة المحاولة
              </button>
            </div>
          ) : activities.length ? (
            <div className="dl-notification-list">
              {activities.slice(0, 6).map((item) => (
                <a
                  href={item.href}
                  key={`${item.kind}-${item.id}`}
                  onClick={onClose}
                  className="dl-notification-row"
                >
                  <PlatformIcon
                    name={item.kind === "quiz" ? "quiz" : "clipboard"}
                  />
                  <span>
                    <b>{item.title}</b>
                    <small>{item.subjectTitle}</small>
                    <time dateTime={item.dueAt!}>
                      {formatDeadline(item.dueAt!)}
                    </time>
                  </span>
                  <span className={`dl-status-badge dl-status-${item.status}`}>
                    {activityStatusLabels[item.status]}
                  </span>
                </a>
              ))}
            </div>
          ) : (
            <p className="dl-notifications-empty">
              {loading
                ? "جارٍ تحميل المواعيد…"
                : "لا توجد مواعيد نهائية محددة لمهامك حاليًا."}
            </p>
          )}
          <a
            href="/dashboard#upcoming-activities"
            className="dl-notifications-all"
            onClick={onClose}
          >
            متابعة جميع المهام <PlatformIcon name="arrow" />
          </a>
        </section>
      ) : null}
    </div>
  );
}
