export function browserCsp(nonce: string, production: boolean, pathname?: string): string {
  // The standalone public HTML cannot receive a per-request nonce. Trust its
  // exact reviewed script only on its own path; other pages keep their nonce.
  // examModuleCsp.test.ts checks both canonical/public pairs and route scoping.
  const standaloneHash = pathname === "/exam-module.html"
    ? " 'sha256-Y8MY0TUj0eyIf45SPEdHTm0rAD1TAOcGV1Ggthh2QhI='"
    : pathname === "/summaries.html"
      ? " 'sha256-sddA6M6f7cI6Swj1KNTHfpgqa9lZEMPzPdoc0IiZnso='" : "";
  const loaderHash = standaloneHash ? " 'sha256-fP+6GVbYZdw8mkgLSdzcH1ig9BtUhZoLdcyA5zMoafc='" : "";
  const bootstrapHash = standaloneHash ? " 'sha256-oY2GIhy+bh724pEwtFcY2C//g914JNQZM/OV+1kVqeE='" : "";
  return ["default-src 'self'", `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${standaloneHash}${loaderHash}${bootstrapHash}${production ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob: https:", "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co" + (production ? "" : " http://localhost:* ws://localhost:*"),
    "media-src 'self' blob: https:", "frame-src 'self'", "object-src 'none'", "base-uri 'self'",
    "form-action 'self'", "frame-ancestors 'self'", ...(production ? ["upgrade-insecure-requests"] : [])].join("; ");
}
