import 'package:supabase_flutter/supabase_flutter.dart';

/// The thin seam between [AuthController] and Supabase Auth. Extracted
/// as an interface (rather than [AuthController] calling
/// `Supabase.instance.client.auth` directly) purely for testability —
/// [AuthController]'s session-restoration/sign-in/sign-out logic can then
/// be exercised in a unit test against a fake implementation, without
/// requiring `Supabase.initialize` to have run (which needs a real or
/// emulated Supabase project). [SupabaseAuthGateway] is the only
/// production implementation, and it does nothing beyond forwarding to
/// the real Supabase client — no behavior lives in this interface split.
abstract class AuthGateway {
  Session? get currentSession;
  Stream<AuthState> get onAuthStateChange;
  Future<void> signInWithOAuth(OAuthProvider provider, {required String redirectTo});
  Future<void> signOut();
}

class SupabaseAuthGateway implements AuthGateway {
  const SupabaseAuthGateway();

  @override
  Session? get currentSession => Supabase.instance.client.auth.currentSession;

  @override
  Stream<AuthState> get onAuthStateChange => Supabase.instance.client.auth.onAuthStateChange;

  @override
  Future<void> signInWithOAuth(OAuthProvider provider, {required String redirectTo}) {
    return Supabase.instance.client.auth.signInWithOAuth(
      provider,
      redirectTo: redirectTo,
      authScreenLaunchMode: LaunchMode.externalApplication,
    );
  }

  @override
  Future<void> signOut() => Supabase.instance.client.auth.signOut();
}
