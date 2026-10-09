"use client";

import type { CSSProperties } from "react";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { formatArabicNumber, formatLearningTime } from "@/lib/learning";
import { useLearning } from "./LearningProvider";

export function PersonalAnalytics() {
  const { overview, loading, error, refresh } = useLearning();
  const count = (value: number | undefined) =>
    value === undefined ? "—" : formatArabicNumber(value);
  return (
    <section
      className="dl-personal-analytics"
      id="learning-analytics"
      aria-labelledby="personal-analytics-title"
      aria-busy={loading}
    >
      <div className="dl-personal-heading">
        <div>
          <h2 id="personal-analytics-title">تقدمك الشخصي</h2>
          <span>رحلتك التعليمية</span>
        </div>
        <span className="dl-live-label">
          <i aria-hidden="true" />
          يُحدَّث تلقائيًا
        </span>
      </div>
      {error ? (
        <div className="dl-learning-error" role="status">
          {error}
          <button type="button" onClick={() => void refresh()}>
            إعادة المحاولة
          </button>
        </div>
      ) : null}
      <div className="dl-metric-grid">
        <article className="dl-metric-card dl-metric-progress">
          <div
            className="dl-progress-ring"
            style={
              {
                "--progress": `${overview?.progressPercentage ?? 0}%`,
              } as CSSProperties
            }
            role="progressbar"
            aria-label="نسبة إنجاز المنهج"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={overview?.progressPercentage}
            title="الإنجاز الكلي للمحاضرات والواجبات والاختبارات"
          >
            <strong>
              {overview ? `${count(overview.progressPercentage)}٪` : "—"}
            </strong>
          </div>
          <div>
            <h3>إنجاز المنهج</h3>
            <small>
              {overview
                ? `الاختبارات: ${count(overview.completedQuizzes)} من ${count(overview.totalQuizzes)}`
                : "جارٍ تحميل تقدمك"}
            </small>
          </div>
        </article>
        <article className="dl-metric-card dl-metric-time">
          <span className="dl-metric-icon">
            <PlatformIcon name="clock" />
          </span>
          <div title="وقت التعلم النشط المسجل">
            <h3>ساعات التعلم</h3>
            <strong className="dl-metric-value">{overview ? formatLearningTime(overview.learningSeconds) : "—"}</strong>
          </div>
        </article>
        <article className="dl-metric-card dl-metric-lectures">
          <span className="dl-metric-icon">
            <PlatformIcon name="video" />
          </span>
          <div>
            <h3>المحاضرات المكتملة</h3>
            <strong className="dl-metric-value"><bdi dir="ltr">{count(overview?.completedLectures)}<small> / {count(overview?.totalLectures)}</small></bdi></strong>
          </div>
        </article>
        <article className="dl-metric-card dl-metric-assignments">
          <span className="dl-metric-icon">
            <PlatformIcon name="clipboard" />
          </span>
          <div>
            <h3>الواجبات المكتملة</h3>
            <strong className="dl-metric-value"><bdi dir="ltr">{count(overview?.completedAssignments)}<small> / {count(overview?.totalAssignments)}</small></bdi></strong>
          </div>
        </article>
      </div>
    </section>
  );
}
