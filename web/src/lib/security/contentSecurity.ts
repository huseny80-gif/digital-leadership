export function browserCsp(nonce: string, production: boolean, pathname?: string): string {
  // The standalone public HTML cannot receive a per-request nonce. Trust its
  // exact reviewed script only on its own path; other pages keep their nonce.
  // examModuleCsp.test.ts checks both canonical/public pairs and route scoping.
  const standaloneHash = pathname === "/exam-module.html"
    ? " 'sha256-q6+DnNt2cIOmxB2bHgEOn2C/EChKG7g6/Gi/gMJJgvI='"
    : pathname === "/summaries.html"
      ? " 'sha256-GDfs23z5XpSNqldnBgKRVVc+fbslRyUHVDgrSNcwAl8='" : "";
  return ["default-src 'self'", `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${standaloneHash}${production ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob: https:", "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co" + (production ? "" : " http://localhost:* ws://localhost:*"),
    "media-src 'self' blob: https:", "frame-src 'self'", "object-src 'none'", "base-uri 'self'",
    "form-action 'self'", "frame-ancestors 'self'", ...(production ? ["upgrade-insecure-requests"] : [])].join("; ");
}
