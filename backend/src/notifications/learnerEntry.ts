import { createHash } from "node:crypto";
import type { Request } from "express";
import type { LearnerEntryResult } from "@shared/index";
import { forbidden } from "../lib/httpError.js";
import type { LoginNotificationsStore } from "./loginNotificationsRepository.js";

/** All identity comes from the existing verified middleware context. The
 * HTTP body is deliberately empty and never supplies names or identifiers. */
export async function recordLearnerEntry(
  req: Request,
  store: Pick<LoginNotificationsStore, "recordEntry">,
): Promise<LearnerEntryResult> {
  if (req.user) {
    if (req.user.status !== "active") throw forbidden();
    if (req.user.role !== "user" || req.authSession?.userId !== req.user.id) return { recorded: false };
    return {
      recorded: await store.recordEntry({
        kind: "trainee", principalId: req.user.id, fingerprint: req.authSession.fingerprint,
      }),
    };
  }
  const guest = req.guestSession!;
  if (guest.status !== "active" || (guest.expiresAt !== null && Date.parse(guest.expiresAt) <= Date.now())) throw forbidden();
  return {
    recorded: await store.recordEntry({
      kind: "visitor", principalId: guest.id,
      fingerprint: createHash("sha256").update(`guest:${guest.id}`).digest("hex"),
    }),
  };
}
