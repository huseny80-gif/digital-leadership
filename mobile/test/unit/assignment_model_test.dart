import 'package:flutter_test/flutter_test.dart';

import 'package:digital_leadership/shared/models/assignment.dart';

/// PHASE 12S — [Assignment] model parsing. `Assignment` has no
/// rubric/answer-key field at all (a compile-time guarantee, matching
/// [QuestionForAttempt]'s own invariant in quiz_model_test.dart) and must
/// parse correctly whether `lectureId` is present or `null` — the
/// migrated Finquiz assignments are 100% subject-scoped.
void main() {
  test('Assignment.fromJson parses a subject-only assignment (lectureId = null)', () {
    final assignment = Assignment.fromJson({
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
    });

    expect(assignment.title, 'Essay 1');
    expect(assignment.lectureId, isNull);
    expect(assignment.description, 'Write about X.');
    expect(assignment.status, 'published');
  });

  test('Assignment.fromJson parses a null description without error', () {
    final assignment = Assignment.fromJson({
      'id': 'a1',
      'subjectId': 's1',
      'lectureId': null,
      'title': 'Essay 1',
      'description': null,
      'orderIndex': 0,
      'status': 'published',
      'createdBy': 'admin-1',
      'createdAt': '2026-01-01T00:00:00Z',
      'updatedAt': '2026-01-01T00:00:00Z',
    });

    expect(assignment.description, isNull);
  });

  test('fromJson ignores an unexpected rubric key rather than surfacing it, if a backend response ever included one', () {
    final assignment = Assignment.fromJson({
      'id': 'a1',
      'subjectId': 's1',
      'lectureId': null,
      'title': 'Essay 1',
      'description': null,
      'orderIndex': 0,
      'status': 'published',
      'createdBy': 'admin-1',
      'createdAt': '2026-01-01T00:00:00Z',
      'updatedAt': '2026-01-01T00:00:00Z',
      'rubric': [
        {'text': 'criterion', 'keywords': ['x']},
      ],
    });

    expect(assignment.title, 'Essay 1');
    // No `.rubric` getter exists on Assignment at all — this is a
    // compile-time guarantee, not just a runtime check.
  });
}
