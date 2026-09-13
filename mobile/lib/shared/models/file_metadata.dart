/// Dart mirror of `FileMetadata` in `shared/src/types/file.ts`.
/// Deliberately has no `storageKey` field — the backend never returns
/// one to any client (DATABASE_SECURITY.md §6, unchanged for mobile).
class FileMetadata {
  const FileMetadata({
    required this.id,
    required this.originalFilename,
    required this.mimeType,
    required this.sizeBytes,
    required this.status,
    required this.uploadedBy,
    required this.createdAt,
  });

  final String id;
  final String originalFilename;
  final String mimeType;
  final int sizeBytes;
  final String status;
  final String uploadedBy;
  final String createdAt;

  factory FileMetadata.fromJson(Map<String, dynamic> json) {
    return FileMetadata(
      id: json['id'] as String,
      originalFilename: json['originalFilename'] as String,
      mimeType: json['mimeType'] as String,
      sizeBytes: (json['sizeBytes'] as num).toInt(),
      status: json['status'] as String,
      uploadedBy: json['uploadedBy'] as String,
      createdAt: json['createdAt'] as String,
    );
  }
}

/// Dart mirror of `LectureItem`/`LectureItemResponse` in
/// `shared/src/types/content.ts`. `file` is the embedded, already-safe
/// [FileMetadata] for a `pdf` item — never a storage key or URL.
class LectureItem {
  const LectureItem({
    required this.id,
    required this.lectureId,
    required this.itemType,
    required this.title,
    required this.bodyText,
    required this.fileId,
    required this.orderIndex,
    required this.status,
    required this.file,
  });

  final String id;
  final String lectureId;
  final String itemType; // 'pdf' | 'summary' | 'assignment' | 'exercise'
  final String title;
  final String? bodyText;
  final String? fileId;
  final int orderIndex;
  final String status;
  final FileMetadata? file;

  factory LectureItem.fromJson(Map<String, dynamic> json) {
    final fileJson = json['file'] as Map<String, dynamic>?;
    return LectureItem(
      id: json['id'] as String,
      lectureId: json['lectureId'] as String,
      itemType: json['itemType'] as String,
      title: json['title'] as String,
      bodyText: json['bodyText'] as String?,
      fileId: json['fileId'] as String?,
      orderIndex: json['orderIndex'] as int,
      status: json['status'] as String,
      file: fileJson != null ? FileMetadata.fromJson(fileJson) : null,
    );
  }
}

/// Dart mirror of `SignedFileUrl`. Held only in memory by the screen that
/// requested it — never persisted to disk/secure storage/shared prefs,
/// never logged (PHASE 10 "Secure PDF Viewer").
class SignedFileUrl {
  const SignedFileUrl({required this.url, required this.expiresAt});

  final String url;
  final String expiresAt;

  factory SignedFileUrl.fromJson(Map<String, dynamic> json) {
    return SignedFileUrl(
      url: json['url'] as String,
      expiresAt: json['expiresAt'] as String,
    );
  }
}
