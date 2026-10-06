import Link from "next/link";
import type { PaginatedResult, ParticipantFeedback } from "@shared/index";
import { apiGetPaginated, ApiError } from "@/lib/api/client";
import { ParticipantFeedbackInbox } from "@/components/feedback/ParticipantFeedbackInbox";

export default async function ParticipantFeedbackPage() {
  let initial: PaginatedResult<ParticipantFeedback> | null = null;
  let denied = false;
  try { initial = await apiGetPaginated<ParticipantFeedback>("/api/v1/feedback/manage?page=1&limit=20"); }
  catch (error) { denied = error instanceof ApiError && (error.status === 401 || error.status === 403); }
  if (!initial) return <section className="participant-feedback feedback-panel" dir="rtl"><h1>آراء المشاركين</h1><p role="alert">{denied ? "هذه النافذة متاحة للمدير والمدرب فقط." : "تعذر تحميل آراء المشاركين. حاول مرة أخرى."}</p><Link className="btn btn-secondary" href={denied ? "/dashboard" : "/participant-feedback"}>{denied ? "الرجوع إلى الرئيسية" : "إعادة المحاولة"}</Link></section>;
  return <ParticipantFeedbackInbox initial={initial} />;
}
