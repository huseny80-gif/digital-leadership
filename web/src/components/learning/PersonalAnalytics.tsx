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
      <div className="dl-section-heading">
        <div>
          <span>رحلتك التعليمية</span>
          <h2 id="personal-analytics-title">تقدمك الشخصي</h2>
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
          >
            <strong>
              {overview ? `${count(overview.progressPercentage)}٪` : "—"}
            </strong>
          </div>
          <div>
            <h3>إنجاز المنهج</h3>
            <p>المحاضرات والواجبات والاختبارات</p>
            <small>
              {overview
                ? `${count(overview.completedQuizzes)} من ${count(overview.totalQuizzes)} اختبارات مكتملة`
                : "جارٍ تحميل تقدمك"}
            </small>
          </div>
        </article>
        <article className="dl-metric-card dl-metric-time">
          <span className="dl-metric-icon">
            <PlatformIcon name="clock" />
          </span>
          <h3>ساعات التعلم</h3>
          <strong>
            {overview ? formatLearningTime(overview.learningSeconds) : "—"}
          </strong>
          <p>وقت التعلم النشط المسجل</p>
        </article>
        <article className="dl-metric-card dl-metric-lectures">
          <span className="dl-metric-icon">
            <PlatformIcon name="video" />
          </span>
          <h3>المحاضرات المكتملة</h3>
          <strong>
            {count(overview?.completedLectures)}
            <small> / {count(overview?.totalLectures)}</small>
          </strong>
          <p>خطوة جديدة نحو الإنجاز</p>
        </article>
        <article className="dl-metric-card dl-metric-assignments">
          <span className="dl-metric-icon">
            <PlatformIcon name="clipboard" />
          </span>
          <h3>الواجبات المكتملة</h3>
          <strong>
            {count(overview?.completedAssignments)}
            <small> / {count(overview?.totalAssignments)}</small>
          </strong>
          <p>تابع مهامك وإنجازاتك</p>
        </article>
      </div>
    </section>
  );
}
