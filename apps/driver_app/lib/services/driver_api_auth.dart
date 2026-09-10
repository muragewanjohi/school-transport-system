import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:driver_app/config/api_config.dart';
import 'package:driver_app/utils/session_recovery_logic.dart';

class DriverApiAuth {
  static Future<Map<String, String>> headers({bool jsonBody = true}) async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('access_token') ?? '';
    return {
      if (jsonBody) 'Content-Type': 'application/json',
      if (token.isNotEmpty) 'Authorization': 'Bearer $token',
    };
  }

  static Future<String?> accessToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('access_token');
  }

  static Future<void> persistToken(String? token) async {
    final prefs = await SharedPreferences.getInstance();
    if (token == null || token.isEmpty) {
      await prefs.remove('access_token');
    } else {
      await prefs.setString('access_token', token);
    }
  }

  static Future<SessionRecoveryStatus>? _inFlight;

  static Future<SessionRecoveryStatus> recoverSession({
    bool force = false,
  }) async {
    final existing = _inFlight;
    if (existing != null) return existing;
    final future = _recover(force: force);
    _inFlight = future;
    try {
      return await future;
    } finally {
      if (identical(_inFlight, future)) {
        _inFlight = null;
      }
    }
  }

  static Future<SessionRecoveryStatus> _recover({required bool force}) async {
    final token = await accessToken();
    final decision = hmacRefreshDecision(token, DateTime.now(), force: force);
    if (decision == HmacRefreshDecision.unauthorized) {
      return SessionRecoveryStatus.unauthorized;
    }
    if (decision == HmacRefreshDecision.skip) {
      return SessionRecoveryStatus.ok;
    }

    try {
      final response = await http
          .post(
            Uri.parse('${ApiConfig.baseUrl}/api/auth/driver-refresh'),
            headers: await headers(),
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
      await persistToken(body['access_token']?.toString());
      return SessionRecoveryStatus.ok;
    } catch (_) {
      return token != null && token.isNotEmpty
          ? SessionRecoveryStatus.ok
          : SessionRecoveryStatus.failed;
    }
  }
}
