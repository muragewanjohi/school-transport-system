import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:parent_app/utils/session_recovery_logic.dart';

void main() {
  final now = DateTime.utc(2026, 9, 10, 12);

  test('HMAC should refresh when less than 24 hours remain', () {
    final exp = now.millisecondsSinceEpoch ~/ 1000 + (23 * 60 * 60);
    expect(hmacShouldProactivelyRefresh(exp, now), isTrue);
    expect(
      hmacRefreshDecision(_tokenWithExp(exp), now),
      HmacRefreshDecision.refresh,
    );
  });

  test('HMAC skips refresh when more than 24 hours remain', () {
    final exp = now.millisecondsSinceEpoch ~/ 1000 + (48 * 60 * 60);
    expect(hmacShouldProactivelyRefresh(exp, now), isFalse);
    expect(
      hmacRefreshDecision(_tokenWithExp(exp), now),
      HmacRefreshDecision.skip,
    );
  });

  test('HTTP 401 retries once after a successful refresh', () {
    expect(shouldRetryAfterUnauthorized(401, false), isTrue);
    expect(shouldRetryAfterUnauthorized(401, true), isFalse);
    expect(shouldRetryAfterUnauthorized(200, false), isFalse);
  });

  test('Missing HMAC is unauthorized', () {
    expect(hmacRefreshDecision(null, now), HmacRefreshDecision.unauthorized);
    expect(hmacRefreshDecision('', now), HmacRefreshDecision.unauthorized);
  });

  test('Expired Supabase access token needs refresh', () {
    final expired = now.millisecondsSinceEpoch ~/ 1000 - 10;
    expect(supabaseAccessTokenNeedsRefresh(expired, now), isTrue);
    expect(supabaseAccessTokenNeedsRefresh(null, now), isTrue);
    final fresh = now.millisecondsSinceEpoch ~/ 1000 + 600;
    expect(supabaseAccessTokenNeedsRefresh(fresh, now), isFalse);
  });
}

String _tokenWithExp(int exp) {
  final payload = base64Url.encode(
    utf8.encode(
      '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","tenant_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"parent","exp":$exp}',
    ),
  );
  return 'par.$payload.sig';
}
