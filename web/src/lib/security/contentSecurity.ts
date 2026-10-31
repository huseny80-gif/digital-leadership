export function browserCsp(nonce: string, production: boolean, pathname?: string): string {
  // The standalone public HTML cannot receive a per-request nonce. Trust its
  // exact reviewed script only on its own path; other pages keep their nonce.
  // examModuleCsp.test.ts checks both canonical/public pairs and route scoping.
  const standaloneHash = pathname === "/exam-module.html"
    ? " 'sha256-Y8MY0TUj0eyIf45SPEdHTm0rAD1TAOcGV1Ggthh2QhI=' 'sha256-nRfrD5kDHHoQ3T3cE6tB1WF0+zPCLmQXag7SKlCw79c=' 'sha256-oY2GIhy+bh724pEwtFcY2C//g914JNQZM/OV+1kVqeE='"
    : pathname === "/summaries.html"
      ? " 'sha256-Ks5uY0cuU2TGnXrsH5//H80XgLQ5iObV0SCIzoiAmZA=' 'sha256-nRfrD5kDHHoQ3T3cE6tB1WF0+zPCLmQXag7SKlCw79c=' 'sha256-oY2GIhy+bh724pEwtFcY2C//g914JNQZM/OV+1kVqeE='" : "";
  return ["default-src 'self'", `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${standaloneHash}${production ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob: https:", "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co" + (production ? "" : " http://localhost:* ws://localhost:*"),
    "media-src 'self' blob: https:", "frame-src 'self'", "object-src 'none'", "base-uri 'self'",
    "form-action 'self'", "frame-ancestors 'self'", ...(production ? ["upgrade-insecure-requests"] : [])].join("; ");
}
