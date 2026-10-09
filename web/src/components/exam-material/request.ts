import type { ApiResult } from "@shared/index";

export async function examRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json() as ApiResult<T> & { error?: { message?: string } };
  if (!response.ok || !("data" in body)) throw new Error(body.error?.message || "تعذر إتمام الطلب. حاول مرة أخرى.");
  return body.data;
}
export const examHref = (subjectId: string, groupId: string, tab: "summary" | "quiz", attemptId?: string) => {
  const query = new URLSearchParams({ group: groupId, tab });
  if (attemptId) query.set("attempt", attemptId);
  return `/subjects/${subjectId}/exam-material?${query}`;
};
