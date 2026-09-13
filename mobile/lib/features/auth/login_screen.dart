import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/config/env.dart';

/// Login screen (PHASE 10 §5/§20). Google sign-in only, via Supabase
/// Auth's own OAuth flow — no local username/password, no second token
/// system, no hardcoded user. If real Supabase/Google configuration is
/// not present (`Env.hasSupabaseConfig`), this screen says so plainly
/// rather than pretending sign-in would work (MOBILE_SETUP.md).
class LoginScreen extends StatelessWidget {
  const LoginScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.school_outlined, size: 56, color: Theme.of(context).colorScheme.primary),
                const SizedBox(height: 16),
                Text('Digital Leadership', style: Theme.of(context).textTheme.headlineSmall),
                const SizedBox(height: 8),
                Text(
                  'Sign in with your Google account to continue.',
                  style: Theme.of(context).textTheme.bodyMedium,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 24),
                if (!Env.hasSupabaseConfig)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 16),
                    child: Text(
                      'This build has no Supabase configuration (SUPABASE_URL / SUPABASE_ANON_KEY). '
                      'See MOBILE_SETUP.md for the required --dart-define values.',
                      style: TextStyle(color: Theme.of(context).colorScheme.error),
                      textAlign: TextAlign.center,
                    ),
                  ),
                if (auth.error != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 16),
                    child: Text(
                      auth.error!,
                      style: TextStyle(color: Theme.of(context).colorScheme.error),
                      textAlign: TextAlign.center,
                    ),
                  ),
                FilledButton.icon(
                  onPressed: (!Env.hasSupabaseConfig || auth.signingIn)
                      ? null
                      : () => auth.signInWithGoogle(Env.oauthRedirectUrl),
                  icon: const Icon(Icons.login),
                  label: Text(auth.signingIn ? 'Signing in…' : 'Sign in with Google'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
