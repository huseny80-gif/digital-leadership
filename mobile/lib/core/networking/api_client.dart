import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../config/env.dart';
import 'api_exception.dart';

/// Supplies the current session's access token, if any. Implemented by
/// [AuthController] (`core/auth/auth_controller.dart`) — the API client
/// itself never talks to Supabase directly and never decides whether a
/// session is valid; it only attaches whatever token this returns, the
/// same way the web client's `lib/api/client.ts` only forwards the
/// current Supabase access token for the backend to verify independently.
abstract class AccessTokenProvider {
  Future<String?> getAccessToken();
}

/// Centralized, typed HTTP client for the shared `/api/v1` backend
/// (PHASE 10 §18 "Networking"). Every screen/repository in this app goes
/// through this — no screen constructs its own `http.Client` or repeats
/// endpoint/error-handling logic. Mirrors `web/src/lib/api/client.ts`'s
/// shape (`apiGet`/`apiPost`/`apiPatch`/`apiDelete`) so the two clients'
/// behavior stays easy to compare.
class ApiClient {
  ApiClient({required this.tokenProvider, http.Client? httpClient, String? baseUrl})
      : _http = httpClient ?? http.Client(),
        baseUrl = baseUrl ?? Env.apiBaseUrl;

  final AccessTokenProvider tokenProvider;
  final http.Client _http;
  final String baseUrl;

  static const _timeout = Duration(seconds: 15);

  Future<Map<String, String>> _headers({bool json = false}) async {
    final token = await tokenProvider.getAccessToken();
    // TEMPORARY DIAGNOSTIC (Phase 13 OAuth/session investigation) — never
    // logs the token value itself, only whether it is present and its
    // length. Remove once the auth flow is diagnosed.
    debugPrint('API_AUTH_DEBUG: tokenPresent=${token != null}, tokenLength=${token?.length ?? 0}');
    return {
      if (token != null) 'authorization': 'Bearer $token',
      if (json) 'content-type': 'application/json',
    };
  }

  Future<dynamic> _decode(http.Response res) async {
    if (res.statusCode == 204 || res.body.isEmpty) return null;
    try {
      return jsonDecode(res.body);
    } on FormatException {
      throw ApiException.network('The server returned an invalid response.');
    }
  }

  Future<dynamic> get(String path) async {
    return _send('GET', path);
  }

  Future<dynamic> post(String path, [Object? body]) async {
    return _send('POST', path, body ?? const <String, dynamic>{});
  }

  Future<dynamic> patch(String path, Object body) async {
    return _send('PATCH', path, body);
  }

  Future<void> delete(String path) async {
    await _send('DELETE', path);
  }

  Future<dynamic> _send(String method, String path, [Object? jsonBody]) async {
    final uri = Uri.parse('$baseUrl$path');
    final headers = await _headers(json: jsonBody != null);
    // TEMPORARY DIAGNOSTIC (Phase 13 OAuth/session investigation) — remove
    // once the auth flow is diagnosed.
    debugPrint('API_AUTH_DEBUG: request=$method $path');

    http.Response res;
    try {
      final request = http.Request(method, uri)
        ..headers.addAll(headers)
        ..body = jsonBody != null ? jsonEncode(jsonBody) : '';
      final streamed = await _http.send(request).timeout(_timeout);
      res = await http.Response.fromStream(streamed);
    } on TimeoutException {
      throw ApiException.network('The request timed out. Please try again.');
    } catch (_) {
      // Deliberately not including the raw exception text in the thrown
      // ApiException — that could contain a hostname/path fragment that
      // is not meaningful to a learner (PHASE 10 §22).
      throw ApiException.network('Unable to reach the server. Check your connection.');
    }

    final decoded = await _decode(res);

    if (res.statusCode < 200 || res.statusCode >= 300) {
      final errorMap = (decoded is Map<String, dynamic>) ? decoded['error'] as Map<String, dynamic>? : null;
      throw ApiException(
        statusCode: res.statusCode,
        code: errorMap?['code'] as String? ?? 'error',
        message: errorMap?['message'] as String? ?? 'Request failed.',
      );
    }

    return decoded;
  }
}
