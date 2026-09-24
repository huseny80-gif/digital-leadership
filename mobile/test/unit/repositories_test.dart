import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:digital_leadership/core/networking/api_client.dart';
import 'package:digital_leadership/core/networking/api_exception.dart';
import 'package:digital_leadership/shared/api/assessments_repository.dart';
import 'package:digital_leadership/shared/api/content_repository.dart';
import 'package:digital_leadership/shared/api/files_repository.dart';

class _StaticTokenProvider implements AccessTokenProvider {
  const _StaticTokenProvider(this.token);
  final String? token;
  @override
  Future<String?> getAccessToken() async => token;
}

void main() {
  group('ContentRepository (PHASE 10 §9/§10)', () {
    test('listSubjects calls GET /api/v1/subjects with the bearer token attached', () async {
      Uri? calledUri;
      Map<String, String>? calledHeaders;
      final client = ApiClient(
        tokenProvider: const _StaticTokenProvider('tok-123'),
        httpClient: MockClient((request) async {
          calledUri = request.url;
          calledHeaders = request.headers;
          return http.Response(jsonEncode({'data': [], 'page': 1, 'limit': 50, 'total': 0}), 200);
        }),
        baseUrl: 'http://test',
      );
      final repo = ContentRepository(client);

      final result = await repo.listSubjects();

      expect(calledUri!.path, '/api/v1/subjects');
      expect(calledHeaders!['authorization'], 'Bearer tok-123');
      expect(result.data, isEmpty);
    });

    test('13. unauthorized access surfaces as ApiException(401), never an unhandled crash', () async {
      final client = ApiClient(
        tokenProvider: const _StaticTokenProvider(null),
        httpClient: MockClient((request) async {
          return http.Response(jsonEncode({'error': {'code': 'unauthenticated', 'message': 'Authentication is required.'}}), 401);
        }),
        baseUrl: 'http://test',
      );
      final repo = ContentRepository(client);

      expect(() => repo.listSubjects(), throwsA(isA<ApiException>().having((e) => e.isUnauthenticated, 'isUnauthenticated', isTrue)));
    });

    test('PHASE 12S: listAssignments calls GET /api/v1/subjects/:id/assignments with the bearer token attached', () async {
      Uri? calledUri;
      Map<String, String>? calledHeaders;
      final client = ApiClient(
        tokenProvider: const _StaticTokenProvider('tok-123'),
        httpClient: MockClient((request) async {
          calledUri = request.url;
          calledHeaders = request.headers;
          return http.Response(
            jsonEncode({
              'data': [
                {
                  'id': 'a1',
                  'subjectId': 's1',
                  'lectureId': null,
                  'title': 'Essay 1',
                  'description': 'Write about X.',
                  'orderIndex': 0,
                  'status': 'published',
                  'createdBy': 'admin-1',
                  'createdAt': '2026-01-01T00:00:00Z',
                  'updatedAt': '2026-01-01T00:00:00Z',
                },
              ],
              'page': 1,
              'limit': 50,
              'total': 1,
            }),
            200,
          );
        }),
        baseUrl: 'http://test',
      );
      final repo = ContentRepository(client);

      final result = await repo.listAssignments('s1');

      expect(calledUri!.path, '/api/v1/subjects/s1/assignments');
      expect(calledHeaders!['authorization'], 'Bearer tok-123');
      expect(result.data, hasLength(1));
      expect(result.data[0].title, 'Essay 1');
      expect(result.data[0].lectureId, isNull);
    });

    test('PHASE 12S: listAssignments returns an empty list for a subject with no assignments', () async {
      final client = ApiClient(
        tokenProvider: const _StaticTokenProvider('tok-123'),
        httpClient: MockClient((request) async {
          return http.Response(jsonEncode({'data': [], 'page': 1, 'limit': 50, 'total': 0}), 200);
        }),
        baseUrl: 'http://test',
      );
      final repo = ContentRepository(client);

      final result = await repo.listAssignments('s1');

      expect(result.data, isEmpty);
    });

    test('PHASE 12S: listAssignments surfaces a 404 (invalid/invisible subject) as ApiException, never an unhandled crash', () async {
      final client = ApiClient(
        tokenProvider: const _StaticTokenProvider('tok-123'),
        httpClient: MockClient((request) async {
          return http.Response(jsonEncode({'error': {'code': 'not_found', 'message': 'Subject not found.'}}), 404);
        }),
        baseUrl: 'http://test',
      );
      final repo = ContentRepository(client);

      expect(() => repo.listAssignments('missing'), throwsA(isA<ApiException>().having((e) => e.isNotFound, 'isNotFound', isTrue)));
    });
  });

  group('FilesRepository (PHASE 10 §11)', () {
    test('getSignedUrl calls GET /api/v1/files/:fileId and returns the signed URL only', () async {
      Uri? calledUri;
      final client = ApiClient(
        tokenProvider: const _StaticTokenProvider('tok'),
        httpClient: MockClient((request) async {
          calledUri = request.url;
          return http.Response(jsonEncode({'data': {'url': 'https://storage.example/x?token=abc', 'expiresAt': '2030-01-01T00:00:00Z'}}), 200);
        }),
        baseUrl: 'http://test',
      );
      final repo = FilesRepository(client);

      final signed = await repo.getSignedUrl('file-1');

      expect(calledUri!.path, '/api/v1/files/file-1');
      expect(signed.url, contains('token=abc'));
    });
  });

  group('AssessmentsRepository (PHASE 10 §12/§13)', () {
    test('submitAnswer POSTs only questionId + selectedOptionId — never isCorrect/score', () async {
      Map<String, dynamic>? sentBody;
      final client = ApiClient(
        tokenProvider: const _StaticTokenProvider('tok'),
        httpClient: MockClient((request) async {
          sentBody = jsonDecode(request.body) as Map<String, dynamic>;
          return http.Response(jsonEncode({'data': {'questionId': 'q1', 'recorded': true}}), 200);
        }),
        baseUrl: 'http://test',
      );
      final repo = AssessmentsRepository(client);

      final ack = await repo.submitAnswer('attempt-1', questionId: 'q1', selectedOptionId: 'opt-1');

      expect(sentBody, {'questionId': 'q1', 'selectedOptionId': 'opt-1'});
      expect(sentBody!.containsKey('isCorrect'), isFalse);
      expect(sentBody!.containsKey('score'), isFalse);
      expect(ack.recorded, isTrue);
    });

    test('submitAttempt POSTs with no body fields (server computes the score)', () async {
      Map<String, dynamic>? sentBody;
      final client = ApiClient(
        tokenProvider: const _StaticTokenProvider('tok'),
        httpClient: MockClient((request) async {
          sentBody = jsonDecode(request.body) as Map<String, dynamic>;
          return http.Response(
            jsonEncode({
              'data': {
                'attemptId': 'a1',
                'quizId': 'q1',
                'status': 'graded',
                'totalQuestions': 1,
                'answeredQuestions': 1,
                'correctAnswers': 1,
                'score': 1,
                'percentage': 100,
                'submittedAt': '2026-01-01T00:00:00Z',
              },
            }),
            200,
          );
        }),
        baseUrl: 'http://test',
      );
      final repo = AssessmentsRepository(client);

      final result = await repo.submitAttempt('a1');

      expect(sentBody, isEmpty);
      expect(result.percentage, 100);
    });
  });
}
