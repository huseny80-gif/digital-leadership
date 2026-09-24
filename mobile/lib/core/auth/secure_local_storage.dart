import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Backs `supabase_flutter`'s session persistence with the platform's
/// secure storage (iOS Keychain / Android Keystore-backed EncryptedSharedPreferences)
/// instead of its default (SharedPreferences/plain storage) — PHASE 10 §5:
/// "Store sensitive authentication material using secure platform
/// storage... Do NOT store authentication tokens in SharedPreferences."
///
/// Implements `supabase_flutter`'s `LocalStorage` contract. **Known
/// limitation (MOBILE_SETUP.md):** this was written against the
/// documented `supabase_flutter` v2 `LocalStorage` interface but could
/// not be compiled or verified against the actual package — the Flutter
/// SDK was unavailable in this environment (see MOBILE_TEST_PLAN.md).
/// Re-verify this against the exact pinned `supabase_flutter` version
/// once `flutter pub get`/`flutter analyze` can be run.
class SecureLocalStorage extends LocalStorage {
  SecureLocalStorage({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
              iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
            );

  final FlutterSecureStorage _storage;

  static const _sessionKey = 'supabase.session';

  @override
  Future<void> initialize() async {}

  @override
  Future<bool> hasAccessToken() async {
    final value = await _storage.read(key: _sessionKey);
    return value != null;
  }

  @override
  Future<String?> accessToken() async {
    return _storage.read(key: _sessionKey);
  }

  @override
  Future<void> persistSession(String persistSessionString) async {
    await _storage.write(key: _sessionKey, value: persistSessionString);
  }

  @override
  Future<void> removePersistedSession() async {
    await _storage.delete(key: _sessionKey);
  }
}
