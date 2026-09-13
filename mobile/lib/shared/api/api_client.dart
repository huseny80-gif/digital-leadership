/// Placeholder typed API client boundary.
///
/// The Flutter app does not share TypeScript source with the web app —
/// Dart and TypeScript cannot import the same source files — but both
/// clients must agree on one wire contract, defined once in
/// API_ARCHITECTURE.md and mirrored here as Dart model classes (see
/// `shared/models`) rather than being reinvented ad hoc per screen.
///
/// Real request logic (session credential handling, error normalization
/// per SECURITY_ARCHITECTURE.md §13) is implemented in Phase 9 once the
/// backend endpoints exist.
class ApiClient {
  const ApiClient({required this.baseUrl});

  final String baseUrl;

  Future<T> get<T>(String path) {
    throw UnimplementedError(
      'API client is implemented in Phase 9 (Mobile Applications), '
      'once the backend endpoints in API_ARCHITECTURE.md exist.',
    );
  }
}
