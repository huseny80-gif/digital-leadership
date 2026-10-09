# Reusable training links and guest analytics

Admins can copy a saved entry URL, view its locally generated QR code, and
return later to share it again without creating another grant. The default
selection is the active link with the most entry sessions. Guest access
remains permanent and the main sidebar remains on the right.

## Storage and existing links

New grants keep their original URL in authenticated AES-256-GCM ciphertext.
The encryption key is derived with a separate HKDF context from the existing
backend-only `GUEST_SESSION_SIGNING_SECRET`. Ciphertext is bound to the grant
ID; lists never return tokens, ciphertext or URLs. Preserve this secret
across deployments. Rotating it requires re-encrypting stored link tokens
with the old key first; hashes continue authorizing existing public URLs.

Older grants only contain an irreversible hash, so their original raw URL
cannot be recovered. On the first admin retrieval, a row-locked transaction
adds one stable sharing token to the **same grant**. The original published
token remains valid; concurrent copies and subsequent visits return the same
saved sharing URL. No participant identities, grants or historical results
are duplicated or reset.

`POST /api/v1/admin/training-access/:grantId/link` initializes or retrieves
the saved URL, with `Cache-Control: private, no-store`. `requireAdmin` gates
this endpoint, cleanup and guest analytics; public join responses do not
expose grant IDs or tokens.

## Disabled-record cleanup

Migration 23 runs transactionally under a startup advisory lock. It deletes
revoked grants with no guest sessions and archives revoked grants which have
sessions. Archived grants disappear from link management and cannot admit
new entrants. Their sessions, progress, answers and grades remain intact.
Revoking an active link archives it immediately; the admin cleanup action
archives any remaining disabled entries. Existing valid sessions are checked
independently from the disabled entry link, preserving ongoing study.

The migration is additive and repeatable. A code rollback may retain the
new columns; it must not replace active hashes or delete linked grants.

## Analytics interpretation

Each row represents one guest entry session, not an inferred unique person.
Repeated names are kept separate. The dashboard shows cohort totals, daily
entry counts (14 UTC calendar days), session status, lecture progress and
quiz attempts. Search, join-date filters, chart filters, sorting and pagination
operate on the actual admin response. Both lecture totals and completions
count published, non-deleted lectures with visible parent subjects. A disabled
entry link does not mark an otherwise valid guest session as revoked.

Quiz completion counts attempts. Average scores remain raw points, with
ungraded results shown as a dash and a real zero kept as zero. Session status
describes usability, not current online presence. All names and results are
restricted to administrators.

## Validation

Real isolated PostgreSQL tests cover stable copies, concurrent legacy-link
retrieval, original-token continuity, no token leakage in lists, admin-only
access, repeated cleanup, preservation of guest progress/grades, and consistent
lecture counts. Frontend tests cover copy after a revisit, clipboard fallback,
QR output, filtering, pagination, duplicate names and zero-versus-null scores.
Browser checks use the real components/styles and synthetic local fixtures
on desktop, tablet and mobile in both themes; no production identity is
impersonated.
