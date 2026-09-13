import type { SessionUser } from "@shared/index";

/**
 * Session issuance/validation boundary (ARCHITECTURE.md §5,
 * ARCHITECTURE_DIAGRAM.md §2). The backend issues its own session
 * credential after verifying an external identity — it never reuses the
 * identity provider's token as the ongoing session. Implemented in
 * Phase 6.
 */
export interface SessionService {
  issueSession(userId: string): Promise<{ token: string }>;
  resolveSession(token: string): Promise<SessionUser | null>;
  invalidateSession(token: string): Promise<void>;
}

export class NotImplementedSessionService implements SessionService {
  async issueSession(): Promise<{ token: string }> {
    throw new Error("Not implemented: session issuance is added in Phase 6.");
  }
  async resolveSession(): Promise<SessionUser | null> {
    throw new Error("Not implemented: session resolution is added in Phase 6.");
  }
  async invalidateSession(): Promise<void> {
    throw new Error("Not implemented: session invalidation is added in Phase 6.");
  }
}
