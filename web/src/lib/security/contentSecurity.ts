export function browserCsp(nonce: string, production: boolean, pathname?: string): string {
  // The standalone public HTML cannot receive a per-request nonce. Trust its
  // exact reviewed script only on this path; every other page keeps its nonce.
  // examModuleCsp.test.ts checks this hash against the canonical and public HTML.
  const standaloneHash = pathname === "/exam-module.html"
    ? " 'sha256-E3X7cK9WIHGriSHiBXW/y2jsdqU+nYYeBvgLX89JRdk='" : "";
  return ["default-src 'self'", `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${standaloneHash}${production ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob: https:", "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co" + (production ? "" : " http://localhost:* ws://localhost:*"),
    "media-src 'self' blob: https:", "frame-src 'self'", "object-src 'none'", "base-uri 'self'",
    "form-action 'self'", "frame-ancestors 'self'", ...(production ? ["upgrade-insecure-requests"] : [])].join("; ");
}
