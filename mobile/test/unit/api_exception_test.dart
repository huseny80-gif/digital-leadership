import 'package:flutter_test/flutter_test.dart';

import 'package:digital_leadership/core/networking/api_exception.dart';

/// PHASE 10 §22 "Error Handling": every status code maps to a short,
/// safe, user-presentable message — never a raw exception/backend
/// string.
void main() {
  test('network failure (no response) maps to a connectivity message', () {
    final e = ApiException.network('boom: connection refused at 10.0.2.2:4000');
    expect(e.statusCode, 0);
    expect(e.toSafeMessage(), isNot(contains('boom')));
    expect(e.toSafeMessage(), contains('connection'));
  });

  test('401 maps to a session-expired message and isUnauthenticated is true', () {
    const e = ApiException(statusCode: 401, code: 'unauthenticated', message: 'x');
    expect(e.isUnauthenticated, isTrue);
    expect(e.toSafeMessage(), contains('session has expired'));
  });

  test('403 maps to a permission message, scoped to the given context', () {
    const e = ApiException(statusCode: 403, code: 'forbidden', message: 'x');
    expect(e.isForbidden, isTrue);
    expect(e.toSafeMessage(context: 'this quiz'), contains('this quiz'));
  });

  test('404 maps to a not-found message and isNotFound is true', () {
    const e = ApiException(statusCode: 404, code: 'not_found', message: 'x');
    expect(e.isNotFound, isTrue);
    expect(e.toSafeMessage(context: 'lecture'), contains('not be found'));
  });

  test('409 relays the backend message when present (e.g. self-lockout), never a raw 500-style message', () {
    const e = ApiException(statusCode: 409, code: 'conflict', message: 'Already submitted.');
    expect(e.isConflict, isTrue);
    expect(e.toSafeMessage(), 'Already submitted.');
  });

  test('an unexpected 5xx never leaks the raw backend message', () {
    const e = ApiException(
      statusCode: 500,
      code: 'internal_error',
      message: 'relation "quiz_attempts" does not exist: connection to database failed',
    );
    final safe = e.toSafeMessage(context: 'this quiz');
    expect(safe, isNot(contains('relation')));
    expect(safe, isNot(contains('database')));
  });
}
