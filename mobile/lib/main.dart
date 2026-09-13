import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'app/app.dart';
import 'core/auth/auth_controller.dart';
import 'core/auth/secure_local_storage.dart';
import 'core/auth/supabase_token_provider.dart';
import 'core/config/env.dart';
import 'core/networking/api_client.dart';
import 'shared/api/assessments_repository.dart';
import 'shared/api/content_repository.dart';
import 'shared/api/files_repository.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  if (!Env.hasSupabaseConfig) {
    // No fabricated credentials (PHASE 10 §19/§20) — run a minimal shell
    // that says so plainly rather than crashing on `Supabase.initialize`
    // with an empty URL. See MOBILE_SETUP.md for the required
    // `--dart-define` values.
    runApp(const _MissingConfigApp());
    return;
  }

  await Supabase.initialize(
    url: Env.supabaseUrl,
    anonKey: Env.supabaseAnonKey,
    authOptions: FlutterAuthClientOptions(localStorage: SecureLocalStorage()),
  );

  final apiClient = ApiClient(tokenProvider: const SupabaseTokenProvider());

  runApp(
    MultiProvider(
      providers: [
        Provider<ApiClient>.value(value: apiClient),
        Provider<ContentRepository>(create: (_) => ContentRepository(apiClient)),
        Provider<FilesRepository>(create: (_) => FilesRepository(apiClient)),
        Provider<AssessmentsRepository>(create: (_) => AssessmentsRepository(apiClient)),
        ChangeNotifierProvider<AuthController>(create: (_) => AuthController(apiClient: apiClient)),
      ],
      child: const DigitalLeadershipApp(),
    ),
  );
}

class _MissingConfigApp extends StatelessWidget {
  const _MissingConfigApp();

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              'Missing Supabase configuration.\n\n'
              'Run with --dart-define=SUPABASE_URL=... --dart-define=SUPABASE_ANON_KEY=...\n\n'
              'See MOBILE_SETUP.md.',
              textAlign: TextAlign.center,
            ),
          ),
        ),
      ),
    );
  }
}
