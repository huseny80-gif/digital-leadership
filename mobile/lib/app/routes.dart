/// Named route constants, kept in one place so navigation call sites never
/// hardcode a route string (mirrors the "no scattered logic" principle
/// applied to authorization in ARCHITECTURE.md §6, applied here to routing).
abstract final class AppRoutes {
  static const login = '/login';
  static const dashboard = '/dashboard';
  static const subjects = '/subjects';
  static const admin = '/admin';
  static const profile = '/profile';
}
