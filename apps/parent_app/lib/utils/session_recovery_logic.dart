import 'dart:convert';

const hmacProactiveRefreshSeconds = 24 * 60 * 60;

enum HmacRefreshDecision { skip, refresh, unauthorized }

enum SessionRecoveryStatus { ok, unauthorized, failed }

Map<String, dynamic>? decodeHmacPayload(String token) {
  final parts = token.split('.');
  if (parts.length != 3) return null;
  if (parts[0] != 'par' && parts[0] != 'drv') return null;
  try {
    var normalized = parts[1].replaceAll('-', '+').replaceAll('_', '/');
    final pad = normalized.length % 4;
    if (pad > 0) {
      normalized = normalized.padRight(normalized.length + (4 - pad), '=');
    }
    final decoded = json.decode(utf8.decode(base64.decode(normalized)));
    if (decoded is Map<String, dynamic>) return decoded;
    if (decoded is Map) return Map<String, dynamic>.from(decoded);
    return null;
  } catch (_) {
    return null;
  }
}

int? hmacExpiryEpoch(String token) {
  final exp = decodeHmacPayload(token)?['exp'];
  if (exp is int) return exp;
  if (exp is num) return exp.toInt();
  return null;
}

bool hmacShouldProactivelyRefresh(int expEpochSeconds, DateTime now) {
  final nowEpoch = now.millisecondsSinceEpoch ~/ 1000;
  return expEpochSeconds - nowEpoch < hmacProactiveRefreshSeconds;
}

bool supabaseAccessTokenNeedsRefresh(
  int? expiresAtEpoch,
  DateTime now, {
  int skewSeconds = 60,
}) {
  if (expiresAtEpoch == null) return true;
  return expiresAtEpoch <= now.millisecondsSinceEpoch ~/ 1000 + skewSeconds;
}

HmacRefreshDecision hmacRefreshDecision(
  String? token,
  DateTime now, {
  bool force = false,
}) {
  if (token == null || token.isEmpty) {
    return HmacRefreshDecision.unauthorized;
  }
  if (force) return HmacRefreshDecision.refresh;
  final exp = hmacExpiryEpoch(token);
  if (exp == null) return HmacRefreshDecision.refresh;
  if (hmacShouldProactivelyRefresh(exp, now)) {
    return HmacRefreshDecision.refresh;
  }
  return HmacRefreshDecision.skip;
}

bool shouldRetryAfterUnauthorized(int statusCode, bool alreadyRefreshed) {
  return statusCode == 401 && !alreadyRefreshed;
}
