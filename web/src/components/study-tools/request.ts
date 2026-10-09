import type { ApiResult } from "@shared/index";
export async function studyRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/study-tools/${path}`, { cache: "no-store", ...init });
  const body = await response.json() as ApiResult<T> & { error?: { message?: string } };
  if (!response.ok || !("data" in body)) throw new Error(body.error?.message ?? "تعذر إتمام الطلب. حاول مرة أخرى.");
  return body.data;
}
