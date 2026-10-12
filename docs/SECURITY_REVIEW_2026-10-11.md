# Platform security review — 11 October 2026

The review covers the current Express API, Next.js administration proxies,
file import paths and private participant feedback. It preserves the public
trainee link flow, source quotations and the dark glass interface.

## Verified findings and changes

- The role middleware previously accepted a suspended administrator. Token
  verification now rejects every inactive account before attaching identity;
  authenticated and role guards independently check active status. Roles
  still come from the database, never headers, query fields or token metadata.
  A central `/admin` boundary protects every child mount and disables caching.
- Participant inbox viewing and review remain available to authorized trainers.
  Permanent deletion now requires an administrator on the server and the UI.
- Existing uploads accept PDFs only. MIME, extension, filename and byte size
  are checked, then PDF.js parses the actual document with evaluation disabled.
  The policy rejects invalid/encrypted documents, JavaScript actions, embedded
  attachments, interactive forms and unsafe annotations. Documents are capped
  at 200 pages. Multipart counts/field sizes, JSON sizes and streamed frontend
  request bytes are bounded before storage or publication. Parser and upload
  limit errors return safe 400/413 responses rather than generic 500s.
- The HTML reader uses a parser-based element/attribute/URL allow-list. React
  continues to escape all ordinary titles, search results and comments. Input
  envelopes reject NUL, pollution keys and excessive nesting without changing
  academic wording. SQL repositories continue binding values as parameters;
  administrative proxy paths cannot escape their namespace by traversal.
- Every browser API mutation requires same-origin provenance in production.
  Read-only requests and local development are preserved. CSP uses per-request
  script nonces; production does not permit inline scripts or eval. Styling
  allows existing inline presentation rules to preserve the interface.
- Production API requests require HTTPS behind Railway's trusted proxy, with
  only the minimal internal health probe exempt. Public API/Supabase/web URLs
  require HTTPS. Both hosts emit nosniff, frame, referrer and permission headers
  plus production HSTS. The deployment providers terminate TLS at their edge.
- Private feedback messages, submitted names and internal notes use AES-256-GCM
  with fresh nonces and record/field-bound authenticated data. HKDF derives a
  separate content key from the existing backend-only guest signing secret.
  Startup migration encrypts previous plaintext transactionally, retaining IDs,
  timestamps and review states. Browser roles have no table grants/RLS policy.
  Response DTOs decrypt only through the staff-authorized endpoint and never
  include ciphertext/key fields. Existing sharing tokens already use AES-GCM.

Preserve the encryption secret across deployments. Key rotation must migrate
ciphertext with the old and new keys; replacing it alone loses readability.
These controls validate passive files; they do not introduce a third-party
antivirus scanning service or a new image/video upload feature.

## Validation

Regression checks cover suspended/demoted admins, forged roles, unauthorized
publication/deletion, source-preserving input validation, SQL payloads, encoded
and malformed XSS, unsafe cross-origin changes, path traversal, body limits,
PDF actions/attachments, encryption integrity and legacy record migration.
All 23 reviewed original course PDFs are tested against the upload policy.
Full CI uses an isolated PostgreSQL database with all migrations, alongside
web tests, type checks, lint and production builds.
