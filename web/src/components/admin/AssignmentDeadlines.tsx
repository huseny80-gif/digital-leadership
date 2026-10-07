"use client";

import { useEffect, useState } from "react";
import type { Assignment } from "@shared/index";
import { adminGet, adminPatch } from "@/lib/api/adminBrowserClient";
import { deadlineToIso, toLocalDateTime } from "@/lib/deadline";

export function AssignmentDeadlines({ subjectId }: { subjectId: string }) {
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [dates, setDates] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void adminGet<Assignment[]>(`subjects/${subjectId}/assignments`)
      .then((items) => {
        if (cancelled) return;
        setAssignments(items);
        setDates(
          Object.fromEntries(
            items.map((item) => [item.id, toLocalDateTime(item.dueAt)]),
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setError("تعذر تحميل مواعيد الواجبات.");
      });
    return () => {
      cancelled = true;
    };
  }, [subjectId]);
  async function save(id: string) {
    setSaving(id);
    setError(null);
    setSaved(null);
    try {
      const assignment = await adminPatch<Assignment>(`assignments/${id}`, {
        dueAt: deadlineToIso(dates[id] ?? ""),
      });
      setAssignments(
        (items) =>
          items?.map((item) => (item.id === id ? assignment : item)) ?? null,
      );
      setSaved(id);
    } catch {
      setError("تعذر حفظ الموعد. تحقق من التاريخ ثم حاول مرة أخرى.");
    } finally {
      setSaving(null);
    }
  }
  return (
    <section
      className="dl-admin-deadlines"
      dir="rtl"
      aria-labelledby="assignment-deadlines-title"
    >
      <h2 id="assignment-deadlines-title">مواعيد الواجبات والأنشطة</h2>
      <p className="page-subheading">
        تظهر المواعيد للمتدرب في المهام والإشعارات. يُعرض الوقت حسب المنطقة
        الزمنية لجهازك. اترك الحقل فارغًا لإلغاء الموعد.
      </p>
      {error ? (
        <p className="dl-learning-error" role="alert">
          {error}
        </p>
      ) : null}
      {assignments === null && !error ? (
        <p role="status">جارٍ تحميل الواجبات…</p>
      ) : assignments?.length ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>الواجب</th>
                <th>الموعد النهائي</th>
                <th>الحفظ</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.title}
                    <small className="dl-deadline-publication">
                      {item.status === "published" ? "منشور" : "مسودة"}
                    </small>
                  </td>
                  <td>
                    <input
                      type="datetime-local"
                      className="form-input"
                      aria-label={`الموعد النهائي: ${item.title}`}
                      value={dates[item.id] ?? ""}
                      onChange={(event) => {
                        setDates((values) => ({
                          ...values,
                          [item.id]: event.target.value,
                        }));
                        setSaved(null);
                      }}
                    />
                  </td>
                  <td>
                    <button
                      className="btn btn-secondary"
                      type="button"
                      disabled={saving !== null}
                      onClick={() => void save(item.id)}
                    >
                      {saving === item.id ? "جارٍ الحفظ…" : "حفظ الموعد"}
                    </button>
                    {saved === item.id ? (
                      <span role="status"> تم الحفظ</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !error ? (
        <p>لا توجد واجبات لهذه المادة بعد.</p>
      ) : null}
    </section>
  );
}
