import 'package:flutter_test/flutter_test.dart';

import 'package:digital_leadership/shared/models/user_profile.dart';

void main() {
  test('UserProfile.fromJson parses the API contract shape', () {
    final profile = UserProfile.fromJson({
      'id': 'u1',
      'email': 'someone@example.com',
      'displayName': 'Someone',
      'avatarUrl': null,
      'role': 'user',
      'status': 'active',
      'createdAt': '2026-01-01T00:00:00Z',
    });

    expect(profile.id, 'u1');
    expect(profile.role, 'user');
    expect(profile.avatarUrl, isNull);
  });
}
