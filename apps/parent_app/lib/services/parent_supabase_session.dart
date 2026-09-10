import 'package:parent_app/services/parent_api_auth.dart';
import 'package:parent_app/utils/session_recovery_logic.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Keeps a Supabase Auth session alive for storage RLS fallbacks when the
/// HMAC `par.*` token is present but `auth.users` was never bootstrapped.
class ParentSupabaseSession {
  static Future<bool> ensureActive() async {
    if (await refreshIfNeeded()) {
      return true;
    }
    return Supabase.instance.isInitialized &&
        Supabase.instance.client.auth.currentSession != null;
  }

  /// Refreshes an existing SDK session when the access JWT is expired.
  /// Does not call `setSession` with a login-era refresh token (reuse risk).
  static Future<bool> refreshIfNeeded() async {
    if (!Supabase.instance.isInitialized) {
      return false;
    }
    final session = Supabase.instance.client.auth.currentSession;
    if (session == null) {
      return false;
    }
    if (!supabaseAccessTokenNeedsRefresh(
      session.expiresAt,
      DateTime.now(),
    )) {
      return true;
    }
    try {
      final res = await Supabase.instance.client.auth.refreshSession();
      final next = res.session;
      if (next == null) {
        return false;
      }
      await ParentApiAuth.persistSupabaseRefresh(next.refreshToken);
      return true;
    } catch (_) {
      return false;
    }
  }

  static Future<void> applyFromApiBody(Map<String, dynamic> body) async {
    final refresh = body['supabase_refresh_token']?.toString();
    if (refresh == null || refresh.isEmpty) {
      return;
    }
    await ParentApiAuth.persistSupabaseRefresh(refresh);
    try {
      await Supabase.instance.client.auth.setSession(refresh);
    } catch (_) {}
  }
}
