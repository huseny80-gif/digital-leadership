/// Dart mirror of `PaginatedResult<T>` (API_V1.md "Pagination Contract").
/// The envelope IS the response body for a collection endpoint — not
/// nested inside a second `data` wrapper (matches the web client's
/// `apiGetPaginated`, `web/src/lib/api/client.ts`).
class PaginatedResult<T> {
  const PaginatedResult({
    required this.data,
    required this.page,
    required this.limit,
    required this.total,
  });

  final List<T> data;
  final int page;
  final int limit;
  final int total;

  factory PaginatedResult.fromJson(
    Map<String, dynamic> json,
    T Function(Map<String, dynamic>) fromJsonT,
  ) {
    final items = json['data'] as List<dynamic>;
    return PaginatedResult(
      data: items.map((e) => fromJsonT(e as Map<String, dynamic>)).toList(),
      page: json['page'] as int,
      limit: json['limit'] as int,
      total: json['total'] as int,
    );
  }
}
