# Login notifications

The existing header bell includes a **دخول المتدربين والزوار** section for administrators. It shows the latest 20 successful learner entries with display name, entry time and read state, alongside the existing deadline reminders. The badge combines unread entries and unfinished deadline reminders; its accessible label identifies both counts.

`AppShell` reports authenticated learner access through `POST /api/learning/entry` with an empty object. The BFF forwards the existing Supabase bearer credential or signed guest cookie. The backend derives identity from verified middleware context. Registered trainees use a fingerprint of the verified Supabase `session_id` and subject; guest sessions use a fingerprint of their verified session ID. The existing `user` role represents registered trainees. Staff sessions and tokens without a stable verified session identifier return `recorded:false`. Refreshes, retries and extra tabs reuse the same database entry. A new authenticated session creates a new entry.

The current `audit_logs` table stores these events. Transaction locks serialize duplicate requests and order committed entry timestamps. Raw session identifiers, tokens, contact details and IP addresses are absent from the notification contract. No schema migration is required.

`GET /api/v1/admin/login-notifications` returns `{data:{items,unreadCount,latestId}}`, protected by the existing admin authorization boundary. `POST /api/v1/admin/login-notifications/read` accepts only `{throughId}` from the displayed snapshot. An append-only, per-administrator watermark persists read status and leaves later arrivals unread. Another administrator retains their own unread count.

The browser refreshes the admin feed when opening the bell, focusing a visible page, and every 30 seconds while visible. Explicit read acknowledgements finish when the menu closes; pending requests are cancelled when the administrator context is removed. Learner and guest bells retain personal deadline reminders and never request the admin feed. Entry-report failures retry without interrupting study access.

Verification includes session verification, concurrent retry deduplication, per-admin snapshot acknowledgement, safe BFF input handling, preserved deadlines, role changes, read failures, polling and menu lifecycle tests. The PostgreSQL integration test uses only the explicitly selected loopback `digital_leadership_backend_test` database, which CI creates and migrates. Responsive local browser checks use labelled fixture data rather than production accounts.
