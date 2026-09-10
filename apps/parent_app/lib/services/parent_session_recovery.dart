import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:parent_app/config/api_config.dart';
import 'package:parent_app/services/parent_api_auth.dart';
import 'package:parent_app/services/parent_supabase_session.dart';
import 'package:parent_app/utils/session_recovery_logic.dart';

/// Recovers HMAC + Supabase Auth after idle so Refresh / resume can load data.
class ParentSessionRecovery {
  static Future<SessionRecoveryStatus>? _inFlight;

  static Future<SessionRecoveryStatus> recover({
    bool forceHmacRefresh = false,
  }) async {
    final existing = _inFlight;
    if (existing != null) return existing;
    final future = _recover(forceHmacRefresh: forceHmacRefresh);
    _inFlight = future;
    try {
      return await future;
    } finally {
      if (identical(_inFlight, future)) {
        _inFlight = null;
      }
    }
  }

  static Future<SessionRecoveryStatus> _recover({
    required bool forceHmacRefresh,
  }) async {
    final token = await ParentApiAuth.accessToken();
    final hmacDecision = hmacRefreshDecision(
      token,
      DateTime.now(),
      force: forceHmacRefresh,
    );
    if (hmacDecision == HmacRefreshDecision.unauthorized) {
      return SessionRecoveryStatus.unauthorized;
    }

    final supabaseReady = await ParentSupabaseSession.refreshIfNeeded();
    final bootstrapSupabase = !supabaseReady;
    final shouldRefreshHmac =
        hmacDecision == HmacRefreshDecision.refresh || bootstrapSupabase;

    if (!shouldRefreshHmac) {
      return SessionRecoveryStatus.ok;
    }

    try {
      final headers = await ParentApiAuth.headers();
      if (bootstrapSupabase) {
        headers['x-bootstrap-supabase'] = '1';
      }
      final response = await http
          .post(
            Uri.parse('${ApiConfig.baseUrl}/api/auth/parent-refresh'),
            headers: headers,
            body: json.encode({'bootstrap_supabase': bootstrapSupabase}),
          )
          .timeout(const Duration(seconds: 12));

      if (response.statusCode == 401) {
        return SessionRecoveryStatus.unauthorized;
      }
      if (response.statusCode != 200) {
        return token != null && token.isNotEmpty
            ? SessionRecoveryStatus.ok
            : SessionRecoveryStatus.failed;
      }

      final body = json.decode(response.body);
      if (body is! Map<String, dynamic> || body['success'] != true) {
        return SessionRecoveryStatus.failed;
      }
      await ParentApiAuth.persistToken(body['access_token']?.toString());
      await ParentSupabaseSession.applyFromApiBody(body);
      return SessionRecoveryStatus.ok;
    } catch (_) {
      return token != null && token.isNotEmpty
          ? SessionRecoveryStatus.ok
          : SessionRecoveryStatus.failed;
    }
  }

  static Future<http.Response> sendWithRetry(
    Future<http.Response> Function(Map<String, String> headers) send, {
    Map<String, String>? extraHeaders,
  }) async {
    await recover();
    Future<Map<String, String>> merged() async {
      return {
        ...await ParentApiAuth.headers(),
        ...?extraHeaders,
      };
    }

    final response = await send(await merged());
    if (!shouldRetryAfterUnauthorized(response.statusCode, false)) {
      return response;
    }
    final status = await recover(forceHmacRefresh: true);
    if (status != SessionRecoveryStatus.ok) {
      return response;
    }
    return send(await merged());
  }
}
