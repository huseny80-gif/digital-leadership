/// Dart mirror of `Subject` in `shared/src/types/content.ts`. Field set
/// kept in sync by hand (Dart and TypeScript cannot share source — see
/// DEVELOPMENT.md), matching API_V1.md exactly.
class Subject {
  const Subject({
    required this.id,
    required this.title,
    required this.description,
    required this.orderIndex,
    required this.status,
    required this.createdBy,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String title;
  final String? description;
  final int orderIndex;
  final String status;
  final String createdBy;
  final String createdAt;
  final String updatedAt;

  factory Subject.fromJson(Map<String, dynamic> json) {
    return Subject(
      id: json['id'] as String,
      title: json['title'] as String,
      description: json['description'] as String?,
      orderIndex: json['orderIndex'] as int,
      status: json['status'] as String,
      createdBy: json['createdBy'] as String,
      createdAt: json['createdAt'] as String,
      updatedAt: json['updatedAt'] as String,
    );
  }
}
