import 'package:parent_app/services/parent_api_auth.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Keeps a Supabase Auth session alive for storage RLS fallbacks when the
/// HMAC `par.*` token is present but `auth.users` was never bootstrapped.
class ParentSupabaseSession {
  static Future<bool> ensureActive() async {
    if (Supabase.instance.client.auth.currentSession != null) {
      return true;
    }
    final refresh = await ParentApiAuth.supabaseRefreshToken();
    if (refresh == null || refresh.isEmpty) {
      return false;
    }
    try {
      await Supabase.instance.client.auth.setSession(refresh);
    } catch (_) {
      return false;
    }
    return Supabase.instance.client.auth.currentSession != null;
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
