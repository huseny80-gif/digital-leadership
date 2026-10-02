"use client";

import { createContext, useContext } from "react";

export interface GuestSessionInfo {
  id: string;
  displayName: string;
  subjectId: string;
  subjectTitle: string;
  status: string;
  expiresAt: string;
}

/**
 * Makes the already-resolved guest session (fetched once by
 * `training/layout.tsx`'s gate) available to any page under `/training/*`
 * without each page re-fetching `/api/guest/me` on its own. Pages that
 * still fetch their own guest-scoped data (lectures, quizzes, progress)
 * are unaffected — this only avoids duplicating the identity/session
 * lookup itself.
 */
export const GuestSessionContext = createContext<GuestSessionInfo | null>(null);

export function useGuestSession(): GuestSessionInfo | null {
  return useContext(GuestSessionContext);
}
