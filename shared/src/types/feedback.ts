export const FEEDBACK_CATEGORIES = ["opinion", "note", "suggestion", "weakness"] as const;
export type FeedbackCategory = typeof FEEDBACK_CATEGORIES[number];
export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  opinion: "رأي في المنصة", note: "ملاحظة", suggestion: "مقترح تطوير", weakness: "نقطة ضعف",
};
export const FEEDBACK_STATUSES = ["new", "reviewed", "archived"] as const;
export type FeedbackStatus = typeof FEEDBACK_STATUSES[number];
export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "جديد", reviewed: "تمت المراجعة", archived: "مؤرشف",
};

export interface FeedbackSubmission {
  submissionId: string;
  category: FeedbackCategory;
  message: string;
  name?: string | undefined;
}

/** Only the staff inbox API returns this shape. Submission returns an
 * acknowledgement only, never a response record or another participant. */
export interface ParticipantFeedback {
  id: string;
  category: FeedbackCategory;
  message: string;
  authorName: string;
  authorKind: "user" | "guest";
  status: FeedbackStatus;
  internalNote: string;
  createdAt: string;
  updatedAt: string;
}
