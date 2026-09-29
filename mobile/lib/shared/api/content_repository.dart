import '../../core/networking/api_client.dart';
import '../models/assignment.dart';
import '../models/lecture.dart';
import '../models/file_metadata.dart';
import '../models/paginated_result.dart';
import '../models/subject.dart';

/// Learner-facing content data access (PHASE 10 §9-10), reusing the exact
/// Phase 7 endpoints the web client consumes — no new endpoint, no
/// client-side visibility filtering (the backend's own published/draft
/// enforcement is authoritative; this repository never second-guesses a
/// 404 into anything else).
class ContentRepository {
  const ContentRepository(this._client);

  final ApiClient _client;

  Future<PaginatedResult<Subject>> listSubjects({int page = 1, int limit = 50}) async {
    final json = await _client.get('/api/v1/subjects?page=$page&limit=$limit');
    return PaginatedResult.fromJson(json as Map<String, dynamic>, Subject.fromJson);
  }

  Future<Subject> getSubject(String subjectId) async {
    final json = await _client.get('/api/v1/subjects/$subjectId');
    return Subject.fromJson((json as Map<String, dynamic>)['data'] as Map<String, dynamic>);
  }

  Future<PaginatedResult<Lecture>> listLectures(String subjectId, {int page = 1, int limit = 50}) async {
    final json = await _client.get('/api/v1/subjects/$subjectId/lectures?page=$page&limit=$limit');
    return PaginatedResult.fromJson(json as Map<String, dynamic>, Lecture.fromJson);
  }

  Future<Lecture> getLecture(String lectureId) async {
    final json = await _client.get('/api/v1/lectures/$lectureId');
    return Lecture.fromJson((json as Map<String, dynamic>)['data'] as Map<String, dynamic>);
  }

  Future<PaginatedResult<LectureItem>> listLectureItems(String lectureId, {int page = 1, int limit = 100}) async {
    final json = await _client.get('/api/v1/lectures/$lectureId/items?page=$page&limit=$limit');
    return PaginatedResult.fromJson(json as Map<String, dynamic>, LectureItem.fromJson);
  }

  /// PHASE 12S — `GET /api/v1/subjects/:id/assignments` (PHASE 12P). Same
  /// no-client-side-filtering rule as every other method here: the
  /// backend's own published/draft + subject-visibility enforcement is
  /// authoritative.
  Future<PaginatedResult<Assignment>> listAssignments(String subjectId, {int page = 1, int limit = 50}) async {
    final json = await _client.get('/api/v1/subjects/$subjectId/assignments?page=$page&limit=$limit');
    return PaginatedResult.fromJson(json as Map<String, dynamic>, Assignment.fromJson);
  }
}
