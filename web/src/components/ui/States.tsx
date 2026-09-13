/**
 * Consistent UI states (WEB_APPLICATION_ARCHITECTURE.md "Error Handling").
 * Every page that fetches data uses one of these rather than inventing
 * its own loading/empty/error markup, and none of them ever renders a raw
 * backend/database error string — only the safe, pre-written messages
 * passed in by the caller (see `lib/api/errorMessage.ts`).
 */

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="state-block" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span className="state-message">{label}</span>
    </div>
  );
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="state-block">
      <p className="state-title">{title}</p>
      <p className="state-message">{message}</p>
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  retryHref,
}: {
  title?: string;
  message: string;
  retryHref?: string;
}) {
  return (
    <div className="state-block" data-variant="error" role="alert">
      <p className="state-title">{title}</p>
      <p className="state-message">{message}</p>
      {retryHref ? (
        <a className="btn btn-secondary" href={retryHref}>
          Try again
        </a>
      ) : null}
    </div>
  );
}

export function NotFoundState({ message }: { message: string }) {
  return (
    <div className="state-block">
      <p className="state-title">Not found</p>
      <p className="state-message">{message}</p>
      <a className="btn btn-secondary" href="/dashboard">
        Back to dashboard
      </a>
    </div>
  );
}
