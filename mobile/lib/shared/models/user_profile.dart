/// Dart mirror of `UserProfile` in `shared/src/types/user.ts`. Kept in sync
/// by hand (documented in DEVELOPMENT.md) since Dart and TypeScript cannot
/// share source — the field set and meaning must stay identical to the
/// contract in API_ARCHITECTURE.md.
class UserProfile {
  const UserProfile({
    required this.id,
    required this.email,
    required this.displayName,
    required this.avatarUrl,
    required this.role,
    required this.status,
    required this.createdAt,
  });

  final String id;
  final String email;
  final String displayName;
  final String? avatarUrl;
  final String role;
  final String status;
  final String createdAt;

  factory UserProfile.fromJson(Map<String, dynamic> json) {
    return UserProfile(
      id: json['id'] as String,
      email: json['email'] as String,
      displayName: json['displayName'] as String,
      avatarUrl: json['avatarUrl'] as String?,
      role: json['role'] as String,
      status: json['status'] as String,
      createdAt: json['createdAt'] as String,
    );
  }
}
