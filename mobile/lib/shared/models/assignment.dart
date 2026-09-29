/// Dart mirror of `Assignment` in `shared/src/types/content.ts`
/// (PHASE 12H — dedicated, subject-scoped assignment; `lectureId` is
/// nullable and, for the current migrated content, always `null` — this
/// model never assumes a lecture relationship).
class Assignment {
  const Assignment({
    required this.id,
    required this.subjectId,
    required this.lectureId,
    required this.title,
    required this.description,
    required this.orderIndex,
    required this.status,
    required this.createdBy,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String subjectId;
  final String? lectureId;
  final String title;
  final String? description;
  final int orderIndex;
  final String status;
  final String createdBy;
  final String createdAt;
  final String updatedAt;

  factory Assignment.fromJson(Map<String, dynamic> json) {
    return Assignment(
      id: json['id'] as String,
      subjectId: json['subjectId'] as String,
      lectureId: json['lectureId'] as String?,
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
