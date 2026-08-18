import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:parent_app/config/api_config.dart';
import 'package:parent_app/services/parent_api_auth.dart';
import 'package:parent_app/services/supabase_service.dart';
import 'package:parent_app/utils/parent_notification_logic.dart';

class ParentNotificationsInbox {
  final List<ParentInboxItem> items;
  final int unreadCount;

  const ParentNotificationsInbox({
    required this.items,
    required this.unreadCount,
  });
}

class ParentNotificationsService {
  static Future<ParentNotificationsInbox> fetchInbox({DateTime? nowUtc}) async {
    try {
      final viaApi = await _fetchViaApi(nowUtc: nowUtc);
      if (viaApi != null) return viaApi;
    } catch (_) {}
    return _fetchViaSupabase(nowUtc: nowUtc);
  }

  static Future<int> fetchUnreadCount() async {
    final inbox = await fetchInbox();
    return inbox.unreadCount;
  }

  static Future<void> markAllRead() async {
    try {
      final headers = await ParentApiAuth.headers();
      if (headers['Authorization'] != null) {
        final uri = Uri.parse('${ApiConfig.baseUrl}/api/parent/notifications');
        final response = await http
            .patch(uri, headers: headers, body: json.encode({'all': true}))
            .timeout(const Duration(seconds: 10));
        if (response.statusCode == 200) return;
      }
    } catch (_) {}

    final userId = SupabaseService.client.auth.currentUser?.id;
    if (userId == null) return;
    await SupabaseService.client.from('notifications').update({'read': true}).eq('user_id', userId);
  }

  static Future<ParentNotificationsInbox?> _fetchViaApi({DateTime? nowUtc}) async {
    final headers = await ParentApiAuth.headers();
    if (headers['Authorization'] == null) return null;

    final uri = Uri.parse('${ApiConfig.baseUrl}/api/parent/notifications');
    final response = await http.get(uri, headers: headers).timeout(
          const Duration(seconds: 10),
        );
    if (response.statusCode != 200) return null;

    final body = json.decode(response.body) as Map<String, dynamic>;
    if (body['success'] != true) return null;

    final rows = (body['notifications'] as List<dynamic>?) ?? const [];
    final items = mapNotificationRows(rows, nowUtc: nowUtc);
    final unread = (body['unread_count'] as num?)?.toInt() ?? unreadNotificationCount(items);
    return ParentNotificationsInbox(items: items, unreadCount: unread);
  }

  static Future<ParentNotificationsInbox> _fetchViaSupabase({DateTime? nowUtc}) async {
    final userId = SupabaseService.client.auth.currentUser?.id;
    if (userId == null) {
      return const ParentNotificationsInbox(items: [], unreadCount: 0);
    }

    final rows = await SupabaseService.client
        .from('notifications')
        .select('id, title, message, notification_type, read, created_at')
        .eq('user_id', userId)
        .order('created_at', ascending: false)
        .limit(50);

    final items = mapNotificationRows(rows as List<dynamic>, nowUtc: nowUtc);
    return ParentNotificationsInbox(
      items: items,
      unreadCount: unreadNotificationCount(items),
    );
  }
}
