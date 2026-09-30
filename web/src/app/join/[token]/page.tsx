"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface JoinInfo {
  subjectTitle: string;
  subjectDescription: string | null;
}

/**
 * Phase 6 — the public, no-account guest entry point (task requirement
 * #2). Reached via a QR code or shared link created in the admin
 * console's Training Access screen. No Supabase session, no sign-in —
 * this is the platform's SECOND unauthenticated entry point after
 * `/login` (PROJECT_REQUIREMENTS.md §4's "no protected content leaks to
 * an unauthenticated visitor" still holds: this page itself reveals only
 * a program name/description the admin explicitly put in the grant, and
 * submitting it only ever creates a new, narrowly-scoped guest session —
 * it never grants access to anything beyond the one subject the token
 * scopes it to).
 *
 * The trainee's name is rendered here as plain React text at every step
 * (confirmation heading) — never `dangerouslySetInnerHTML`, so even if
 * some future bug let a hostile string through server-side validation,
 * the browser would still show it as inert text, never execute it.
 */
export default function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const router = useRouter();

  const [token, setToken] = useState<string | null>(null);
  const [info, setInfo] = useState<JoinInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { token: resolvedToken } = await params;
      if (cancelled) return;
      setToken(resolvedToken);
      try {
        const res = await fetch(`/api/guest-join/${encodeURIComponent(resolvedToken)}`, { cache: "no-store" });
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(
            res.status === 404
              ? "This training access link is invalid, has expired, or has been revoked."
              : "Unable to load this training link. Please try again.",
          );
          return;
        }
        setInfo(body.data as JoinInfo);
      } catch {
        if (!cancelled) setLoadError("Unable to load this training link. Please try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/guest-join/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = await res.json();
      if (!res.ok) {
        setFormError(body?.error?.message ?? "Unable to join this training. Please check your name and try again.");
        return;
      }
      router.push("/training");
    } catch {
      setFormError("Unable to join this training. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-bg)",
        padding: "var(--space-5)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-lg)",
          padding: "var(--space-6)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "var(--space-5)" }}>
          <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
            Digital Leadership
          </div>
        </div>

        {loadError && (
          <p role="alert" style={{ color: "var(--color-danger)", background: "var(--color-danger-bg)", padding: "var(--space-3)", borderRadius: "var(--radius-sm)" }}>
            {loadError}
          </p>
        )}

        {!loadError && !info && <p style={{ color: "var(--color-text-muted)" }}>Loading…</p>}

        {info && (
          <>
            <h1 style={{ fontSize: "var(--font-size-xl)", margin: "0 0 var(--space-2)", color: "var(--color-text)" }}>{info.subjectTitle}</h1>
            {info.subjectDescription && (
              <p style={{ color: "var(--color-text-muted)", marginBottom: "var(--space-5)" }}>{info.subjectDescription}</p>
            )}

            <form onSubmit={handleSubmit}>
              <label htmlFor="trainee-name" style={{ display: "block", fontSize: "var(--font-size-sm)", marginBottom: "var(--space-2)", color: "var(--color-text)" }}>
                الاسم الثلاثي
              </label>
              <input
                id="trainee-name"
                name="trainee-name"
                type="text"
                required
                dir="auto"
                autoComplete="off"
                value={name}
                onChange={(e) => setName(e.target.value)}
                minLength={2}
                maxLength={120}
                style={{
                  width: "100%",
                  padding: "var(--space-3)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "var(--font-size-base)",
                  marginBottom: "var(--space-4)",
                  boxSizing: "border-box",
                }}
              />

              {formError && (
                <p role="alert" style={{ color: "var(--color-danger)", marginBottom: "var(--space-3)" }}>
                  {formError}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting || name.trim().length === 0}
                style={{
                  width: "100%",
                  padding: "var(--space-3)",
                  background: "var(--color-primary)",
                  color: "var(--color-primary-contrast)",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "var(--font-size-base)",
                  cursor: submitting ? "default" : "pointer",
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? "Joining…" : "Join Training"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
