import { normalizeSearchText, type GuestTraineeAnalyticsRow } from "@digital-leadership/shared";

export type GuestStatusFilter = "all" | GuestTraineeAnalyticsRow["status"];
export type GuestSort = "lastSeen" | "name" | "progress" | "quizzes" | "score";
export const guestStatusLabels = { active: "نشطة", expired: "منتهية", revoked: "معطلة" } as const;
export const guestNumber = (value: number) => value.toLocaleString("ar-u-nu-arab", { maximumFractionDigits: 1 });
export const guestDay = (iso: string) => iso.slice(0, 10);
export function guestDate(iso: string, withTime = false) {
  return new Date(iso).toLocaleString("ar-u-nu-arab", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } as const : {}),
  });
}

export function lectureProgress(row: GuestTraineeAnalyticsRow): number {
  return row.totalLectures > 0 ? Math.min(100, Math.max(0, row.lecturesCompleted / row.totalLectures * 100)) : 0;
}

/** Dates refer to entry sessions, not inferred unique people or live presence. */
export function filterGuests(rows: GuestTraineeAnalyticsRow[], query: string, days: number, asOf: string) {
  const normalized = normalizeSearchText(query);
  const start = days ? new Date(`${guestDay(asOf)}T00:00:00Z`).getTime() - (days - 1) * 86400000 : -Infinity;
  return rows.filter(row => (!normalized || normalizeSearchText(row.displayName).includes(normalized)) && new Date(row.joinedAt).getTime() >= start);
}

export function sortGuests(rows: GuestTraineeAnalyticsRow[], sort: GuestSort) {
  return [...rows].sort((a, b) => {
    const tie = a.guestSessionId.localeCompare(b.guestSessionId);
    if (sort === "name") return a.displayName.localeCompare(b.displayName, "ar") || tie;
    if (sort === "progress") return lectureProgress(b) - lectureProgress(a) || tie;
    if (sort === "quizzes") return b.quizzesCompleted - a.quizzesCompleted || tie;
    if (sort === "score") {
      if (a.averageScore === null) return b.averageScore === null ? tie : 1;
      if (b.averageScore === null) return -1;
      return b.averageScore - a.averageScore || tie;
    }
    return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime() || tie;
  });
}

export function guestSummary(rows: GuestTraineeAnalyticsRow[]) {
  return rows.reduce((sum, row) => {
    sum.sessions++; sum[row.status]++;
    sum.lectures += row.lecturesCompleted;
    sum.quizzes += row.quizzesCompleted;
    return sum;
  }, { sessions: 0, active: 0, expired: 0, revoked: 0, lectures: 0, quizzes: 0 });
}

export function guestEntryTrend(rows: GuestTraineeAnalyticsRow[], asOf: string, length = 14) {
  const end = new Date(`${guestDay(asOf)}T00:00:00Z`).getTime();
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(guestDay(row.joinedAt), (counts.get(guestDay(row.joinedAt)) ?? 0) + 1);
  return Array.from({ length }, (_, index) => {
    const day = new Date(end - (length - index - 1) * 86400000).toISOString().slice(0, 10);
    return { day, count: counts.get(day) ?? 0 };
  });
}
