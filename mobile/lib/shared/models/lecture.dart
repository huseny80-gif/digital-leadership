/// Dart mirror of `Lecture` in `shared/src/types/content.ts`.
class Lecture {
  const Lecture({
    required this.id,
    required this.subjectId,
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
  final String title;
  final String? description;
  final int orderIndex;
  final String status;
  final String createdBy;
  final String createdAt;
  final String updatedAt;

  factory Lecture.fromJson(Map<String, dynamic> json) {
    return Lecture(
      id: json['id'] as String,
      subjectId: json['subjectId'] as String,
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
