export function browserCsp(nonce: string, production: boolean): string {
  return ["default-src 'self'", `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${production ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob: https:", "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co" + (production ? "" : " http://localhost:* ws://localhost:*"),
    "media-src 'self' blob: https:", "frame-src 'self'", "object-src 'none'", "base-uri 'self'",
    "form-action 'self'", "frame-ancestors 'self'", ...(production ? ["upgrade-insecure-requests"] : [])].join("; ");
}
