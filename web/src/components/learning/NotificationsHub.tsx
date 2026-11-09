"use client";

import { useEffect, useRef } from "react";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { activityStatusLabels, formatDeadline } from "@/lib/learning";
import { useLearning } from "./LearningProvider";
import { useLoginNotifications } from "./useLoginNotifications";
import styles from "./LoginNotifications.module.css";

export function NotificationsHub({
  open,
  onToggle,
  onClose,
  isAdmin = false,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  isAdmin?: boolean;
}) {
  const { overview, loading, error, refresh } = useLearning();
  const root = useRef<HTMLDivElement>(null);
  const logins = useLoginNotifications(isAdmin, open);
  const activities = (overview?.activities ?? []).filter(
    (item) => item.dueAt && item.status !== "completed",
  );
  const count = activities.length + (logins.data?.unreadCount ?? 0);
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
          isAdmin ? `الإشعارات — الدخول غير المقروء: ${logins.data?.unreadCount ?? 0}، المواعيد: ${activities.length}` : activities.length
            ? `الإشعارات — المواعيد: ${activities.length}`
            : "الإشعارات"
        }
        aria-expanded={open}
        aria-controls="notifications-menu"
        onClick={onToggle}
      >
        <PlatformIcon name="bell" />
        {count ? (
          <span className="dl-notification-count">
            {count > 9
              ? "+٩"
              : count.toLocaleString("ar-IQ")}
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
          {isAdmin ? <section className={styles.section} aria-label="دخول المتدربين والزوار">
            <div className={styles.heading}><h3>دخول المتدربين والزوار</h3>
              {logins.data?.unreadCount ? <button type="button" disabled={logins.marking} onClick={() => void logins.markAllRead()}>{logins.marking ? "جارٍ حفظ القراءة…" : "تحديد الكل كمقروء"}</button> : null}
            </div>
            {logins.error ? <div className={styles.error} role="status">{logins.error}<button type="button" onClick={() => void logins.refresh()}>إعادة تحميل إشعارات الدخول</button></div> : null}
            {logins.data?.items.length ? <div className={styles.list}>{logins.data.items.map(item => <div className={styles.row} key={item.id} data-unread={!item.read}>
              <PlatformIcon name="user" /><span className={styles.copy}><strong>{item.displayName}</strong><small>{item.kind === "trainee" ? "دخول متدرب" : "دخول زائر"}</small>
                <time dateTime={item.enteredAt}>{new Date(item.enteredAt).toLocaleString("ar-IQ", { dateStyle: "short", timeStyle: "short" })}</time></span>
              {!item.read ? <span className={styles.unread} aria-label="غير مقروء" /> : null}
            </div>)}</div> : !logins.error ? <p className={styles.message} role="status">{logins.loading ? "جارٍ تحميل إشعارات الدخول…" : "لا توجد إشعارات دخول جديدة بعد."}</p> : null}
            <a className={styles.all} href="/admin/audit-logs" onClick={onClose}>عرض سجل الدخول والنشاط ←</a>
          </section> : null}
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
