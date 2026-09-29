/// A safe, client-facing API error — the Dart equivalent of the web
/// client's `ApiError` (`web/src/lib/api/client.ts`). Only ever carries
/// the backend's own `code`/`message` (`ApiErrorBody`,
/// SECURITY_ARCHITECTURE.md §13) — never a raw exception message, stack
/// trace, or connection string (PHASE 10 §22 "Error Handling").
class ApiException implements Exception {
  const ApiException({required this.statusCode, required this.code, required this.message});

  final int statusCode;
  final String code;
  final String message;

  /// A network-layer failure (no HTTP response at all — offline, DNS,
  /// TLS, timeout). Distinguished from a real backend error response
  /// because there is no server-provided `code`/`message` to relay.
  factory ApiException.network(String reason) {
    return ApiException(statusCode: 0, code: 'network_error', message: reason);
  }

  bool get isUnauthenticated => statusCode == 401;
  bool get isForbidden => statusCode == 403;
  bool get isNotFound => statusCode == 404;
  bool get isConflict => statusCode == 409;

  /// A short, user-presentable message — never the raw [message] for an
  /// unexpected/5xx failure, matching the web client's
  /// `lib/api/errorMessage.ts` pattern of pre-written, context-specific
  /// copy rather than surfacing backend internals.
  String toSafeMessage({String context = 'this content'}) {
    switch (statusCode) {
      case 0:
        return 'Unable to reach the server. Check your connection and try again.';
      case 401:
        return 'Your session has expired. Please sign in again.';
      case 403:
        return 'You do not have permission to view $context.';
      case 404:
        return '${_capitalize(context)} could not be found.';
      case 409:
        return message.isNotEmpty ? message : 'This action could not be completed.';
      case 422:
        return 'The information provided was invalid.';
      case 429:
        return 'Too many requests. Please wait a moment and try again.';
      default:
        return 'Unable to load $context. Please try again.';
    }
  }

  static String _capitalize(String s) => s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);

  @override
  String toString() => 'ApiException($statusCode, $code, $message)';
}
