import '../../core/networking/api_client.dart';
import '../models/file_metadata.dart';

/// Secure PDF access (PHASE 10 §11). The ONLY way this app ever resolves
/// a file ID into something viewable — never a direct Supabase Storage
/// call, never a cached/reused URL past its request. Every call re-hits
/// the backend, which independently re-authorizes
/// (`GET /api/v1/files/:fileId`, unchanged from Phase 8/9A).
class FilesRepository {
  const FilesRepository(this._client);

  final ApiClient _client;

  Future<SignedFileUrl> getSignedUrl(String fileId) async {
    final json = await _client.get('/api/v1/files/$fileId');
    return SignedFileUrl.fromJson((json as Map<String, dynamic>)['data'] as Map<String, dynamic>);
  }
}
