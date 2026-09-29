/// Environment configuration (PHASE 10 "Environment Configuration").
///
/// Every value here is read from a compile-time `--dart-define`, exactly
/// mirroring the web app's `NEXT_PUBLIC_*` pattern (`web/src/config/env.ts`):
/// a public API base URL and Supabase's PUBLIC URL + anon key — never a
/// secret. Supabase's privileged server-side key, any backend secret, and
/// any OAuth client secret are never referenced anywhere in this file or
/// this app;
/// the Google OAuth *client secret* lives only in the Supabase dashboard
/// (GOOGLE_OAUTH_SETUP.md), exactly as it does for the web client.
///
/// No default value here is a real credential — every default is either
/// an obviously-local placeholder (`http://localhost:4000`) or an empty
/// string that fails loudly (via [requireSupabaseConfig]) rather than
/// silently proceeding with a fabricated one (MOBILE_SETUP.md "Known
/// Limitations": real Supabase/Google configuration was not available in
/// this environment, and none was invented).
abstract final class Env {
  /// The shared backend's base URL (the same `/api/v1` surface the web
  /// app consumes — API_V1.md). Defaults to a local dev backend.
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:4000',
  );

  /// Supabase project URL — public by design (this is the same value the
  /// web app's `NEXT_PUBLIC_SUPABASE_URL` holds).
  static const supabaseUrl = String.fromEnvironment('SUPABASE_URL');

  /// Supabase anon (public) key — safe to ship in a client per Supabase's
  /// own design; RLS and this project's backend-mediated authorization
  /// (DATABASE_SECURITY.md §7) are what actually protect data, not the
  /// secrecy of this key. Never the service-role key.
  static const supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY');

  /// The custom URL scheme this app registers for the OAuth redirect
  /// (deep link) back from Supabase after Google sign-in completes — see
  /// MOBILE_AUTH.md "Deep Link Configuration". Must match the Android
  /// intent-filter / iOS URL scheme registration exactly.
  static const oauthRedirectScheme = String.fromEnvironment(
    'OAUTH_REDIRECT_SCHEME',
    defaultValue: 'com.digitalleadership.app',
  );

  static const oauthRedirectUrl = '$oauthRedirectScheme://login-callback';

  static bool get hasSupabaseConfig => supabaseUrl.isNotEmpty && supabaseAnonKey.isNotEmpty;
}
