/**
 * Resolves which origin the OAuth/PKCE flow should actually run on.
 *
 * Root cause this fixes: `login/page.tsx` and `auth/callback/route.ts`
 * previously forced EVERY request onto the single fixed
 * `NEXT_PUBLIC_SITE_URL` origin (production), regardless of which host
 * the user actually opened the app from. That is correct for an
 * untrusted/arbitrary host (prevents an open redirect), but it also
 * meant a Vercel Preview deployment for a pull request could never
 * complete Google sign-in on its own preview URL — the user would
 * always get bounced to production mid-login, exactly as reported
 * ("Safari's final URL becomes web-husen4.vercel.app").
 *
 * This still ONLY trusts a small, derived allowlist — never an
 * arbitrary value from a query string, header, or the request itself —
 * so it cannot become an open redirect:
 *
 * - The canonical production origin (`NEXT_PUBLIC_SITE_URL`) is always
 *   trusted, as before.
 * - A Vercel preview/production URL for THIS SAME project is trusted
 *   too, derived from the canonical origin's own hostname (never
 *   hardcoded), so it adapts automatically if the Vercel project name
 *   or team scope ever changes rather than silently going stale.
 * - Anything else (a different domain, a different Vercel project, a
 *   non-https origin) always falls back to the canonical origin —
 *   identical to the previous behavior for every untrusted host.
 *
 * Vercel's own URL scheme ties every deployment for one project to the
 * same `<project>-<team-scope>.vercel.app` suffix: production is
 * `web-husen4.vercel.app`, a branch alias is
 * `web-git-<branch>-husen4.vercel.app`, and a single deployment is
 * `web-<deployment-id>-husen4.vercel.app`. Matching that exact
 * `<project>-...-<team-scope>.vercel.app` shape (not just "*.vercel.app")
 * is what keeps this from ever trusting an unrelated Vercel project.
 */
export function resolveTrustedOrigin(candidateOrigin: string, canonicalSiteUrl: string): string {
  const canonical = new URL(canonicalSiteUrl);
  if (candidateOrigin === canonical.origin) return canonical.origin;

  let candidate: URL;
  try {
    candidate = new URL(candidateOrigin);
  } catch {
    return canonical.origin;
  }

  // Never trust a non-https origin (rules out plain http, and any
  // non-standard scheme like javascript:/data: outright).
  if (candidate.protocol !== "https:") return canonical.origin;

  // Derive "<project>" and "<team-scope>" from the canonical host
  // itself (e.g. "web-husen4.vercel.app" -> project "web", scope
  // "husen4") rather than hardcoding either — this assumes a
  // project name with no dashes of its own, true for this project
  // ("web"), and degrades safely (no match, falls back to canonical)
  // if that assumption ever stops holding.
  const canonicalHostMatch = canonical.hostname.match(/^([a-z0-9]+)-([a-z0-9]+)\.vercel\.app$/i);
  if (!canonicalHostMatch) return canonical.origin;
  const [, project, teamScope] = canonicalHostMatch;

  const candidateHost = candidate.hostname.toLowerCase();
  const isSameProjectVercelHost =
    candidateHost.startsWith(`${project.toLowerCase()}-`) && candidateHost.endsWith(`-${teamScope.toLowerCase()}.vercel.app`);

  return isSameProjectVercelHost ? candidate.origin : canonical.origin;
}
