import 'package:supabase_flutter/supabase_flutter.dart';

import '../networking/api_client.dart';

/// The [AccessTokenProvider] the [ApiClient] uses. Deliberately a tiny,
/// standalone class rather than [AuthController] itself implementing the
/// interface — [ApiClient] must exist before [AuthController] can be
/// constructed (it depends on one), so [AuthController] implementing the
/// provider it depends on would be circular. This class only ever reads
/// Supabase's current session token; it makes no authorization decision
/// and holds no state of its own.
class SupabaseTokenProvider implements AccessTokenProvider {
  const SupabaseTokenProvider();

  @override
  Future<String?> getAccessToken() async {
    return Supabase.instance.client.auth.currentSession?.accessToken;
  }
}
